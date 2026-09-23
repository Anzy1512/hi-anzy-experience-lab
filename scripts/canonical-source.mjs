/**
 * WHERE THE AGENCY'S TRUTH LIVES — one declaration, three scripts.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Three development-time scripts read the commercial frontend, and each of them
 * carried its own hardcoded `C:/projects/hi-anzy-website` default. That was
 * survivable while there was one commercial repository. There are now two, and
 * the one those paths resolve to is no longer the canonical one — so the sync
 * check reported CURRENT against a repository that had stopped being the source
 * of truth. A green check that is measuring the wrong thing is worse than a red
 * one, which is the reason this file exists rather than three edited constants.
 *
 * ── THE BOUNDARY THIS ENCODES ───────────────────────────────────────────────
 *
 * The Lab does not import from the Agency at runtime and never has: every
 * canonical value is a checked-in snapshot under `src/content/`, and the Lab
 * builds and runs with no Agency repository on the machine. That is the
 * contract, and it is why all of this is development-time only.
 *
 * The Agency repository is READ ONLY from here. Nothing in this project writes
 * to it, checks anything out in it, or fetches into it without `--fetch` being
 * asked for explicitly.
 */

/** The current commercial production website. Canonical from Phase 8.12. */
export const AGENCY = {
  repo: 'Anzy1512/hi-anzy-website-2.0',
  branch: 'main',
  /** Override with HI_ANZY_AGENCY_PATH, or `--path` on any of the scripts. */
  defaultPath: process.env.HI_ANZY_AGENCY_PATH || 'C:/projects/hi-anzy-website-2.0',
};

/**
 * The previous commercial repository.
 *
 * Kept by name so a clone of it can be RECOGNISED rather than silently
 * measured. Every canonical value currently in the Lab was mirrored from here,
 * which is a fact about provenance and is not corrected by renaming anything.
 */
export const LEGACY = {
  repo: 'Anzy1512/hi-anzy-platform',
  knownPaths: ['C:/projects/hi-anzy-website'],
};

/**
 * What the Lab's snapshot was actually taken from.
 *
 * This is provenance, not configuration. It changes only when somebody
 * genuinely re-reads the sources and updates the mirrored values — never to
 * make a check pass. Relabelling a snapshot with a repository it was not read
 * from would be a fabricated provenance, which is the one thing this project
 * does not do.
 */
export const MIRRORED_FROM = {
  repo: LEGACY.repo,
  commit: 'eac228293a2f7f9c8e36079f4f67e9fb9e5b2f9b',
  short: 'eac2282',
  date: '2026-09-12',
  /** True until the sources are re-read from AGENCY.repo. */
  staleAgainstCanonical: true,
};

/**
 * Which repository a clone on disk actually is, read from its own remote.
 *
 * Returns `canonical`, `legacy`, `unknown`, or `absent`. The scripts branch on
 * this so that measuring the wrong repository is reported rather than
 * presented as a result.
 */
export function identifyClone(path, { existsSync, execSync }) {
  if (!path || !existsSync(path)) return { kind: 'absent', path, remote: null };
  let remote = null;
  try {
    remote = execSync('git remote get-url origin', {
      cwd: path,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return { kind: 'unknown', path, remote: null };
  }
  const slug = remote.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '');
  if (slug === AGENCY.repo) return { kind: 'canonical', path, remote, slug };
  if (slug === LEGACY.repo) return { kind: 'legacy', path, remote, slug };
  return { kind: 'unknown', path, remote, slug };
}

/** One line naming where the Lab's content came from, for any script to print. */
export function provenanceLine() {
  return (
    `MIRRORED FROM      ${MIRRORED_FROM.repo} @ ${MIRRORED_FROM.short} (${MIRRORED_FROM.date})` +
    (MIRRORED_FROM.staleAgainstCanonical
      ? `\n                   which is now LEGACY. Canonical is ${AGENCY.repo}.`
      : '')
  );
}
