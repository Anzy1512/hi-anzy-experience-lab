# Experience Lab — Reference Study

Phase 1 reference pass. Not a link dump: every entry states the principle extracted, what was
deliberately **not** taken, and how it becomes Hi Anzy. 14 references.

The house rule for this document: **we take principles, never compositions.** If a reference's
look could be recognised in our output, we took too much.

---

## A. Motion & typographic construction

### 1. Codrops — *Interactive Text Destruction* (Jul 2025) & *WebGPU Gommage Effect* (Jan 2026)
https://tympanus.net/codrops/tag/typography/

**What works.** Type treated as *matter* that can be decomposed, not a label that can fade.
Destruction reads as authored because the decomposition follows the letterform's own geometry.

**Do not copy.** The particle dissolve itself — it is now a genre. Also the WebGPU/TSL dependency;
it buys spectacle we have not conceptually earned in Phase 1.

**Hi Anzy translation.** Type decomposes along a **print** logic rather than a physics logic: our
wordmark separates into *ink plates*, not particles. Same principle (type as constructed matter),
completely different vocabulary, ~2 kB of CSS transforms instead of a compute shader.

### 2. Codrops — *From SplitText to MorphSVG* (May 2025) + GSAP 3.13 making all plugins free
https://gsap.com/blog/3-13/

**What works.** Character-level control is now free and the SplitText rewrite is half the size.

**Do not copy.** Reflexively splitting every heading. Char-stagger on everything is the single
clearest tell of a generated site.

**Hi Anzy translation.** We use GSAP core and hand-roll a ~20-line splitter for the two places that
genuinely need per-character control. Splitting stays a *deliberate* device, and cleanup stays ours.

### 3. Codrops — *How to Create Responsive and SEO-friendly WebGL Text* (Jun 2025)

**What works.** Real HTML text stays in the DOM and drives the WebGL layer, rather than being
replaced by it. Accessible and selectable by default.

**Do not copy.** The full canvas-text pipeline — unnecessary at our scale.

**Hi Anzy translation.** This is the load-bearing rule for X-Ray: the diagnostic overlay measures
**real DOM**, it never renders a fictional copy of the page. The X-Ray is honest instrumentation,
which is why it is conceptually defensible rather than decorative.

### 4. Codrops — *Hover Animations for Terminal-like Typography* (Jun 2024)

**What works.** Monospace as a *voice* — the machine speaking — set against an editorial voice.

**Do not copy.** Green-on-black terminal cosplay and scramble-on-everything.

**Hi Anzy translation.** IBM Plex Mono is the instrument's voice and appears only where the system
is genuinely reporting a value. If a mono string is not a measurement, it is set in Newsreader (Phase 6; formerly Plex Sans).

---

## B. Interaction & pointer

### 5. Active Theory — controlled chaos, cursor as instrument
https://activetheory.net/

**What works.** Layouts that *look* volatile but are tightly scripted; the cursor becomes a tool
that acts on content rather than a decorated dot.

**Do not copy.** Glitch overlays, oversized novelty cursors, and simultaneous motion everywhere.

**Hi Anzy translation.** Our pointer is a **registration crosshair** — two hairlines and a bracket
with a state label (`DISCOVER / ENTER / SCAN / EXIT`). It is small, it never occludes, and in X-Ray
it becomes the actual measuring instrument. Cursor-as-tool, minus the theatre.

### 6. Lusion — cursor-reactive depth
https://lusion.co/

**What works.** Small pointer-driven parallax gives a flat composition real dimension at almost no
cost.

**Do not copy.** Constant, ambient mouse-parallax on the whole page — it makes a site feel like it
is breathing at you.

**Hi Anzy translation.** Parallax is *quantised* and local: only the Lab Index row under the pointer
responds, and only in discrete steps. Depth is a reward for proximity, not a background behaviour.

### 7. Resn — reward curiosity
https://resn.co.nz/

**What works.** Layered scenes that give something back when you push on them.

**Do not copy.** Whole-site whimsy; obscuring navigation to feel clever.

**Hi Anzy translation.** Exactly **one** hidden interaction in Phase 1, and the primary interface
stays legible to someone who never finds it.

---

## C. Editorial, print and measurement systems

### 8. Swiss/International grid practice — Müller-Brockmann's *Grid Systems*
**What works.** The grid is a visible ethical position, not an invisible helper: columns, baselines
and margins are the design.

**Do not copy.** Reverent 1960s pastiche.

**Hi Anzy translation.** The grid is the **subject** of X-Ray. GRID is a layer you switch on, with
columns, baseline and viewport bounds drawn as real measured geometry.

### 9. Printer's control strips & registration marks (offset lithography convention)
**What works.** A printed sheet carries its own diagnostic instrumentation in the trim area — colour
patches, registration targets, trim/bleed marks. Function that happens to look extraordinary.

**Do not copy.** Nothing to avoid; this is an under-used language on the web.

**Hi Anzy translation.** This is the **central metaphor of the whole product** and the reason the
Lab is not generic. The X-Ray layer control is a *print control strip*. The pointer is a
*registration target*. The launcher reveal is a *misregistration coming into register*. It ties the
source material (a printed proposal deck) to the digital institution honestly, and it gives every
technical element a non-sci-fi reason to exist.

### 10. Architectural working drawings — dimension lines, leader lines, section marks
**What works.** Measurement notation is legible at a glance and beautiful only because it is precise:
witness lines, arrowheads, offset labels that never sit on top of the thing measured.

**Do not copy.** Blueprint-blue. It is the single most exhausted "technical" cliché on the web.

**Hi Anzy translation.** X-Ray's blueprint state is **bone-on-ink**, never cyan. Dimension callouts
use real leader-line convention: the label is offset, connected by a hairline, and never overlaps its
subject.

### 11. Scientific/engineering diagnostic instruments (oscilloscope, spectrum analyser faceplates)
**What works.** Dense information stays calm because it is *ranked*: one signal colour, everything
else neutral, and the instrument's own chrome recedes.

**Do not copy.** "HUD noise" — brackets and ticks applied as decoration to non-data.

**Hi Anzy translation.** Hard rule enforced in the design system: **orange means signal.** Orange is
reserved for the currently active/scanned object and the one online reality. If everything is orange,
nothing is.

---

## D. Structure & navigation

### 12. Museum/exhibition wall labels and plate lists
**What works.** An index of works — number, title, medium, status — is a legitimate and dignified
navigation model. Hierarchy comes from typographic scale, not from boxes.

**Do not copy.** Literal gallery-wall skeuomorphism.

**Hi Anzy translation.** The Reality Index is a **plate list**, not a card wall: oversized index
numerals, condensed display titles, right-aligned status notation, rules between rows. It solves the
brief's "no cards" requirement with a model that is genuinely more appropriate, not just contrarian.

### 13. FIELD.IO / FutureDeluxe — systems-driven identity
https://field.io/ · https://futuredeluxe.com/

**What works.** Output looks generative but is clearly *directed*: one system, executed at several
scales, with restraint about how much of it is shown at once.

**Do not copy.** Abstract chrome blobs and iridescent gradient sculpture.

**Hi Anzy translation.** Our one generative element is a **procedural specimen plate** — a seeded
contour field drawn to canvas that X-Ray can process (MONO / THRESHOLD / HALFTONE / EDGE). Generative
where it earns its place; zero stock imagery, zero AI imagery, near-zero payload.

### 14. Bruno Simon — *bruno-simon.com*
https://bruno-simon.com/

**What works.** The technology is the portfolio, and the concept is graspable in three seconds.

**Do not copy.** The playfulness — wrong register for a consultancy — and the assumption that a
visitor wants to learn controls before seeing content.

**Hi Anzy translation.** X-Ray must be legible in three seconds ("the interface is showing me its own
construction") and must always offer an obvious way out. Concept-first, controls-second.

---

## Principles carried into Phase 1

1. **Type is matter; decompose it along its own logic** — for us, print plates. (1, 2)
2. **Instrument the real thing, never a fake copy of it.** X-Ray measures live DOM. (3)
3. **Mono is the machine's voice; use it only for real values.** (4)
4. **Cursor is a tool, not an ornament.** (5)
5. **Depth is a reward for proximity, not an ambient behaviour.** (6)
6. **One secret, maximum.** (7)
7. **The grid is the subject, not the scaffolding.** (8)
8. **Print instrumentation is our original technical language** — and it is ours because the source
   material was literally a printed deck. (9)
9. **Never blueprint-blue; bone-on-ink instead.** (10)
10. **Orange = signal. Scarcity is what makes it read.** (11)
11. **Index, not cards.** (12)
12. **Generative only where it earns its place.** (13)
13. **The concept must land in three seconds, and there is always a way out.** (14)

## Sources

- [Codrops — typography](https://tympanus.net/codrops/tag/typography/)
- [Codrops — WebGL](https://tympanus.net/codrops/tag/webgl/)
- [GSAP 3.13 release notes](https://gsap.com/blog/3-13/)
- [Codrops — From SplitText to MorphSVG](https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins/)
- [Lusion](https://lusion.co/)
- [Active Theory](https://activetheory.net/)
- [Bruno Simon](https://bruno-simon.com/)

---

# Phase 2 addendum — spatial references

Six additions, all chosen against one question: *what interaction problem does this
solve, what does it cost, and what is the mobile equivalent?*

### 15. Codrops — *Creating a Smooth Horizontal Parallax Gallery: From DOM to WebGL* (Feb 2026) · *Inside HAOQI.DESIGN: Letting DOM and WebGL Share a Retro-Futurist Stage* (Aug 2026)
https://tympanus.net/codrops/2026/02/19/creating-a-smooth-horizontal-parallax-gallery-from-dom-to-webgl/

**Problem solved.** How a WebGL object stays welded to the DOM element it represents.

**Principle.** Set the camera so **one world unit equals one CSS pixel**, then feed
`getBoundingClientRect()` straight into position and scale. Three's origin is centred and
the rect's is top-left, so the conversion is a fixed offset, not a fudge factor.

**Cost.** Near zero — it is arithmetic. The expensive mistake is *when* you measure.

**Hi Anzy translation.** This is already how Phase 1's `DepthField` places its boxes, so
Reality Compiler inherits a proven mapping rather than inventing one.

### 16. `@14islands/r3f-scroll-rig` — measurement discipline
https://github.com/14islands/r3f-scroll-rig

**Problem solved.** Keeping hundreds of rects correct without forcing layout every frame.

**Principle.** Measure on mount, keep the cache warm with `ResizeObserver` /
`IntersectionObserver`, and correct cached rects by the **scroll delta** rather than
re-reading. Re-measure only what is near the viewport.

**Do not copy.** The library itself. It brings a scroll model and a component surface we do
not need, and the load-bearing idea is one page of code.

**Hi Anzy translation.** `useSpatialCells` measures on mount, re-measures on resize and on
`fonts.ready`, and otherwise never touches layout during the compilation.

### 17. R3F — on-demand rendering
https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx

**Problem solved.** A WebGL scene that renders 60×/s while nothing is moving is a battery
bug wearing a costume.

**Principle.** `<Canvas frameloop="demand">` plus explicit `invalidate()` on real change.

**Hi Anzy translation.** Reality Compiler renders only when compilation progress or the
pointer actually changes. When the visitor stops, the GPU stops. This is the direct
continuation of Phase 1's rule that the shared RAF loop must not exist when idle.

### 18. CSS 3D perspective matched to a WebGL camera
**Problem solved.** Keeping typography *readable, selectable and accessible* while it moves
into depth — instead of rasterising it into textures and losing all three.

**Principle.** A CSS `perspective: P` container and a Three perspective camera at distance
`P` with `fov = 2·atan((h/2)/P)` produce **identical projections**. An element at
`translateZ(z)` lands exactly where a mesh at `z` does.

**Cost.** Free, and it deletes an entire class of dependency (no html-to-texture).

**Hi Anzy translation.** The load-bearing architectural decision of Reality Compiler: the
DOM carries the content into depth, WebGL carries the structure around it. The title does
not become a picture of the title — it *is* the title, at a new z.

### 19. Directed camera work over orbit controls — Lusion / Active Theory / FIELD.IO
**Problem solved.** Visitors get lost the moment they are handed free flight.

**Principle.** Establish, approach, focus, return. Movement is authored; input biases the
camera rather than owning it.

**Do not copy.** The default orbit-controls look, and drifting idle rotation.

**Hi Anzy translation.** Compilation progress owns the camera on a fixed rail; the pointer
only adds a small, damped bias. Living World will extend the same rig with landmark travel.

### 20. Contour/topographic representation as terrain
**Problem solved.** How the compiled document becomes *ground* without inventing a
videogame landscape.

**Principle.** A contour drawing already encodes height. Displacing it is a reading of the
drawing, not a new invention.

**Hi Anzy translation.** The specimen's procedural contour plate — the same seeded field
Phase 1 draws to canvas — becomes the terrain in the WORLD state, and is the material
bridge into Living World. Print halftone → contour → geography, with no step that is not
derived from the step before it.

## Phase 2 principles carried forward

14. **One unit = one pixel.** The mapping between document and world is arithmetic, not art direction.
15. **Measure rarely, correct cheaply.** Never read layout inside the render loop.
16. **The loop rests when the visitor does.**
17. **DOM carries content into depth; WebGL carries structure.** Typography stays real text.
18. **The camera is directed; input only biases it.**
19. **Every spatial form is derived from a 2D form that preceded it.** If a visitor cannot
    trace an object back to the document, it does not belong in the world.


---

## Phase 3 references

### 21. Analytic particle systems (formation morphing without a solver)
**Problem solved.** Hundreds of thousands of particles that move meaningfully, with no
simulation state to leak across a mode boundary.

**Principle.** If every particle's position is a pure function of its own static attributes
and one uniform, the system has no memory — so it cannot drift, cannot desync, and cannot be
left running.

**Hi Anzy translation.** `mix(tFrom, tTo, staged(progress, delay))` in the vertex shader, with
a pointer force added on top. Every formation is something the Lab has already said: the sheet,
the wordmark, the Compiler's planes, the specimen's contour field. **Not taken:** GPGPU
ping-pong render targets — they buy behaviour this product does not need and cost a class of
disposal bug it cannot afford.

### 22. Frame differencing as a presence signal
**Problem solved.** Reading a visitor's movement without a model, a download, or an identity.

**Principle.** The difference between two successive frames already localises motion. The
centroid of that difference is a position; its magnitude is an energy.

**Hi Anzy translation.** 32×24, in-tab, discarded immediately. **Deliberately not taken:**
MediaPipe hand landmarks. It is the obvious reach and it was rejected on honesty grounds —
shipping gesture recognition whose behaviour could not be verified here would be a claim, not a
feature. The interface never uses the words "hand tracking" or "gesture".

### 23. Deterministic diagnostic models (not prediction)
**Problem solved.** How an agency simulator can be genuinely useful without inventing business
outcomes.

**Principle.** A reading states what is *present* in the input and what follows from it.
A prediction states what will happen. Only the first is defensible from five questions.

**Hi Anzy translation.** Answers move seven named axes; axes select clusters; clusters are
banded and sequenced by their own dependencies. Where input is thin the model says
`NEEDS VALIDATION` and asks an open question. **Not taken:** any projected reach, uplift,
timeline, conversion figure or confidence percentage.

### 24. Job-ticket and shelf metaphors (instead of a desktop)
**Problem solved.** An operating environment that is not a Windows/macOS/Linux/retro-terminal
costume.

**Principle.** Take the metaphor from the subject's own world. Hi Anzy's source material is a
printed proposal, so the bench, the sheet and the job ticket are already in the vocabulary —
the desktop is not.

**Hi Anzy translation.** Ink bench, paper sheets, resident processes, one job ticket along the
bottom. Sheets shelf-pack along a row and go on the pile when the bench is full. **Not taken:**
window chrome buttons, minimise/maximise, a dock, a file manager, a wallpaper, or a shell that
executes anything.

## Phase 3 principles carried forward

20. **A system with no memory cannot leak.** Prefer analytic state over simulated state.
21. **Never ship an unverifiable capability.** If its behaviour cannot be confirmed in this
    environment, it is a claim, not a feature — and it is labelled honestly or not shipped.
22. **A reading is not a prediction.** Say what is present; refuse to forecast outcomes.
23. **Permission is asked once, explicitly, late — and revoked completely.** Nothing sensitive
    is acquired before an affirmative click, and exit destroys it.
24. **Take the metaphor from the subject, not from software.**
25. **A module never exports both a component and a hook or context.** Fast Refresh cannot
    preserve it, and the resulting duplicate context is indistinguishable from a runtime bug.

---

## Phase 4 references

### 25. Photogrammetric point clouds as memory
**Problem solved.** How an archive can be *reconstructed* rather than displayed.

**Principle.** A point cloud is a sampling of a real surface. Its incompleteness is not a
style — it is the record of what the capture actually got.

**Hi Anzy translation.** Each record's title is rasterised and its ink pixels become points,
so the cloud's silhouette is literally the typography. Integrity governs how many of a
record's own pixels survive and how far they scatter. **Gaussian splatting was evaluated and
not adopted**: it would have added a large, fast-moving dependency in order to render captured
assets this project does not have and could not have honestly sourced. Sampling the Lab's own
type is cheaper and more truthful — the residue is residue *of something the Lab really says*.

### 26. Progress-driven composition instead of timelines
**Problem solved.** A film that can genuinely pause.

**Principle.** If every shot is a pure function of one number, stopping the number stops the
film. Nothing can keep running underneath because nothing else is running.

**Hi Anzy translation.** Director has no CSS `animation` and no tween library. One clock,
`p` from 0 to 1 per shot, and a wall-clock source so the edit keeps its own timing on a
machine that is dropping frames.

### 27. Synthesis over samples for interface sound
**Problem solved.** Sound in three modes without a single audio asset.

**Principle.** Short interface sounds are cheaper to synthesise than to store, and a
synthesised voice can take a pitch, a pan and a distance as arguments.

**Hi Anzy translation.** Six families, one pentatonic scale, procedural envelopes. Zero bytes
of audio payload, no licensing surface, and a fixed scale that makes an interactive instrument
musical by construction. **Not taken:** a sample library, a music bed, or any third-party
audio engine.

### 28. Interaction archaeology
**Problem solved.** A time machine that is not a parade of colour themes.

**Principle.** What dates an interface is not its palette — it is how you were expected to
move through it, and what the machine was assumed able to do. 1995 has no hover state because
the model had no notion of one; 2007's real contribution is that the page can now hold state
you can lose.

**Hi Anzy translation.** Each era reimplements navigation and interaction, and one source
object renders all seven. **Not taken:** parody. No animated GIFs, no Comic Sans, and no
"under construction" gag beyond the one line 1995 genuinely used.

## Phase 4 principles carried forward

26. **`dt` is for animation, never for time.** A clamped delta is the right input to a
    simulation and the wrong input to a clock or a measurement.
27. **Destruction must be theatrical and structurally isolated.** Chaos owns its fragments;
    nothing outside the mode is read or written, so the failure is a performance.
28. **Sound is a layer the work can lose.** Director, After Dark and Sonic are each designed
    to be complete in silence, because most visitors will never turn sound on.
29. **A measurement instrument must not be able to lie by construction.** If a readout cannot
    exceed its own clamp, the clamp is the bug.
30. **Where a value is unknown, print UNKNOWN and say why.** Performance sets unmeasured
    values in a different type style so the distinction survives a screenshot.
