/**
 * THE RECORDED HISTORY — what the repository can actually prove.
 *
 * GENERATED. Do not edit by hand.
 *   scripts/capture-canonical-eras.mjs
 *   source  Anzy1512/hi-anzy-platform, origin/main
 *   read    2026-09-12
 *
 * ── THE HONEST SPAN ─────────────────────────────────────────────────────────
 *
 * 69 commits, 2026-08-20 to 2026-09-01. That is the whole of it.
 *
 * There is no decade of Hi Anzy website history in this repository and this file
 * does not pretend there is. Every era below is a commit that exists, on a date
 * that is real, with counts taken by running git against that commit rather than
 * by being described. Anything before 2026-08-20 is NOT RECORDED — not "early
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

export const RECORD_FIRST = '2026-08-20';
export const RECORD_LAST = '2026-09-01';
export const RECORD_COMMITS = 69;

export const CANONICAL_ERAS: CanonicalEra[] = [
  {
    "sha": "fbcbb0f",
    "date": "2026-08-20",
    "subject": "Recovered Emergent project baseline",
    "routes": 15,
    "pages": 15,
    "faces": null,
    "brandAssets": 0,
    "contentExports": 19,
    "changed": null
  },
  {
    "sha": "625c80d",
    "date": "2026-08-21",
    "subject": "Integrate deck: portfolio links, enriched network, dissolve + pinned scroll",
    "routes": 15,
    "pages": 15,
    "faces": [
      "Rajdhani",
      "Figtree",
      "Amaranth"
    ],
    "brandAssets": 11,
    "contentExports": 21,
    "changed": {
      "files": 66,
      "insertions": 4142,
      "deletions": 684,
      "commits": 5
    }
  },
  {
    "sha": "e5f1e52",
    "date": "2026-08-21",
    "subject": "Network disciplines: 16 explained pages, plus two broken filters fixed",
    "routes": 16,
    "pages": 16,
    "faces": [
      "Rajdhani",
      "Figtree",
      "Amaranth"
    ],
    "brandAssets": 11,
    "contentExports": 21,
    "changed": {
      "files": 17,
      "insertions": 823,
      "deletions": 37,
      "commits": 3
    }
  },
  {
    "sha": "45513ca",
    "date": "2026-08-28",
    "subject": "New hero visual, a bold-colour rebuild of the What We Do banner, and a real README",
    "routes": 17,
    "pages": 17,
    "faces": [
      "Rajdhani",
      "Figtree",
      "Amaranth"
    ],
    "brandAssets": 18,
    "contentExports": 23,
    "changed": {
      "files": 105,
      "insertions": 9223,
      "deletions": 829,
      "commits": 35
    }
  },
  {
    "sha": "703d91c",
    "date": "2026-08-31",
    "subject": "Milestone 1: hardening + typography (feat/work-ecosystem-coming-soon)",
    "routes": 17,
    "pages": 17,
    "faces": [
      "Rajdhani",
      "Newsreader",
      "Amaranth"
    ],
    "brandAssets": 54,
    "contentExports": 23,
    "changed": {
      "files": 119,
      "insertions": 2342,
      "deletions": 807,
      "commits": 10
    }
  },
  {
    "sha": "6bea67f",
    "date": "2026-09-01",
    "subject": "Milestone 3: EvidenceDeck, The Hi Anzy Orbit, and the ecosystem backend",
    "routes": 23,
    "pages": 18,
    "faces": [
      "Rajdhani",
      "Newsreader",
      "Amaranth"
    ],
    "brandAssets": 54,
    "contentExports": 24,
    "changed": {
      "files": 25,
      "insertions": 1721,
      "deletions": 677,
      "commits": 2
    }
  },
  {
    "sha": "eac2282",
    "date": "2026-09-01",
    "subject": "Phase 4: final production audit — fix dot-overflow regression, cleanup",
    "routes": 24,
    "pages": 19,
    "faces": [
      "Rajdhani",
      "Newsreader",
      "Amaranth"
    ],
    "brandAssets": 54,
    "contentExports": 24,
    "changed": {
      "files": 73,
      "insertions": 3173,
      "deletions": 1792,
      "commits": 13
    }
  }
];
