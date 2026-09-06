# Experience Lab — Visual System

## The direction, and why this one

Three territories were explored: **A** editorial/architectural paper and ink; **B** dark technical
institution; **C** hybrid, where print structures acquire depth. The build is a synthesis, and the
synthesis has a single idea holding it together:

> **Hi Anzy's identity lives on paper. The Experience Lab is what happens when that paper is put
> under an instrument.**

That is why the product has **three material states** rather than one look. They are not themes.
They are the same sheet, treated three ways, and moving between them is the transition.

| Material | Where | What it is |
|---|---|---|
| `paper` | Launcher | Warm bone stock, print screen, ink type. Almost print. |
| `ink` | Reality Index | The sheet turned over and backlit. |
| `blueprint` | X-Ray | The sheet's construction. Bone lines on ink. **Never cyan.** |

Set as `data-material` on `<html>`; every component reads semantic tokens (`--ground`, `--figure`,
`--rule`, `--signal`) and never raw palette values, so a material change is one attribute.

## Why print, specifically

The source material is a printed proposal deck. So the technical language of the Lab is the
technical language of **print production**, not science fiction:

- trim marks and a registration target as persistent sheet furniture
- the launcher reveal is **three ink plates coming into register**
- the X-Ray layer control is a **printer's control strip** — each layer is a patch
- notation is drawn from print and drafting: `PLATE`, `REG/`, `OBJ/`, `TRK`, `BASE`, `DIM-W`

This is the thing that stops the product reading as a generic futuristic interface. Every technical
element has a non-arbitrary reason to exist, inherited from where the brand actually came from.

## Palette

Inherited from the deck, not invented.

```
--c-bone       #e9e2d0   warm paper stock
--c-ink        #191d1c   charcoal, slightly green-black
--c-void       #0e1111
--c-signal     #f2911b   Hi Anzy orange
--c-signal-hot #ee4322   the second plate
--c-grey       #8a8578
```

### The one hard colour rule

**Orange means signal.** It marks:

- the object currently acquired by the scanner, and its dimensions
- the single reality that is `ONLINE`
- active controls and the live pointer trail

Nothing else. This was enforced in review, not by taste: the first X-Ray build coloured type
baselines, structure ticks and region labels orange and the whole sheet developed an orange cast —
at which point the colour stopped meaning anything. Those layers are now bone; orange came back to
signal only. If orange starts appearing anywhere else, remove it.

**Never blueprint-blue.** The most exhausted cliché in technical UI. X-Ray is bone-on-ink.

## Typography

Three voices, kept strictly apart. Two are inherited from the deck; the third is new.

| Role | Face | Use |
|---|---|---|
| Display | **Rajdhani** 500/600/700 | Wordmark, index titles, specimen headings. Editorial mass. |
| Body | **Newsreader** 200-800 (serif) | Statements, descriptions, reading. Phase 6: adopted from the canonical site's own `App.css` ("Newsreader = Human Voice"), replacing IBM Plex Sans. |
| System | **IBM Plex Mono** 400/500 | **The instrument's voice.** |

**Mono is only for values the system actually measured.** Decorative pseudo-technical strings are
banned — they are the fastest way to turn an instrument into a costume. The clock in the sheet
furniture is a real clock; every number in X-Ray came out of `getBoundingClientRect` or
`getComputedStyle` on a live node.

### The wordmark

Set as SVG so it spans the sheet exactly at any viewport, with the viewBox derived from real glyph
bounds after the webfont resolves.

Two things were fixed by looking at it:

1. `getBBox()` on SVG text returns the font's **layout** box, not the glyph extent. For Rajdhani
   that is nearly twice the cap height, and it wrapped the wordmark in ~45% invisible padding that
   pushed the statement and the entry control off-screen. Cap height now comes from canvas
   `TextMetrics.actualBoundingBoxAscent`.
2. Plate misregistration is **vertical only** (orange −2.6, red +2.2 user units). Offsetting on both
   axes puts colour on every edge of every stroke and reads as embossed 3D text. Vertical-only puts
   orange along top edges and red along bottom — which is what the hiAnzy logotype already does with
   its orange bar above "hi" and red bar below "zy".

On viewports ≤640px the wordmark **stacks to two lines**. One line on a 390px sheet is ~90px tall and
leaves the composition more than half empty. Stacking is the right composition for a tall narrow
sheet, not a smaller version of the wide one.

## Motion

### Easing vocabulary

Five named curves, registered with GSAP CustomEase using the *same* control points as the CSS
`--e-*` tokens, so a CSS transition and a JS tween move identically.

| Name | Character | Used for |
|---|---|---|
| `snap` | leaves instantly, arrives hard | state changes, toggles, selection |
| `glide` | long tail | things travelling across the sheet |
| `weight` | reluctant start, committed finish | material and mass |
| `mechanical` | held, then decisive | instrument parts, registration |
| `cinematic` | slowest settle | whole-material changes |

No `ease-in-out`. No GSAP defaults.

### Primitives

`splitChars`, `maskReveal`, `trackIn`, `scanSweep`, `rowsIn`, `settleImmediately`,
`guaranteeCompletion`. There is deliberately **no `fadeUp`**.

### Rhythm

The launcher is six beats and most of them are quiet: void → signal → **register** → label →
statement → enter. The single loud moment lasts about a second. Contrast is the design.

### Entrance animations may never hold content hostage

`guaranteeCompletion()` exists because the Reality Index animates *from* `opacity: 0`. When the
frame budget collapsed during QA the rows never appeared at all — the navigation was invisible. A
`setTimeout` deadline now forces the end state regardless of whether rAF is running. Any reveal that
starts from invisible must use it.

## Reduced motion

`prefers-reduced-motion` is first-class and **preserves the concept**. The plates still land in
register with their residual misregistration, every layer still arrives, hierarchy and materials are
untouched — only the travel is removed and the timings compress. Verified visually, not assumed.

## Banned

Purple/cyan AI gradients · glowing orbs · glass cards · bento grids · universal border-radius ·
meaningless particles · fake holograms · matrix rain · scanline decoration · HUD noise over non-data ·
background video as spectacle · AI stock imagery · 3D for its own sake · fade-up on every section ·
constant ambient parallax · everything moving at once.

## Imagery

There is no photography and no generated image. The specimen's plate is a **seeded procedural
contour field** drawn to canvas — honest about what it is, weighs nothing, and gives X-Ray real
luminance to process through `NORMAL / MONO / THRESHOLD / HALFTONE / EDGE`. Generation is capped at
360×460 with three octaves because it runs synchronously; the original 620×820 / four-octave version
blocked the main thread long enough to trip the engine's entry watchdog.

---

# Phase 2 — the material continues

Phase 1 ended at three material states. Phase 2 answers *what happens when the paper stops
being flat* by continuing the same sequence rather than starting a new one:

```
PAPER → INK → BLUEPRINT → STRUCTURE → DEPTH → SPACE → WORLD
```

`STRUCTURE` onward are not new `data-material` values. They are **stages of one
transformation**, because a fourth and fifth palette would have been a new look rather than
the same sheet under further handling. The ground stays ink; what changes is what is standing
on it.

## The derivation rule

**Every spatial form must be derived from a 2D form that preceded it.** This is the rule that
keeps the world from becoming generic:

| 2D origin | becomes |
|---|---|
| page layers separating in Z | district architecture — stacked plates |
| the printed contour plate | terrain, traced as isolines at real altitudes |
| rules on the sheet | routes running along the ground |
| registration targets | beacons planted at each district |
| the six-stage method list | a corridor, because reading order is depth order |
| dashed measure boxes | the WebGL scaffolding that supersedes them |

If a visitor cannot trace an object back to the document, it does not belong in the world.

## Contours, not meshes

The ground is drawn with **marching squares** at nine to eleven height levels. Two earlier
attempts displaced a wireframe grid instead, and both failed identically: a grid of quads
reads as a videogame landscape, which is the one cliché this world cannot afford. Real
contours are closed rings at constant height — they read as a map, they carry the print DNA
directly, and because each ring sits at its own altitude the drawing is also the relief.

## Orange, still scarce

In Reality Compiler orange marks the stage rules, the corridor between the six method stages,
and the entry control. In Living World it marks routes, the focused district, and the active
index chip. The scaffolding, the boxes, the plates and the ground are all bone. The rule
survived Phase 2 unchanged: if orange starts appearing anywhere else, remove it.

## Reduced motion and no-WebGL

Both spatial modes were designed so the CSS/DOM half carries the whole idea:

- **Reality Compiler** on `lite` runs with no canvas at all. The document still separates into
  depth under CSS 3D; only the scaffolding is absent, and the fallback line says so plainly.
- **Living World** on `lite` shows the territory index — every district, its line and its
  notes, as ordinary HTML. Capability tiers reduce what is *rendered*; they must never reduce
  what *exists*.

Reduced motion snaps between stages rather than gliding, and drops travel, while keeping every
stage reachable and every layer present.


---

# Phase 3 — four realities that must not look like each other

The single largest risk going into Phase 3 was that every mode would settle into the same dark
green contour-grid screen. Four modes, four distinct treatments:

| Reality | Material | What it looks like |
|---|---|---|
| **Agency Simulator** | `paper` | A working document. Fragments on a light table, resolving into a system reading with rules and bands. No canvas, no depth. |
| **Matter Engine** | `ink`, deepened to `#0b0e0e` | Substance. The one mode where the surface *is* the material and the type is made of the same stuff as the field. |
| **Presence** | `ink` | Almost empty. A field, a meter, one control. The visitor is the content. |
| **Anzy.OS** | `ink` **and** `paper` at once | An ink bench with paper sheets laid on it. The only mode that holds two materials simultaneously. |

## Anzy.OS — paper on ink

The sheet re-declares the **paper** semantic tokens locally:

```css
.os-sheet {
  --ground: var(--c-bone);
  --figure: var(--c-ink);
  --rule: rgba(25, 29, 28, 0.22);
  ...
}
```

Everything inside then styles itself, which is exactly the mechanism the token system exists
for — a material change stays one block of custom properties rather than a rewrite.

The bench carries a 96px drafting grid at `--rule-faint`. An earlier 64px version at half
opacity was so faint it read as two stray streaks rather than a ruled surface; the fix was a
wider module and full token opacity, not a brighter line.

**The operating metaphor is a print workshop's job system, not a computer desktop.** No dock,
no menu bar, no traffic lights, no wallpaper, no glass, no start menu, no file manager, no
retro-terminal green. Sheets have a head, a plate number and one control. Paper on a bench
casts one soft contact shadow; the focused sheet is separated by opacity and the weight of its
head rule, never by colour.

## Orange in Phase 3

- **Simulator** — the lead band and the active control only. Hedged output (`NEEDS VALIDATION`,
  `OPEN QUESTIONS`) is deliberately *not* orange; it is not a signal, it is an admission.
- **Matter** — the active state and force buttons.
- **Presence** — the energy meter and the one camera control.
- **Anzy.OS** — the caret on lines the visitor typed, the tick beside an open process, the
  `ONLINE` status in the realities list, and the focus rule on the job ticket.

Two Anzy.OS defects found by looking rather than compiling: the open-process marker originally
ran the full height of its row and started at the sheet edge, so two adjacent open processes
merged into a single long orange stripe down the left of the screen; and on mobile the
full-screen paper panel covered the mode host's bone-on-ink chrome, making **EXIT invisible on
paper**. Both are fixed — the marker is a discrete inset tick, and the mobile panel starts
below the chrome band.

## Mobile is a model change, not a scale change

Anzy.OS at ≤900px is an **app stack**, never tiny draggable windows: the rail is the list,
tapping a process replaces the list with a full-screen panel, closing it brings the list back,
and the job ticket stays pinned to the bottom. Dragging is disabled rather than shrunk.

---

# Phase 4 — nine identities, one DNA

The standing risk was that every new mode would settle into the same dark contour screen.
Nine modes, nine dominant identities:

| Reality | Identity | What makes it unmistakable |
|---|---|---|
| **MEMORY** | fragment / reconstruction | Type made of sampled grain, resolving and decaying with distance. Empty ground, one word. |
| **DIRECTOR** | cinematic / typographic | Black frame, colossal type, an edit strip with cue marks. Several shots contain no movement at all. |
| **DREAM** | generative / surreal | Contour weather with words surfacing out of it. No UI except a seed and a readout. |
| **AFTER DARK** | culture / poster / night | **Black stock**, one sodium light, grain, poster type. The only mode that changes paper. |
| **SONIC** | instrument / spatial | An architectural elevation of sixteen bays in six materials. |
| **CHAOS** | failure / physics | Type on the floor, rotated, piled. A red-orange progress rule. |
| **TIME MACHINE** | historical interface logic | Seven complete visual worlds inside one monitor frame — Times New Roman, Verdana 11px, a 2007 gradient header, a flat 2015 card grid. |
| **PORTAL** | aperture / threshold | A rectangle with trim marks and depth behind it. One orange horizon line. |
| **PERFORMANCE** | measurement | A document of readings. Tabular figures, hairlines, and unmeasured values set in italic. |

## After Dark changes the stock

The one place the material system is genuinely extended rather than reused. The mode declares
its own `--stock` (black card, not ink), `--sodium` (a lamp, not a signal mark) and `--chalk`.

Orange stops being *signal* here and becomes *light* — it falls across the poster from a
moving source rather than marking anything. That is the only mode where it is allowed to
behave that way, and it is why After Dark reads as a different time of day rather than a
different colourway.

## Orange in Phase 4

- **Memory** — the active rail tick and the phase label. The points themselves are bone.
- **Director** — the act slug, the progress fill, the measure line, one registration circle.
- **Dream** — *conditionally*. Only seeds whose `signal` parameter is 1 get a single orange
  contour level, and only while a word is fully surfaced. Most dreams have no orange at all.
- **After Dark** — the sodium lamp and the reversed poster bar.
- **Sonic** — the SIGNAL material and the bay currently sounding.
- **Chaos** — the lead fragment during reconstruction, and the progress rule.
- **Portal** — the horizon line, and nothing else.
- **Performance** — the sample control and the caveat.

## Defects found by looking

- **Memory**: points rendered sub-pixel at the camera's distance, so a fully reconstructed
  record read as grey dust; and the camera did not move, so distant records were literally
  small instead of being walked toward. Fixed by clamping point size and translating the
  whole archive by the visitor's position — *the camera never moves; the world does*.
- **Memory**: residue passing near the camera blew up into dinner-plate blobs that buried
  the record. Fixed with a point-size ceiling and a depth-of-field fade at both ends.
- **Memory on mobile**: a fixed world scale is a desktop assumption — at 390px the word ran
  off both edges. The archive is now sized to the viewport.
- **Sonic**: 84px of dead space under the elevation.
- **Chaos**: the ten-stage clock ran at one twelfth of real speed (see the architecture notes).
- **Performance**: frame-time readouts pinned at exactly 64ms by the shared loop's clamp.

## Reduced motion in Phase 4

Every mode keeps its concept and loses only travel:

- **Director** becomes a sequence of editorial tableaux — every shot still arrives, in order,
  on the clock, composed rather than moving.
- **Dream** stops drifting but still cycles words and still reconstructs them.
- **Chaos** holds every fragment at home for the whole performance: the ten stages still run,
  are still announced, and the type still loses and regains its contrast. What is removed is
  type being thrown across a screen, which is the part that causes harm.
- **After Dark** keeps the stock, the lamp, the grain and the turning wall; the lamp stops
  sweeping.
- **Sonic** is untouched. An instrument that will not play is not an accessible instrument.
- **Portal** keeps the aperture, the depth and the horizon, and drops the shearing parallax.
