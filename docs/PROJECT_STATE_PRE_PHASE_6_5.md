# HI ANZY EXPERIENCE LAB
## PRE-PHASE 6.5 PROJECT STATE

*Authoritative as of the state verified below. When this document, chat memory, and the
repository disagree, the repository wins — everything here was checked against live code
and git, not recalled.*

---

### 1. PRODUCT INTENT

The **Experience Lab** is a standalone experimental product for the creative consultancy
Hi Anzy — not a redesign, marketing site, or component showcase. It is a deliberately
entered alternate runtime that reinterprets the real company (its method, service
taxonomy, brand system, and select component *behaviours*) as sixteen spatial/interactive
"realities" reached from a launcher and a Reality Index.

Conceptual separation that must never blur:

- **REALITY 0** — the canonical commercial Hi Anzy website (`Anzy1512/hi-anzy-platform`).
  Real, production, conversion-oriented. The Lab never touches it, never depends on it at
  runtime, and never destabilises it.
- **EXPERIENCE LAB** — this repository. An interface institution built *from* Reality 0's
  truth (method, taxonomy, brand tokens, fonts, select component ideas) but expressed as
  original spatial/procedural work. Nothing here is a copy of a canonical page or component;
  everything is a translation, with the translation logic recorded.

Core philosophy: technology without theatre. Editorial print × architectural drawing ×
creative technology. Contrast is the design — stillness before motion, small before huge.
Truth is non-negotiable — the product describes what a system measured or what the company
actually does, never a fabricated business fact.

---

### 2. REPOSITORY TOPOLOGY

| | |
|---|---|
| Canonical Hi Anzy frontend | `github.com/Anzy1512/hi-anzy-platform` |
| Canonical local path | `C:/projects/hi-anzy-website` |
| Canonical branch | `main` |
| Canonical commit (verified) | `6e36db1449834a9476150cb05da0e9eb9f6b5537` |
| Canonical tree | clean (`git status --porcelain` empty) |
| Canonical sync check | `node scripts/check-canonical-sync.mjs` → **STATUS CURRENT** |
| Experience Lab path | `C:/claude/hi anzy alternate` |
| Lab current branch | `phase-6-canonical-spatial` |
| Lab `master` checkpoint | `8614f98` (Phase 5.5 closure) — untouched |
| Phase 6 branch base commit | `5c05d3a`, cut from `8614f98` |
| Lab working tree | **dirty** — see §9, this is Phase 6 closure work not yet committed |

**Rule, restated:** the commercial repository is READ-ONLY for every Lab phase. No
cross-repository runtime import. Canonical facts are mirrored into `src/content/canonical.ts`
with documented provenance (source file, commit, and — for fonts — sha256) and a
development-only drift check (`scripts/check-canonical-sync.mjs`) flags staleness.

---

### 3. NON-NEGOTIABLE INVARIANTS

- Commercial frontend untouched; no cross-repo runtime dependency.
- No framework/build/React migration without explicit instruction. Current stack: React 19,
  Vite, TypeScript strict, three + @react-three/fiber, GSAP. **5 runtime + 13 dev
  dependencies → 173 packages.** No UI kit, no state library, no router, no second motion
  library, no physics library (Chaos hand-rolls ~50 lines of Verlet integration).
  MediaPipe deliberately rejected for Presence (unverifiable multi-MB model).
- `three`/`@react-three/fiber` must never reach the entry chunk. No `manualChunks` for them
  — naming the chunk hoists it into the entry graph and forces a modulepreload.
- Heavy modes lazy-load (`load: () => import(...)` per mode). A visitor who never enters a
  spatial reality pays effectively zero WebGL cost — verified network-level in Phase 6 across
  seven navigation states (see §11).
- Explicit enter/exit lifecycle. Escape always works, everywhere, including mid-animation
  and mid-audio. Visible EXIT control. `emergencyReset()` is the floor.
- Every listener/timer/RAF/tween/GPU resource registered on a `CleanupScope`; the engine
  disposes the mode-level scope on exit regardless of what happened. One shared RAF loop
  (`core/raf.ts`) that does not exist while nothing is subscribed.
- `core/raf` clamps `dt` to 64ms for animation safety. Anything timed (Director's film,
  Chaos's ten stages) or *measuring* frame behaviour (Performance) must read
  `performance.now()`, never accumulate clamped `dt`.
- Reduced motion (`prefers-reduced-motion`) is first-class and preserves the concept —
  removes travel, keeps hierarchy/materials/layers/information. It currently routes into the
  `lite` capability tier (a stated, deliberate architectural coupling — see §14).
- WebGL/capability truth: a mode never claims "unavailable" from a capability the machine
  actually has. `spatialFallbackReason()` derives the sentence from real `webgl`/
  `reducedMotion` flags, not from the tier alone (fixed in Phase 5.5 after four realities
  told capable browsers their WebGL was unavailable).
- Camera/XR/device-tilt capabilities are never simulated as verified. Presence's camera
  never initialises before explicit consent; nothing is recorded, stored, or uploaded; exit
  stops every track so the browser's camera indicator goes out. Portal's XR/tilt are
  reported, never assumed.
- Audio: one shared engine (`src/audio/`). No `AudioContext` — not even suspended — exists
  before `enable()` is called from a real user gesture. Every mode's nodes live on a `Scene`
  disposed on exit; the context is closed outright, not merely suspended, on teardown.
  Every voice is synthesised — zero audio files in the project.
- Content truth: never fabricate clients, collaborators, people, partnerships, testimonials,
  awards, metrics, revenue, or case-study outcomes. Canonical business facts (method,
  service taxonomy) are mirrored from source with provenance; anything the source doesn't
  support is either excluded with a written reason or left an open question in copy (Agency
  Simulator's `DERIVED_SUMMARY` explicitly prints what it does *not* know, same weight as
  what it does).
- Mobile is a deliberately different composition, not a shrunk desktop (Sonic Architecture's
  elevation literally rotates into a section; the Reality Index's WebGL lattice is omitted
  below 900px in favour of the same information as a written list).

---

### 4. CANONICAL HI ANZY BRAND TRUTH (verified against source, not memory)

**Method** (`src/content/canonical.ts`, mirrored from `frontend/src/data/content.js`
`METHOD_STAGES`): **AUDIT → ARCHITECT → BUILD → CONNECT → SCALE**. Five stages, each with a
title, page-voice line, duration, and outputs.

**Service taxonomy** — 6 categories (verified: `SERVICES.length === 6`, not the 7 an earlier
draft miscounted from an interface-type match): `business-audit-strategy`,
`brand-experience`, `digital-technology-automation`, `growth-content-commerce`,
`media-creators-experiences`, `advisory-security-scale`.

**Palette** (from the canonical `frontend/src/index.css` "hiAnzy raw tokens", adopted in
Phase 6, replacing values the Lab had read off an earlier printed deck): `--paper #E0D8C1`,
`--ink #232A2A`, `--orange #F19020` (signal), `--signal #E54A25` (signal-hot),
`--white-d #F7F5EE`, `--panel-dark #1D2424`. Orange had already been correct to within one
channel-step in the Lab's prior value; paper and ink had drifted further and were corrected.
On paper stock, signal text is printed *heavier* (`--signal-text: #9c3d0b`) because
`#F19020` on `#E0D8C1` measures 1.69:1 — below AA at any size; on ink/blueprint the signal
stays the literal brand orange (6.09:1+).

**Typography** — three voices, verified current in `src/design-system/fonts.css` and
`tokens.css`:
- **Rajdhani** — system/display voice (`--f-display`). Files verified byte-identical
  (sha256) to the canonical site's own `rajdhani-{500,600,700}-normal-latin.woff2`.
- **Newsreader** — human/editorial voice (`--f-body`). **Phase 6 change**: replaced IBM Plex
  Sans, which was a face appearing nowhere in the canonical system. Adopted because the
  canonical `frontend/src/App.css` opens by declaring the pairing "locked": *"Rajdhani =
  System Voice · Newsreader = Human Voice (serif)."* The Lab now mirrors the actual
  `newsreader-200-800-normal-latin.woff2` file (sha256/12 `62981321d9a3`).
- **IBM Plex Mono** — the instrument's voice (`--f-mono`), for values the system actually
  measured only. Files verified byte-identical to the canonical site's own.

**CLAUDE.md was still asserting the old IBM Plex Sans body face** at the start of this
compaction pass — a real contradiction between a permanent-rules file and the shipped code.
Corrected during this pass (see §17 changes). Two other docs
(`EXPERIENCE_LAB_VISUAL_SYSTEM.md`, `EXPERIENCE_LAB_REFERENCES.md`) had the same stale claim
and were corrected the same way.

---

### 5. EXPERIENCE LAB VISUAL LANGUAGE (established, unchanged by this pass)

Editorial print × architectural drawing × creative technology × spatial design × interactive
art × motion graphics × digital installation. Warm paper / ink / signal-orange accent
(orange is rare and means signal only — the acquired object, the one active state). Material
states drive `<html data-material>`: `paper` (launcher), `ink` (index + spatial modes),
`blueprint` (X-Ray, bone-on-ink, never cyan). Technology without theatre: every spatial
form must trace back to a 2D form that preceded it (`src/spatial/translation.ts`'s
progressive scale FLAT→REGISTERED→SEPARATED→DEPTH→ASSEMBLED→WORLD governs this).

**Explicitly not:** SaaS UI, generic cyberpunk, purple/cyan AI gradients, glassmorphism,
random glowing geometry, template WebGL demos, meaningless particles, fake holograms, matrix
rain, HUD noise over non-data, bento grids, universal border-radius.

**Phase 6.5's mission (not yet started) is to push this language further** with imagery,
objects, environments, materiality, and cinematic art direction — see §15.

---

### 6. REALITY INVENTORY — all 16, verified `online` in `src/content/lab.ts`

| Reality | Concept | Key mechanism | Tier |
|---|---|---|---|
| Living World | Continuous spatial territory, not pages | WebGL districts, `ORBIT_CLUSTER` | Flagship |
| Reality Compiler | Document → structure → depth → world | Progressive spatialisation scale | Flagship |
| Matter Engine | Shared analytic particle field | Reused by Presence | Flagship |
| Agency Simulator | Deterministic reading, never a prediction | Method registers, `DERIVED_SUMMARY`, `SYSTEM_LOOP` (Phase 6) | Flagship |
| Presence | Consented, local, camera-optional motion sensing | `CONTACT_GAP` (Phase 6), reuses Matter's field | Elevated P6 |
| Memory | Archive reconstructed from sampled typography | `GRAIN_RESOLVE`, `PROVENANCE_MARK` | Flagship |
| Anzy.OS | Fictional shell, ink bench, paper sheets | `NETWORK.app` now prints real discipline/subcategory data | Flagship |
| Portal | Aperture; XR reported, not assumed | `PAPER_APERTURE` transition | Stable |
| X-Ray | Bone-on-ink construction drawing | `blueprint` material | Stable |
| Director | 84s film, one clock | `PINNED_FIELD` | Flagship |
| Chaos | Theatrical failure, isolated copy | **Phase 6 elevated**: fragments now derive from real METHOD/SERVICES/MATERIALS; `NOISE_ORDER` drives taxonomy-drift + material-mismatch stages; exact-reconstruction verified byte-identical | Elevated P6 |
| Dream | Seeded contours that remember words | — | Stable |
| After Dark | Night stock, sodium, poster culture | **Phase 6 elevated**: `HALFTONE_FIELD` (Canvas2D dot screen) responds to a lamp held by movement, not presence | Elevated P6 |
| Sonic Architecture | The interface as instrument | **Phase 6 elevated**: elevation redrawn with datum lines/coursing/hatch/section-cut; mobile is a rotated "section" layout, not a shrunk elevation | Elevated P6 |
| Time Machine | One source, seven eras/interaction models | `POSITION_RAIL` (Phase 6) — travelled rail node, zero new focusables | Stable |
| Performance | Measured values or UNKNOWN by name | New `CONVERGENCE` group reads live from manifest/translation/materials | Flagship |

Reality Index (launcher's index page, not a numbered reality) gained a **spatial twin** in
Phase 6: `LATTICE_ASSEMBLY` — a lazily-loaded three.js lattice of 16 nodes meshed by the
cross-reality graph's 12 edges (verified: `EDGES.length === 12`), sitting beside — never
replacing — the written cross-reference list. Loaded only when the section is actually
scrolled into view (IntersectionObserver gate, fixed in Phase 6 after it was found eagerly
fetching 227 kB of react-three-fiber on every Index visit).

---

### 7. PHASE HISTORY — decisions only

**Phase 1** — Foundation: mode engine, `CleanupScope`, shared RAF loop, launcher, X-Ray.

**Phase 2** — Flagship realities: Living World, Reality Compiler, Agency Simulator, Matter
Engine, Presence, Anzy.OS built out.

**Phase 3** — Physics/interactive systems as actually implemented (hand-rolled, no physics
library); Presence's frame-differencing motion sensing (MediaPipe explicitly rejected).

**Phase 4** — Memory, Director, Dream, the shared audio engine, After Dark, Sonic
Architecture, Chaos, Time Machine, Portal, Performance. All 16 realities reach `online`.

**Phase 4.5** — Closure audit: accessibility, lifecycle torture, content-truth hardening
across all 16.

**Phase 5** — Creative audit and targeted elevation of the two weakest realities at the time.

**Phase 5.5** — Canonical frontend convergence, first pass: built `canonicalManifest.ts`
(coverage gate, no `NOT_MAPPED` value), `content/canonical.ts` (mirror bridge with
provenance), the 8-primitive 2D→3D translation vocabulary, 5 transition primitives
(`REGISTRATION_SHIFT`/`PAPER_APERTURE`/`PLATE_SEPARATE`/`INK_DISSOLVE`/`ARCHIVE_RESOLVE`),
the cross-reality graph, session-only visited-state + focus-restoration, and the dev-only
sync-check script. Closure pass fixed 7 defects (contrast failures, a dead graph edge,
focus-restoration gaps, false WebGL-unavailable claims) found only by running the product.

**Phase 6** — Canonical spatial/material convergence. **Completed:** real brand palette
adopted (not the deck-derived approximation), Newsreader body face adopted from source,
13-entry material vocabulary (`materials.ts`) with 10 inherited/3 Lab-originated flagged
structurally, `LATTICE_ASSEMBLY` (Index spatial twin), all 14 translation primitives built
and consumed (0 mapped-only, 0 orphaned — verified live), Sonic/After Dark/Chaos elevated
with a stated thesis and dedicated mobile forms each, a real 227 kB eager-fetch regression
found and fixed. **Not yet committed** — see §9.

---

### 8. PHASE 5.5 ARCHITECTURE (preserved, still authoritative)

- `src/content/canonicalManifest.ts` — 116 entries (18 routes, 27 exports, 64 components,
  7 asset/font). Treatments: `SYSTEM_SOURCE` 30, `EXCLUDED` 28, `DOM_ONLY` 23,
  `SPATIAL_TRANSFORM` 17, `MATERIAL_SOURCE` 17, `SPATIAL_TWIN` 1. `exclusionsWithoutReason()`
  → **0** (verified live). `NOT_MAPPED` is not a value the `Treatment` union can hold.
- `src/content/canonical.ts` — the mirror bridge. Every export states its canonical source
  file/commit. `CANONICAL_SOURCE.commit` = `6e36db1`.
- `src/spatial/translation.ts` — the 2D→3D vocabulary. `Stage` progressive scale
  (FLAT→REGISTERED→SEPARATED→DEPTH→ASSEMBLED→WORLD) + `domCarriesContent(stage)`.
  14 `Primitive` entries, each with `origin`, `canonicalBehaviour`, `spatialBehaviour`,
  `consumers`, `reducedMotion`, and (Phase 6) a `wired: boolean` flag distinguishing "the
  code exists and a reality reads it" from "a destination has been named." **All 14 are
  `wired: true`** as of this state — there is no remaining BUILT-vs-MAPPED-ONLY distinction
  to track.
- `src/experience/transitions.ts` — 5 primitives, DOM overlays only, cancel-safe,
  interruption-torture verified (25/50/75% cancellation leaves 0 RAF subscribers, 0 overlay
  remnants, reads wall time not clamped `dt`).
- `src/content/graph.ts` — 12 cross-reality edges (`EDGES.length === 12`), each with a
  displayed `because` string. Rendered as ≤2 onward moves per reality (desktop only, ≥900px)
  and as the full written list + `LATTICE_ASSEMBLY` on the Reality Index at every width.
- `src/experience/visited.ts` — session-only visited trail; feeds focus restoration on
  Escape/EXIT/Back and the lattice's visited-node marking. No storage.
- `scripts/check-canonical-sync.mjs` — dev-only; compares canonical HEAD/hash/export names
  against the mirror.

---

### 9. PHASE 6 CURRENT STATE — verified now, not from prior chat claims

| Item | Status |
|---|---|
| 6F reality elevation (Sonic/After Dark/Chaos) | **COMPLETE** — each has a stated one-sentence thesis, a mechanism proving it, and a dedicated (not shrunk) mobile form. Verified in source. |
| 5 previously-mapped-only primitives (`NOISE_ORDER`, `POSITION_RAIL`, `CONTACT_GAP`, `DERIVED_SUMMARY`, `HALFTONE_FIELD`) | **COMPLETE** — all `wired: true`, all consumed, verified via `unwiredPrimitives().length === 0` at runtime. |
| modulepreload regression | **INVESTIGATED, ACCEPTED.** 1 link (Vite's own `__vitePreload` helper, 0.73 kB gzip), unavoidable once ≥2 entry-reachable modules dynamic-import. Real regression it *uncovered*: the Index lattice was eagerly fetching 227 kB of react-three-fiber before any WebGL reality was entered — **fixed** with an IntersectionObserver gate. |
| Chaos exact reconstruction | **VERIFIED** — full 10-stage run then byte-identical comparison of all 20 fragments (transform/position/word/register), `diffCount: 0`. |
| Content-truth: superseded method (`ABSORB→CLARIFY→BLUEPRINT→ASSEMBLE→SUSTAIN`) | **FOUND AND REMOVED** from 4 locations that had survived 3 earlier truth sweeps (an After Dark poster, Chaos's fragment array, X-Ray's specimen headings, a stale doc-comment in `simulator.ts`). |
| Working tree | **DIRTY, UNCOMMITTED.** 20 modified files + 4 new files represent all of the above. This is real, verified, building/passing work — not speculative. It has not yet been committed to `phase-6-canonical-spatial`. |
| TypeScript / Lint / Build | **Clean** — 0 errors, 0 warnings, verified this pass. |
| Bundle | Entry 309.15 kB raw / **104.55 kB gzip**. Down 0.52 kB gzip from pre-Phase-6 (`8614f98`: 105.07 kB), despite the 227 kB regression fix, the lattice, and 5 new primitives, because `Newsreader` variable-font subsetting and other Phase 6 changes offset the additions. |
| Dependencies | Unchanged: 5 runtime + 13 dev → 173 packages. Nothing added. |
| Commercial repo | Clean, unmoved, at `6e36db1`. |

**REGRESSION (transient, already fixed within Phase 6, not currently present):** the Index
lattice's 227 kB eager fetch. Do not re-introduce it — the fix is the
`useApproached`/IntersectionObserver gate in `src/components/LabIndex/LabIndex.tsx`.

**No open blockers remain from the Phase 6 closure prompt.** The only outstanding action is
committing the working tree (a decision for whoever directs the next session — this
compaction pass was told explicitly not to make git-history decisions).

---

### 10. MATERIAL / SPATIAL SYSTEM

**Materials** (`src/design-system/materials.ts`, 13 entries, verified): `PAPER`, `INK`,
`SIGNAL`, `GRAPHITE`, `RULE`, `ARCHIVE`, `GRAIN`, `HALFTONE`, `TRACE`, `PROVENANCE` —
**10 inherited** from a canonical source (each cites the file). `REGISTRATION`,
`BLUEPRINT`, `CUT` — **3 Lab-originated** (`inherited: false`), each stating why no
canonical equivalent exists. Every entry: appearance, motion, depth, audio-or-null,
fallback, reduced-motion, origin.

**Spatial primitives** (`src/spatial/translation.ts`, 14 entries) — see §8. All BUILT and
WIRED; none MAPPED-ONLY; none orphaned. No SOURCE-REFERENCE-ONLY category exists in the
current schema — a primitive is either wired or it doesn't exist yet as one.

**Spatial-twin architecture:** `LATTICE_ASSEMBLY` on the Reality Index (§6) is the one
instance. `spatial/SpatialCanvas.tsx` + `spatial/projection.ts` remain the single shared
projection contract (one canvas convention, one quality-tier system, one disposal helper —
`useDisposable`/`disposeObject` in `spatial/disposal.ts`).

---

### 11. PERFORMANCE BASELINE (verified this pass, current build)

| | Value |
|---|---|
| Entry JS (raw) | 309.15 kB |
| Entry JS (gzip) | **104.55 kB** |
| react-three-fiber chunk | 880.55 kB raw / 233.68 kB gzip — dynamic only, verified no static `from "...three..."` import in the entry chunk |
| modulepreload count | **1** (`preload-helper`, Vite's dynamic-import runtime, 0.73 kB gzip) — investigated and accepted, see §9 |
| Runtime dependencies | 5 |
| Dev dependencies | 13 |
| Total resolved packages | 173 |
| Heaviest lazy chunk | `PerformanceMode` 39.09 kB / 13.08 kB gzip (new CONVERGENCE readout) |
| Elevated-mode chunks | Sonic 2.43 kB · After Dark 2.84 kB · Chaos 2.97 kB · Presence 3.09 kB · Time Machine 4.39 kB (all gzip) |

**Verified network-level (Phase 6):** across 7 states — launcher, Index unscrolled, a
DOM-only reality, After Dark (Canvas2D, no WebGL), Sonic (DOM), Chaos (DOM physics), and a
spatial reality — react-three-fiber fetches **only** on first entry to the spatial reality.
Zero eager fetch elsewhere.

---

### 12. ACCESSIBILITY / REDUCED MOTION / MOBILE — current verified state

- **Keyboard/focus:** all 6 Phase-6-touched realities show 0 unnamed focusables, 0
  `[role=slider]` missing `aria-valuenow`, 0 exposed (non-`aria-hidden`) canvases.
- **Focus restoration:** verified through all three exit paths (Escape, EXIT button,
  browser Back) — each returns focus to the exact Reality Index row the visitor left from.
- **Escape:** works during Chaos stage 08 (near-total failure) — exits cleanly, 0
  fragments/RAF/transients remain.
- **Touch targets:** only known sub-28px elements are Time Machine's two 1995-era links,
  which carry an intentional 44px pseudo-element hit area (by design, not a defect).
- **390×844 / 768×1024 / 1440×900 / 1920×1080:** 0 horizontal overflow at any width across
  all Phase-6-touched realities; EXIT reachable at every width.
- **Reduced motion / lite tier:** all 6 elevated/touched realities render substantive
  content (182–2569 chars of live text), none empty.
- **Semantic fallback:** `spatialFallbackReason()` still derives truthful WebGL-availability
  copy from actual capability flags, not from tier alone.
- **Audio consent:** verified before/during/after-exit context lifecycle — `off`/`none` →
  `on`/`running` (only after a real gesture) → `off`/`none` (context closed, not suspended).

---

### 13. HARDWARE QA — still pending, clearly separate from software acceptance

| Path | Status |
|---|---|
| Presence granted-camera path | **SOFTWARE PATH VERIFIED** (no request before consent, decline path, teardown clears `srcObject`/tracks). **REAL HARDWARE PENDING** — this dev environment has no camera; procedure is documented in `docs/PRESENCE_HARDWARE_QA.md` for a human to run. |
| Portal immersive XR | **REAL HARDWARE PENDING** — reported via feature-detection only, never assumed. |
| Portal device tilt / accelerometer | **REAL HARDWARE PENDING** — same. |

None of these are failures. They are honestly labelled as unverified, per the project's
truth rule about hardware claims.

---

### 14. KNOWN TECHNICAL DEBT (active only)

- **`prefers-reduced-motion` → `lite` capability-tier coupling.** Deliberate, documented,
  not a bug. Conflating motion preference with render capability is architecturally
  imprecise but the fallback paths are truthful (see §12), and no fix is scheduled.
- **1 modulepreload link.** Accepted (§9, §11) — not scheduled for removal; would require
  Rollup output configuration changes disproportionate to a 0.73 kB cost.
- **Manual canonical sync.** `check-canonical-sync.mjs` is a dev-only, manually-run drift
  check, not automated CI. If the canonical repo moves, nobody is notified automatically.
- **Hardware QA** (§13) — inherently cannot be closed from this environment.
- **`THREE.Clock` deprecation warning** surfaces from `@react-three/fiber` internals in the
  console; not the Lab's own code, not actionable without an R3F upgrade (out of scope
  without explicit instruction per the framework-migration rule).

Nothing else from earlier phases is currently open — Phase 5.5's 7 closure defects, and
Phase 6's regressions found along the way, are fixed and verified in this pass, not merely
claimed.

---

### 15. PHASE 6.5 MISSION (not started — record only)

The Lab is technically and architecturally sophisticated but visually still dependent on
typography, line work, dark interfaces, technical diagrams, and abstract geometry. Phase 6.5
exists to move it from **ADVANCED INTERFACE** to **ART-DIRECTED DIGITAL WORLD** — introducing,
where conceptually justified: photography, image treatment, 3D objects (scanned/modelled),
environments, depth, materiality, collage, cinematic composition, cultural visual reference,
human presence, spatial storytelling, and stronger art direction generally.

The Hi Anzy deck (`docs/HI_ANZY_DECK_CONTENT.md`) is reference/provenance, not a creative
cage. The canonical frontend supplies truth (method, taxonomy, brand tokens — unchanged by
6.5). External references supply inspiration only. Research sources explicitly permitted:
Pinterest, Behance, Awwwards, Godly, Codrops, Are.na, Three.js examples, spatial/design
studio portfolios, appropriately-licensed asset libraries.

Working principle for 6.5: **understand Hi Anzy deeply → research broadly → invent freely →
select ruthlessly → build originally.**

---

### 16. PHASE 6.5 CREATIVE FREEDOM (record only)

Permitted: research, design, create, model, generate procedural assets, write shaders,
source appropriately-licensed assets, reinterpret canonical elements and the deck, change
visual composition, invent new spatial metaphors, use different visual laws per reality.

Not permitted: copying another studio's actual work. The deck is context, not a template.

---

### 17. WHAT MUST NOT BE LOST DURING 6.5

Architecture (mode engine, `CleanupScope`, one RAF loop, one spatial projection contract) ·
Truth (canonical content provenance, no fabricated business facts, honest hardware/capability
reporting) · Performance (lazy-loading, entry-chunk discipline, no eager `three`) ·
Accessibility (keyboard, focus restoration, Escape everywhere) · Cleanup (zero leaked
canvases/RAF/audio/listeners on exit — verified by lifecycle torture) · Mobile (dedicated
compositions, not shrunk desktop) · Reduced motion (concept-preserving fallbacks) · Canonical
content (method/taxonomy stay sourced, not invented) · Exit/Escape (always work) · Hardware
honesty (PENDING stays PENDING until real hardware confirms) · Asset provenance (every new
image/3D asset's source and licence recorded, the way fonts and content are now).

---

### 18. NEXT SESSION BOOT SEQUENCE

1. Read `CLAUDE.md` (permanent engineering rules).
2. Read this file, `docs/PROJECT_STATE_PRE_PHASE_6_5.md` (current state).
3. Run `git status`, `git branch`, `git log --oneline -10` — confirm branch is
   `phase-6-canonical-spatial`, confirm whether §9's uncommitted work has since been
   committed (it may have been between sessions).
4. Run `node scripts/check-canonical-sync.mjs` — confirm no canonical drift before mirroring
   anything new.
5. Re-verify §9's "no open blockers" claim still holds (`npx tsc -b`, `npm run lint`,
   `npm run build`) rather than trusting it silently.
6. Read the Phase 6.5 master prompt when it is given.
7. Research before implementing — Phase 6.5 explicitly asks for broad visual research before
   any building begins.

---

## CONTRADICTION AUDIT (performed this pass)

| Contradiction | Resolution |
|---|---|
| `CLAUDE.md` said body face = IBM Plex Sans; code (`fonts.css`, `tokens.css`) says Newsreader since Phase 6 | **Resolved from code.** `CLAUDE.md` corrected. |
| `docs/EXPERIENCE_LAB_VISUAL_SYSTEM.md` and `docs/EXPERIENCE_LAB_REFERENCES.md` had the same stale Plex Sans claim | **Resolved from code.** Both corrected. |
| `CLAUDE.md`'s phase-discipline footer said "do not start Phase 5" | **Stale — 6 phases have since run.** Replaced with a pointer to this file instead of a new hardcoded phase number, so it can't go stale the same way again. |
| Earlier chat draft counted `SERVICES.length` as 7 | **Resolved from code — actually 6.** The 7th match was the TypeScript interface field `slug: string`, not a service entry. |
| Earlier chat claimed "16 → 17 SPATIAL_TRANSFORM" without re-verifying post-edit | **Confirmed live**: `byTreatment.SPATIAL_TRANSFORM === 17`, `MATERIAL_SOURCE === 17` (was 18) — `three/SystemCore.js`'s manifest entry moved treatments in this session, verified by direct evaluation of `coverage()`, not by re-reading old chat text. |
| Prior sessions reported primitives as "9 built / 5 mapped-only" | **No longer true — stale.** Live check: `unwiredPrimitives().length === 0`. All 14 are wired now. Old status removed from this document rather than carried forward. |
| `docs/HI_ANZY_DECK_CONTENT.md` still describes the deck's own historical Plex Sans usage | **Not a contradiction** — that file is a provenance record of the source deck, not a statement of current Lab implementation. Left unchanged. |
