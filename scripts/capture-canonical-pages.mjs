#!/usr/bin/env node
/**
 * CANONICAL PAGE CAPTURE — development only.
 *
 * Reads real Hi Anzy page sources from `origin/main`, read-only, and emits
 * `src/content/canonicalPages.ts` for the Reality Compiler to compile.
 *
 *   node scripts/capture-canonical-pages.mjs
 *   node scripts/capture-canonical-pages.mjs --path /path/to/hi-anzy-platform
 *
 * ── WHY EXTRACTION AND NOT A SCREENSHOT ─────────────────────────────────────
 *
 * A screenshot is a raster of one viewport at one moment, and the Compiler's
 * whole subject is *structure* — the grid, the layers, the depth order. You
 * cannot separate a PNG into planes without inventing the planes. What the
 * commercial source actually carries is better than a picture of it: named
 * sections (`data-index-label`), the real twelve-column grid, typography by
 * role rather than by face (`font-display` / `font-editorial` / `font-mono-sys`),
 * the real hex tokens, and the real component names. All of it addressable back
 * to a file and a line.
 *
 * It also cannot go stale silently or lie: every field below is quoted from a
 * file at a known commit, and anything the source computes at runtime is marked
 * DYNAMIC rather than guessed at.
 *
 * ── WHY IT IS NOT IN THE BUILD ──────────────────────────────────────────────
 *
 * Same rule as the sync check. The deployed Lab must stand alone; nothing in
 * production may require the canonical repository to exist on disk. This writes
 * a committed file and is run by a person.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { AGENCY } from './canonical-source.mjs';

const argPath = process.argv.indexOf('--path');
const REPO = argPath > -1 ? process.argv[argPath + 1] : AGENCY.defaultPath;
const OUT = 'src/content/canonicalPages.ts';

/** The routes worth compiling. Each is a real page of the commercial site. */
const PAGES = [
  { route: '/', file: 'frontend/src/pages/Home.js', name: 'HOME' },
  { route: '/what-we-do', file: 'frontend/src/pages/WhatWeDo.js', name: 'WHAT WE DO' },
  { route: '/how-we-work', file: 'frontend/src/pages/HowWeWork.js', name: 'HOW WE WORK' },
  { route: '/network', file: 'frontend/src/pages/Network.js', name: 'NETWORK' },
  { route: '/why-hi-anzy', file: 'frontend/src/pages/WhyHiAnzy.js', name: 'WHY HI ANZY' },
];

if (!existsSync(REPO)) {
  console.log('CANONICAL REPO     not present — nothing captured, existing file left alone.');
  process.exit(0);
}

const git = (a) => execSync(`git -C "${REPO}" ${a}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const commit = git('rev-parse origin/main').trim();
const shortCommit = commit.slice(0, 7);

/* -------------------------------------------------------------------------- */
/* EXTRACTION                                                                  */
/* -------------------------------------------------------------------------- */

/** Collapse a JSX text run to readable prose, or null if it is all expression. */
function text(raw) {
  if (!raw) return null;
  let t = raw
    // A JSX expression is content this file cannot resolve. Say so rather than
    // dropping it, or a heading reads as shorter than it is.
    .replace(/\{[^{}]*\}/g, ' ⟨DYNAMIC⟩ ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t === '⟨DYNAMIC⟩') return null;
  return t;
}

const uniq = (a) => [...new Set(a)].filter(Boolean);

/**
 * A page's own composition, where it has one.
 *
 * Home is not built from `<section>` tags at all — it mounts eighteen named
 * components in order, with `SectionConnector`s between them carrying labels
 * like "SYMPTOM → QUESTION" and "CAPABILITY → METHOD". That is a better
 * structure than section tags and it is the one the Compiler actually wants:
 * the page states its own reading order *and the logic of each transition*,
 * which is precisely the thing that becomes depth order in space.
 *
 * So composed pages are followed into their parts rather than reported as
 * empty. Anything not resolvable to a file is still listed by name — a mount
 * this script cannot read is a real part of the page and saying "eighteen
 * sections, I could open twelve" is honest where dropping six is not.
 */
function composition(src, imports) {
  const ret = src.slice(src.search(/return\s*\(/));
  const mounts = [...ret.matchAll(/<([A-Z][A-Za-z0-9]*)\b([^>]*)>/g)];
  const out = [];
  for (const m of mounts) {
    const name = m[1];
    if (name === 'Seo' || name === 'Suspense' || name === 'Reveal') continue;
    if (name === 'SectionConnector') {
      const label = m[2].match(/label="([^"]+)"/)?.[1];
      if (label) out.push({ kind: 'connector', label });
      continue;
    }
    if (out.some((o) => o.kind === 'mount' && o.name === name)) continue;
    out.push({ kind: 'mount', name, file: imports[name] ?? null });
  }
  return out;
}

/**
 * Which canonical data exports a component pulls its content from.
 *
 * Several of Home's sections render entirely from `@/data/content` — WhyHowNow,
 * WhatWeDoGrid, Trust, NetworkPreview — so there is no literal copy in their
 * JSX to quote and the first pass reported them as carrying no text. That read
 * as a gap in the page when it is actually a fact about it, and a useful one:
 * those exports are the same ones `src/content/canonical.ts` already mirrors,
 * so naming them ties the plane to data the Lab can show rather than to a blank.
 */
function dataImports(src) {
  const out = [];
  for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from\s+"@\/data\/(?:content|disciplines)"/g)) {
    for (const raw of m[1].split(',')) {
      const n = raw.trim();
      if (n && /^[A-Z_]+$/.test(n)) out.push(n);
    }
  }
  return [...new Set(out)];
}

/** `Name -> frontend/src/...` for every local import in a file. */
function importMap(src) {
  const map = {};
  for (const m of src.matchAll(/import\s+\{?\s*([A-Za-z0-9_,\s]+?)\s*\}?\s+from\s+"@\/([^"]+)"/g)) {
    const target = `frontend/src/${m[2]}.js`;
    for (const raw of m[1].split(',')) {
      const n = raw.trim();
      if (n && /^[A-Z]/.test(n)) map[n] = target;
    }
  }
  return map;
}

function captureFile(src, file) {
  const sections = [];
  /*
   * Split on top-level <section ...>. The commercial pages that use sections
   * use them consistently, which is the only reason a source-level read is
   * honest here: a page that nested sections arbitrarily would need a real
   * parser and this would be guessing.
   */
  const parts = src.split(/<section\b/);
  parts.shift();

  parts.forEach((part, i) => {
    const body = part;
    const label =
      body.match(/data-index-label="([^"]+)"/)?.[1] ??
      body.match(/data-testid="([^"]+)"/)?.[1]?.toUpperCase().replace(/-/g, ' ') ??
      null;

    const headings = [...body.matchAll(/<h([1-3])[^>]*>([\s\S]{0,400}?)<\/h\1>/g)]
      .map((m) => ({ level: Number(m[1]), text: text(m[2]) }))
      .filter((h) => h.text);

    const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]{0,500}?)<\/p>/g)]
      .map((m) => text(m[1]))
      .filter(Boolean)
      .slice(0, 4);

    /* Typography by ROLE, which is what the site itself encodes. */
    const roles = uniq(
      [
        /font-display/.test(body) ? 'SYSTEM (Rajdhani)' : null,
        /font-editorial|font-accent/.test(body) ? 'HUMAN (Newsreader)' : null,
        /font-mono-sys|sys-chip/.test(body) ? 'TECHNICAL (spaced Rajdhani)' : null,
      ].filter(Boolean),
    );

    const colours = uniq([...body.matchAll(/#([0-9A-Fa-f]{6})\b/g)].map((m) => `#${m[1].toUpperCase()}`));

    /*
     * WHICH PARTS OF THE REAL PAGE CARRY A PICTURE.
     *
     * Added in Phase 8.6 E. Without it the Compiler turned an image-bearing
     * section into a plane of text like any other, which is a false report
     * about the page: on the real site those parts are mostly picture, and a
     * tool that claims to take a website apart should not quietly drop the
     * half of it that is not words.
     *
     * The brand STEM is recorded rather than a path, because the Lab serves the
     * same owned files from its own public/brand under BASE_URL. Nothing is
     * hotlinked from the commercial site and nothing is invented: `<Picture
     * name="pop-hands-a" />` is the site's own component and `name` is the file
     * stem, so this is a direct read of the markup.
     */
    const images = uniq([
      ...[...body.matchAll(/<Picture\b[^>]*?\bname=["']([a-z0-9-]+)["']/g)].map((m) => m[1]),
      ...[...body.matchAll(/brand\/([a-z0-9-]+)\.(?:avif|png|jpg|webp)/g)].map((m) => m[1]),
    ]);
    const components = uniq(
      [...body.matchAll(/<([A-Z][A-Za-z0-9]+)\b/g)].map((m) => m[1]),
    ).filter((c) => c !== 'Reveal' && c !== 'Seo');
    const columns = Number(body.match(/lg:grid-cols-(\d+)/)?.[1] ?? 0) || null;
    const dark = /panel-dark|bg-\[#1D2424\]|bg-\[#232A2A\]/.test(body);

    if (!label && headings.length === 0 && paras.length === 0) return;

    sections.push({
      index: String(i + 1).padStart(2, '0'),
      label: label ?? `SECTION ${i + 1}`,
      headings,
      copy: paras,
      roles,
      colours,
      images,
      components,
      columns,
      ground: dark ? 'INK' : 'PAPER',
      source: `${file}#section-${i + 1}`,
    });
  });

  return sections;
}

/* -------------------------------------------------------------------------- */

const out = [];
for (const p of PAGES) {
  let src;
  try {
    src = git(`show ${commit}:${p.file}`);
  } catch {
    console.log(`MISSING            ${p.file} — skipped`);
    continue;
  }
  const seo = src.match(/<Seo\s+title="([^"]*)"\s*\n?\s*description="([^"]*)"/) ??
    src.match(/title="([^"]*)"[\s\S]{0,80}?description="([^"]*)"/);

  let sections = captureFile(src, p.file);

  /* A composed page: follow its own parts. */
  if (sections.length === 0) {
    const imports = importMap(src);
    const comp = composition(src, imports);
    let pending = null;
    for (const node of comp) {
      if (node.kind === 'connector') {
        pending = node.label;
        continue;
      }
      let childSections = [];
      if (node.file) {
        try {
          const childSrc = git(`show ${commit}:${node.file}`);
          childSections = captureFile(childSrc, node.file);
          if (childSections.length === 0) {
            /* No <section> inside either — read the component's own body as
               one block rather than reporting it as absent. */
            childSections = captureFile(`<section ${childSrc}`, node.file);
          }
        } catch {
          /* Not a file this script can resolve. It is still a real part of the
             page, so it is listed by name with nothing claimed about it. */
        }
      }
      const first = childSections[0];
      let data = [];
      if (node.file) {
        try {
          data = dataImports(git(`show ${commit}:${node.file}`));
        } catch {
          /* already reported as unreadable below */
        }
      }
      sections.push({
        data,
        index: String(sections.length + 1).padStart(2, '0'),
        label: node.name.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase(),
        transition: pending,
        headings: first?.headings ?? [],
        copy: first?.copy ?? [],
        roles: first?.roles ?? [],
        colours: first?.colours ?? [],
        images: first?.images ?? [],
        components: first?.components ?? [],
        columns: first?.columns ?? null,
        ground: first?.ground ?? 'PAPER',
        source: node.file ? `${node.file}` : `${p.file} → <${node.name}> (not resolvable to a file)`,
        read: Boolean(first),
      });
      pending = null;
    }
  }
  const pageData = dataImports(src);
  sections = sections.map((s) => ({ transition: null, read: true, data: pageData, ...s }));

  out.push({
    route: p.route,
    name: p.name,
    title: seo?.[1] ?? null,
    description: seo?.[2] ?? null,
    file: p.file,
    sections,
  });
  const readable = sections.filter((s) => s.read).length;
  console.log(
    `CAPTURED           ${p.route.padEnd(14)}${String(sections.length).padStart(2)} sections, ${readable} read`,
  );
}

const banner = `/**
 * CANONICAL PAGES — real commercial pages, read at a known commit.
 *
 * GENERATED. Do not edit by hand.
 *   scripts/capture-canonical-pages.mjs
 *   source  Anzy1512/hi-anzy-platform @ ${shortCommit} (origin/main)
 *   read    ${new Date().toISOString().slice(0, 10)}
 *
 * Every string below is quoted from the commercial frontend's own source. Text
 * the page computes at runtime appears as \u27e8DYNAMIC\u27e9 rather than being guessed
 * at, which is why some headings are part prose and part marker: that is
 * genuinely what the source says at that point.
 *
 * This is a STRUCTURAL READ, not a screenshot. See the capture script for why —
 * the Compiler's subject is the grid, the layers and the depth order, and none
 * of those survive rasterisation.
 */

export interface CanonicalHeading {
  level: number;
  text: string;
}

export interface CanonicalSection {
  index: string;
  /** The site's own \`data-index-label\`, or the component it mounts. */
  label: string;
  /**
   * The label the page's own \`SectionConnector\` gives the move *into* this
   * section — "SYMPTOM → QUESTION", "CAPABILITY → METHOD". The commercial
   * page states the logic of its own reading order, so the Compiler does not
   * have to invent one.
   */
  transition: string | null;
  /** False when the part is real but this script could not open its file. */
  read: boolean;
  /**
   * Canonical data exports this part renders from, where its copy is not
   * literal in the JSX. These are the same names \`content/canonical.ts\`
   * mirrors, so a plane with no quotable text still says what fills it.
   */
  data: string[];
  headings: CanonicalHeading[];
  copy: string[];
  /** Typography by role, as the site's own classes encode it. */
  roles: string[];
  /** Hex values written into this section's own markup. */
  colours: string[];
  /**
   * Brand asset stems this part actually renders, read from its own markup.
   * The Lab serves the same owned files from public/brand; nothing is
   * hotlinked and nothing is inferred from a section's subject.
   */
  images: string[];
  /** Real component names this section mounts. */
  components: string[];
  /** Columns of the real twelve-column grid this section spans. */
  columns: number | null;
  ground: 'PAPER' | 'INK';
  /** File and section ordinal in the canonical repository. */
  source: string;
}

export interface CanonicalPage {
  route: string;
  name: string;
  title: string | null;
  description: string | null;
  file: string;
  sections: CanonicalSection[];
}

export const CANONICAL_PAGES_COMMIT = '${shortCommit}';

export const CANONICAL_PAGES: CanonicalPage[] = ${JSON.stringify(out, null, 2)};

export function canonicalPage(route: string): CanonicalPage | undefined {
  return CANONICAL_PAGES.find((p) => p.route === route);
}
`;

writeFileSync(OUT, banner, 'utf8');
console.log(`WROTE              ${OUT}`);
console.log(`COMMIT             ${shortCommit}`);
