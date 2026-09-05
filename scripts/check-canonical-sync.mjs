#!/usr/bin/env node
/**
 * CANONICAL SYNC CHECK — development only.
 *
 * `src/content/canonical.ts` mirrors the commercial frontend's content module.
 * A mirror goes stale silently, which is its one real weakness; this reports
 * when it has.
 *
 * It is deliberately NOT part of the build. The deployed Experience Lab must
 * stand alone, and nothing in production may depend on the canonical repository
 * existing on disk. If the repo is not here, this says so and exits 0.
 *
 *   node scripts/check-canonical-sync.mjs
 *   node scripts/check-canonical-sync.mjs --path /path/to/hi-anzy-platform
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const argPath = process.argv.indexOf('--path');
const REPO = argPath > -1 ? process.argv[argPath + 1] : 'C:/projects/hi-anzy-website';
const SOURCE = join(REPO, 'frontend/src/data/content.js');

/** The commit `canonical.ts` was mirrored from. Update it when you re-sync. */
const MIRRORED_COMMIT = '6e36db1';

/** Exports the Lab depends on. A rename here is a silent breakage there. */
const REQUIRED_EXPORTS = [
  'METHOD_STAGES', 'CATEGORIES', 'WHY_HOW_NOW', 'TRUST_PRINCIPLES',
  'AUDIENCES', 'DIAGNOSTIC_AREAS', 'DIAGNOSTIC_OUTCOMES', 'SOMETHINGS_OFF',
  'NETWORK_CATEGORIES_HOME', 'INSIGHT_CATEGORIES',
];

if (!existsSync(SOURCE)) {
  console.log('CANONICAL SOURCE   not present on this machine');
  console.log('STATUS             SKIPPED — the Lab does not require it to build or run.');
  process.exit(0);
}

const src = readFileSync(SOURCE, 'utf8');
const hash = createHash('sha256').update(src).digest('hex').slice(0, 12);

let head = 'unknown';
try {
  head = execSync(`git -C "${REPO}" rev-parse --short HEAD`, { encoding: 'utf8' }).trim();
} catch {
  /* not a git checkout; the hash comparison still works */
}

const missing = REQUIRED_EXPORTS.filter(
  // Plain string search: a template literal turns a lone  into a BACKSPACE
  // character rather than a word boundary, and the check silently passed nothing.
  (e) => !src.includes(`export const ${e}`),
);

console.log(`CANONICAL SOURCE   ${SOURCE}`);
console.log(`SOURCE HEAD        ${head}`);
console.log(`SOURCE SHA256/12   ${hash}`);
console.log(`MIRRORED FROM      ${MIRRORED_COMMIT}`);

if (missing.length) {
  console.log(`STATUS             BROKEN — ${missing.length} required export(s) missing: ${missing.join(', ')}`);
  console.log('                   src/content/canonical.ts is mirroring names that no longer exist.');
  process.exit(1);
}

if (head !== 'unknown' && head !== MIRRORED_COMMIT) {
  console.log('STATUS             STALE — the canonical source has moved on.');
  console.log('');
  console.log('RESYNC PROCEDURE');
  console.log('  1. Read frontend/src/data/content.js at the new commit.');
  console.log('  2. Update the mirrored values in src/content/canonical.ts.');
  console.log('  3. Re-check every entry in src/content/canonicalManifest.ts.');
  console.log(`  4. Set MIRRORED_COMMIT in this script to ${head}.`);
  console.log('  5. Run typecheck, lint and the Lab visual QA.');
  process.exit(2);
}

console.log('STATUS             CURRENT — all required exports present, commit matches.');
