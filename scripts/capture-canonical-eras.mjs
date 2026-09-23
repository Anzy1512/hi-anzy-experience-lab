#!/usr/bin/env node
/**
 * CANONICAL ERA CAPTURE — development only.
 *
 * Reads the commercial repository's own history, read-only, and emits
 * `src/content/canonicalEras.ts` for Time Machine.
 *
 *   node scripts/capture-canonical-eras.mjs
 *
 * ── WHAT THIS FOUND, AND WHY IT CHANGED THE MODE ────────────────────────────
 *
 * The brief asked for genuine Hi Anzy history in place of a history of the web.
 * The honest answer, established before writing a line of it: **the repository
 * does not contain years of Hi Anzy website history.** `origin/main` begins on
 * 2026-08-20 with "Recovered Emergent project baseline" and reaches its current
 * head twelve days later. Sixty-nine commits, one fortnight.
 *
 * So there is no 1995 Hi Anzy site to reconstruct, and there was never going to
 * be one. What there is instead is better than a pastiche and worse than a
 * legend: a fortnight of real, dated, verifiable change, where a page count and
 * a route table can be counted at each point rather than described.
 *
 * Every field below is derived by running git against a commit. Nothing is
 * characterised, summarised or dramatised by this script — the numbers are
 * counted and the subject line is the one the author wrote.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { AGENCY } from './canonical-source.mjs';

const argPath = process.argv.indexOf('--path');
const REPO = argPath > -1 ? process.argv[argPath + 1] : AGENCY.defaultPath;
const OUT = 'src/content/canonicalEras.ts';

/**
 * The checkpoints.
 *
 * Chosen because each is a state the site demonstrably *was* — a baseline, an
 * integration, a redesign, a hardening pass, a feature landing, an audit — not
 * because seven is a nice number. Where two candidates said the same thing, the
 * later one is kept.
 */
const CHECKPOINTS = [
  'fbcbb0f',
  '625c80d',
  'e5f1e52',
  '45513ca',
  '703d91c',
  '6bea67f',
  'eac2282',
];

if (!existsSync(REPO)) {
  console.log('CANONICAL REPO     not present — nothing captured, existing file left alone.');
  process.exit(0);
}

const git = (a) => execSync(`git -C "${REPO}" ${a}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const at = (sha, path) => {
  try {
    return git(`show ${sha}:${path}`);
  } catch {
    return null;
  }
};

/** Count things that can actually be counted at a commit. */
function measure(sha) {
  const app = at(sha, 'frontend/src/App.js');
  const content = at(sha, 'frontend/src/data/content.js');
  const css = at(sha, 'frontend/src/App.css');

  const routes = app ? (app.match(/path="/g) ?? []).length : null;
  const pages = app
    ? new Set([...app.matchAll(/@\/pages\/([A-Za-z0-9/_-]+)/g)].map((m) => m[1])).size
    : null;

  /* Fonts by ROLE, from the site's own variables, so a face swap is visible as
     a change of role rather than as a change of name. */
  const faces = css
    ? [...new Set([...css.matchAll(/--font-[a-z]+:\s*"([^"]+)"/g)].map((m) => m[1]))]
    : null;

  let brand = null;
  try {
    brand = git(`ls-tree -r --name-only ${sha} frontend/public/brand`)
      .split('\n')
      .filter((l) => l.trim()).length;
  } catch {
    /* the directory may not exist yet at this commit, which is itself a fact */
  }

  const exports = content
    ? [...content.matchAll(/export const ([A-Z_0-9]+)/g)].map((m) => m[1]).length
    : null;

  return { routes, pages, faces, brand, exports };
}

const out = [];
let prev = null;

for (const sha of CHECKPOINTS) {
  let full, date, subject;
  try {
    full = git(`rev-parse ${sha}`).trim();
    date = git(`log -1 --format=%cs ${sha}`).trim();
    subject = git(`log -1 --format=%s ${sha}`).trim();
  } catch {
    console.log(`MISSING            ${sha} — skipped`);
    continue;
  }

  const m = measure(sha);

  /* What changed since the previous checkpoint, counted rather than described. */
  let changed = null;
  if (prev) {
    const stat = git(`diff --shortstat ${prev} ${sha}`).trim();
    const files = Number(stat.match(/(\d+) files? changed/)?.[1] ?? 0);
    const ins = Number(stat.match(/(\d+) insertions?/)?.[1] ?? 0);
    const del = Number(stat.match(/(\d+) deletions?/)?.[1] ?? 0);
    const commits = Number(git(`rev-list --count ${prev}..${sha}`).trim());
    changed = { files, insertions: ins, deletions: del, commits };
  }

  out.push({
    sha: full.slice(0, 7),
    date,
    subject,
    routes: m.routes,
    pages: m.pages,
    faces: m.faces,
    brandAssets: m.brand,
    contentExports: m.exports,
    changed,
  });
  console.log(`CAPTURED           ${full.slice(0, 7)} ${date}  routes=${m.routes} pages=${m.pages} brand=${m.brand}`);
  prev = sha;
}

const first = git(`log --reverse --format=%cs origin/main`).split('\n')[0].trim();
const last = git(`log -1 --format=%cs origin/main`).trim();
const total = git('rev-list --count origin/main').trim();

const banner = `/**
 * THE RECORDED HISTORY — what the repository can actually prove.
 *
 * GENERATED. Do not edit by hand.
 *   scripts/capture-canonical-eras.mjs
 *   source  Anzy1512/hi-anzy-platform, origin/main
 *   read    ${new Date().toISOString().slice(0, 10)}
 *
 * ── THE HONEST SPAN ─────────────────────────────────────────────────────────
 *
 * ${total} commits, ${first} to ${last}. That is the whole of it.
 *
 * There is no decade of Hi Anzy website history in this repository and this file
 * does not pretend there is. Every era below is a commit that exists, on a date
 * that is real, with counts taken by running git against that commit rather than
 * by being described. Anything before ${first} is NOT RECORDED — not "early
 * days", not "the first site", not a reconstruction. Unrecorded.
 */

export interface EraChange {
  files: number;
  insertions: number;
  deletions: number;
  commits: number;
}

export interface CanonicalEra {
  sha: string;
  date: string;
  /** The author's own subject line, unedited. */
  subject: string;
  /** Route declarations in App.js at this commit. */
  routes: number | null;
  /** Distinct page components mounted at this commit. */
  pages: number | null;
  /** Type faces the stylesheet named at this commit. */
  faces: string[] | null;
  /** Files in frontend/public/brand at this commit. */
  brandAssets: number | null;
  /** Exports in the content module at this commit. */
  contentExports: number | null;
  /** Counted against the previous checkpoint. Null for the first. */
  changed: EraChange | null;
}

export const RECORD_FIRST = '${first}';
export const RECORD_LAST = '${last}';
export const RECORD_COMMITS = ${total};

export const CANONICAL_ERAS: CanonicalEra[] = ${JSON.stringify(out, null, 2)};
`;

writeFileSync(OUT, banner, 'utf8');
console.log(`WROTE              ${OUT}`);
console.log(`SPAN               ${first} → ${last}  (${total} commits)`);
