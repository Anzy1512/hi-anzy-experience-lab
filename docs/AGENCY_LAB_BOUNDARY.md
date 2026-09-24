# THE AGENCY / LAB BOUNDARY

Two products, two repositories, two deployments. This file says where the line
is, what may cross it, and in which direction.

## THE THREE REPOSITORIES

| Role | Repository | State |
|---|---|---|
| **Agency** — the commercial production website | `Anzy1512/hi-anzy-website-2.0` | **CANONICAL** |
| **Lab** — this project | `Anzy1512/hi-anzy-experience-lab` | **CANONICAL** |
| Previous commercial site | `Anzy1512/hi-anzy-platform` | **LEGACY** — reference only |

`hi-anzy-platform` is not the current commercial production repository and is
not the Lab repository. It is where the Lab's content snapshot was read from,
which is a fact about provenance and does not make it current.

## THE DIRECTION OF THE ARROW

```
   Anzy1512/hi-anzy-website-2.0          (the Agency, read only from here)
                 │
                 │   development-time only
                 │   an explicit, reviewed, checked-in snapshot
                 ▼
   Anzy1512/hi-anzy-experience-lab       (the Lab)
```

Content flows **Agency → Lab**, never the other way, and never at runtime.

**Nothing in this project writes to the Agency repository.** No commit, no
checkout, no push, no branch, no reset. `--fetch` is the only operation that
touches its network, and only when a developer asks for it by name.

## WHAT MAY CROSS, AND HOW

Only **brand and content truth**, and only as a snapshot that a person read and
checked in:

| Crosses | Does not cross |
|---|---|
| positioning, method, service and discipline taxonomy | client names, outcomes, testimonials |
| terminology, typography, colour tokens | metrics, revenue, pricing |
| route and page structure, for provenance | private or live API records |
| brand raster provenance | anything the Lab is not entitled to assert |

The second column is not a matter of convenience. The Lab must never assert a
commercial fact it cannot source, and mirroring one from a repository does not
make the Lab entitled to state it.

## WHAT MUST NEVER EXIST

- **No runtime cross-repository import.** Nothing under `src/` reads a file
  outside `src/`, fetches the Agency, or resolves a path into another
  repository. Verified: no `readFileSync`, no `fetch` to the Agency, no `../../..`
  import escaping the project. The one `fetch` in `src/` (Phase 9.0) is SURVEY's, to
  the Commercial Intelligence Engine running on the visitor's own machine — a
  separate program, not the Agency, and nothing it answers is mirrored into the Lab.
- **No shared working tree.** The two repositories are separate checkouts with
  separate histories.
- **No deployment coupling.** The Lab builds and deploys with no Agency
  repository present on the machine or the build host.
- **No merge.** These histories are never joined.
- **No ownership ambiguity.** Every file in this repository is owned by this
  repository. Mirrored values carry their source in a comment and in
  `MIRRORED_FROM`.

### The test that proves it

> Delete every Hi Anzy Agency repository from the machine. `npm ci &&
> npm run build && npm run preview` must still produce a working Lab.

This holds today. All canonical values are checked-in TypeScript under
`src/content/`; the only code that reads the Agency lives in `scripts/` and is
never part of the build.

## THE SYNC CONTRACT

One declaration, `scripts/canonical-source.mjs`, names the canonical repository,
the legacy one, and what the Lab's snapshot was actually taken from. Three
development-time scripts read it:

| Script | Does |
|---|---|
| `check-canonical-sync.mjs` | reports per-source drift between the snapshot and canonical |
| `capture-canonical-pages.mjs` | re-reads the real page structures |
| `capture-canonical-eras.mjs` | re-reads the era material |

Each takes `--path`, or `HI_ANZY_AGENCY_PATH`, and defaults to a clone of the
canonical Agency repository.

**The check identifies the clone before it measures it.** Pointed at the legacy
repository it says so and refuses to present the result as a statement about
canonical — because the snapshot was read from legacy, so matching it is
expected and means nothing. A green check measuring the wrong repository is
worse than a red one.

### Re-sync procedure

1. Point the check at a clone of `hi-anzy-website-2.0`; it names the drifted
   sources and their Lab destinations.
2. Read those sources with `git show origin/main:<path>` — read-only.
3. Update the mirrored values at the named destinations.
4. Re-check `src/content/canonicalManifest.ts`.
5. Update each source's `sha`, plus `CANONICAL_REMOTE_SHA`, `SYNC_DATE` and
   `MIRRORED_FROM`.
6. Typecheck, lint, build, and re-run the QA for every reality that reads them.

**Never update a hash to make the check pass.** The hash records what was read;
changing it without reading is how a mirror starts lying quietly.

## CURRENT PROVENANCE

The Lab's snapshot is mirrored from **`Anzy1512/hi-anzy-website-2.0` @
`0208378`** (2026-09-23), re-read on 2026-09-24 in Phase 8.12C.

Before that it was mirrored from **`Anzy1512/hi-anzy-platform` @ `eac2282`**
(2026-09-01), the legacy repository. That remains the correct provenance for
everything mirrored before the re-read, and it is kept in
`PREVIOUSLY_MIRRORED_FROM` rather than overwritten. Relabelling an old snapshot
with a repository it was never read from is a fabricated provenance.

All four mirrored sources are **CURRENT** against canonical:

| Source | Treatment | State | Lab destination |
|---|---|---|---|
| `frontend/src/data/content.js` | MIRROR | CURRENT | `src/content/canonical.ts` |
| `frontend/src/data/disciplines.js` | MIRROR | CURRENT | — |
| `frontend/src/App.js` | REFERENCE | CURRENT | `canonicalManifest.ts` (ROUTES) |
| `frontend/src/App.css` | TRANSFORM | CURRENT | `src/design-system/*` |

**What CURRENT means differs by treatment**, and the distinction matters here
because only one of the three drifted sources changed anything in the Lab:

- **MIRROR** — the Lab's values ARE these values. `content.js` drifted and the
  changed fields were adopted.
- **REFERENCE** — the Lab depends on facts in the file, not on the file.
  `App.js` drifted by 78 lines and its route table is identical: 24 paths, none
  added, none removed.
- **TRANSFORM** — the Lab inherits brand truth and expresses it its own way.
  `App.css` drifted by 213 lines with all 25 custom properties, every
  `font-family` and every brand colour unchanged.

So CURRENT means *read and reconciled at this commit*, never *copied*.
`docs/PHASE_8_12_RELEASE_AND_CANONICAL.md` records what was adopted, what was
refused, and what the comparison found wrong in the Lab.

## THE ONE THING THAT CROSSES THE OTHER WAY

The arrow above describes **source and content**, and in that direction it holds
absolutely. There is one artefact flowing the other way, and it is worth naming
because the diagram alone would hide it:

`Anzy1512/hi-anzy-website-2.0` carries a **built copy of the Lab** at
`frontend/lab/` — `index.html`, content-hashed `assets/`, `brand/`, `fonts/`.
Its `vercel.json` build command copies that directory into `build/lab`, and its
`customHttp.yml` gives `lab/assets/**` an immutable cache policy. **The Lab as
deployed today is a sub-path of the Agency site.**

Nothing in this repository put it there and nothing here maintains it; it is
build output committed by work in the Agency repository. What it means for this
project:

- the Lab's own build still requires no Agency repository — the independence
  test below is unaffected;
- but the Lab currently runs under the **Agency's** headers. `customHttp.yml`
  applies `Permissions-Policy: camera=(), microphone=(), geolocation=()` to
  `**/*`, which includes `/lab/**`, so **Presence's camera path is disabled by
  policy in the only deployment that exists**;
- so `lab.hianzy.com` is not merely a nicer URL. Moving to its own origin
  changes what one reality is able to do, and that belongs in §12 rather than
  being discovered after the move.

## DEPLOYMENT

| | |
|---|---|
| Lab, today | served as `/lab` from the Agency's own build — see above |
| Lab, intended | `lab.hianzy.com`, built from `hi-anzy-experience-lab` (§12, not started) |
| Agency | its own deployment, from `hi-anzy-website-2.0` |

`vite.config` already takes `base` from `process.env.LAB_BASE`, defaulting to
`/`, so a root-domain Lab needs no configuration and a sub-path deployment sets
one variable. Neither build knows the other exists.
