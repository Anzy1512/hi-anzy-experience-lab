# PHASE 8.12B — PRODUCT ARCHITECTURE + GRADUATION FOUNDATION

Workstreams §5–§10. The objective was not filesystem aesthetics: it was to make
later extraction of a single product possible without rewriting the Lab or
duplicating its infrastructure.

**Status: CLOSED.** No file was moved. Ownership is declared, the one real
coupling is recorded with the work that removes it, and two unbacked contract
claims found by the analysis were corrected.

## BRANCH / HEAD

`phase-8-12-independence`, cut from `138fa72`. Baseline at start: `f30faf0`,
clean, gates green (`tsc -b` 0 · `eslint --max-warnings 0` 0 · build passes).

## PASS A — THE DEPENDENCY TRUTH

Parsed, not assumed: every static and dynamic import in `src/` resolved to a
file and both ends classified by owner.

### File ownership

| Owner | Files | | Owner | Files |
|---|---|---|---|---|
| PLATFORM/content | 18 | | REALITY:world | 11 |
| PLATFORM/ui | 13 | | REALITY:xray | 10 |
| PLATFORM/system | 11 | | REALITY:compiler | 6 |
| PLATFORM/runtime | 7 | | REALITY:os, simulator | 5 each |
| PLATFORM/spatial | 7 | | REALITY:director | 4 |
| PLATFORM/lifecycle | 6 | | REALITY:matter, memory | 3 each |
| PLATFORM/audio | 3 | | REALITY:afterdark, dream, portal, presence | 2 each |
| PLATFORM/artifacts, graphics, motion, shell | 2 each | | REALITY:chaos, performance, sonic, timemachine | 1 each |
| PLATFORM/analytics, design | 1 each | | DEV | 3 |

### The finding that matters

**One sibling coupling exists in the entire Lab:**

```
presence -> matter   modes/presence/PresenceMode.tsx imports modes/matter/ParticleField.tsx
```

Sixteen realities, one cross-product import. Nothing else. No circular coupling
was found in either direction.

**Platform → reality edges are all dynamic**, and all from one place:
`content/lab.ts` lazily importing each mode. That is the code-split seam and is
intended — the registry names realities, it does not link them.

## PASS B — PLATFORM VS PRODUCT OWNERSHIP

Sixteen shared contracts, named so that "what does this product need from the
Lab" is answerable without re-reading its imports:

`RUNTIME` · `LIFECYCLE` · `SHELL` · `PROJECT` · `PERSISTENCE` · `ARTIFACT` ·
`HANDOFF` · `WORK` · `REGISTRY` · `BRAND` · `DESIGN` · `MOTION` · `SPATIAL` ·
`GRAPHICS` · `AUDIO` · `UI`

Every product and instrument consumes `RUNTIME`, `LIFECYCLE` and `SHELL` without
exception — the frame loop, the cleanup scope that guarantees exit, and the
chrome that owns the way out. Those three are what no single reality can be
extracted without.

**No reality owns shared project memory or global lifecycle.** Verified: the
only writers of `system/project` state are the platform's own modules and
`ArtifactBar`; `recordArtifact` has exactly two callers, `ArtifactBar` and the
Compiler's INSPECT control.

## PASS C — THE PRODUCT DEFINITION

`src/system/maturity.ts`, an **extension** of `registry.ts` rather than a
competitor. Same ids, a dev-time guard that they describe the same sixteen
things, and **no field duplicated**:

| Fact | Lives in |
|---|---|
| layer, family, proposition, the six-question contract | `registry.ts` (unchanged) |
| owns, consumes, dependsOnSiblings, persistence, maturity, evidence, graduation, standalone | `maturity.ts` (new) |

`INPUT / CONTEXT / PROCESS / RESULT / YOU TAKE / CONTINUE` is **not** repeated —
`maturity.ts` imports `PRODUCTS` and cross-checks against it.

It is loaded in development only, from `main.tsx` behind `import.meta.env.DEV`,
so its guard actually runs. **Verified absent from every production chunk** —
`MATURITY_ORDER`, `dependsOnSiblings`, `removalPath`, `graduationGaps` and
`siblingCouplings` appear in no shipped file.

## PASS D — MATURITY, DEFINED OPERATIONALLY

| State | Means |
|---|---|
| EXPERIMENT | proves an interaction or idea. Owes nothing else. |
| PROTOTYPE | performs a coherent job; major product gaps remain. |
| ALPHA | core workflow works; named reliability or product constraints are open or unverified. |
| BETA | workflow, persistence, error states, accessibility and major edge cases usable. Production validation remains. |
| PRODUCT | meets the Lab's release contract in full. |
| STANDALONE | PRODUCT plus an independent build/deploy/extraction contract that has been executed. |

**Nothing is PRODUCT or STANDALONE.** The Lab's release contract is not written
and no reality has ever been built or deployed alone. Claiming either would be
claiming something nobody has done.

### Classification, with evidence

| Reality | Layer | Maturity | The evidence that set it |
|---|---|---|---|
| ANZY.OS | PRODUCT | **BETA** | Flows A & D with a reload; four destructive ops; the seven-case storage failure matrix passes through its surface; 32px at four viewports |
| Agency Simulator | PRODUCT | **BETA** | Flow A: brief rebuilt from stored inputs after reload, nothing re-asked |
| Reality Compiler | PRODUCT | **BETA** | Flow B: manifest recorded, carried to X-Ray, opens on the same page |
| Matter Engine | PRODUCT | **BETA** | Flow C: recipe recorded, Director opens on it by name after reload |
| Director | PRODUCT | **BETA** | Accepts brief OR recipe, names its source; verified in A and C |
| **Portal** | PRODUCT | **ALPHA** | Its `kind: 'delivery'` handoff exists in source and **has never been exercised end to end** — no QA run has produced a delivery artifact |
| **X-Ray** | INSTRUMENT | **ALPHA** | Inbound handoff verified; outbound has **no mechanism** — imports `claim`/`offered`, never `offer` |
| **Performance** | INSTRUMENT | **ALPHA** | Imports neither `project` nor `handoff`; report is download-only |
| **Presence** | INSTRUMENT | **ALPHA** | Consent verified in software (zero `getUserMedia` calls before consent); **physical camera never tested**; holds the one sibling import |
| Living World | EXPERIENCE | PROTOTYPE | Frozen; rail below floor, labels off-viewport at 390/768 |
| Memory, Time Machine | EXPERIENCE | PROTOTYPE | Deep states exercised in 8.11 |
| Dream, Chaos, After Dark, Sonic | EXPERIENCE | EXPERIMENT | Each proves one idea and claims nothing more |

Portal, X-Ray and Performance are **not** at ALPHA because they are unpolished.
They are there because a named part of their contract is unproven or unbuilt.

## PASS E — THE GRADUATION CONTRACT

Eighteen dimensions, four answers: **PASS** (demonstrated) · **OPEN** (a known
gap with work behind it) · **UNVERIFIED** (the mechanism exists, nobody has run
it) · **N/A** (does not apply to this kind of thing).

Deliberately not a score. A percentage over eighteen unequal dimensions is a
number nobody can act on; each of these four closes with a specific piece of
work. `graduationGaps(id)` returns exactly the OPEN and UNVERIFIED rows.

### Per-product gaps — "what prevents this becoming standalone"

| Reality | OPEN | UNVERIFIED |
|---|---|---|
| ANZY.OS | STATE_ISOLATION, DEPLOYABILITY | PERFORMANCE |
| Agency Simulator | DEPLOYABILITY | PERFORMANCE |
| Reality Compiler | DEPLOYABILITY | ERROR_STATES, PERFORMANCE |
| Matter Engine | DEPLOYABILITY | PERFORMANCE |
| Director | DEPLOYABILITY | PERFORMANCE |
| Portal | DEPLOYABILITY | ARTIFACT, CONTINUE, PERSISTENCE, RESUME, ERROR_STATES, EXPORT, PERFORMANCE |
| X-Ray | CONTINUE, PERSISTENCE, DEPLOYABILITY | PERFORMANCE |
| Performance | CONTINUE, DEPLOYABILITY | — |
| Presence | DEPENDENCY_ISOLATION, DEPLOYABILITY | PERFORMANCE |

`PERFORMANCE` is UNVERIFIED almost everywhere for one honest reason: headless
Chrome drives rAF at roughly 2fps, so nothing measured in this environment is a
benchmark. It stays UNVERIFIED until somebody measures on real hardware.

## PASS F — EXTRACTABILITY

| Reality | Candidate | The blocker, specifically |
|---|---|---|
| **Agency Simulator** | **yes — strongest** | No sibling imports; its reading is a pure function of a sentence plus five choices. Needs BRAND to travel with it. |
| Matter Engine | yes | Extractable today; **Presence breaks** unless the renderer moves first. |
| Director | yes | The only AUDIO consumer among products. |
| X-Ray | yes | Needs a subject to measure; CONTINUE unbuilt. |
| Performance | yes | Measures the Lab — extracted, it has nothing to observe. |
| Reality Compiler | yes | Heaviest SPATIAL consumer after Living World. |
| ANZY.OS | yes, hardest | Hosts SYSTEM.app, which reads the whole project store: extraction means deciding whether the project layer travels or becomes a service. |
| **Portal** | **no** | Its output is other products' output. Least separable by design. |
| **Presence** | **no** | The sibling import. Extracting it today takes Matter with it. |

State portability: every product's durable state is the shared `Project`, which
is schema-versioned, exportable as MD+JSON, and already independent of any
product. Artifacts carry `producer`, `sourceIds` and `limits`, so provenance
survives extraction. **UI is coupled to ModeHost for all sixteen** — every mode
implements `ModeViewProps` and relies on the host for chrome, Escape and scope.
That is the deliberate shared contract, and it is what a standalone shell would
have to provide.

## PASS G — DIRECTORY BOUNDARIES: DEFERRED, ON PURPOSE

**No file was moved.** `src/platform/`, `src/products/` and so on were
considered and rejected for now.

The dependency map shows the existing layout already expresses the boundary:
`modes/<id>/` is reality-owned, everything else is platform, and the only
violation is one import. Moving sixteen directories to make a diagram tidier
would touch every import in the project, invalidate the QA drivers, and risk
regression in mature code — to express an ownership that a manifest now states
precisely and a dev guard enforces.

Ownership is declared before it is enforced; physical moves become worthwhile
when a product is actually extracted, and at that point they are that product's
move rather than a big-bang migration.

## PASS H — SHARED LAYERS

Everything protected was verified, not assumed: project memory, artifact
provenance, handoffs, cleanup/lifecycle, reduced motion, keyboard/focus/Escape,
lazy loading, bundle isolation, storage semantics and source provenance all
behave exactly as before. No behaviour regression.

## DEFECTS FOUND AND FIXED

The dependency analysis surfaced a truthfulness defect the registry's own guard
could not catch, because `unmetContract()` only counts `null` fields.

**X-Ray and Performance both declared `continue: 'SYSTEM.app.'` with no
mechanism behind it.** X-Ray imports `claim` and `offered` — inbound only, never
`offer`, and its artifact bar carries no handoff. Performance imports neither
`project` nor `handoff` at all. The registry's own header says the surface must
"refuse to claim a continuation that does not exist"; these two claimed one.

Corrected to the truth, and verified rendering in the orientation sheet:

- X-Ray — *"Nowhere yet. The report is a download; nothing carries it into the
  project, and SYSTEM.app does not receive it."*
- Performance — *"Nowhere yet. The report is a download; this instrument does
  not write to the project."*

Agency Simulator still reads `SYSTEM.app.`, which is backed by a real handoff.

## COUPLING: RETAINED, WITH THE REMOVAL PATH

`presence → matter/ParticleField` is **deliberately retained**.

It is not misfiling. `ParticleField` calls Matter's own `buildTargets()` over
Matter's `MatterState` vocabulary, so moving it to the platform would drag a
product's domain model into shared code. Giving Presence its own formation would
change what it draws, and this phase does not permit a behaviour regression.
Presence uses exactly one state, `"field"`, statically.

**Removal path, recorded in the manifest:** change `ParticleField` to take
prebuilt `from`/`to` `Float32Array` buffers instead of state names, move it to
`graphics/`, and let each caller build its own formation. Matter keeps
`buildTargets` and its vocabulary; Presence gains one static formation. Requires
a before/after visual comparison, because the field *is* the mode.

## VERIFICATION

| Check | Result |
|---|---|
| `tsc -b` / `eslint --max-warnings 0` / `npm run build` | 0 / 0 / passes |
| Registry + manifest dev guards | **silent** — no `[registry]` or `[maturity]` error |
| All 16 realities enterable | **all active**, zero overflow, no page or console errors |
| Corrected CONTINUE copy on screen | verified in the orientation sheet for both |
| Same-reality navigation regression | holds — `active` 11s, mode stays live, clock advances |
| Enter → exit → re-enter → Escape | RAF, canvases, videos, mode hosts all → 0 |
| Flow C + handoff + reload | passes; Director opens on the recipe by name |
| Project export MD / JSON | 10,904 B / 31,799 B — byte-identical to 8.11 |
| 390×844 smoke (product, instrument, experience) | all active, sheet fits, zero overflow, no sub-32px control |

## BUNDLE

| | Value | vs 8.11 close |
|---|---|---|
| Boot, 5 files, raw | 351,356 B | **+174** |
| Boot, gzip | 118,315 B | +64 |
| CSS | 42,588 B | **0** |
| modulepreloads | 4 | 0 |
| Dependencies | 5 runtime + 13 build | **unchanged** |

The +174 B is **entirely** the two corrected CONTINUE strings, which reach the
boot graph through `ProductContract` → `LabIndex`. Confirmed by locating the
literals in the entry chunk. The manifests cost nothing: dev-only, eliminated.

three/R3F remain outside the entry graph; the document composer remains outside
the boot graph; no unexpected eager product chunk appeared.

## CANONICAL SYNC — EXPECTED DRIFT

`check-canonical-sync.mjs` reports **DRIFT (exit 2)** against
`hi-anzy-website-2.0`: `content.js`, `App.js` and `App.css` have moved since the
snapshot. **This is expected and was not touched.** No canonical snapshot, route
or design token was changed in this block, in either direction.

## KNOWN LIMITATIONS

- One sibling coupling, retained with its removal path.
- Portal has six UNVERIFIED dimensions because its artifact path has never run.
- X-Ray and Performance have an OPEN CONTINUE — now stated truthfully rather
  than claimed.
- `PERFORMANCE` is UNVERIFIED across the board; no real-hardware measurement
  exists and headless figures are not evidence.
- Presence's camera is unverified on physical hardware.
- The Lab's **release contract is not written**, which is why nothing can reach
  PRODUCT. That is §11–§14 territory.

## REMAINING §11–§14

| | |
|---|---|
| §11 | restructure the launcher around Products / Instruments / Experiences — the registry already groups four ways; this is presentation, deliberately not started |
| §12 | define the `lab.hianzy.com` deployment boundary |
| §13 | define the standalone-product routing/deployment pattern |
| §14 | verify bundle isolation for an actual extracted candidate |

Plus, unblocked by this block: the Lab release contract (what PRODUCT means),
and the canonical re-sync with its own visual/content QA.
