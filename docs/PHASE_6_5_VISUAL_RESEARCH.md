# PHASE 6.5 — VISUAL RESEARCH

Short by intention. Only references that changed a decision are here; a hundred
links nobody acted on would be a worse document than five that produced code.

---

## 1. Architectural drawing conventions — poché, hatch, line-weight hierarchy

**Reference.** [Life of an Architect — line weight](https://www.lifeofanarchitect.com/architectural-graphics-101-line-weight/) ·
[ArchitectWisdom — what poché means](https://architectwisdom.com/poche/) ·
[Coohom — hatch standards](https://www.coohom.com/article/industry-standards-for-hatching-in-architectural-and-engineering-drawings)

**Why it matters.** Living World's nine districts already differ in *topology* —
eight distinct silhouette builders, varying plate counts, rise and shear. On
screen they read as one material, because every plate in the territory goes
through a single colour formula (`lum = 0.36 + t × 0.46`, one bone hue). Eight
different buildings drawn with one pen.

**Principle to extract.** A section drawing distinguishes materials by **hatch
pattern and line-weight hierarchy, never by hue** — solid poché for cut
concrete, diagonal hatch for masonry, lighter hatch for timber. The outline
carries the strong weight; the hatch is the thinnest line in the drawing and is
explicitly *secondary* information. And: "the specific conventions matter less
than the consistency of their application within a single project."

**What not to copy.** Literal CAD hatch libraries, or a legend. The Lab is not
pretending to be a construction document.

**Which reality.** Living World. Also already used in Sonic Architecture, where
the sounding bay is drawn as a section cut — this makes the two realities agree
about what a drawing convention means, which is the point of having one.

---

## 2. Layered depth images vs. the 2026 gallery default

**Reference.** [Codrops — scroll-reactive 3D gallery](https://tympanus.net/codrops/2026/03/09/building-a-scroll-reactive-3d-gallery-with-three-js-velocity-and-mood-based-backgrounds/) ·
[LearnOpenGL — parallax mapping](https://learnopengl.com/Advanced-Lighting/Parallax-Mapping) ·
[Layered Depth Images](https://arxiv.org/pdf/2008.12298)

**Why it matters.** It names the thing to avoid. "Images stacked along the
Z-axis… less like a slideshow and more like a walk through a mood" is the
current default for putting pictures into WebGL, and it is what the originality
filter in §33 exists to reject.

**Principle to extract.** Depth-from-displacement invents depth *inside* a
photograph that never had any. For **collage** the honest move is the opposite:
a collage is already a stack of cut paper, so restore the separation between
layers that genuinely existed when it was assembled. Cheaper, and specific to
the source.

**What not to copy.** Z-stacked scroll galleries; depth maps on flat art;
anything where the technique would work identically on any image set.

**Which reality.** Director, Memory — implemented as `SPECIMEN_PLATE`.

---

## 3. The canonical site's own refusal

**Reference.** `frontend/src/components/deck/MotifFrame.js` in
`Anzy1512/hi-anzy-platform` @ `6e36db1`.

**Why it matters.** The company already faced the question this phase asks and
wrote down its answer: *"They are not the deck's photographs. Reproducing
scanned pop-art collage at hero scale would look like a screenshot of a PDF."*

**Principle to extract.** Correct — the assets are 321–522px wide. So invert
it: at **specimen scale**, held and examined, the halftone rosette and the
scissored edge stop being resolution failure and become material evidence. The
constraint produced the art direction.

**What not to copy.** Hero-scale imagery. Ever, with this set.

**Which reality.** Director, Memory.

---

## 4. What the canonical `three/` components already knew

**Reference.** `SystemCore.js`, `HalftoneBackdrop.js`, `useSceneVisibility.js`,
`Constellation.js`, `OrderingGrid.js` in the canonical frontend.

**Why it matters.** Read in Phase 6. Two findings still directing work here:
`SystemCore` assembles **sixteen** nodes into one meshed lattice ("disconnected
things, meshed into one system") and this product has sixteen realities; and
`HalftoneBackdrop` states the discipline for texture — *"texture, never noise"*,
ink at 2–5% effective alpha.

**Principle to extract.** Texture must stay under the threshold where it
becomes noise. A field you notice is already too strong.

**What not to copy.** Their shaders — both were reimplemented in the cheapest
technology that produced the experience (CSS planes, Canvas2D arcs).

**Which reality.** Reality Index (`LATTICE_ASSEMBLY`), After Dark
(`HALFTONE_FIELD`), and the drawn ground inside every `SPECIMEN_PLATE`.

---

## Standing rule this research produced

> **Materials are distinguished by pattern and weight, not by hue.**

The Lab has one accent and it means signal. Every time a reality needs to say
"these two things are made of different stuff", the answer is a different
*drawing convention* — hatch, density, line weight, poché — not a different
colour. That rule now governs Sonic's bays, Chaos's register mismatch, and
Living World's districts.
