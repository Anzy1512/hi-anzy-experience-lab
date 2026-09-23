# PHASE 8.11 — PRODUCT + BRAND CONVERGENCE

## STATUS

**CLOSED.** The convergence work that was genuinely outstanding has been done
and verified. Several areas the brief asked for turned out to be already built —
those are proved and left alone, as the brief's own execution order requires.

The two workstreams left open at partial closure — §13 presentation readiness
and §18 deep-state QA — were completed afterwards and are recorded at the end of
this document. One real defect was found by them and fixed.

Current truth lives in `docs/PROJECT_STATE_CURRENT.md`. This file is the
historical record of what Phase 8.11 did.

## BRANCH / HEAD

- Branch: `phase-8-11-convergence`, cut from `e184995` (Phase 8.10 closure)
- Commits: `af583e4`, plus this one
- Gates: `tsc -b` = 0 · `eslint src --max-warnings 0` = 0 · `npm run build` passes

## RECONNAISSANCE — WHAT THE BRIEF ASSUMED, AND WHAT IS TRUE

The brief was written from a picture the repository has moved past. Recording
the difference, because the phase's first instruction is that repository truth
wins and its last is to prove what is already correct rather than rebuild it.

| Brief assumed | Repository truth |
|---|---|
| §2 the three-family model must be established | **Already exists.** `src/system/registry.ts`, Phase 8.7: `ProductLayer = PRODUCT \| INSTRUMENT \| EXPERIENCE`. |
| §3 the six-box contract must be defined | **Already exists.** `ProductContract` with `input / context / process / result / artifact / continue`, plus `unmetContract()` and `incompleteProducts()`, which count the gaps honestly rather than hiding them. |
| §4 the index shows sixteen equivalent rows | **Already grouped by kind** since Phase 8.7 — `INDEX_GROUPS`, four groups, each with a one-line note on what having that kind of thing means. |
| §11 ~13 modes hold 24–32px controls | **True, and measured precisely:** 22 distinct classes. |
| §7 download vs handoff semantics are blurred | **True in the UI**, correct in the model. |

So the taxonomy was never the problem. The **reach** was.

## THE ONE REAL GAP: THE CONTRACT WAS UNREACHABLE

§3's actual requirement is *"a user must be able to perceive the contract while
using the product"*. It was rendered in exactly one place: an expanded row on
the Reality Index — which a visitor reads **before** entering and cannot reach
again without leaving the product they are asking about.

### The orientation sheet

The plate number and title in the chrome band were inert text: the one part of
the chrome that looked like a label and behaved like one. They are now a
control that opens a sheet printing, in the registry's own words and the
registry's own component, what the reality is and what it owes you.

- **One description.** `ProductContract` is the same component the index uses.
  No second description of a product exists anywhere in this build.
- **Behind a press**, not always-on furniture. Every reality is full-bleed and
  there is no free rectangle; `WorkStrip`'s own comment records two earlier
  floating panels that printed over the product underneath.
- **Additive.** The project section draws only when a project holds something.
  A reality entered with no project is not shown an empty ledger or told to
  start one — printing a blank one would have made project mode a requirement.
- **One Escape owner.** ModeHost still has exactly one `useEscape`: it closes
  the sheet when open, leaves the reality when not. Two listeners racing for
  one key is how a panel closes the mode behind it.
- **Keyed on the mode id**, not a boolean, so a sheet describing one reality
  cannot survive into the next without an effect to clear it.

Found and removed while building it: the sheet's own `WHERE THIS LEADS` section
printed the contract's `CONTINUE` row a second time, four lines under the first.

## THE INTERACTION FLOOR

Every interactive target in all sixteen realities plus six deep states,
measured at 1440×900 and 390×844, rolled up **by the class that styles it** so
the fix was a list of selectors rather than a hunt.

**22 classes under 32px → 4.** Three of the 22 were Phase 8.10's own work,
which had raised them to 30px — the WCAG 2.5.8 figure, not this project's floor.

Raised to 32px from padding alone, type and horizontal rhythm untouched:
`dr-btn` · `pt-btn` · `dm-btn` · `ad-btn` · `sn-btn` · `pr-btn` · `pf-btn` ·
`mem-hold` · `rc-act` · `rc-stop` · `tm-scrub__stop` · `xr-proc` ·
`xr-strip__target` · `os-cmd__input`.

Verified after: at 1920×1080, 1440×900, 768×1024 and 390×844, across ANZY.OS,
Agency Simulator, Reality Compiler, X-Ray, Director, Portal and Matter Engine —
**no target below 24px and none between 24 and 32px.** No horizontal overflow
in any reality at either audit viewport, before or after.

### The two documented exceptions

1. **Era1995's page links, 17.6px (Time Machine).** They live inside a
   period-accurate 1995 reconstruction — *"This page is under construction.
   Best viewed at 640×480."* They are the artwork, not the chrome. A 32px
   button would falsify the era, which is exactly what §11 ("do not turn tiny
   editorial labels into giant buttons") and §13 ("do not polish merely because
   something is unconventional") forbid.
2. **Living World — `lw-stop` 21.6–29.6, `lw-label` 24.0, `lw-nav__btn` 28.0.**
   Frozen. `lw-label` is positioned absolutely in the world lattice, so its box
   is composition rather than chrome. **This needs an explicit exemption from
   the freeze before anyone touches it** — the same conclusion the Phase 8.10
   closure reached, unchanged.

## ARTIFACT SEMANTICS

The model is correct and was **not** changed: an artifact enters the ledger when
it is handed onward, not when it is downloaded. `ArtifactBar.run()` composes and
delivers a file; only `ArtifactBar.send()` calls `recordArtifact()`.

What was wrong was the wording.

- **A download and a send sat in one row as equal siblings** with nothing saying
  that only one of them keeps anything. The bar now states it in the body voice,
  and only when there is a send to contrast against: *"A copy leaves with you
  and nothing is kept. SEND also records it in this project, with where it came
  from and what it cannot tell you."* The code comment has said exactly this
  since Phase 8.8 — to developers only.
- **`SAVED` meant two different things.** A download replied `SAVED .MD` while
  the project surface reports `SAVED — YES · IN THIS BROWSER`. One is a file on
  your machine and the other is a record in browser storage. Downloads now reply
  `DOWNLOADED .MD` / `.JSON` / `.PNG`, and the terminal's `brief saved as .md` /
  `project saved as .md` became `downloaded as`. One verb, one class of action.

## SYSTEM VOCABULARY

`SAVED` was the one genuine collision and is fixed above. The rest were checked
and found coherent: `EXIT`/`ESC` leave a reality, `SEND TO <place>` names a
destination rather than a generic action, `TAKE IT` accepts an offer, `OPEN`
opens a saved project, `CONTINUE` is the contract row rather than a control.
Reality-specific verbs (`CROSS`, `GO THROUGH`, `INSPECT LIVE IN X-RAY`,
`ENTER THE WORLD`) were deliberately left — consistency is required for system
actions, not for artistic ones.

## FLOWS AND REGRESSION

| Check | Result |
|---|---|
| Watchdog same-reality regression | **Holds.** `active` for 11s on same-URL re-entry and popstate; mode stays live (terminal responds, clock advances). |
| Heaviest mode, 3 consecutive entries | ready at 1348 / 884 / 908 ms, **0 bounces** |
| Flow C — Matter → recipe → reload → Director → Portal | **PASS.** Director opens on *"MATTER RECIPE — 'A SYSTEM THAT HOLDS', PRODUCED BY MATTER ENGINE AND CARRIED HERE AS AN ARTIFACT"* |
| Flow D — Terminal → project → reload → SYSTEM.app | **PASS.** Statement, title and state survive; nothing re-asked. |
| Export MD / JSON | **Unchanged.** 10,904 B / 31,799 B, every section present, no duplicate sections, no cloud or fabricated-proof wording. |
| Enter → exit → re-enter → Escape | RAF subscribers, canvases, videos, mode hosts all → 0 |
| Reduced motion | panel complete, **0 animating elements**, Escape leaves |

**One observation worth recording:** immediately after a rebuild, the first cold
entry into Matter Engine once exceeded the 6s watchdog while the dev server
re-optimised the 880 kB R3F chunk. Three warm runs then measured 1348/884/908 ms
with no bounce. This is a dev-server characteristic, not a product defect — in
production the chunk is pre-built and served statically — but it is the one
condition under which the watchdog can fire on a healthy mode.

## BUNDLE

| | This phase | 8.10 baseline | Delta |
|---|---|---|---|
| Boot, 5 files, raw | 350,945 B | 347,978 B | **+2,967 (+0.85%)** |
| Boot, gzip | 118,193 B | 117,572 B | +621 |
| CSS raw | 42,443 B | 40,084 B | +2,359 |
| modulepreloads | 4 | 4 | 0 |

The cost is the orientation sheet, which is reached from the chrome and is
therefore on the boot path by construction. Confirmed unchanged: **no three/R3F
library in the boot graph** (only the chunk filename in the dynamic-import
manifest), **no document composer in the boot graph**, **no `manualChunks`**,
**no dependency change** — still 5 runtime + 13 build.

## CANONICAL SYNC

`node scripts/check-canonical-sync.mjs` → **STATUS CURRENT.** All four mirrored
sources (`content.js`, `disciplines.js`, `App.js`, `App.css`) match
`origin/main`. No canonical content was added or altered this phase; nothing in
this work asserts a client, a metric, a result or a partnership.

## COMMERCIAL REPO STATUS

`C:/projects/hi-anzy-website` — **untouched.** Working tree clean, branch
`launch/step-0`, HEAD `237e121`. No read beyond `git status` / `git log`, no
checkout, no merge, no write.

## TYPOGRAPHY / COLOUR

Audited, unchanged, and deliberately so. The three voices (Rajdhani, Newsreader,
IBM Plex Mono) are intact and no fourth was introduced — the orientation sheet
uses the existing `t-display` / `t-body-s` / `t-mono` classes and the existing
`--ground` / `--figure` / `--rule` semantic tokens. The provenance registers
(`--prov-sourced`, `--prov-measured`, `--prov-derived`, `--prov-unknown`,
`--prov-recommend`) already carry the semantic-colour role §10 describes, each
with a mark and a word as well as a hue. **No new colour system was invented**,
because inventing one where a working one exists is the "make more" this phase
is explicitly not for.

## HARDWARE

Unchanged and still honest. Presence's camera path, Portal's XR reporting and
device-tilt remain **PENDING REAL HARDWARE**. Nothing in this phase tested,
simulated or claimed a physical-device result. No FPS figure is asserted;
headless Chrome drives rAF at roughly 2fps and `UNKNOWN` remains valid.

## IMPORT STATUS

**STILL DEFERRED**, unchanged from Phase 8.10 and not an 8.11 entry condition.
The future contract it must satisfy, recorded per §14:

schema/version validation · hostile and malformed input handling · project-id
collision policy · artifact-id collision policy · provenance for artifacts
arriving from another browser · overwrite / merge / new-copy semantics · size
limits · failure atomicity.

No implementation was attempted.

## §13 PRESENTATION READINESS — COMPLETED

Walked the built product cold, without opening the orientation sheet by hand, so
the question was what a visitor is *offered* rather than what exists.

### What every perspective can already answer

Measured at the launcher and index, before any row is expanded:

- The launcher states the proposition and offers two doors: a route through the
  Lab in order, or the full index as a map.
- The index prints four groups, each with a note — **PRODUCTS** "Give them
  something. Take something away." · **INSTRUMENTS** "They measure. The reading
  is the output." · **SPATIAL & ARCHIVE** "Territory and record. Enter them;
  nothing is owed back." · **EXPERIMENTS** "What the studio is willing to try in
  public."
- Heading order is semantic and correct: H1 REALITIES → H2 WHAT DO YOU WANT TO
  DO? → the four group headings → H2 CROSS-REFERENCES.

So **products, instruments and experiences are distinguishable without opening
anything**, and the six contract questions are answerable inside every reality
from the chrome.

### The defect: available is not discoverable

Cold inside a product, measured:

- the orientation control's entire name was **"04 / AGENCY SIMULATOR ?"** — a
  bare glyph, `aria-hidden`, contributing nothing to the accessible name, so a
  screen reader announced the name of the room and nothing about the door;
- nothing on screen said what the mark opened (`screenExplainsIt: false`);
- none of the six contract words were visible until it was pressed.

It was reachable — first in tab order, one Tab from entry, with a visible focus
ring — and still gave a first-time visitor no reason to press it.

**Fixed with the smallest coherent intervention**, and nothing else:

- the control carries an `aria-label` stating what pressing it does;
- the glyph became the visitor's own question, **WHAT IS THIS**, at widths where
  the band has room, falling back to `?` below 900px where it does not.

No carousel, no modal tour, no tooltips, no onboarding. EXIT keeps its weight —
bordered, lit on hover, carrying ESC; this is a dim line of the same small mono.

### The adversarial question

*"Could a visitor mistake this for an internal developer instrument?"*

Swept six visitor-facing surfaces (Agency Simulator, ANZY.OS, X-Ray,
Performance, Portal, Director) for `localhost`, `TODO`, `FIXME`, `DEBUG`,
`console`, `undefined`, `NaN`, `null`, `[object Object]`, `lorem ipsum`,
`placeholder`, `Ctrl+Alt+P`, `__lab`.

**Zero hits. No page errors, no console errors.** The dev instruments are behind
`import.meta.env.DEV` and dead-code-eliminated, and nothing visitor-facing leaks
a developer artefact. The surfaces that *look* instrument-like — X-Ray's
measurements, Performance's readouts — are instruments on purpose, classified as
such, and say so in their own contract.

## §18 DEEP-STATE QA — COMPLETED

The new chrome control against six realities in their later states, with real
rectangles rather than screenshots.

| Reality | Deep state reached | Result |
|---|---|---|
| **PRESENCE** | consent panel, stop, exit, re-entry | `getUserMedia` called **zero times** on entry and zero times after pressing USE CAMERA — the consent panel precedes any request and states 32×24, discarded, nothing recorded or uploaded, identifies nobody. 0 video elements throughout; 0 after exit; re-entry starts clean. |
| **TIME MACHINE** | 1995 checkpoint, then a second era | Era markup intact, its 17.6px links preserved as the documented exception. Chrome survives the era change; no duplicate chrome; no overflow. |
| **MEMORY** | reconstruction held | No overlap, Escape closes the sheet only, focus returns to `mem-hold`. |
| **CHAOS** | 7s of progressed deterioration | **Chrome intact** — the global frame does not become part of the deterioration. |
| **AFTER DARK** | night state | Chrome contrast measured **10.3:1** (bone `rgb(224,216,193)` on `rgb(35,42,42)`). |
| **SONIC** | instrument running | AudioContext `none` before gesture → `running` after → **`none` after exit**. The context is closed outright, not suspended. |

Across all six: **Escape closes the sheet and never leaves the reality**
(`escapeClosedSheetOnly: true`, hash unchanged), no duplicate chrome, zero
overflow with the sheet open, focus lands on a real control in the mode, no page
or console errors.

**One observation, not a defect.** In Time Machine and Sonic the open sheet
covers some of the mode's own controls (the era links and scrub stops; two small
Sonic controls). That is what a panel does, it is dismissed by one Escape, and
EXIT and the toggle are never covered. Recorded so it is not rediscovered as a
surprise.

### Viewports, re-verified after the discoverability fix

1920×1080, 1440×900, 768×1024, 390×844 across Agency Simulator, ANZY.OS, X-Ray
and After Dark: zero horizontal overflow, no chrome collision, the sheet fits
the viewport at every size, `role="dialog"` with an H2, and no control inside it
below 32px. The word/glyph swap verified painted: words at 1440, glyph at 768
and 390.

## KNOWN LIMITATIONS

- The two interaction-floor exceptions above (Era1995 artwork; Living World,
  frozen, needs an explicit exemption).
- An artifact is recorded on handoff, not on download. Now **stated in the UI**
  rather than merely true.
- The orientation sheet costs +2,967 B raw on the boot path. It is reached from
  the chrome, so it cannot be lazy without making the answer to "what is this"
  slower than the question.
- Living World's off-viewport district labels at 390/768 remain recorded and
  untouched.

## WHAT WAS DELIBERATELY NOT CHANGED

The product taxonomy, the index grouping, the `ProductContract` data, the
persistence model, `ExperienceProvider`'s lifecycle logic, the typography, the
colour tokens, Living World, the commercial repository, and every
reality-specific verb that is doing artistic rather than systemic work.

## NEXT PHASE ENTRY CONDITIONS

1. Branch `phase-8-11-convergence`, working tree clean, all three gates green.
2. Boot at or below 350,945 B raw across 5 files; no three/R3F or document
   composer in the boot graph; 5 runtime + 13 build dependencies.
3. Canonical sync CURRENT; commercial repo untouched.
4. The nine QA drivers in `scripts/qa/` green against a dev server.
5. The two open items above either scheduled or explicitly deferred.
