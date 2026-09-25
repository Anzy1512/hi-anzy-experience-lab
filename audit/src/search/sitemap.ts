import type { Crawler } from '../crawl/fetch.ts';
import { normaliseForIdentity, urlFacts } from '../crawl/url.ts';
import {
  unavailableResponse,
  type Availability,
  type Discovery,
  type SearchOptions,
  type SearchProvider,
  type SearchResponse,
} from './types.ts';

/**
 * DISCOVERY BY INVITATION.
 *
 * ── WHY THIS IS THE ADAPTER THAT GETS PROVEN ────────────────────────────────
 *
 * The `sitemap` provider id has been in `ProviderId` since layer 2 with nothing
 * behind it. That gap mattered more than it looked: every other discovery path
 * this service has needs either a key nobody has issued or a SearXNG instance
 * nobody is hosting, which means the whole discovery half of the architecture
 * had been exercised only against fixtures. A sitemap needs neither. It is the
 * one path that can be run against real commercial sites today and shown to
 * work, rather than asserted to work once someone pays for a subscription.
 *
 * It is also the politest discovery there is. A sitemap is a file a site
 * publishes to say "these are my pages, please read them" — so the URLs come
 * from the subject rather than from an engine's guess about the subject, and
 * there is no third party keeping a log of which companies are being looked at.
 *
 * ── AND WHAT IT STILL IS NOT ────────────────────────────────────────────────
 *
 * A `<loc>` is a URL. Not a page, not a fact, not evidence. Every one goes
 * through the same crawler as anything else, which means robots decides, the
 * private-address guard decides, the size cap decides and the rate limiter
 * decides — none of which this file can see or influence. The temptation this
 * format offers is `<lastmod>`: it is free, it looks authoritative, and it is
 * the site's own unverified claim about itself. It is carried into
 * `publishedAt` for provenance and ranking exactly as a search engine's date
 * would be, and nothing downstream treats it as established.
 *
 * ── THE TWO THINGS THAT GO WRONG ────────────────────────────────────────────
 *
 * A site that refuses. `Disallow: /` covers `/robots.txt` and the sitemaps it
 * names, so a refusal has to arrive as `unavailable` carrying the reason. An
 * empty result list would say "this site publishes nothing", which is a
 * statement about the site rather than about our permission to read it.
 *
 * A sitemap index of sitemap indexes. The format is recursive and a large site
 * will happily hand back fifty thousand URLs across two hundred files, which is
 * a crawl budget disguised as a document. Recursion stops at one level and both
 * the file count and the URL count are capped, so a pilot cannot be talked into
 * an unbounded crawl by the shape of somebody's CMS output.
 */

/** How many sitemap files one origin may cost us, index included. */
const MAX_FILES = 4;

/**
 * Tags may be namespace-prefixed (`<ns:loc>`), and real sitemaps do this.
 * Matching the prefix is cheaper than being surprised by it in production.
 */
const tag = (name: string): string => `<(?:[A-Za-z0-9_.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?${name}>`;

const LOC = new RegExp(tag('loc'), 'i');
const LASTMOD = new RegExp(tag('lastmod'), 'i');
const URL_BLOCK = new RegExp(tag('url'), 'gi');
const SITEMAP_BLOCK = new RegExp(tag('sitemap'), 'gi');
const LOC_ANY = new RegExp(tag('loc'), 'gi');
const IS_INDEX = /<(?:[A-Za-z0-9_.-]+:)?sitemapindex\b/i;

/**
 * XML text to the string it stands for.
 *
 * `&amp;` is unescaped LAST and deliberately. Doing it first turns the
 * perfectly legal `&amp;lt;` into `&lt;` and then into `<`, which invents
 * markup inside a URL that never had any — and a URL with a query string is
 * precisely where `&amp;` appears.
 */
function decodeXml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/g, '&')
    .trim();
}

function asDate(raw: string | undefined): Date | null {
  if (raw === undefined) return null;
  const s = decodeXml(raw);
  if (s === '') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface SitemapEntry {
  loc: string;
  /** The site's own claim about when this changed. Never verified here. */
  lastmod: Date | null;
}

export interface SitemapDocument {
  kind: 'index' | 'urlset';
  entries: SitemapEntry[];
}

/**
 * Read one sitemap file.
 *
 * Exported because it is the part worth testing without a network: the
 * namespace prefixes, the CDATA, the entity order and the malformed-but-common
 * file with bare `<loc>` tags and no `<url>` wrapper are all decided here.
 */
export function readSitemap(xml: string): SitemapDocument {
  const kind: 'index' | 'urlset' = IS_INDEX.test(xml) ? 'index' : 'urlset';
  const blocks = kind === 'index' ? SITEMAP_BLOCK : URL_BLOCK;
  blocks.lastIndex = 0;

  const entries: SitemapEntry[] = [];
  for (const m of xml.matchAll(blocks)) {
    const body = m[1] ?? '';
    const loc = LOC.exec(body)?.[1];
    if (loc === undefined) continue;
    const decoded = decodeXml(loc);
    if (decoded === '') continue;
    entries.push({ loc: decoded, lastmod: asDate(LASTMOD.exec(body)?.[1]) });
  }

  /*
   * A file with `<loc>` tags and no wrapper is malformed and not rare. Reading
   * the locations it does have beats discarding a real sitemap over a missing
   * element, and it cannot invent anything: a `<loc>` is still only a URL.
   */
  if (entries.length === 0) {
    LOC_ANY.lastIndex = 0;
    for (const m of xml.matchAll(LOC_ANY)) {
      const decoded = decodeXml(m[1] ?? '');
      if (decoded !== '') entries.push({ loc: decoded, lastmod: null });
    }
  }

  return { kind, entries };
}

export interface SitemapProviderOptions {
  /** Files per origin, index included. */
  maxFiles?: number;
}

export class SitemapProvider implements SearchProvider {
  readonly id = 'sitemap' as const;
  readonly label = 'Published sitemap';
  private readonly crawler: Crawler;
  private readonly maxFiles: number;

  /**
   * The crawler is required rather than defaulted.
   *
   * A provider that could quietly construct its own would be a provider with
   * its own rate limiter, its own robots cache and its own opinion about
   * private addresses — a second crawler, invisible at the call site, fetching
   * from the same hosts as the first. Taking the caller's means a pilot's
   * politeness budget is one budget.
   */
  constructor(crawler: Crawler, opts: SitemapProviderOptions = {}) {
    this.crawler = crawler;
    this.maxFiles = opts.maxFiles ?? MAX_FILES;
  }

  async available(): Promise<Availability> {
    return { ok: true, detail: 'needs no key; reads robots.txt and the sitemaps it names' };
  }

  /**
   * `query` is one or more origins or URLs, whitespace- or comma-separated.
   *
   * The same shape `DirectProvider` takes, so a pilot can hand either one the
   * same seed list and the registry stays interchangeable.
   */
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const startedAt = performance.now();
    const limit = opts.limit ?? 50;
    const discoveredAt = new Date();
    const seen = new Set<string>();
    const results: Discovery[] = [];
    const refusals: string[] = [];

    const origins: string[] = [];
    for (const token of query.split(/[\s,]+/)) {
      if (token === '') continue;
      const facts = urlFacts(token);
      if (facts === null) continue;
      const origin = facts.url.origin;
      if (!origins.includes(origin)) origins.push(origin);
    }

    if (origins.length === 0) {
      return unavailableResponse(
        this.id,
        query,
        { reason: 'not_configured', detail: 'no fetchable origin was supplied to read a sitemap from' },
        Math.round(performance.now() - startedAt),
      );
    }

    for (const origin of origins) {
      if (results.length >= limit) break;
      const found = await this.forOrigin(origin, opts);
      if (found.refused !== null) {
        refusals.push(`${origin}: ${found.refused}`);
        continue;
      }
      for (const entry of found.entries) {
        if (results.length >= limit) break;
        /* Only pages belonging to the origin whose sitemap named them. A
           sitemap may legally list another host; following that would let one
           site nominate crawl targets anywhere. */
        const facts = urlFacts(entry.loc);
        if (facts === null || facts.url.origin !== origin) continue;
        const identity = normaliseForIdentity(facts.url);
        if (identity === null || seen.has(identity)) continue;
        seen.add(identity);
        results.push({
          provider: this.id,
          query: origin,
          url: facts.url.toString(),
          canonicalUrl: null,
          title: null,
          /* A sitemap carries no summary, and building one out of the path
             would be the same mistake as trusting a search snippet. */
          snippet: null,
          rank: results.length + 1,
          publishedAt: entry.lastmod,
          discoveredAt,
          providerMetadata: { origin, sitemap: entry.sitemap, lastmod: entry.lastmod?.toISOString() ?? null },
        });
      }
    }

    const elapsedMs = Math.round(performance.now() - startedAt);

    /*
     * Every origin refused, or published nothing readable. That is reported as
     * unavailable rather than as an empty result set: "we were not allowed to
     * look" and "there is nothing there" are different findings, and a caller
     * handed the second cannot recover the first.
     */
    if (results.length === 0 && refusals.length > 0) {
      return unavailableResponse(this.id, query, { reason: 'rejected', detail: refusals.join('; ') }, elapsedMs);
    }

    return { provider: this.id, query, results, elapsedMs };
  }

  /** Robots → the sitemaps it names → the conventional one → entries. */
  private async forOrigin(
    origin: string,
    opts: SearchOptions,
  ): Promise<{ entries: Array<SitemapEntry & { sitemap: string }>; refused: string | null }> {
    const advertised = await this.crawler.sitemaps(origin);
    if (advertised.refused !== null) return { entries: [], refused: advertised.refused };

    /*
     * The conventional location, only when robots.txt named none.
     *
     * Guessing in addition to what a site advertised would mean ignoring the
     * one file where it stated its answer. Guessing when it advertised nothing
     * is a single well-known request that a site is free to 404.
     */
    const queue = advertised.sitemaps.length > 0 ? [...advertised.sitemaps] : [`${origin}/sitemap.xml`];

    const entries: Array<SitemapEntry & { sitemap: string }> = [];
    const fetched = new Set<string>();
    const problems: string[] = [];
    let files = 0;
    let depthAllowance = 1;

    while (queue.length > 0 && files < this.maxFiles) {
      const next = queue.shift();
      if (next === undefined) break;
      const facts = urlFacts(next);
      if (facts === null || facts.url.origin !== origin) continue;
      const key = normaliseForIdentity(facts.url);
      if (key === null || fetched.has(key)) continue;
      fetched.add(key);
      files += 1;

      const res = await this.crawler.fetch({
        url: facts.url.toString(),
        ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
      });
      if (res.outcome !== 'ok' || res.body === null) {
        problems.push(`${facts.url.pathname} ${res.outcome}${res.detail === '' ? '' : ` (${res.detail})`}`);
        continue;
      }

      const doc = readSitemap(res.body);
      if (doc.kind === 'index') {
        /* One level. A sitemap index naming sitemap indexes is either a very
           large site or a loop, and neither belongs in a bounded pilot. */
        if (depthAllowance > 0) {
          depthAllowance -= 1;
          for (const e of doc.entries) queue.push(e.loc);
        } else {
          problems.push(`${facts.url.pathname} is a sitemap index below the one level this provider follows`);
        }
        continue;
      }
      for (const e of doc.entries) entries.push({ ...e, sitemap: facts.url.toString() });
    }

    if (entries.length === 0) {
      return {
        entries: [],
        refused:
          problems.length > 0
            ? problems.join('; ')
            : advertised.sitemaps.length > 0
              ? 'robots.txt names a sitemap that listed no pages'
              : 'no sitemap advertised in robots.txt and none at /sitemap.xml',
      };
    }
    return { entries, refused: null };
  }
}
