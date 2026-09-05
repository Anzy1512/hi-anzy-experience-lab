# PHASE 5.5 — CANONICAL FRONTEND INVENTORY

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
