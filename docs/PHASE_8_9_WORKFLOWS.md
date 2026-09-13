# PHASE 8.9 — MULTI-PRODUCT WORKFLOWS

Sixteen products that each produce something are still sixteen products. This
phase is about whether they behave as one system: whether a visitor can arrive
with a situation, move between four tools, and leave with something coherent —
and whether they can stop at any point without anything breaking or lying to
them.

Everything below was run in a browser. Where a thing could not be verified, it
says so by name.

---

## 1. THE MODEL — A PIECE OF WORK

`src/system/work.ts`.

Three guided pieces of work and one open route:

| | |
|---|---|
| `problem` | **TURN A PROBLEM INTO A SYSTEM** — Agency Simulator → SYSTEM.app → Director → Portal |
| `inspect` | **TAKE A SYSTEM APART** — Reality Compiler → X-Ray *(optional)* → SYSTEM.app |
| `matter` | **TURN A MESSAGE INTO MATTER** — Matter Engine → Director → Portal |
| `open` | **OPEN THE SYSTEM** — no sequence; ANZY.OS and everything from there |

**Progress is derived, never stored.** A step is done when the project holds an
artifact of that step's kind *from that step's product*. Exactly one thing is
stored: which piece of work the visitor chose, which is a preference rather
than a fact about the project.

That single decision is what makes the rest of the phase hold together:

- declining a continuation cannot corrupt progress, because there is no
  progress to corrupt;
- entering a product directly and producing something advances the work;
- re-running a tool does not double-count;
- NEW PROJECT empties the reading without a field having to be cleared.

Kind alone was not enough — it would let Director's treatment satisfy a step
that named Matter Engine. The producer is part of the match.

### Required versus finished

`TAKE A SYSTEM APART` completes the moment the Compiler produces a manifest,
because X-Ray is optional. The first build therefore told a visitor standing
*inside X-Ray*, having just been sent there, that there was `NOTHING LEFT TO
MAKE`. `WorkProgress` now carries `optionalOpen` alongside `status`, and the two
surfaces say different things:

- the index band: `EVERYTHING REQUIRED EXISTS · 1 OF 2 MADE · X-RAY IS STILL OPEN`
- the chrome strip: nothing, until there is genuinely no next step at all.

---

## 2. ORIENTATION

**`components/Work/WorkBand.tsx`** — "WHAT DO YOU WANT TO DO?", a ruled band
above the Reality Index. Three jobs, one open route, the whole index still
underneath. Status is carried by a mark (hollow / half / solid) as well as by
colour, and `STOP FOLLOWING` sits beside the fact that something is being
followed.

**`components/Work/WorkStrip.tsx`** — the work being followed, inside a product.

This took three attempts and the first two were wrong in a way worth recording:

1. A panel pinned under the EXIT control. It printed across AGENCY SIMULATOR's
   own headline and standfirst.
2. Moved to the onward-moves corner. It printed across the same mode's
   capability clusters in the system view — that corner is only clear in modes
   whose bottom band is chrome, and the Simulator's right column is a scrolling
   document running the full height.
3. **In the host's own chrome band**, between the mode's number and EXIT. That
   band is the only region sixteen full-bleed realities have all been designed
   around, because the way out has lived there since Phase 1.

Centred in that band it still collided — with REALITY COMPILER's five route
tabs at x 716–887 on a 1440 screen. It is now hard against the mode id, capped
at `min(42ch, 32vw)`, and yields its title to an ellipsis rather than growing
into anybody.

It also says much less than it did. Three of the four things the first version
listed were the products' own job: X-Ray names the page that arrived, Director
names the document it is working from, every artifact bar says what leaves.
What no product can know is which piece of work it is standing inside.

`OnwardMoves` stands down while a work is being followed — not for room, but
because offering a visitor part-way through turning a problem into a system
"MATTER ENGINE — the same field, without the argument" is inviting them to
abandon something they chose.

### Measured, on every mode

A collision probe was run against all sixteen realities at 1920×1080 and
1440×900: for each, the strip's box against every leaf element in the document
that is neither strip nor chrome.

```
1440×900   16 / 16 clear
1920×1080  16 / 16 clear
768×1024   strip hidden (below the 1180px floor); index band verified instead
390×844    strip hidden; index band verified, no horizontal scroll
```

Two collisions were found and fixed this way: the Compiler's route tabs (above)
and Portal's crossing column, which is anchored to the bottom and grows upward —
printing WHAT IS NOT IN IT made it tall enough to push its own state line behind
the chrome. The column has a ceiling now and the package scrolls inside it.

---

## 3. CONTEXT CONTINUITY

`project.statement` had no producer before this phase — nothing ever called
`setStatement`. Two things do now:

- the Terminal's `diagnose`, alongside `setFrame`;
- the Agency Simulator, when a statement frames successfully.

And the Simulator reads it back. A visitor who described their situation in the
Terminal now finds AGENCY SIMULATOR opening with **THIS IS WHAT YOU SAID**, the
label **THE PROBLEM — CARRIED IN**, and the box already holding their sentence.
Editing a single character hands the question back: it is their sentence again,
and the panel returns to asking.

### The bug underneath it

The seeding worked in production and silently failed in development. The mode's
own reset called `setSaid('')`, and StrictMode double-invokes an effect's
cleanup on mount — so the reset ran once before the visitor had done anything
and blanked the seeded value.

The fix is not a StrictMode workaround. The statement belongs to the session,
not to the mode, so resetting the mode restores it from the project rather than
clearing it. `START AGAIN` does the same: it restarts the simulation, not the
session.

Verified in both, on `#/anzy-os` → `diagnose …` → `#/agency-simulator`:

```
production (4173)  heading = THIS IS WHAT YOU SAID   prefilled = "our reporting is a mess…"
development (5173) heading = THIS IS WHAT YOU SAID   prefilled = "our reporting is a mess…"
after one edit     heading = WHAT IS ACTUALLY WRONG?  label = THE PROBLEM
```

---

## 4. HANDOFFS THE WORK CAN STEER

`useHandoffTarget(product, accepts, fallback)` in `system/work.ts`.

The obvious version reads the next step out of the active work and sends there.
It is wrong: a handoff is a thing carried *into a tool that needs it*, and most
steps need nothing. Portal reads the whole project and takes no input, so an
offer addressed to it would sit in the pending slot forever.

So the product passes the destinations it actually knows how to hand to — all
of which claim offers — and the work only chooses among them. With no work
active the product's own default stands, which is what keeps every product
correct when entered directly.

```
REALITY COMPILER   accepts x-ray, anzy-os    → SEND TO X-RAY during TAKE A SYSTEM APART
MATTER ENGINE      accepts director, anzy-os → SEND TO DIRECTOR during TURN A MESSAGE INTO MATTER
```

Walking the route is a different gesture and belongs to the strip: SEND TO
carries something, NEXT opens a door.

### Director takes two kinds of subject

Director read briefs. It now reads a **brief** (a stated problem) or a
**recipe** (a phrase set in the particle field), and says which it got. The
subject is *selected* out of the incoming document rather than summarised —
the statement from a brief, the phrase from a recipe — and if what comes out is
still long enough to be prose it is cut to its first sentence and the treatment
says it was shortened.

```
MATTER RECIPE — "MAKE IT MAKE SENSE", PRODUCED BY MATTER ENGINE AND CARRIED
HERE AS AN ARTIFACT. THE SUBJECT LINE ABOVE IS STATED THERE WORD FOR WORD.

WHAT THIS FILM IS FOR
MAKE IT MAKE SENSE
```

---

## 5. THE ASSEMBLED PROJECT

`system/assemble.ts`, rendered in SYSTEM.app.

The ledger already listed what had been made. Somebody who has spent twenty
minutes across four products is not asking what files they have. The panel now
answers five questions, with the ledger sitting between them as the sixth:

```
WHAT YOU TOLD US          their words, wherever they typed them
WHAT THIS WORKED OUT      what the system derived, by register
WHAT WAS MADE             the ledger — times, sources, limits
WHAT IS STILL UNKNOWN     the gaps, named rather than implied
WHAT IS RECOMMENDED       the RECOMMENDATION lines, gathered
WHAT YOU CAN DO NEXT      doors, chosen from what exists
```

Nothing is stored: the reading is a pure function of the project and the session
brief.

**It is a reading, not a reprint.** The first build listed every UNKNOWN the
brief holds — on a real run, more than twenty — and SYSTEM.app became a worse
copy of a document the visitor already had, with the gaps that belong to the
*session* lost in the middle of it. The brief's own unknowns are now counted and
pointed at (`The brief names 17 more … AUDIT 11, BUILD 2, CONNECT 2, SCALE 2`);
what is stated in full is what nothing else says.

### Absences derived from what exists

Reading a page's source and measuring a page in a browser are different claims.
A session holding only the first looks, to anybody who was not here, like a page
that was examined. Skipping X-Ray is legitimate; it just has to be said.

With a manifest and no specimen, both SYSTEM.app and the delivery package print:

> **LIVE MEASUREMENT WAS NOT PERFORMED.** The page in this package was read
> from its committed source only. Nothing here reports what a browser actually
> did with it — no computed type sizes, no measured spacing, no real element
> boxes. X-RAY is the instrument that takes those, and it was not run.

Because it is derived, declining a continuation writes its own consequence into
the manifest without any step having to record that it was declined.

`WHAT IS NOT IN IT` is now printed **on screen** in Portal as well as in the
downloaded manifest. It was download-only, which meant the one line that stops
the package being read as more than it is was invisible to anybody who packaged
there and never opened the file.

---

## 6. THE REDUCED-MOTION VISITOR COULD NOT DO ONE OF THE THREE JOBS

The largest thing this phase found.

`prefers-reduced-motion: reduce` → capability profile `lite` → `COUNTS.lite = 0`
→ `active === false` in MATTER ENGINE → **the artifact bar was not rendered at
all**. The mode's calm version is correct and well made; it simply had no way to
produce anything. The same applied to a phone and to any machine without WebGL.

So the index promised `TURN A MESSAGE INTO MATTER` to a class of visitors who
could not complete it, and nothing said so.

A recipe is *settings*, not a picture. The calm version has every one of them —
state, phrase, force, profile — because they are what the visitor chose rather
than what the renderer produced. The bar is now outside the `active` guard,
without the PNG, and the document says why:

> The settings for a formation this browser did not draw. The field is not
> rendered here — reduced motion was asked for, or this machine has no WebGL —
> so there is no picture to keep and none is claimed.

Verified under genuine `prefers-reduced-motion: reduce` (Playwright
`emulateMedia`, `matchMedia(...).matches === true` confirmed in the page):

```
MATTER ENGINE (calm)  COPY · DOWNLOAD .MD · DOWNLOAD .JSON · SEND TO DIRECTOR
                      no DOWNLOAD .PNG, correctly
```

### Motion on the new surfaces

Measured in the browser, not inspected: every element of `.wb`, `.ws`,
`.os-read` and `.pt-package__not` reports `transform: none` and
`animation-name: none`. The only non-zero transitions are `background-color`,
`border-color` and `color`. Nothing travels, so the reduced path is identical by
construction and no branch was added.

---

## 7. PRESENTATION

Internal vocabulary removed from anything a visitor reads:

| was | is |
|---|---|
| `NOT YET — this tool cannot answer that` | what the absence actually is, per row |
| `ARTIFACT` (contract row label) | `YOU TAKE` |
| `3 ARTIFACTS · 2 HANDOFFS` | `3 MADE · 2 CARRIED BETWEEN TOOLS` |
| `DEVELOPED FROM 2 EARLIER ARTIFACTS` | `MADE FROM 2 EARLIER RESULTS` |
| `this artifact recorded no payload` | `a reference only — nothing was recorded with it` |
| `produced by AGENCY-SIMULATOR` | `produced by AGENCY SIMULATOR` |
| `DIRECTOR TREATMENT FROM DIRECTOR` | `TREATMENT FROM DIRECTOR` |
| `MATTER RECIPE FROM MATTER ENGINE` | `RECIPE FROM MATTER ENGINE` |
| `hi-anzy-matter-type` (ledger title) | `Matter Recipe — "MAKE IT MAKE SENSE"` |

`NOT YET` was right in Phase 8.7, when four contract rows were genuinely
unbuilt. It is wrong now: the one product with empty rows is PRESENCE, which
produces nothing **by design**, and `NOT YET` promised a file that is never
coming. The guard against the classification drifting is
`incompleteProducts()`, which runs in development — that was always the real
check.

One stale claim was also corrected. MEMORY's UNBUILT card said "the realities
that are still index rows"; there are none, and have not been since all sixteen
came online.

A scan of the built bundle finds zero occurrences of `artifact contract`,
`handoff record`, `producer ID`, `null contract` or `registry`. The three
remaining `NOT YET` strings are authored English in Director's captions, in
MEMORY's copy and in a Simulator finding, none of them a status label.

---

## 8. THE AUDIT'S OWN PREMISE HAD EXPIRED

`scripts/check-contrast.mjs` classified `--prov-measured` against `--prov-derived`
as *"NOT HELD — never on the same page"*, on the grounds that the brief and the
specimen report draw from disjoint vocabularies. That was true when it was
written. SYSTEM.app's assembled reading now sets all five registers in one list,
because a session can hold a brief and an X-Ray reading at once and showing them
together is the entire point of the panel.

The claim was retired rather than quietly kept. Those three pairs moved into a
`MARK_SEPARATED` class — co-occurring, separated by mark and word rather than by
hue — which is the Phase 8.6 E design decision stated where it can be checked,
instead of riding on an assertion about page layouts that had stopped being true.

The exemption leans on the CSS, so the script names what carries it:
`.os-read__line[data-p='MEASURED'] .os-read__p::before` is a 3px rule where every
other register is a 7px square, and the register's word is printed in full on
every line.

```
CHECKED      282 information-bearing pairs
DECORATIVE   123 measured, not held to a text ratio
FAILURES     none — every information-bearing pair clears AA.
```

---

## 9. THE FOUR CHAINS, WALKED

All four run end to end. Chains 1 and 3 were also walked under genuine
`prefers-reduced-motion: reduce`.

**1 · A problem becomes a package.**
`AGENCY SIMULATOR` state → five answers → PRODUCE THE BRIEF → SEND TO ANZY.OS
(`1 OF 3 MADE`) → NEXT · DIRECTOR → treatment names the visitor's own sentence →
SEND (`2 OF 3`) → NEXT · PORTAL → CROSS → package → SEND (`3 OF 3 MADE ·
NOTHING LEFT TO MAKE`).

**2 · A page is taken apart, and the measurement is skipped.**
`REALITY COMPILER` compile → **SEND TO X-RAY** → X-Ray opens on `/ / HOME`, the
same page → leave without measuring → SYSTEM.app and the package both state
`LIVE MEASUREMENT WAS NOT PERFORMED`, and `WHAT YOU CAN DO NEXT` offers X-RAY
with a reason.

**3 · A message becomes matter.**
`MATTER ENGINE` TYPE → "MAKE IT MAKE SENSE" → **SEND TO DIRECTOR** → the
treatment's subject is the phrase, word for word → SEND → NEXT · PORTAL →
package (`3 OF 3 MADE`).

**4 · The open route.**
`OPEN THE SYSTEM` → ANZY.OS with no strip, because nothing is being followed →
`diagnose …` in the Terminal → SYSTEM.app reads it back under WHAT YOU TOLD US →
AGENCY SIMULATOR opens already holding the sentence.

### Interruption and decline

| | |
|---|---|
| `NOT NOW` on an offer | the artifact stays, the reading is unchanged, the count is unchanged |
| `STOP` mid-work | the strip disappears, the visitor stays exactly where they are |
| re-choosing the work later | picks up from what the project actually holds |
| walking off-route (CHAOS, mid-work) | strip stays and offers the way back; nothing reports an error |
| `NEW PROJECT` | reading empties, band returns to `0 OF 3 MADE` |
| enter / exit × 3 | back on the index, zero leaked canvases |

---

## 10. ACCESSIBILITY

- Index tab order: skip link → index → four work items → the reality rows. The
  band is genuinely first, not merely visually above.
- The strip is the first tab stop inside a mode, before EXIT. Two stops of
  chrome, both of them ways out or onward.
- Focus ring measured on both: `solid 1.6px rgb(241, 144, 32)`.
- `STOP` operated by keyboard leaves the visitor in the mode, as a click does.
- Every control added this phase is ≥32px tall.
- The register column in the reading is `max-content` on the list rather than a
  fixed measure on each row, so `RECOMMENDATION` cannot run into its own
  sentence — and rows share one track instead of going ragged.
- Product names do not break at their own hyphen in a 390px column.
- No horizontal scroll at 390×844.

---

## 11. BUNDLE

| | baseline `1dc3c6b` | now | Δ |
|---|---|---|---|
| entry JS | 324.97 kB | 324.74 kB | **−0.23 kB** |
| entry CSS | 36.44 kB | 39.92 kB | **+3.48 kB** |
| `react-three-fiber` chunk | 880.56 kB | 880.59 kB | +0.03 kB |

`dist/index.html` carries exactly one `modulepreload`, for `jsx-runtime`.
`three` and R3F appear in the entry only as a dynamic-import manifest string,
never in its graph. No `manualChunks` was added.

---

## 12. WHAT WAS NOT DONE

- **No new realities, no rebuilds, no Living World work.** Living World was not
  opened.
- **No persistence.** The project, the brief and the chosen work all live in
  memory for one tab. PERFORMANCE still reports `STORAGE — NONE`.
- **No fake anything.** Nothing was added that claims a measurement, a client,
  a result or a capability the product does not have.
- **The commercial repository was not touched.**
- **Frame-rate numbers: UNKNOWN by name.** Nothing in this phase measured or
  claimed one.
