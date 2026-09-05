# PHASE 5.5 — CANONICAL FRONTEND INVENTORY

> **This document is the narrative.** The authoritative, machine-readable record is
> `src/content/canonicalManifest.ts`, which carries a treatment, rationale, consent risk,
> payload risk and destination for every entry, and derives its own counts. PERFORMANCE
> reads coverage from it rather than from a number typed into a page.
>
> **History is preserved.** The "Coverage statement" at the foot of this file is the
> original, honest, incomplete state from the first 5.5 pass. The FINAL STATE section
> immediately below supersedes it.

---

## FINAL STATE

| | |
|---|---|
| Canonical source | `Anzy1512/hi-anzy-platform`, branch `main`, commit `6e36db1` |
| Sync check | `node scripts/check-canonical-sync.mjs` → `STATUS CURRENT` |
| `NOT_MAPPED` | **0** — the treatment union does not contain the value |
| Manifest | 116 entries · 18 routes · 27 exports · 64 components · 7 asset/font |
| Exclusions | 28, every one with a written reason, enforced by `exclusionsWithoutReason()` |

### The exclusion guard is a check, not a character count

`exclusionsWithoutReason()` began as `rationale.length < 20`, which tests that a
sentence is long rather than that it says anything. It now passes an entry only if
the rationale states the reason itself (70+ characters) **or** names a sibling entry
that does — `"As BRAND_REFS — the curated top tier, same policy."` is a reason;
repeating the BRAND_REFS paragraph nine times would make the file worse. A deferral
to an entry that does not exist, or to another deferral, fails. Tightening it caught
three entries the length check had passed, including `ClientMarquee.js`, which is the
single exclusion in this file least entitled to be compressed into a cross-reference.

### What changed in the continuation

- **`src/content/canonicalManifest.ts`** — every route (18 entries), content export (27),
  component (64) and asset family/font (7) with an explicit treatment and a written reason.
- **`src/spatial/translation.ts`** — eight primitives extracted from canonical component
  *behaviour*, plus a six-step progressive spatialisation scale. No React crossed the
  repository boundary.
- **`src/experience/transitions.ts`** — five transition primitives chosen by destination,
  wired into the navigation engine.
- **`src/content/graph.ts`** — thirteen cross-reality edges, each stating why the move is
  worth making.
- **`scripts/check-canonical-sync.mjs`** — development-only drift detection. Not part of
  the build; the deployed Lab never requires the canonical repo to exist.

### What the closing QA pass changed

Seven defects, each found by running the thing rather than by reading it:

1. **The onward graph washed out its own text.** Group `opacity: 0.4` at rest dimmed
   the type and its box toward the backdrop at the same rate, so they converged: the
   reason line measured **1.83:1** and no opacity below 1 could reach 4.5:1. Recession
   is now carried by the rule, the scale and the corner. Measured **5.16:1** desktop,
   **6.04:1** mobile.
2. **On a phone the graph printed through the reality.** A fixed overlay cannot dodge
   sixteen layouts; at 375×812 it crossed body copy in four of the thirteen realities
   that have an onward move, including Memory's WebGL capability notice. It is hidden
   below 900px, and the graph now lives on the Reality Index instead — which is where
   `EDGES` is rendered whole.
3. **An edge pointed at something that was not a reality.** `time-machine →
   reality-index` rendered a button reading `REALITY-INDEX` (the raw id, uppercased)
   wired to `enterMode()` with an id no mode has. Both ends were strings and nothing
   checked them. The edge is gone — leaving is what EXIT is for — and a development-only
   check makes the next one loud.
4. **Escape did not restore focus.** `exitMode` tears down inline rather than through
   `applyLocation`, so the index never learned which reality it was returning from and
   a keyboard visitor landed on `<body>` in front of sixteen rows. All three exit paths
   — Escape, the EXIT control, browser Back — now put the caret back on the row it left.
5. **Four realities told capable browsers they could not do WebGL.** The `lite` spatial
   tier sets `webgl: false` whatever the machine can do, and reduced motion routes to
   `lite` — so asking for less movement produced "…which is unavailable here". That is
   the brief's own prohibition, in the product's own copy. `spatialFallbackReason()`
   derives the sentence from actual capability, and there are three of them.
6. **The sheet's head margin had no ground.** Fixed, transparent, and invisible while
   every page was a screen tall — until the cross-reference section made the Index long
   enough to scroll its own rows through `HA/XL / SHEET 01`.
7. **Two sub-28px touch targets survived, both in Time Machine's 1995 era.** 1995 is a
   reconstruction of how the web looked, not of how hard it was to use: the hit area is
   grown to 44px with a pseudo-element on coarse pointers and the typography is untouched.

### The 2D → 3D primitive mapping

| Canonical component | Behaviour | Lab primitive | Consumed by |
|---|---|---|---|
| `PinnedSequence` | Frame holds, narrative advances | `PINNED_FIELD` | Reality Compiler, Director |
| `EvidenceDeck` | Fan of plates, one forward | `SPATIAL_DECK` | Anzy.OS, Memory |
| `CaseAnatomy` | Ordered spine filling in | `ANATOMY_SPINE` | Agency Simulator |
| `OrbitSection` + `three/SignalField` | Relationships around a centre | `ORBIT_CLUSTER` | Living World |
| `RouteLine` | The signature orange route, drawn | `ROUTE_TRACE` | Living World, Agency Simulator, Index |
| `DissolveImage` | Image resolving out of grain | `GRAIN_RESOLVE` | Memory, Dream |
| `SystemDiagnostic` | The connection is what failed | `DIAGNOSTIC_FIELD` | Agency Simulator |
| `ProvenanceTag` | Credit as a typed object | `PROVENANCE_MARK` | Memory, Performance |

**The most interesting finding of this phase**: `GRAIN_RESOLVE` and `ROUTE_TRACE` describe
what Memory, Dream and Living World were *already doing*, built months before this mapping
existed. The two products converged independently — which is the strongest available
evidence that they are expressions of one design system rather than a reskin.

### Transition graph

`REGISTRATION_SHIFT` (default) · `PAPER_APERTURE` (Portal, Anzy.OS, Time Machine) ·
`PLATE_SEPARATE` (Compiler, Living World, Chaos) · `INK_DISSOLVE` (Matter, Presence) ·
`ARCHIVE_RESOLVE` (Memory, Dream).

Interrupted at half their duration, all five report progress within 0.4950–0.5093 —
which is also the proof they are reading wall time rather than the RAF loop's clamped
`dt` — remove their overlay on cancel, tolerate a second cancel, and leave zero RAF
subscribers. Under `reduced`, each marks the change with its own `tr--static` state and
subscribes no frame callback at all.

### Cross-reality graph

Twelve edges, each stating why the move is worth making, in `src/content/graph.ts`.
Rendered in two places: at most two onward moves in the mode host above 900px, and the
whole set as **CROSS-REFERENCES** on the Reality Index at every width. The index block is
deliberately not interactive — every reality it names has an enterable row a few
centimetres up the same sheet, and a second set of controls pointing at the same sixteen
destinations would be duplicate navigation and twelve more stops in the tab order.

All five are DOM overlays. None creates a WebGL context, none is load-bearing — navigation
has already happened when one plays — and all are registered on the mode scope.

### Reduced motion × capability — the decision

**Not refactored. Deliberately.**

`core/capability.ts` maps `prefers-reduced-motion` to the `lite` tier, so the spatial modes
show their semantic fallbacks. Conceptually motion preference and render capability are
different axes and separating them would be cleaner.

It was not done because the risk is asymmetric. Every reality's fallback path, every
capability-tier test and every reduced-motion assertion from Phases 1–5 currently depends
on that coupling, and the payoff — a powerful desktop with reduced motion keeping full
spatial fidelity — is a fidelity improvement, not a correctness one. The brief itself says
no regression to Phases 1–5 is acceptable for architectural purity.

**The narrow adapter that makes the separation possible later**: transitions already take
`reduced` as an explicit argument rather than inferring it from the quality tier, and
`translation.domCarriesContent(stage)` decides DOM-versus-geometry from the spatialisation
stage rather than from the profile. Both are motion-preference-aware without consulting
`capability.profile`, which is the seam a future split would widen.

---


## Topology

| | |
|---|---|
| **Canonical frontend** | `C:/projects/hi-anzy-website`, remote `github.com/Anzy1512/hi-anzy-platform`, branch `main`, HEAD `6e36db1` |
| **Experience Lab** | `C:/claude/hi anzy alternate`, **separate repository**, no remote, branch `master` |
| **Relationship** | The Lab is *not* inside the platform repo. It was inspected **read-only** and nothing in it was modified, moved or built. |
| **Bridge** | `src/content/canonical.ts` — a documented mirror, not a cross-repo import. |

**Why a mirror and not an import.** The two products have independent builds, React
versions and deployments. Importing across that boundary would couple them and put the
Lab's bundle at the mercy of a codebase it does not control. The cost of mirroring is that
this file goes stale silently; re-syncing is a manual read of `frontend/src/data/content.js`.

**The commercial site is unchanged.** No file under `C:/projects/hi-anzy-website` was
written. Verified by `git status` in that repository before and after.

---

## Treatment legend

- **SYSTEM_SOURCE** — mirrored into `canonical.ts`; realities read it from there.
- **SPATIAL_TRANSFORM** — the content drives a spatial/behavioural interpretation.
- **DOM_ONLY** — belongs to the commercial site; the Lab does not reinterpret it.
- **EXCLUDED** — deliberately not brought across, with a reason.
- **NOT MAPPED** — genuinely not addressed in this phase.

---

## Content sources (`frontend/src/data/`)

| Source export | Treatment | Destination | Status |
|---|---|---|---|
| `METHOD_STAGES` | **SYSTEM_SOURCE + SPATIAL_TRANSFORM** | `canonical.METHOD` → Agency Simulator registers, Anzy.OS `METHOD.app` + `method` command, Director Act III, Time Machine `SOURCE.method`, Memory records M.03/M.04 | **DONE** |
| `CATEGORIES` (6 service categories) | **SYSTEM_SOURCE** | `canonical.SERVICES` → Anzy.OS capability sheets, Time Machine services, Agency Simulator cluster→category tagging | **DONE** |
| `CATEGORIES[].methodStage` | SYSTEM_SOURCE | Ties each category to its stage; surfaced in the Simulator reading | **DONE** |
| `WHY_HOW_NOW` | SYSTEM_SOURCE (reduced) | `canonical.POSITION.questions` | **DONE — not yet consumed by a reality** |
| `BRAND_REFS`, `TOP_CLIENT_MARKS` | **EXCLUDED** | — | **Deliberate.** These are real, sourced and provenance-checked, and the commercial site is the right place for them because it carries the context that makes a client list mean something. The Lab has never asserted a client relationship — Memory marks `NAMES` and `CONSENT TO PUBLISH` explicitly `UNRECOVERED`. Importing a marquee would contradict a standing position, so this is excluded by decision, not omission. |
| `CHARACTERS`, `TEAM_QUOTE` | NOT MAPPED | — | People-shaped content; would need the same consent reasoning as above. |
| `PACKAGES`, `COMBOS` | NOT MAPPED | — | Commercial offer construction. Belongs to the buying journey, not a spatial interpretation. |
| `TRUST_PRINCIPLES`, `AUDIENCES`, `DIAGNOSTIC_*`, `SOMETHINGS_OFF` | NOT MAPPED | — | Strong Agency Simulator candidates; not reached this phase. |
| `NETWORK_CATEGORIES_HOME`, `NETWORK_SUBCATS` | NOT MAPPED | — | Living World district candidates; not reached. |
| `ORBIT_CATEGORIES`, `INSIGHT_CATEGORIES`, `ROTATING_QUOTES`, `PROVENANCE_STYLES`, `FILTER_LIST` | NOT MAPPED | — | |
| `NAV_LINKS`, `FOOTER_LINKS` | DOM_ONLY | — | Site navigation. The Lab has its own index. |
| `disciplines.js` (323 lines) | NOT MAPPED | — | Not inspected in depth this phase. |

## Routes (`frontend/src/pages/`, 17 files)

| Route | Treatment | Status |
|---|---|---|
| `HowWeWork` | SPATIAL_TRANSFORM via `METHOD_STAGES` | **DONE** (indirect — the method now drives five realities) |
| `WhatWeDo`, `Discipline`, `ServiceDetail` | SYSTEM_SOURCE via `CATEGORIES` | **DONE** (indirect) |
| `Home`, `WhyHiAnzy`, `Work`, `WorkDetail`, `Network`, `WhoWeWorkWith`, `Insights`, `InsightDetail`, `Resources`, `Careers`, `Collaborate`, `Contact`, `ComingSoon`, `NotFound` | NOT MAPPED | Route-level structure was not reinterpreted this phase. |

## Components (41 files)

Not individually mapped. Reviewed as a set: the distinctive brand behaviours are
`PinnedSequence`, `EvidenceDeck`, `CaseAnatomy`, `OrbitSection`, `PackageBuilder`,
`MenuConstellation`, `SystemDiagnostic`, `RouteLine`, `ProvenanceTag`, `DissolveImage`,
plus `components/three/` and `components/motion/`. **NOT MAPPED** — these are the richest
source of 2D→3D translation material and are the obvious first target for a continuation.

## Assets

`frontend/public/brand`, `frontend/public/fonts` — **NOT MAPPED.** The Lab uses its own
self-hosted Rajdhani / IBM Plex and generates every texture procedurally. Importing brand
imagery would add payload the Lab has so far avoided entirely.

---

## Coverage statement

**The coverage gate is NOT met.** Of the meaningful public-facing surface:

- **2 of ~14 content exports** are mirrored and consumed (`METHOD_STAGES`, `CATEGORIES`),
  plus one reduced (`WHY_HOW_NOW`).
- **2 client-name exports** are deliberately excluded with a stated reason.
- **~9 content exports, 14 routes, 41 components and all brand assets are NOT MAPPED.**

What was done is the highest-value slice — the Lab now states the company's **real method**
and **real service taxonomy** instead of an older deck's — but it is a slice, and the brief
asked for full coverage before declaring the phase closed.
