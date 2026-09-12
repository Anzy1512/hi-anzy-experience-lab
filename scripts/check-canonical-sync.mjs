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
 *   node scripts/check-canonical-sync.mjs --path /path/to/hi-anzy-platform
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

const argv = process.argv;
const argPath = argv.indexOf('--path');
const REPO = argPath > -1 ? argv[argPath + 1] : 'C:/projects/hi-anzy-website';
const WANT_FETCH = argv.includes('--fetch');

/** Canonical commit these hashes were taken from, and when. */
const CANONICAL_REMOTE_SHA = 'eac228293a2f7f9c8e36079f4f67e9fb9e5b2f9b';
const SYNC_DATE = '2026-09-12';

/**
 * Every canonical file the Lab mirrors, with its sha256/16 at the synced
 * commit. `exports` are names `canonical.ts` depends on by name — a rename
 * there is a silent breakage here, which a hash alone would report as ordinary
 * drift rather than as the breakage it is.
 */
const SOURCES = [
  {
    path: 'frontend/src/data/content.js',
    sha: 'b85506b18ab97f92',
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
    sha: 'bb208629591a7e63',
    lab: 'src/content/canonicalManifest.ts (ROUTES)',
    treatment: 'REFERENCE',
    exports: [],
  },
  {
    path: 'frontend/src/App.css',
    sha: '521ab287bbdd6c1d',
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

say('CANONICAL REPO', REPO);
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
console.log('STATUS             CURRENT — every mirrored source matches origin/main.');
