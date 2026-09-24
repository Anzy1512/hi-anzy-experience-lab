import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

import { registrableDomain } from '../crawl/url.ts';
import { contactFromLinks, contactFromText, dedupeValues } from './contact.ts';
import { METHOD_STRENGTH, type ExtractedLink, type ExtractedValue, type Extraction, type Heading } from './types.ts';

/**
 * DETERMINISTIC EXTRACTION. NO MODEL IS CONSULTED AND NONE IS NEEDED.
 *
 * Everything below is selectors, declared metadata and structure. That is not
 * a compromise pending something cleverer — it is the correct tool. A language
 * model asked to "find the phone number on this page" costs tokens, takes a
 * second, and is occasionally creative; `document.querySelector('a[href^=tel]')`
 * costs nothing, takes microseconds, and is either right or empty.
 *
 * The rule this layer follows is that AI is for semantic judgement, and none
 * of this is semantic judgement. Later layers will have plenty.
 *
 * ── THE TEXT, AND WHY IT COMES OUT AS BLOCKS ────────────────────────────────
 *
 * Extraction does not return a wall of prose. It returns ordered blocks — a
 * heading, a paragraph, a list item — each with its heading trail and its
 * character span in the assembled text. That is what makes structure-aware
 * chunking possible downstream, and it is why the span on a citation can point
 * at a passage rather than at a page.
 */

/*
 * DOM types come from linkedom, not from the DOM lib.
 *
 * Adding `"DOM"` to tsconfig's `lib` would bring browser globals into a Node
 * service and let `fetch`, `Response` and `AbortSignal` resolve to two
 * different declarations depending on import order. Deriving the handful of
 * types actually used from linkedom's own return value keeps the service's
 * global environment Node-only.
 */
type LDocument = ReturnType<typeof parseHTML>['document'];
type LElement = NonNullable<ReturnType<LDocument['querySelector']>>;
/** Whatever Readability declares it consumes, without naming the DOM lib. */
type ReadabilityDocument = ConstructorParameters<typeof Readability>[0];

export interface Block {
  kind: 'section' | 'paragraph' | 'list' | 'table' | 'metadata';
  text: string;
  /** Heading level, for heading blocks. */
  level: number | null;
  /** The heading trail above this block, e.g. "Our work > Case studies". */
  headingPath: string;
  charStart: number;
  charEnd: number;
}

const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th,dd,dt,figcaption';

/** Markup that is furniture, not content, in any document. */
const FURNITURE = 'script,style,noscript,template,svg,nav,header,footer,aside,form,iframe,button,select';

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function attr(doc: LDocument, selector: string, name: string): string | null {
  const el = doc.querySelector(selector);
  if (el === null) return null;
  const v = clean(el.getAttribute(name));
  return v === '' ? null : v;
}

function meta(doc: LDocument, names: string[]): { value: string; method: 'opengraph' | 'meta' } | null {
  for (const name of names) {
    const og = name.startsWith('og:') || name.startsWith('twitter:') || name.startsWith('article:');
    const el =
      doc.querySelector(`meta[property="${name}"]`) ?? doc.querySelector(`meta[name="${name}"]`);
    const v = clean(el?.getAttribute('content'));
    if (v !== '') return { value: v, method: og ? 'opengraph' : 'meta' };
  }
  return null;
}

function parseJsonLd(doc: LDocument): unknown[] {
  const out: unknown[] = [];
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = el.textContent ?? '';
    if (raw.trim() === '') continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      /* A @graph is the common wrapper and its members are the useful part. */
      if (parsed !== null && typeof parsed === 'object' && '@graph' in parsed) {
        const graph = (parsed as { '@graph': unknown })['@graph'];
        if (Array.isArray(graph)) {
          out.push(...graph);
          continue;
        }
      }
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* Malformed JSON-LD is extremely common and is not an error here. It is
         one absent signal among many, and failing the whole extraction over a
         stray trailing comma would lose the page. */
    }
  }
  return out;
}

function typeOf(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return [];
  const t = (node as { '@type'?: unknown })['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

/** Values a publisher stated as data. The strongest evidence a page offers. */
function valuesFromJsonLd(nodes: unknown[]): ExtractedValue[] {
  const out: ExtractedValue[] = [];
  const push = (field: string, value: unknown, evidence: string) => {
    if (typeof value !== 'string') return;
    const v = clean(value);
    if (v === '') return;
    out.push({ field, value: v, method: 'jsonld', charStart: null, charEnd: null, evidence });
  };

  for (const node of nodes) {
    if (node === null || typeof node !== 'object') continue;
    const types = typeOf(node);
    const o = node as Record<string, unknown>;

    if (types.some((t) => /Organization|Corporation|LocalBusiness|Store|NGO/i.test(t))) {
      push('orgName', o.name, '@type Organization name');
      push('description', o.description, '@type Organization description');
      push('email', o.email, '@type Organization email');
      push('phone', o.telephone, '@type Organization telephone');
      push('url', o.url, '@type Organization url');
      const sameAs = o.sameAs;
      if (Array.isArray(sameAs)) for (const s of sameAs) push('social', s, '@type Organization sameAs');
      else push('social', sameAs, '@type Organization sameAs');

      /*
       * A coordinate the publisher stated, as data.
       *
       * This is extraction, not geocoding. The difference matters: a geocoder
       * turns an address into a guess at where it is, and this service has none
       * on purpose. `schema.org/GeoCoordinates` is the business saying where it
       * is, in the same breath as its phone number, and reading it is the same
       * act as reading the phone number.
       *
       * Out-of-range values are dropped rather than clamped. A latitude of 412
       * is a broken page, and clamping it to 90 would put a business at the
       * North Pole with a straight face.
       */
      const geo = o.geo;
      if (geo !== null && typeof geo === 'object') {
        const g = geo as Record<string, unknown>;
        const num = (v: unknown): number | null => {
          const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
          return Number.isFinite(n) ? n : null;
        };
        const lat = num(g.latitude);
        const lon = num(g.longitude);
        if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          push('latitude', String(lat), '@type GeoCoordinates latitude');
          push('longitude', String(lon), '@type GeoCoordinates longitude');
        }
      }

      const address = o.address;
      if (address !== null && typeof address === 'object') {
        const a = address as Record<string, unknown>;
        const line = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
          .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
          .join(', ');
        if (line !== '') push('address', line, '@type PostalAddress');
      } else {
        push('address', address, '@type Organization address');
      }
    }

    if (types.some((t) => /Product|Service|Offer/i.test(t))) push('product', o.name, `@type ${types[0] ?? 'Product'} name`);
    if (types.some((t) => /Article|NewsArticle|BlogPosting|WebPage/i.test(t))) {
      push('headline', o.headline, '@type Article headline');
      push('datePublished', o.datePublished, '@type Article datePublished');
    }
  }
  return out;
}

/** Walk a root element into ordered blocks, assembling the text as it goes. */
function blocksFrom(root: LElement): { blocks: Block[]; text: string; headings: Heading[] } {
  for (const el of root.querySelectorAll(FURNITURE)) el.remove();

  const blocks: Block[] = [];
  const headings: Heading[] = [];
  const trail: string[] = [];
  let text = '';

  for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
    const tag = el.tagName.toLowerCase();
    const body = clean(el.textContent);
    if (body === '') continue;
    /* A block whose text is entirely inside an ancestor block already emitted
       would be counted twice; `li` inside `li` and `p` inside `blockquote` are
       the usual cases. Emitting the innermost only keeps the text honest. */
    if (el.querySelector(BLOCK_SELECTOR) !== null) continue;

    const isHeading = /^h[1-6]$/.test(tag);
    const level = isHeading ? Number(tag.slice(1)) : null;

    if (isHeading && level !== null) {
      trail.length = Math.max(0, level - 1);
      trail[level - 1] = body;
    }

    const charStart = text.length;
    text += (text === '' ? '' : '\n\n') + body;
    const charEnd = text.length;

    const kind: Block['kind'] = isHeading
      ? 'section'
      : tag === 'li' || tag === 'dd' || tag === 'dt'
        ? 'list'
        : tag === 'td' || tag === 'th'
          ? 'table'
          : 'paragraph';

    blocks.push({
      kind,
      text: body,
      level,
      headingPath: trail.filter((x) => typeof x === 'string' && x !== '').join(' > '),
      charStart: charStart + (charStart === 0 ? 0 : 2),
      charEnd,
    });
    if (isHeading && level !== null) headings.push({ level, text: body, charStart });
  }

  return { blocks, text, headings };
}

export interface HtmlExtraction extends Extraction {
  blocks: Block[];
}

/**
 * Wrap anything that is not a document in one.
 *
 * linkedom throws on `document.body` when there is no `<html>` element, and an
 * empty string, whitespace or a bare text fragment all produce exactly that.
 * Each of those is reachable: the crawler has an explicit empty-body path, and
 * `text/plain` is in its content-type allowlist. Found when the entity layer
 * ran the extractor over a body the fixture served empty — which is the same
 * shape a real 200-with-no-content produces.
 *
 * Wrapping rather than refusing is deliberate: a plain-text page still has
 * content worth extracting, and returning an empty extraction would lose it.
 */
function asDocumentHtml(html: string): string {
  const trimmed = html.trim();
  if (trimmed === '') return '<html><head></head><body></body></html>';
  if (/^\s*(<!doctype|<html)/i.test(trimmed)) return html;
  /* A fragment with markup keeps it; plain text is escaped so that a stray
     angle bracket cannot invent an element. */
  const looksLikeMarkup = /<[a-z][\s\S]*>/i.test(trimmed);
  const body = looksLikeMarkup
    ? trimmed
    : `<pre>${trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  return `<html><head></head><body>${body}</body></html>`;
}

export function extractHtml(rawHtml: string, url: string): HtmlExtraction {
  const html = asDocumentHtml(rawHtml);
  const { document } = parseHTML(html);

  const jsonld = parseJsonLd(document);
  const canonicalHref = attr(document, 'link[rel="canonical"]', 'href');
  let canonicalUrl: string | null = null;
  if (canonicalHref !== null) {
    try {
      canonicalUrl = new URL(canonicalHref, url).toString();
    } catch {
      canonicalUrl = null;
    }
  }

  const ogTitle = meta(document, ['og:title', 'twitter:title']);
  const domTitle = clean(document.querySelector('title')?.textContent);
  const h1 = clean(document.querySelector('h1')?.textContent);
  const description = meta(document, ['og:description', 'twitter:description', 'description']);
  const siteName = meta(document, ['og:site_name']);
  const publishedMeta = meta(document, ['article:published_time', 'og:updated_time', 'date']);

  /*
   * Main text: Readability first, then progressively blunter fallbacks.
   *
   * Readability fails on plenty of real pages — a contact page is mostly
   * markup, a listing page is mostly links — and when it does, its answer is
   * empty rather than wrong. Falling back to <article>, then <main>, then
   * <body> means a thin page still yields its content instead of yielding
   * nothing, and `extractor` records which one answered so a later reader
   * knows how much to trust the boundary.
   */
  let root: LElement | null = null;
  let extractor: HtmlExtraction['extractor'] = 'body';
  try {
    const article = new Readability(parseHTML(html).document as unknown as ReadabilityDocument, {
      keepClasses: false,
    }).parse();
    if (article?.content != null && clean(article.textContent).length > 200) {
      root = parseHTML(`<div id="r">${article.content}</div>`).document.querySelector('#r');
      extractor = 'readability';
    }
  } catch {
    root = null;
  }
  if (root === null) {
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    if (article !== null) {
      root = article;
      extractor = 'article';
    } else if (main !== null) {
      root = main;
      extractor = 'main';
    } else {
      root = document.body;
      extractor = 'body';
    }
  }

  const rawBodyLen = clean(document.body?.textContent).length;
  const { blocks, text, headings } = blocksFrom(root);

  /* ---- links, before furniture removal touched the original document ---- */
  const docDomain = registrableDomain(url);
  const links: ExtractedLink[] = [];
  const hrefsForContact: Array<{ href: string; rel: string | null }> = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const raw = a.getAttribute('href') ?? '';
    const rel = clean(a.getAttribute('rel')) || null;
    if (raw.startsWith('mailto:') || raw.startsWith('tel:')) {
      hrefsForContact.push({ href: raw, rel });
      continue;
    }
    let abs: string;
    try {
      abs = new URL(raw, url).toString();
    } catch {
      continue;
    }
    if (!abs.startsWith('http')) continue;
    hrefsForContact.push({ href: abs, rel });
    links.push({
      href: abs,
      text: clean(a.textContent).slice(0, 200),
      rel,
      external: registrableDomain(abs) !== docDomain,
    });
  }

  /* ---- values, from strongest source to weakest ------------------------- */
  const values: ExtractedValue[] = [
    ...valuesFromJsonLd(jsonld),
    ...contactFromLinks(hrefsForContact),
    ...contactFromText(text),
  ];

  if (siteName !== null) {
    values.push({ field: 'orgName', value: siteName.value, method: 'opengraph', charStart: null, charEnd: null, evidence: 'og:site_name' });
  }
  if (description !== null) {
    values.push({
      field: 'description',
      value: description.value,
      method: description.method,
      charStart: null,
      charEnd: null,
      evidence: 'meta description',
    });
  }
  for (const el of document.querySelectorAll('address')) {
    const v = clean(el.textContent);
    if (v !== '') {
      values.push({ field: 'address', value: v, method: 'dom', charStart: null, charEnd: null, evidence: '<address>' });
    }
  }

  const published =
    publishedMeta !== null && !Number.isNaN(new Date(publishedMeta.value).getTime())
      ? new Date(publishedMeta.value)
      : null;

  return {
    url,
    canonicalUrl,
    title: ogTitle?.value ?? (domTitle !== '' ? domTitle : null) ?? (h1 !== '' ? h1 : null),
    description: description?.value ?? null,
    lang: attr(document, 'html', 'lang'),
    siteName: siteName?.value ?? null,
    publishedAt: published,
    text,
    blocks,
    headings,
    links,
    jsonld,
    values: dedupeValues(values, METHOD_STRENGTH),
    extractor,
    density: rawBodyLen === 0 ? 0 : Math.min(1, text.length / rawBodyLen),
  };
}
