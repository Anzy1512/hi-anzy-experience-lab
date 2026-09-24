#!/usr/bin/env node
/**
 * CANONICAL SYNC CHECK — development only.
 *
 * `src/content/canonical.ts` mirrors the commercial frontend. A mirror goes
 * stale silently, which is its one real weakness; this reports when it has.
 *
 * It is deliberately NOT part of the build. The deployed Experience Lab must
 * stand alone, and nothing in production may depend on the canonical repository
 * existing on disk. If the repo is not here, this says so and exits 0.
 *
 *   node scripts/check-canonical-sync.mjs
 *   node scripts/check-canonical-sync.mjs --path /path/to/hi-anzy-website-2.0
 *   node scripts/check-canonical-sync.mjs --fetch        # refresh origin/main first
 *
 * ── TWO CORRECTIONS THIS VERSION MAKES ──────────────────────────────────────
 *
 * 1. IT READS `origin/main`, NOT THE WORKING TREE.
 *    The previous version read the checked-out files and compared `HEAD`. Both
 *    are properties of whatever branch the developer happens to be standing on.
 *    The local clone used for Phase 8 staging sits on `integration/lab-staging`
 *    with a `main` two unpushed commits *ahead* of the remote, so the old check
 *    was reading neither canonical truth nor anything reproducible. Everything
 *    below comes from `git show origin/main:<path>` — read-only, branch-proof,
 *    and the same answer on any machine.
 *
 * 2. IT HASHES THE SOURCES THE LAB ACTUALLY MIRRORS, NOT THE COMMIT.
 *    Comparing commit SHAs answers "has the repository moved", which is not the
 *    question. Measured: canonical moved twenty commits between `6e36db1` and
 *    `eac2282` without changing one byte of `content.js`, `disciplines.js` or
 *    the route table. Commit equality called that STALE; it was CURRENT. Drift
 *    is per-source or it is noise, so each mirrored file carries its own hash
 *    and reports for itself.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AGENCY, LEGACY, MIRRORED_FROM, identifyClone, provenanceLine } from './canonical-source.mjs';

const argv = process.argv;
const argPath = argv.indexOf('--path');
const REPO = argPath > -1 ? argv[argPath + 1] : AGENCY.defaultPath;
const WANT_FETCH = argv.includes('--fetch');

/*
 * WHAT A GREEN ROW MEANS, PER TREATMENT.
 *
 * Phase 8.12C re-read all four sources at `0208378` and stamped their hashes,
 * and three of them had drifted. Only one of the three changed anything in the
 * Lab, so it is worth being exact about what CURRENT claims:
 *
 *   MIRROR     the Lab's values ARE these values. `content.js` drifted and the
 *              changed fields were adopted into `src/content/canonical.ts`.
 *   REFERENCE  the Lab depends on facts IN this file, not on the file.
 *              `App.js` drifted by 78 lines and its route table is identical:
 *              24 paths, none added, none removed. The drift is an error
 *              boundary and a backdrop component, which the Lab does not have
 *              and does not want.
 *   TRANSFORM  the Lab inherits brand truth from this file and expresses it
 *              its own way. `App.css` drifted by 213 lines and all 25 custom
 *              properties, every font-family declaration and every brand colour
 *              are unchanged. The six new colour literals belong to a
 *              decorative isometric cube on the Agency's own grid.
 *
 * So CURRENT here means "read and reconciled at this commit", not "copied".
 * Stamping a REFERENCE or TRANSFORM hash without reading the file would be
 * exactly the silent-blessing failure this script was rewritten to prevent.
 */

/** Canonical commit these hashes were taken from, and when. */
const CANONICAL_REMOTE_SHA = '020837893c0af5e7f2e5cda72734b430c955cd37';
const SYNC_DATE = '2026-09-24';

/**
 * Every canonical file the Lab mirrors, with its sha256/16 at the synced
 * commit. `exports` are names `canonical.ts` depends on by name — a rename
 * there is a silent breakage here, which a hash alone would report as ordinary
 * drift rather than as the breakage it is.
 */
const SOURCES = [
  {
    path: 'frontend/src/data/content.js',
    sha: 'dfece4ad4159fafe',
    lab: 'src/content/canonical.ts',
    treatment: 'MIRROR',
    exports: [
      'METHOD_STAGES', 'CATEGORIES', 'WHY_HOW_NOW', 'TRUST_PRINCIPLES',
      'AUDIENCES', 'DIAGNOSTIC_AREAS', 'DIAGNOSTIC_OUTCOMES', 'SOMETHINGS_OFF',
      'NETWORK_CATEGORIES_HOME', 'INSIGHT_CATEGORIES',
    ],
  },
  {
    path: 'frontend/src/data/disciplines.js',
    sha: '697d447fbb8a80f5',
    lab: 'src/content/canonical.ts (network taxonomy)',
    treatment: 'MIRROR',
    exports: [],
  },
  {
    path: 'frontend/src/App.js',
    sha: 'de4b393007dc71dc',
    lab: 'src/content/canonicalManifest.ts (ROUTES)',
    treatment: 'REFERENCE',
    exports: [],
  },
  {
    path: 'frontend/src/App.css',
    sha: '492c83ab2deb52fe',
    lab: 'src/design-system/* (typography + colour truth)',
    treatment: 'TRANSFORM',
    exports: [],
  },
];

const git = (args) => execSync(`git -C "${REPO}" ${args}`, { encoding: 'utf8' });
const out = [];
const say = (k, v) => out.push(`${k.padEnd(20)}${v}`);

if (!existsSync(REPO)) {
  console.log('CANONICAL REPO     not present on this machine');
  console.log('STATUS             SKIPPED — the Lab does not require it to build or run.');
  process.exit(0);
}

if (WANT_FETCH) {
  try {
    git('fetch origin main --quiet');
  } catch {
    say('FETCH', 'FAILED — comparing against the last known origin/main');
  }
}

let remote;
try {
  remote = git('rev-parse origin/main').trim();
} catch {
  console.log(`CANONICAL REPO     ${REPO}`);
  console.log('STATUS             SKIPPED — no origin/main ref here. Try --fetch.');
  process.exit(0);
}

/*
 * WHICH REPOSITORY IS THIS, ACTUALLY?
 *
 * Until Phase 8.12 this script took whatever clone it was pointed at and
 * measured it. There is now more than one commercial repository, and the path
 * it used to default to holds the one that STOPPED being canonical — so it
 * reported CURRENT while measuring a repository that no longer decides
 * anything. The hashes matched because that is where the snapshot was read
 * from; matching the wrong source is not being in sync.
 */
const clone = identifyClone(REPO, { existsSync, execSync });
say('CANONICAL REPO', AGENCY.repo);
say('MEASURING', `${REPO}${clone.slug ? `  (${clone.slug})` : ''}`);
if (clone.kind === 'legacy') {
  say('', `NOTE: this is ${LEGACY.repo}, which is LEGACY. Canonical is ${AGENCY.repo}.`);
} else if (clone.kind === 'unknown') {
  say('', `NOTE: this clone is not a repository this script knows about.`);
}
say('ORIGIN/MAIN', remote);
say('SYNCED AGAINST', CANONICAL_REMOTE_SHA);
say('SYNC DATE', SYNC_DATE);
say('REMOTE DATE', git(`log -1 --format=%cI ${remote}`).trim());

/*
 * A local `main` that has moved is not drift and must never be read as truth,
 * but it is worth saying out loud: it is exactly how a stale mirror gets
 * blessed by accident.
 */
try {
  const localMain = git('rev-parse main').trim();
  if (localMain !== remote) {
    const [behind, ahead] = git(`rev-list --left-right --count ${remote}...main`).trim().split(/\s+/);
    say('LOCAL MAIN', `${localMain.slice(0, 7)} — ${behind} behind / ${ahead} ahead of origin/main`);
    if (Number(ahead) > 0) {
      say('', 'NOTE: local main carries unpushed commits. origin/main is the authority.');
    }
  }
} catch {
  /* no local main; origin/main is all we need anyway */
}

const drifted = [];
const broken = [];

for (const s of SOURCES) {
  let body;
  try {
    body = git(`show ${remote}:${s.path}`);
  } catch {
    broken.push(`${s.path} — GONE from origin/main`);
    continue;
  }
  const sha = createHash('sha256').update(body).digest('hex').slice(0, 16);
  const missing = s.exports.filter((e) => !body.includes(`export const ${e}`));
  if (missing.length) broken.push(`${s.path} — missing export(s): ${missing.join(', ')}`);
  else if (sha !== s.sha) drifted.push({ ...s, now: sha });
}

console.log(out.join('\n'));
console.log('');
console.log('SOURCE'.padEnd(42) + 'TREATMENT'.padEnd(12) + 'STATE');
for (const s of SOURCES) {
  const d = drifted.find((x) => x.path === s.path);
  const b = broken.find((x) => x.startsWith(s.path));
  console.log(
    s.path.padEnd(42) + s.treatment.padEnd(12) + (b ? 'BROKEN' : d ? 'DRIFT' : 'CURRENT'),
  );
}

if (broken.length) {
  console.log('');
  console.log('STATUS             BROKEN — canonical.ts mirrors names that no longer exist.');
  for (const b of broken) console.log(`  ${b}`);
  process.exit(1);
}

if (drifted.length) {
  console.log('');
  console.log(`STATUS             DRIFT DETECTED — ${drifted.length} mirrored source(s) changed.`);
  for (const d of drifted) {
    console.log(`  ${d.path}`);
    console.log(`      was ${d.sha}  now ${d.now}`);
    console.log(`      Lab: ${d.lab}`);
  }
  console.log('');
  console.log('RESYNC PROCEDURE');
  console.log(`  1. git -C "${REPO}" show origin/main:<path>   (read-only; never check out over main)`);
  console.log('  2. Update the mirrored values in the Lab destination named above.');
  console.log('  3. Re-check the affected entries in src/content/canonicalManifest.ts.');
  console.log('  4. Update that source\'s `sha` here, plus CANONICAL_REMOTE_SHA and SYNC_DATE.');
  console.log('  5. Run typecheck, lint, and the visual QA for the realities that read it.');
  process.exit(2);
}

console.log('');
if (clone.kind === 'legacy') {
  /* Matching the legacy repository is the expected result, because that is
     where the snapshot was read from. It is not a statement about canonical. */
  console.log('STATUS             MEASURED AGAINST LEGACY — every mirrored source matches');
  console.log(`                   ${LEGACY.repo}, which is where the snapshot came from.`);
  console.log(`                   This says NOTHING about ${AGENCY.repo}.`);
  console.log('');
  console.log(provenanceLine());
  console.log('');
  console.log(`  Point this at a clone of ${AGENCY.repo} to measure canonical:`);
  console.log('    node scripts/check-canonical-sync.mjs --path /path/to/hi-anzy-website-2.0');
  process.exit(0);
}
if (MIRRORED_FROM.staleAgainstCanonical && clone.kind === 'canonical') {
  console.log('STATUS             CURRENT against this clone — but see provenance below.');
  console.log('');
  console.log(provenanceLine());
  process.exit(0);
}
console.log('STATUS             CURRENT — every mirrored source matches origin/main.');
