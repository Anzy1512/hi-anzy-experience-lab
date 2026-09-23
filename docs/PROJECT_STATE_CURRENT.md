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
| 8.12 | not started, not scoped |

- Branch: `phase-8-11-convergence`
- Gates at closure: `tsc -b` = 0 · `eslint src --max-warnings 0` = 0 ·
  `npm run build` passes

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

## PRODUCT CONTRACT

Six questions every PRODUCT and INSTRUMENT answers, or answers `null` honestly:
**INPUT · CONTEXT · PROCESS · RESULT · YOU TAKE · CONTINUE**.

`unmetContract()` and `incompleteProducts()` count the gaps from the registry
rather than from a maintained list. Only PRESENCE has empty rows, and that is
by design — an instrument that keeps nothing has nothing to hand over.

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
| Boot, 5 files, raw | 351,182 B |
| Boot, gzip | 118,251 B |
| CSS raw | 42,588 B |
| modulepreloads | 4 |
| Dependencies | 5 runtime + 13 build |

Invariants, verified each phase: **three/R3F never in the entry graph** (the
only `react-three-fiber` string there is a filename in the dynamic-import
manifest); **the document composer never in the boot graph** (`brief.ts` is a
late import from `projects.ts` and must stay one); **no `manualChunks` for
three/R3F, ever**; no QA harness ships.

## CANONICAL SYNC

`node scripts/check-canonical-sync.mjs` → **CURRENT**. All four mirrored sources
match `origin/main`. `CANONICAL_PAGES_COMMIT = 'eac2282'`.

## COMMERCIAL REPOSITORY

`C:/projects/hi-anzy-website` — **READ ONLY, untouched.** Working tree clean,
branch `launch/step-0`, HEAD `237e121`. No checkout, merge, reset or write has
ever been made to it from this work.

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

## STANDING RULES

Unchanged and not up for reinterpretation: no AI layer · no automation engine ·
no backend · no accounts · no analytics · no new dependencies · no framework
migration · no new realities · no Living World edits without an explicit
exemption · no commercial-repository writes · never fabricate clients, metrics,
results, awards, partnerships or people · never imply a measurement that was not
made.
