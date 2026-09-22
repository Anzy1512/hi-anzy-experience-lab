# PHASE 8.10 — PROJECT MEMORY + PERSISTENCE ARCHITECTURE

## STATUS

**CLOSED.** Every acceptance condition in the phase brief has been met and
verified in a browser. What remains open is listed under KNOWN LIMITATIONS and
DEFERRED WORK, and none of it is load-bearing for the contracts below.

## BRANCH / HEAD

- Branch: `phase-8-10-project-memory`
- Closure commit: this commit
- Preceding commits in the phase:
  - `109d283` — four things the product said about storage that were not true
  - `dcd7a06` — a project stops dying with the tab
  - `3eeead4` — the way out stops being conditionally readable (deep-state QA gate)

Gates at closure: `npx tsc -b` = 0 · `npx eslint src --max-warnings 0` = 0 ·
`npm run build` succeeds.

## PROJECT MODEL

A **project** is what one visitor is working on. It is the only durable object
in the Lab; everything else is either derived from it or session-only.

```
Project = id, createdAt, updatedAt, title, statement,
          constraints[], artifacts[], history[], work
```

Every field had to answer three questions before it was allowed to persist —
**who produces it**, **who consumes it**, and **what breaks for a visitor if it
is gone after a reload**. The audit is `src/system/schema.ts`; the rule is why
`status`, `origin` and derived titles are absent.

## SCHEMA

- `SCHEMA_VERSION = 1` — the first durable shape this product has written.
- `INDEX_KEY = 'hi-anzy-lab.projects.v1'` (localStorage)
- `DB_NAME = 'hi-anzy-lab'`, `DB_STORE = 'projects'`, `keyPath: 'id'` (IndexedDB)

There is nothing below version 1, so there is no migration path and none is
pretended. A version **above** 1 is refused — see FUTURE VERSION BEHAVIOUR.

## PERSISTED INPUTS

| Field | Producer | Consumer | Why it survives |
|---|---|---|---|
| `statement` | Simulator, Terminal `diagnose` | every product that opens on the problem | losing it means asking the visitor to type it again |
| `constraints[]` | Simulator, one per question | the brief, rebuilt on load; SYSTEM.app | they are the visitor's own five decisions |
| `artifacts[]` | any product that hands a result on | SYSTEM.app ledger, export, handoffs | what a resumed project can actually hand over |
| `history[]` | every operation that changes the project | `project history`, export | answers "how did it get into this state" |
| `title` | the visitor, by naming it | every surface that lists projects | `null` means nobody has named it, and that stays answerable |
| `work` | `system/work.ts` when a route is chosen | the work strip on resume | a preference, not a fact |

Artifacts carry `text` and `data` **in full**. A manifest listing documents it
can no longer produce would be worse than no manifest.

## DERIVED OUTPUTS

Never stored, recomputed from the inputs on the day the project is reopened:

- **The five-stage brief.** Measured at 8,396 B of Markdown + 16,943 B of JSON
  = 25.3 kB, and a pure function of the statement plus five option ids (~200 B).
  `frame()`, `run()` and `buildRun()` have no randomness and no clock. If the
  model is corrected, a resumed project gets the corrected reading; the artifact
  already in the ledger still holds, word for word, what was actually produced
  and possibly already sent to somebody.
- **`projectStatus()`** → `EMPTY | STATED | WORKING | PACKAGED`. No control in
  the product closes or archives a project, so a stored status would be a field
  with a producer that does not exist.
- **`projectTitle()`** when unnamed — derived from the statement and labelled
  `DERIVED` wherever it is shown.
- **Work progress** — read off the artifacts, so declining a handoff cannot
  corrupt it.

## SESSION-ONLY FIELDS

Deliberately not persisted: the pending handoff slot (an offer is a gesture in
flight, and a button still waiting to be pressed from yesterday is a stale
prompt, not memory), `experience/visited`, `experience/journey`, and all
component state — panel positions, open sheets, camera transforms, scroll
offsets, step indices. A resumed project puts the visitor back in a product that
knows what they told it. It does not pretend they never left.

## STORAGE BACKEND

Split by measurement, not by fashion:

| Half | Mechanism | Why |
|---|---|---|
| **INDEX** (~120 B per project) | `localStorage` | read synchronously on boot, so the project list paints with the first frame |
| **BODIES** (up to ~100 kB) | `IndexedDB` | read only when a project is actually opened, and not capped at 5 MB |

Measured artifact sizes that drove the decision: brief 25.3 kB · treatment
10.4 kB · specimen 9.2 kB · session 5.4 kB · delivery 3.0 kB · recipe 0.8 kB.
A project holding one of every kind is under 100 kB.

Both are native. **No storage library was added** — the IndexedDB wrapper is
about forty lines because that is all it needs when you are not building an ORM.

`brief.ts` is a **late import** from `projects.ts` (`await import('./brief')`).
Making it static put a 75 kB document composer on the boot path and took
`index.html` from one modulepreload to five. Do not make it static.

## STORAGE CAPABILITY PROBE

`probeStorage()` runs before any surface describes where data is going.
localStorage is probed with a **real write** (Safari has historically exposed
the object and thrown on use); IndexedDB by opening it, because that is the only
thing that answers.

States: `READY` · `UNAVAILABLE` · `DEGRADED` · `FULL` · `REFUSED`.

The state used to start at `READY` and only move when a write failed, so a
browser with site data switched off printed "Saved in this browser only" about
data it was not saving.

## FAILURE MATRIX

All seven cases exercised in a real browser, each in its own context.
Drivers: `scripts/qa/storage-failure-matrix-a.js`, `-b.js`, `storage-refusal-retest.js`.

| Case | Result |
|---|---|
| Future schema version in the **index** | **Refused.** Named by version, whole origin goes read-only, bytes untouched. Was a defect — see below. |
| Future schema version in a **project body** | Refused by name: *"This project was written by version 99; this build reads version 1. It has been left exactly as it is…"* Neighbouring project stays listed and openable. |
| Corrupt (truncated, non-JSON) index | Survived. Both bodies behind it recovered and re-listed. Notice carries **both** facts: that the list was unreadable, and that two projects were put back. |
| Index row with **no body** | Row kept, not deleted. *"That project is listed but its record is not in this browser… Nothing else has been touched."* Other projects unaffected; DELETE on the ghost still works. |
| **Duplicate project id** | Reported out loud — *"Two saved projects shared an id; the older row was dropped."* Newest `updatedAt` wins. The dedupe is a read-time repair: the file on disk is **not** rewritten. |
| **localStorage refused** | `UNAVAILABLE`. "Nothing is being saved… closing it loses the work." `SAVED — NO`. Nothing on screen claims a save, before or after making something. |
| **IndexedDB absent** | `DEGRADED`. "This browser has no IndexedDB, so projects cannot be saved." Lab fully usable. |

No uncaught exceptions in any case. No case lost data it was not asked to.

## FUTURE VERSION BEHAVIOUR

The serious defect this phase found, and the reason `REFUSED` exists.

`readIndex()` refused a future-version index and returned an empty list plus a
sentence. Nothing consumed the difference between *empty because refused* and
*empty because new*, so `reconcile()` re-listed whatever bodies this build could
parse and wrote a **version-1 index over the version-N one**. Measured: a v99
index carrying a field this build has never heard of was replaced within a
second of boot, and the visitor was shown a repair notice instead of the version
refusal.

Now:

- `REFUSED` is **terminal** — `setState` cannot leave it, so an async probe
  resolving later cannot report `READY` over the top and re-open the writes.
- `writeIndex()`, `putProject()` and `deleteProject()` all return `false` from it.
- The workspace skips `reconcile()` and skips auto-resume — both would be the
  reinterpretation the refusal exists to prevent.
- The visitor is told which version wrote the data and that nothing new will be
  saved here.

Verified by seeding a v99 index, then making a project, pressing save and
starting a new one: the stored bytes come back **byte-identical**, unknown field
intact.

## CORRUPTION RECOVERY

Two stores means a reload can land between two writes. Neither direction loses
anything:

- **body without an index row** → re-listed, so it can be opened
- **index row without a body** → row **kept** and reported, because deleting
  somebody's project because a write was interrupted is the one unrecoverable
  move here

IndexedDB transactions are atomic, so a half-written body cannot exist; the only
torn state possible is between the two stores, which is exactly what
`reconcile()` repairs.

Notices **accumulate** rather than overwrite. Boot can produce two true
sentences, and a plain assignment showed only the second — so a corrupt list was
silently repaired with no mention that it had been corrupt.

## MULTI-TAB CONTRACT

**Last write wins, and the loser is told by name.** No merge is performed and
none is claimed. Driver: `scripts/qa/multi-tab-contract.js`, two real tabs on one
origin.

| Event | Behaviour |
|---|---|
| Tab B opens while A has a project | B resumes the same project |
| B changes the project truth | A is told: *"Another tab has been working on this same project more recently… reload here to pick up their version, or keep going and yours will be the one kept."* |
| A writes back | B gets the same notice |
| On disk | one record, last write present, history coherent (`PROJECT_CREATED > STATEMENT_SET > STATEMENT_SET`) |
| B deletes the project A still has open | A is told: *"…It is still on screen and still exportable, and saving again from here will put it back."* |
| A saves again | the project **is** back — the notice was accurate |

Collaborative editing is not solved and is not claimed.

## PROJECT OPERATIONS

Four operations that are **not** the same size, each with its own wording.
Driver: `scripts/qa/project-operations.js`.

| Operation | Where | Destroys | Second press |
|---|---|---|---|
| **START AGAIN** | Simulator | that tool's run + the five constraints. Statement, artifacts, project untouched | no |
| **NEW PROJECT** | SYSTEM.app / `new` | nothing. Previous project saved and listed | no |
| **DELETE THIS PROJECT** | SYSTEM.app | one saved project | **DELETE FOR GOOD** / KEEP IT |
| **CLEAR ALL LOCAL DATA** | SYSTEM.app | every saved project | **CLEAR EVERYTHING** / KEEP THEM |

A confirmation on a safe action teaches people to click through confirmations,
so the two that do not destroy do not ask.

`CLEAR ALL LOCAL DATA` used to sit inside a block that renders only once the
*current draft* has content — so a visitor arriving with saved projects and an
empty draft was shown no way to clear their own local data. The two destructive
controls are their own component now and follow what the browser is holding.

## RESUME MODEL

The last project opened in this browser is resumed on load — **and said so**,
never silently. SYSTEM.app names it and states when it was last touched. The
alternative, starting blank and offering a list, means somebody who reloaded by
accident has to go and find their own work.

A project **earns** persistence by containing something: no statement, no
artifacts, no title means nothing is written at all. A curious visitor can walk
through every reality, close the tab, and leave nothing behind.

`saved` describes the project currently in memory. A flush can outlive its
project — NEW PROJECT flushes the outgoing one and then swaps — so a flush that
resolves afterwards no longer writes its result onto whatever replaced it. It
used to print `SAVED — YES · IN THIS BROWSER` over a brand new empty project.

## FLOWS A–D

All four re-run after every fix in this phase. No duplicated input after any
reload. Drivers: `scripts/qa/flows-acceptance.js`, `export-inspection.js`,
`viewport-accessibility.js`.

**FLOW A** — project → Simulator → brief → SYSTEM.app → reload → Director →
Portal. **PASS.** Brief artifact created with its limits line; offer seen in
SYSTEM.app and claimed (`HANDOFF_ACCEPTED`); after reload the project is
`WORKING`, `SAVED YES`, `PROJECT_RESUMED`, statement and five constraints
intact. Director opens on *"HI ANZY SYSTEM BRIEF, PRODUCED BY AGENCY SIMULATOR
AND CARRIED HERE AS AN ARTIFACT. THE SUBJECT LINE ABOVE IS STATED THERE WORD FOR
WORD."* Portal shows WHAT IS NOT IN IT and never says "published".

**FLOW B** — project → Compiler → manifest → X-Ray → reload → SYSTEM.app.
**PASS.** Manifest artifact created at the world stage; `INSPECT LIVE IN X-RAY`
carries it across and X-Ray opens on the same page the Compiler read. After
reload: `WORKING`, `SAVED YES`, manifest still in the ledger.

**FLOW C** — project → Matter → recipe → reload → Director → Portal. **PASS.**
Recipe artifact created from the TYPE state and a typed phrase. After reload
Director opens on *"MATTER RECIPE — 'A SYSTEM THAT HOLDS', PRODUCED BY MATTER
ENGINE AND CARRIED HERE AS AN ARTIFACT"* and makes it the film's subject.

**FLOW D** — ANZY.OS → Terminal → project → reload → SYSTEM.app. **PASS** for
project continuity: statement stored, `PROJECT_RESUMED` after reload, title and
state correct, nothing re-asked. See KNOWN LIMITATIONS for the artifact nuance.

## EXPORT FORMAT

Two files that say the same thing to two readers. Both read back and inspected,
not merely observed to download.

**`hi-anzy-project-<id>-<date>.md` — 10,904 B measured** for a project holding a
statement, five constraints and one brief artifact:

- title (derived titles labelled: *"No name was given to this project; the line
  above is its opening statement."*), `STATUS`, `STARTED`, `LAST CHANGED`,
  `PROJECT ID`
- `## WHAT WAS SAID` — the statement verbatim
- `## CONSTRAINTS STATED` — all five, in the words they were offered in
- `## WHAT WAS MADE` — per artifact: `TYPE`, `MADE BY`, `MADE AT`, `MADE FROM`,
  `CANNOT TELL YOU`, and the document itself inside `<details>`
- `## WHAT IS STILL UNKNOWN`
- `## HOW IT GOT HERE` — the full history
- `## WHAT THIS FILE IS NOT`
- `SCHEMA` and `CANONICAL SOURCE` (`eac2282`) in the footer

**`hi-anzy-project-<id>-<date>.json` — 31,799 B measured**: `schemaVersion: 1`,
`storage: "LOCAL — this project was saved in one browser and never uploaded"`,
`binary: "NONE — no image is retained by this product, so none is embedded
here"`, `derivedTitle` kept separate from `title`, constraints, artifacts with
`limits` + `document` + `madeFrom`, and the history.

Checked and **absent**: duplicated sections, cloud/sync/server/encryption
wording, fabricated clients, results or metrics, derived material presented as
user fact, and lost artifact relationships.

## IMPORT STATUS

**DEFERRED**, explicitly and on purpose.

A safe importer needs schema-version validation, hostile and malformed input
handling, id-conflict resolution, provenance rules for artifacts arriving from
another browser, and a decision about what it means to import a project whose
`sourceIds` point at artifacts that do not exist here. `readProject()` already
does the validation half — it is written to be held to the same standard for
data a visitor pastes in as for data this browser wrote — but the other four
questions are not answered, and a half-safe importer is worse than none.

Export-only is the Phase 8.10 contract.

## PRIVACY CONTRACT

The product describes only what has been established:

- **"Saved in this browser only. Not uploaded, not synced to an account, and
  gone if you clear this site's data."** — and only when storage has actually
  been probed and works.
- When it does not work: **"Nothing is being saved"**, plus why, plus the fact
  that the tab still holds the work.
- `SAVED — NO` whenever the storage state is anything but `READY`.
- `save` in the shell replies *"not written"* with the reason.
- `new` no longer claims the previous project was saved regardless of what
  storage was doing.

Never stated anywhere: account sync, cloud backup, cross-device availability,
server storage, encryption, permanent retention.

**No media stream is persisted.** Presence compares frames at 32×24 in-tab and
discards them; nothing is recorded, stored or uploaded, and no artifact kind
carries video or camera data. The Matter Engine's PNG is handed straight to the
browser's download path and never retained — the export says so rather than
leaving somebody to notice.

## WATCHDOG DEFECT + FIX

**Symptom.** Entering ANZY.OS and then arriving at it again returned the visitor
to the Reality Index about six seconds later, with
`[lab] mode did not report ready in time — recovering`. Initially misattributed
to the handoff `TAKE IT` control.

**Instrumentation.** `data-phase` on `.modehost` sampled every 200 ms across
eight scenarios. This disproved the first three hypotheses:

| Scenario | Result |
|---|---|
| Deep link to ANZY.OS, nothing in flight | `loading` → `active` at 1399 ms ✓ |
| `SEND TO ANZY.OS` (the real handoff route) | `active` at 1091 ms, held 11 s ✓ |
| Hash hop between two different modes | `active` at 641 ms ✓ |
| `popstate` between two different modes | `active` at 634 ms ✓ |
| Onward-move click | `active` at 833 ms ✓ |
| Stored project present at boot | `active` at 1087–1110 ms ✓ |
| `page.reload()` | `active` at 1504 ms ✓ |
| **Arriving at the mode already open** | **stuck in `loading`, bounced at ~6100 ms ✗** |

**Root cause.** `applyLocation` treated arrival at the reality already open as a
fresh entry: it disposed the scope, opened a new one and set `phase` back to
`loading`. But React kept the **same lazy component mounted** — same id, same
element type — so its boot effect never ran again and `onReady()` was never
called a second time. The phase could not leave `loading`, and the watchdog
correctly gave up.

Worse than the bounce: the still-mounted mode was left holding a **disposed
scope**, and `CleanupScope.add()` runs a teardown immediately on a disposed
scope — so every listener, timer and frame callback the mode registered from
that moment on was cancelled as it was made.

Reachable without a test harness: an onward move, a WorkStrip button or a
SYSTEM.app door pointing at the current reality, a pasted deep link to it, or
Back landing on the same id.

**Fix.** `applyLocation` returns early when the destination is the mode already
active and the phase is neither `exiting` nor `idle` — a visitor who changes
their mind mid-exit still gets a real re-entry. `navigate()` additionally
declines to push a second identical history entry, which would have made Back
look broken. The watchdog is untouched, its timeout unchanged, and no mode is
special-cased.

**Proof.** Re-entry holds `active` for 11 s with no bounce; the mode stays live
(terminal responds, the clock advances — so the scope was not disposed under
it); enter → exit → re-enter → Escape leaves RAF subscribers, canvases, videos
and mode hosts at 0.

## BUNDLE

Production build after every fix in this phase:

| | Raw | Gzip |
|---|---|---|
| `index-*.js` (entry) | 252,643 B | 80,866 B |
| `react-*.js` | 8,185 B | 3,172 B |
| `pointer-*.js` | 2,232 B | 826 B |
| `project-*.js` | 73,325 B | 28,373 B |
| `lab-*.js` | 11,593 B | 4,335 B |
| **Boot total — 5 files** | **347,978 B** | **117,572 B** |
| CSS `index-*.css` | 40,084 B | 8,042 B |

- **modulepreload count: 4** (plus the entry script) — unchanged.
- **Delta on the 8.10 baseline (347,112 B): +866 B, +0.25 %.** CSS unchanged.
- **Dependencies changed: NO.** Still 5 runtime + 13 build.
- **The document composer is not in the boot graph** — none of the five boot
  files contains the brief's section strings. The late `import('./brief')`
  holds.
- **three / R3F are not in the entry graph.** The only occurrence of
  `react-three-fiber` in the entry is its filename inside the dynamic-import
  manifest; `WebGLRenderer` and `useFrame` are absent from every boot file. The
  880,594 B R3F chunk is lazy. No `manualChunks` was added, and none must be.
- **No test harness ships.** No bundle contains Playwright or QA identifiers.

Largest lazy chunks: `react-three-fiber` 880,594 B · `OsMode` 49,907 B ·
`PerformanceMode` 42,321 B · `WorldMode` 31,830 B · `SimulatorMode` 31,752 B.

## ACCESSIBILITY

Measured at all four viewports. Driver: `scripts/qa/viewport-accessibility.js`.

- **No target below 24 px anywhere** — WCAG 2.5.8 AA clears on every surface at
  every size.
- **Every control on the persistent-project UI measures exactly 32 px** at all
  four viewports — the project's own floor, met by the new surfaces.
- `EXIT EXPERIENCE` measures 32.0–43.2 px everywhere and stands on its own
  ground.
- Escape leaves any mode; focus moves into the dialog on entry and returns to
  the index row on exit; the destructive confirmations are separate controls
  with distinct words, not colour-only states.
- Notices carry `role="status"`.

## MOBILE

390×844 and 768×1024: **no horizontal overflow on any surface** (measured
`scrollWidth - clientWidth = 0` throughout). The project panel, its status
key/values, the privacy sentence and all ten controls render and remain 32 px.
ANZY.OS recomposes to a stacked layout with the terminal input at 30 px.

## REDUCED MOTION

Verified at runtime with `prefersReducedMotion` emulated. The project surface
keeps every section, its status, the privacy sentence and all eight artifact and
reading blocks, with **0 animating elements**. The concept is preserved and the
travel is removed — nothing is disabled.

## LIFECYCLE

After exit, measured with the project's own instruments:

| | At index | In mode | After Escape |
|---|---|---|---|
| RAF subscribers | 0 | 1 (Matter) / 0 (OS) | **0** |
| Canvases | 0 | 1 / 0 | **0** |
| Video elements | 0 | 0 | **0** |
| Mode hosts | 0 | 1 | **0** |

Enter → exit → re-enter → exit holds. No page errors across the whole battery.
The Reality Index holds **no** canvas of its own in this build, so there is
nothing to exempt.

## CANONICAL SYNC

`node scripts/check-canonical-sync.mjs` → **STATUS CURRENT**. All four mirrored
sources (`content.js`, `disciplines.js`, `App.js`, `App.css`) match
`origin/main`. `CANONICAL_PAGES_COMMIT = 'eac2282'`, which is what the export
footer prints.

## COMMERCIAL REPO STATUS

`C:/projects/hi-anzy-website` — **untouched by this phase.** Working tree clean.
Currently on branch `launch/step-0` at `237e121`. (Phase 8.9 recorded it on
`integration/lab-staging` at `dba09cf`; it has moved since, outside this work.
No write has been made to it from the Lab at any point.)

## KNOWN LIMITATIONS

- **Controls between 24 px and 32 px.** They clear WCAG 2.5.8 AA and fail this
  project's own baseline. Recorded, not fixed: Compiler stage rail @27.0 and
  `RETURN TO DOCUMENT` @26.6; Director `SOUND ON` / `SILENT` @28.6; Portal
  `CROSS` / `GO THROUGH` / `CARRY SOMETHING ELSE` @28.6; X-Ray layer presets @30
  at ≤900; ANZY.OS terminal input @30 at ≤768. No **new** ones were introduced —
  this is the same set Phase 8.10's gate recorded. Raising them is broad
  restyling across thirteen modes and does not belong in a persistence phase.
- **An artifact is recorded when a result is handed on, not when it is
  downloaded.** Downloading the brief from the shell produces a correct file but
  no ledger entry, so it does not appear under WHAT WAS MADE. This is coherent
  with the model — an artifact is what a resumed project can hand over — but a
  visitor may reasonably expect otherwise. Flow D's continuity is unaffected.
- **Living World** was inspected only, never edited. Its district rail measures
  21.6–24.0 px and three district labels sit off-viewport at 390 and 768. Frozen.
- **No FPS or frame-budget figures are claimed.** Headless Chrome drives rAF at
  roughly 2 fps, so nothing measured in this environment is a benchmark.
  `UNKNOWN` remains valid.

## DEFERRED WORK

- **Project import** — deferred with reasons stated above.
- **The 24–32 px target-size pass** across all thirteen modes.
- **Living World's off-viewport district rail** at 390 and 768, which needs an
  explicit exemption from the freeze before anyone touches it.
- **A workspace entry point on the Reality Index** (a quiet "N saved projects"
  line) — designed in the 8.10 brief, not built. Nothing depends on it.

## NEXT PHASE ENTRY CONDITIONS

Before Phase 8.11 begins, the following must hold — all of them do at this
commit:

1. Branch `phase-8-10-project-memory` at the closure commit, working tree clean.
2. `tsc -b`, `eslint src --max-warnings 0` and `npm run build` all green.
3. Boot payload at or below 347,978 B raw across 5 files; `brief.ts` still a
   late import; no `manualChunks` for three/R3F.
4. Canonical sync **CURRENT**; commercial repo untouched.
5. The nine QA drivers in `scripts/qa/` still run green against a dev server.

Phase 8.11 scope is stated fresh by whoever directs the work. Nothing in this
document authorises it, and the standing prohibitions — no AI layer, no
automation, no framework migration, no new dependencies, no Living World work,
no commercial-repo writes — remain in force.
