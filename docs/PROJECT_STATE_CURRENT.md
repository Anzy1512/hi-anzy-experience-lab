# HI ANZY EXPERIENCE LAB — CURRENT STATE

**This is the living state document.** It records what is true now. When it
disagrees with a historical phase report about anything other than a standing
rule, this file and the source code win.

`docs/PROJECT_STATE_PRE_PHASE_6_5.md` is a **historical checkpoint** and is not
maintained. The phase reports (`PHASE_8_9_WORKFLOWS.md`,
`PHASE_8_10_PROJECT_MEMORY.md`, `PHASE_8_11_CONVERGENCE.md`) are historical
records of what each phase did, and stay that way.

---

## PHASE STATE

| Phase | State |
|---|---|
| 8.9 — workflows | **CLOSED** |
| 8.10 — project memory + persistence | **CLOSED** |
| 8.11 — product + brand convergence | **CLOSED** |
| 8.12 — lab independence + product launch foundation | **IN PROGRESS** — §1–§10 done (separation + product architecture), 8.12C done (release contract + canonical re-read); §11–§14 open |
| Audit service, layers 1–6 | **CLOSED** — corpus, crawl/index/retrieve, entity graph, intelligence engine, jobs and agents, product API and surface |

- Branch: `audit-osint-service`
- Gates: `tsc -b` = 0 · `eslint .` = 0 · `npm run build` passes
- Audit gates: `npm test` = 232/232 (PGlite) · `npm run test:pg` = 125/125
  (Postgres, from a clean schema) · `npm run closure`, `closure:l4`,
  `closure:l6` and `final-test` all pass

## THE AUDIT SERVICE

A second product, in `audit/`, with its own `package.json`, its own dependency
tree and its own tests. It is **not** part of the Lab's build: `npm ci && npm
run build` at the root resolves the same 5 runtime and 13 build dependencies and
produces a Lab that runs with no backend present, exactly as before.

| Layer | What it is |
|---|---|
| 1 | a corpus that can be retrieved from, on PGlite or Postgres, and proof that it can |
| 2 | discovery → crawl → extract → chunk → embed → index → hybrid retrieval |
| 3 | entity resolution and a commercial knowledge graph, with a resolver allowed to refuse |
| 4 | the intelligence engine: intent, plan, evidence packet, rules, citation gate |
| 5 | jobs, a task DAG, one orchestrator, three agents with tool contracts |
| 6 | the product API, and a reading surface built on the Lab's design system |

The surface is a **separate build** (`npm run build:product` → `dist-product/`).
It shares the Lab's tokens, its three typefaces and its easing vocabulary, and
imports none of its runtime — no modes, no engine, no spatial layer, no RAF
loop. It is built separately so the Lab's entry graph is not disturbed: a second
Rollup input would make the two share chunks and put a `modulepreload` in the
Lab's entry document for a page the visitor is not on.

The service holds a key that can spend money and fetch pages, so **no key is
ever built into the surface**. It asks for one and keeps it in the tab.

## THE PRODUCT

Sixteen realities, all `online` and enterable, behind a launcher and a Reality
Index. Not a website and not a component showcase: one company, sixteen
enterable realities, with a project that can travel between them.

## TAXONOMY

Three layers, in `src/system/registry.ts` (built Phase 8.7, unchanged since):

- **PRODUCT** — you give it something and take something away.
- **INSTRUMENT** — it measures; the reading is the output.
- **EXPERIENCE** — it demonstrates capability. No artifact is owed, and an
  experience is never marked incomplete for not producing one.

The index groups by kind into four sections, each with a one-line note:
PRODUCTS · INSTRUMENTS · SPATIAL & ARCHIVE · EXPERIMENTS. Plate numbers
(01–08, X1–X8) are identity and are untouched by the grouping.

A dev-only check errors if `content/lab.ts` and the registry fall out of step.

## MATURITY AND GRADUATION

`src/system/maturity.ts` extends the registry (same ids, dev-time guard, no
field duplicated) with what each reality **owns**, what platform contracts it
**consumes**, what it depends on from a sibling, its **maturity**, the evidence
behind it, an eighteen-dimension **graduation contract** and its standalone
blockers. Loaded in development only; absent from every production chunk.

Maturity is evidence, never polish: EXPERIMENT · PROTOTYPE · ALPHA · BETA ·
PRODUCT · STANDALONE. **Nothing is PRODUCT or STANDALONE**, and since 8.12C that
is a computed result rather than a statement of intent.

BETA: ANZY.OS, Agency Simulator, Reality Compiler, Matter Engine, Director.
ALPHA: Portal (delivery handoff never exercised), X-Ray and Performance
(CONTINUE has no mechanism), Presence (physical camera unverified; holds the
Lab's one sibling import).

Graduation answers are `PASS` / `OPEN` / `UNVERIFIED` / `N/A` — never a score.
`graduationGaps(id)` returns what actually stands in the way.

## THE RELEASE CONTRACT

`src/system/release.ts` classifies the eighteen dimensions by weight and makes
`is this a PRODUCT` executable. It adds no dimension, no state and no maturity
level. Dev-only, absent from every production chunk, and imported by `main.tsx`
in place of `maturity.ts` so both guards run.

- **RELEASE_BLOCKING (9)** — INPUT · TRANSFORMATION · OUTPUT · LIMITATIONS ·
  ERROR_STATES · LIFECYCLE · ACCESSIBILITY · RESPONSIVE · PRIVACY. `OPEN` or
  `UNVERIFIED` here blocks PRODUCT with no appeal.
- **CONDITIONAL (8)** — ARTIFACT · EXPORT · CONTINUE · PERSISTENCE · RESUME ·
  STATE_ISOLATION · PERFORMANCE · DEPENDENCY_ISOLATION. Owed only when the
  product's own declarations invoke them, and blocking exactly as hard where
  they do.
- **INFORMATIONAL (1)** — DEPLOYABILITY. Never blocking for PRODUCT; the whole
  question for STANDALONE.

`N/A` is legitimate only when traceable to a declaration — a `null` in the
registry contract, or `persistence: NONE | SESSION`. A dimension a reality owes
and records `N/A` is a blocker, and a dev guard fails on it. **It caught one on
its first run**: X-Ray declared `persistence: 'PROJECT'` while recording
`RESUME: N/A`; it reads the project and never writes to it, so its persistence
is now `NONE`.

`PERFORMANCE` scales to the workload. A reality that holds a WebGL surface
(`WEBGL_SURFACE`, each entry naming the file that mounts it) owes a real-hardware
reading; a text-and-DOM reality owes the lifecycle evidence. STANDALONE requires
`PERFORMANCE: PASS` regardless.

**Closest to PRODUCT**, computed: Agency Simulator, Matter Engine and Director,
one blocker each — `PERFORMANCE: UNVERIFIED`. **Strongest STANDALONE candidate**:
Agency Simulator (no siblings, no WebGL, no owned runtime dependency, smallest
platform surface of any product). Full contract, the applied table and the eight
STANDALONE conditions: `docs/PHASE_8_12_RELEASE_AND_CANONICAL.md`.

**One sibling coupling exists in the whole Lab**: `presence → matter/ParticleField`,
retained deliberately with its removal path recorded in the manifest. Full
analysis: `docs/PHASE_8_12_PRODUCT_ARCHITECTURE.md`.

## PRODUCT CONTRACT

Six questions every PRODUCT and INSTRUMENT answers, or answers `null` honestly:
**INPUT · CONTEXT · PROCESS · RESULT · YOU TAKE · CONTINUE**.

`unmetContract()` and `incompleteProducts()` count the gaps from the registry
rather than from a maintained list. Only PRESENCE has empty rows, and that is
by design — an instrument that keeps nothing has nothing to hand over.

It counts `null` fields only, so it cannot catch a field filled in with a claim
nothing implements. Phase 8.12B found two: X-Ray and Performance both declared
`continue: 'SYSTEM.app.'` with no handoff behind it. Both now state the truth —
the report is a download and nothing carries it into the project.

## ORIENTATION SYSTEM

The contract is readable **inside** the reality, not only on the index.

- The chrome band's plate number and title is a control reading
  **WHAT IS THIS** (the glyph `?` below 900px, where the band has no room for
  words). It carries an `aria-label` stating what pressing it does.
- It opens a sheet of the reality's own ground, anchored under the chrome:
  where you are, the layer note, the proposition, the six contract rows, and —
  only when a project holds something — its name, statement, state, result
  count and last meaningful event.
- **Escape has exactly one owner.** ModeHost's single `useEscape` closes the
  sheet when it is open and leaves the reality when it is not.
- Open state is keyed on the mode id, so a sheet cannot survive into the next
  reality.
- Project context is **additive**: a reality entered with no project shows no
  empty ledger and is never blocked.

## INTERACTION FLOOR

**32px**, this project's own baseline, above WCAG 2.5.8 AA's 24px.

Verified: no interactive target below 32px in any reality at 1920×1080,
1440×900, 768×1024 or 390×844 — except two documented exceptions.

### Documented exceptions

1. **Era1995 page links, 17.6px (Time Machine).** A period-accurate 1995
   reconstruction — *"This page is under construction. Best viewed at
   640×480."* They are the artwork. A 32px button would falsify the era.
2. **Living World — `lw-stop` 21.6–29.6, `lw-label` 24.0, `lw-nav__btn` 28.0.**
   **FROZEN.** `lw-label` is positioned absolutely in the world lattice, so its
   box is composition rather than chrome. **Requires an explicit exemption from
   the freeze before anyone edits it.** Living World has not been modified since
   the freeze and was not modified in 8.10 or 8.11.

## ARTIFACT SEMANTICS

An artifact enters the project ledger **when it is handed onward**, not when it
is downloaded. `ArtifactBar.run()` delivers a file; only `send()` calls
`recordArtifact()`.

The UI states this rather than leaving it to be discovered: *"A copy leaves with
you and nothing is kept. SEND also records it in this project, with where it
came from and what it cannot tell you."*

**SAVED means one thing** — a project written to this browser's storage. A
download replies `DOWNLOADED`, in the artifact bar and in the terminal.

## PROJECT MEMORY

- Schema version **1**. localStorage index `hi-anzy-lab.projects.v1`; IndexedDB
  bodies in `hi-anzy-lab` / `projects`.
- **Inputs are stored; outputs are derived.** The 25.3 kB brief is a pure
  function of a sentence plus five choices (~200 B), so only the inputs persist.
- A project earns persistence by containing something. Browsing leaves nothing.
- Resume is announced, never silent.
- **Multi-tab:** last write wins, and the loser is told by name. No merge is
  performed or claimed.
- **Future schema versions are refused terminally** — nothing is read, written
  or deleted, and the visitor is told which version wrote the data.
- Four distinct destructive operations: START AGAIN · NEW PROJECT · DELETE THIS
  PROJECT · CLEAR ALL LOCAL DATA. The two that destroy need a second,
  differently-worded press.
- Export: Markdown + JSON, local only. **Import is DEFERRED** — see
  `PHASE_8_10_PROJECT_MEMORY.md` for the contract it must satisfy.

## PRIVACY

Stated only where established: *"Saved in this browser only. Not uploaded, not
synced to an account, and gone if you clear this site's data."* When storage
does not work, the product says nothing is being saved, and why.

Never stated: account sync, cloud backup, cross-device availability, server
storage, encryption, permanent retention.

**No media stream is persisted.** Presence requests nothing on entry; the
consent panel precedes any `getUserMedia` call — verified with the call
instrumented, zero requests made before consent is shown.

## LIFECYCLE

After exit: RAF subscribers, canvases, video elements and mode hosts all → 0.
Escape always leaves. Enter → exit → re-enter holds.

**Same-reality navigation** (the Phase 8.10 defect) is a permanent regression
case: arriving at the reality already open is a no-op, not a teardown. Driver:
`scripts/qa/mode-lifecycle.js`.

**Mode-entry watchdog: 6000ms, unchanged and correct.** Warm navigation into the
heaviest mode measures 748–1354ms including a cold context with no HTTP cache,
with zero bounces. The single bounce ever recorded was a Vite dev-server
re-optimisation immediately after a rebuild — a development characteristic that
does not exist in production, where the chunk is pre-built and served statically.

## BUNDLE

| | Value |
|---|---|
| Boot, 5 files, raw | 351,356 B |
| Boot, gzip | 118,743 B |
| CSS raw | 42,588 B |
| modulepreloads | 4 |
| Dependencies | 5 runtime + 13 build |

Invariants, verified each phase: **three/R3F never in the entry graph** (the
only `react-three-fiber` string there is a filename in the dynamic-import
manifest); **the document composer never in the boot graph** (`brief.ts` is a
late import from `projects.ts` and must stay one); **no `manualChunks` for
three/R3F, ever**; no QA harness ships.

## CANONICAL SYNC

`node scripts/check-canonical-sync.mjs` → **CURRENT (exit 0)** against canonical
`hi-anzy-website-2.0` @ `0208378`, and **DRIFT (exit 2)** when pointed at
`hi-anzy-platform`, which it still identifies by name. Both are the honest
answer, and the second is now the expected direction.

CURRENT means *read and reconciled at this commit*, not *copied*: only the
`MIRROR` rows put values into the Lab. `App.js` (REFERENCE) drifted with its
24-path route table identical, and `App.css` (TRANSFORM) drifted with all 25
custom properties, every `font-family` and every brand colour identical.

## REPOSITORIES

The Lab is an independent product, in its own repository, deployable with no
Agency repository present. Full boundary: `docs/AGENCY_LAB_BOUNDARY.md`.

| Role | Repository | State |
|---|---|---|
| **Lab** (this project) | `Anzy1512/hi-anzy-experience-lab` | canonical, public, default `main` |
| **Audit service** | `audit/` in this repository | its own package; not in the Lab's build |
| **Agency** (commercial production) | `Anzy1512/hi-anzy-website-2.0` | canonical, **read only from here** |
| Previous commercial site | `Anzy1512/hi-anzy-platform` | **LEGACY** — reference only |

Content flows Agency → Lab, development-time only, as a checked-in snapshot.
**Nothing in this project writes to any Agency repository**, and no runtime code
reads one: every canonical value is checked-in TypeScript under `src/content/`.

### Canonical provenance

Mirrored from **`hi-anzy-website-2.0` @ `0208378` (read 2026-09-24)**. Before
Phase 8.12C it was **`hi-anzy-platform` @ `eac2282` (2026-09-12)**, which is
retained in `PREVIOUSLY_MIRRORED_FROM` rather than overwritten — relabelling an
old snapshot with a repository it was never read from is a fabricated
provenance.

All four mirrored sources are CURRENT. What the re-read adopted (the five method
stages' titles, pages and outputs; the six service lines), what it refused (all
route changes, all design-token changes, `site.js`, `INSIGHT_TOPICS`) and the
three untrue mirrors it removed are recorded in
`docs/PHASE_8_12_RELEASE_AND_CANONICAL.md`.

### One artefact crosses the other way

`hi-anzy-website-2.0` carries a **built copy of the Lab** at `frontend/lab/`,
which its `vercel.json` copies into `build/lab`. The Lab as deployed today is a
sub-path of the Agency site, under the Agency's headers — and
`customHttp.yml` applies `Permissions-Policy: camera=(), microphone=(),
geolocation=()` to `**/*`, so **Presence's camera path is disabled by policy in
the only deployment that exists**. Nothing in this repository put that copy
there. It is why §12 is a product question and not a DNS one.

## HARDWARE PENDING

Unverified on physical hardware and honestly marked as such:

- **Presence** — camera path. Software path exercised; no physical camera has
  been tested. `window.__labCam.report()` reports permission `unknown`, zero
  tracks, zero video elements.
- **Portal** — immersive XR is reported, not assumed.
- **Device tilt.**

No FPS figure is asserted anywhere. Headless Chrome drives rAF at roughly 2fps,
so nothing measured in that environment is a benchmark, and `UNKNOWN` remains a
valid value.

## QA DRIVERS

Nine in `scripts/qa/`, each encoding a contract with no other executable record.
See `scripts/qa/README.md` for what each one proves and how to run them (they
are Playwright driver snippets, not standalone Node programs).

## KNOWN LIMITATIONS

- The two interaction-floor exceptions above.
- Living World's off-viewport district labels at 390 and 768 — recorded,
  untouched, frozen.
- An artifact is recorded on handoff, not on download. Now stated in the UI.
- The orientation sheet costs ~3.2 kB raw on the boot path; it is reached from
  the chrome, so it cannot be lazy without making the answer slower than the
  question.
- **The orientation sheet has not been tested with real first-time visitors.**
  Discoverability was measured structurally — accessible name, tab position,
  focus visibility, what is on screen cold — not observed in a human.
- **`PERFORMANCE` is `UNVERIFIED` across the Lab** and is the only blocker
  between three products and PRODUCT. It needs a person on real hardware; no
  number from this environment will be invented to close it.
- **Whether Presence reports a policy-blocked camera honestly is unverified.**
  The Agency deployment blocks `getUserMedia` for `/lab`; which of Presence's
  nine camera states that produces has not been checked.
- **`canonicalEras.ts` records the legacy repository's history.** Named on
  screen since 8.12C; re-capturing it from `hi-anzy-website-2.0` is a separate
  decision, because it changes what Time Machine displays.

## STANDING RULES

Unchanged and not up for reinterpretation: no AI layer · no automation engine ·
no backend · no accounts · no analytics · no new dependencies · no framework
migration · no new realities · no Living World edits without an explicit
exemption · no commercial-repository writes · never fabricate clients, metrics,
results, awards, partnerships or people · never imply a measurement that was not
made.
