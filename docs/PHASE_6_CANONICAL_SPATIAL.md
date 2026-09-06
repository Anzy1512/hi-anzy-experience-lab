# PHASE 6 — CANONICAL SPATIAL CONVERGENCE

> The machine-readable records are `src/content/canonicalManifest.ts` (coverage),
> `src/spatial/translation.ts` (primitives) and `src/design-system/materials.ts`
> (materials). PERFORMANCE derives its CONVERGENCE readout from all three, so no
> number in this document is typed into a page anywhere.

| | |
|---|---|
| Canonical source | `Anzy1512/hi-anzy-platform` @ `6e36db1449834a9476150cb05da0e9eb9f6b5537`, branch `main` |
| Canonical drift | none — HEAD equals the Phase-5.5 recorded commit |
| Lab starting commit | `8614f98` (Phase 5.5 closure) |
| Branch | `phase-6-canonical-spatial`, cut from `8614f98`; `master` untouched |
| Commercial repo | read-only throughout, `git status --porcelain` empty |

---

## A. What Phase 6 took from the canonical frontend

**The typography, from the source's own words.** `frontend/src/App.css` opens:

> Typography system (locked): Rajdhani = System Voice · Newsreader = Human Voice (serif)

The Lab had been setting every human sentence in IBM Plex Sans, a face that
appears nowhere in the canonical system. Newsreader is now the human voice here,
from the site's own file. Rajdhani and IBM Plex Mono turned out to be **byte-
identical already** — sha256 verified, and nobody had ever checked.

**The palette, from `frontend/src/index.css` "hiAnzy raw tokens".**
`--paper #E0D8C1` · `--ink #232A2A` · `--orange #F19020` · `--signal #E54A25` ·
`--white-d #F7F5EE` · `--panel-dark #1D2424`. The orange had been right to
within one step per channel; paper and ink had drifted.

**Eleven `components/three/` and three `components/motion/` files** that Phase
5.5 listed but never opened. Six primitives came out of them.

**A shared engineering ethic, stated independently in both codebases.**
`useSceneVisibility` ("the loop must not exist when nothing is subscribed"),
`ScrollVelocity` ("an idle page runs no animation frames at all"),
`Constellation` ("the scene is never the only source of info"), `OrderingGrid`
("offsets are seeded, never random"), `ContextualCursor` ("deliberately not a
cursor replacement"). Every one is a rule the Lab wrote for itself.

---

## B. The primitive registry

Fourteen primitives. **All fourteen built and consumed; none mapped-only; none
orphaned.** The `wired` flag exists because naming a destination is free, and a
translation table full of confident destinations is how a system comes to
describe work nobody did.

| Primitive | Canonical source | Lab implementation | Consumer | Reduced motion | Mobile |
|---|---|---|---|---|---|
| `PINNED_FIELD` | `PinnedSequence` | held frame, advancing content | Compiler, Director | steps render as a list | unchanged |
| `SPATIAL_DECK` | `EvidenceDeck` | plates in depth, one in focus | Anzy.OS, Memory | lays flat, selection works | stack |
| `ANATOMY_SPINE` | `CaseAnatomy` | ruled registers drawn whether filled or not | Agency Simulator | all registers at once | unchanged |
| `ORBIT_CLUSTER` | `OrbitSection` + `three/SignalField` | districts around a centre | Living World | positions hold, pulses stop | fewer structures |
| `ROUTE_TRACE` | `RouteLine` | drawn dependency between two things | Living World, Simulator, Index | renders complete | unchanged |
| `GRAIN_RESOLVE` | `DissolveImage` | material out of its own residue | Memory, Dream | resolved state | unchanged |
| `DIAGNOSTIC_FIELD` | `SystemDiagnostic` | clusters with named dependencies | Agency Simulator | failing link marked | unchanged |
| `PROVENANCE_MARK` | `ProvenanceTag` | credit and its absence, both first-class | Memory, Performance | a label is a label | unchanged |
| `LATTICE_ASSEMBLY` | `three/SystemCore` | 16 nodes mesh into one structure | Reality Index | assembled, no travel | hidden below 900px |
| `NOISE_ORDER` | `three/LensField` + `motion/OrderingGrid` | `spatial/noiseOrder.ts` — seeded disorder with an **exact** inverse | Chaos | ordered | unchanged |
| `POSITION_RAIL` | `three/IndexSpine` | seven eras on a travelled rail | Time Machine | node in place, no transition | unchanged |
| `CONTACT_GAP` | `three/SparkGap` | the inversion threshold, drawn | Presence | ring present, no transition | same ring at the finger |
| `DERIVED_SUMMARY` | `PackageBuilder` | `content/derivedSummary.ts` — systems → stages → published span | Agency Simulator | text, always was | unchanged |
| `HALFTONE_FIELD` | `three/HalftoneBackdrop` | `modes/afterdark/HalftoneField.tsx` — Canvas2D dot screen | After Dark | drawn once, no frame loop | same, touch-driven |

---

## C. The three elevations

### SONIC ARCHITECTURE

**Before.** Sixteen coloured bars on a baseline. Height→pitch, position→pan,
material→timbre and a playhead were all already true and correct; the drawing
did not say any of it.

**Problem.** The thesis says architecture. The picture said chart.

**Source principle.** Not a component — a drawing convention. An elevation has a
ground line, datum levels, coursing, hatch (poché) and a section cut.

**Change.** Four, none of them WebGL. **Datum lines** ruled across the field,
each labelled with the note a bay reaching it will sound, so height stops being
a quantity and becomes a storey you can name. **Coursing** — a bay of seven
draws seven courses, which is exactly the quantisation the audio already
performs. **Hatch** instead of flat tone, so six materials differ in pattern and
survive being small or seen by someone who cannot separate the hues. **Section
cut** — the sounding bay is drawn cut, heavy outline and solid poché, one device
doing both jobs.

**Mobile.** A different drawing. Below 900px the elevation turns ninety degrees
into a **section**: eight floors stacked down the page, height running across
the full width instead of 21px per bay. Same DOM, same audio; the drag axes swap
and both arrow-key axes are bound so a keyboard visitor need not know which way
the drawing is turned.

**Performance.** DOM and CSS. No canvas, no WebGL. Chunk 6.15 kB / 2.44 kB gzip.

**Verdict.** It is an instrument that looks like a drawing of a building.

### AFTER DARK

**Before.** Black stock, a lamp on a timer, a static grain data-URI, six posters.
A dark theme with atmosphere.

**Problem.** Nothing responded. The thesis — the printed system after the studio
closes — needs a printed system that behaves like one.

**Source principle.** `three/HalftoneBackdrop.js`: a dot screen at a fixed cell,
radius modulated, "texture, never noise".

**Change.** `HALFTONE_FIELD` as real runtime behaviour — a Canvas2D dot screen
that *is* the stock rather than a backdrop to it. Dots open under the lamp and
close away from it, which is what a halftone physically does. Per-cell tone is
seeded, so the sheet has the fibre it has rather than a new one per reload.

**Interaction.** The lamp is held by **movement**, not by presence. The first
version bound it to pointer enter/leave on the whole mode, which meant the light
was held whenever a mouse existed. Two seconds after the visitor stops, the wall
goes back to sweeping on its own — which is the mode's premise, and it has to
keep being true when nobody is there.

**Content defect found.** A poster was still printing `ABSORB · CLARIFY ·
BLUEPRINT / ASSEMBLE · SUSTAIN` — the superseded method. It reads from
`canonical.METHOD` now.

**Performance.** No WebGL. The frame subscription exists only while the lamp is
moving. Chunk 6.22 kB / 2.84 kB gzip.

### CHAOS

**Before.** Ten stages of Verlet physics throwing a **hand-typed array of
twenty words** around — an array that still contained the superseded method.

**Problem.** The premise is that the system survives destruction because its
structure is understood. What came apart was a souvenir of the system.

**Change.** Fragments derive from `canonical.METHOD`, `canonical.SERVICES` and
the material vocabulary — the three things the Lab actually claims to be made
of. Each carries its register, so a fragment can be shown in the *wrong* one.

`NOISE_ORDER` is now a real module, `spatial/noiseOrder.ts`, and it is the piece
that makes the mode's claim true: `disorder(i, 0)` returns a shared frozen zero,
so the reconstructed state is not animated toward — it is the identity the
function already returns. Its `misplaced()` half drives **stage 04 TAXONOMY
DRIFT**: every category on screen correct, none of them where it belongs.
**Stage 05 MATERIAL MISMATCH** draws a fragment in another register's material.

**Verified.** Full 30s performance, then all twenty fragments compared: **byte-
identical** transform, position, word and register. `diffCount: 0`. Escape at
stage 08 exits to the index with zero fragments, zero RAF, zero transients, no
body style or class, no scroll lock.

---

## D. The modulepreload investigation, and what it found

Phase 5.5 had 0; Phase 6 had 1. The link turned out to be **Vite's own
`__vitePreload` runtime** (1.34 kB / 0.73 kB gzip), split into its own chunk
once a second entry-reachable module started importing dynamically. Harmless.

**Investigating it uncovered a real regression.** Measured on the production
build: the Reality Index was fetching **227 kB of react-three-fiber before the
visitor entered any reality**. A lazy import is not a gate — `lazy()` resolves
the moment React renders the component, and the lattice was mounted inside the
cross-reference section unconditionally.

Fixed with an IntersectionObserver load gate at a 600px margin, following
`useSceneVisibility`'s own reasoning about generous margins.

Measured after, on the production build:

| State | R3F fetched |
|---|---|
| A — launcher | none |
| B — Index, not scrolled | none |
| C — Time Machine (DOM only) | none |
| E — After Dark (Canvas2D) | none |
| E — Sonic (DOM) | none |
| E — Chaos (DOM physics) | none |
| D — Matter Engine (spatial) | **227 kB, first fetch** |

**Decision:** the preload stays and the invariant is formally restated. The rule
was never "zero preload links" — it was "`three` is never eagerly loaded". That
is now measured across seven states rather than asserted, and the number is
reported rather than tidied away.

---

## E. Content-truth defects found

The superseded method **survived three previous sweeps** in four places, because
each looked like something else: a poster, a pile of falling type, an editorial
specimen, and a doc comment.

1. **After Dark** — a poster printing `ABSORB · CLARIFY · BLUEPRINT`.
2. **Chaos** — the same five words in the fragment array.
3. **X-Ray's specimen** (`brand.ts`) — four columns headed `ABSORB · CLARIFY ·
   BLUEPRINT · ASSEMBLE`. It never claimed to be the method, which is exactly
   why it survived; a visitor who knows the real five stages would have read it
   as one. Now `LOOK · ORDER · DRAW · ASSEMBLE`, deliberately colliding with
   neither method.
4. **`simulator.ts`** — a doc comment describing the old sequence and asserting
   "no new corporate methodology has been invented here", in a file that had
   been importing the canonical stages since Phase 5.5. The data was right and
   the explanation was wrong.

Also: **the favicon** was still drawn in the printed deck's bone, ink and orange
after every stylesheet had moved — a data URI in `<head>` is the one surface a
CSS audit never reaches.

---

## F. Known limitations

- `prefers-reduced-motion` still selects the `lite` capability tier. Unchanged
  by decision; the fallback sentences remain truthful about actual capability.
- One modulepreload, documented above.
- Presence's camera path, Portal's immersive XR and device tilt remain
  **hardware-pending**. Nothing was emulated and nothing is claimed.
- `THREE.Clock` deprecation warning from R3F internals.
- Newsreader italic mirrored and removed — nothing sets italic.
- `ORBIT_CATEGORIES` and `CaseAnatomy`'s seven steps read but not mirrored:
  nothing would consume them, and mirrored data with no reader makes coverage
  look larger than the work.
