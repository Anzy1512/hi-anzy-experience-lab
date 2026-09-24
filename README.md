# HI ANZY — EXPERIENCE LAB

**One company. Multiple realities.**

A standalone experimental digital product: an interface institution with a launcher, a Reality Index
of seventeen experimental modes, **all seventeen of them built and enterable**.

This is not a website redesign. The Hi Anzy deck is source material for brand DNA, philosophy,
services and terminology only — the factual record lives in
[`docs/HI_ANZY_DECK_CONTENT.md`](docs/HI_ANZY_DECK_CONTENT.md) and stays there.

## Run it

```bash
npm install
npm run dev
```

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint — zero errors and zero warnings is the gate |

## What is built

**The launcher.** Six beats, most of them quiet. The wordmark arrives as three ink plates pulling
into register — the Hi Anzy logotype already contains a misregistration, so the brand's own graphic
device becomes the reveal.

**The Reality Index.** A plate list, not a card wall: oversized numerals, condensed titles,
right-aligned status, rules between rows. Hovering one row recedes the others. Seventeen realities, of
which all seventeen are now `ONLINE`. The index derives that count rather than asserting it, so
it cannot drift from the truth.

**REALITY COMPILER — turn the interface into a world.** A real, readable, accessible document
that reveals the spatial structure it always had: measured, separated, lifted, given volume, bent,
compiled, grounded — then reconstructed exactly. The DOM never leaves; content moves into depth as
actual elements under CSS 3D matched pixel-for-pixel to the WebGL camera, so the title in the world
*is* the `<h2>`. The six method stages become a corridor because the document's reading order is its
depth order.

**LIVING WORLD — enter Hi Anzy.** The territory the compiled sheet became. Contour ground traced
from the specimen plate's own field; districts built as stacked plates whose architecture is their
character; routes drawn as rules. A territory you *read*, not a place you wander: an establishing
view, a district index, and directed travel. Names are DOM, anchored to world points.

**X-RAY — see beneath the interface.** The sheet turned to its own
construction: grid, boxes, type metrics, measured space, structure, pointer telemetry, motion, and a
depth field. Every number on screen was measured off a live DOM node.

- Scan by moving (desktop) or tapping (touch); click to hold a selection
- Nine independently controllable diagnostic layers on a printer's control strip
- Presets `ALL / STD / MIN / OFF`, layer hotkeys `1`–`9`, `A`/`S`/`M`/`O`, `H` to hold
- Plate processing: `NORMAL / MONO / THRESHOLD / HALFTONE / EDGE` on a procedural specimen image
- `DEPTH` lifts the measured boxes onto real z through a perspective camera — the one place WebGL
  earns its seat

**AGENCY SIMULATOR — give Hi Anzy a problem.** Five questions become a system reading, not a
prediction. The model is deterministic and inspectable: answers move seven axes, axes select
capability clusters, clusters are banded `LIKELY LEAD / SUPPORTING / WATCH`, and dependencies
between them produce a sequence. It **never forecasts a business result** — no reach, no uplift, no
timeline, no fabricated analytics. Where the input is thin it says `NEEDS VALIDATION` and asks an
open question instead of inventing an answer.

**MATTER ENGINE — control digital matter.** One draw call, up to 160,000 particles, always
travelling between two *authored* formations — the sheet, the wordmark, the Compiler's planes, the
specimen's contour field. Positions are computed analytically in the vertex shader from
`mix(from, to, t)` plus a pointer force, so there is no simulation state to leak. The only mode that
runs `frameloop="always"`, and the only one that stops dead when the tab is hidden. WebGPU is
detected and reported as `PRESENT · UNUSED`, because it is.

**PRESENCE — you are the controller.** Pointer, touch and camera are all complete inputs; the
camera is an enhancement and never a requirement. Nothing asks for it on load or on entry. Consent
is an explicit panel, the sensing is frame differencing at 32×24 inside the tab, and leaving the
mode stops every track. It is **not** hand tracking and is never described as such — see
[`useCameraMotion.ts`](src/modes/presence/useCameraMotion.ts) for why MediaPipe was deliberately not
adopted.

**ANZY.OS — run Hi Anzy.** Not a desktop clone: a print workshop's job system. An ink bench, paper
sheets laid on it, capabilities as resident processes, and a job ticket along the bottom where
instructions are written. Six applications plus a terminal; the shell can `open`, `close`, `list`,
report `status` and — uniquely — `run` any other reality. The terminal is fictional by
construction rather than by policy: a fixed word table over the mode's own state, with no `eval`, no
filesystem, no environment, no network and no storage. On a phone it becomes an app stack, never
tiny draggable windows.

**MEMORY — walk through reconstructed ideas.** Information as residue. Every point is a sample
of a record's own typography taken off a canvas raster, so the cloud's silhouette *is* the word.
Damage is structural: a record with low integrity keeps fewer of its own pixels and scatters them
further, so it reads as damaged before a letter is legible. Fields the archive lost stay lost —
`PODS` has no names and does not invent any.

**DIRECTOR — watch Hi Anzy become a system.** An 84-second film in six acts that the browser
performs live. No video file, no pre-render. One clock drives everything and each shot derives its
whole composition from a single 0–1 progress value, which is why PAUSE genuinely stops the film
rather than freezing a picture while timelines run on underneath. Sound is offered before playback
and the film is written to work without it.

**DREAM — when the system stops explaining itself.** One thesis, followed all the way: the contours
remember the words they came from. A word is mixed *into* the same seeded scalar field the Lab
draws terrain from, held, then withdrawn — so the letterforms are made of the same lines as the
weather around them. Nothing uses `Math.random()` after entry; the same seed always dreams the
same dream.

**AFTER DARK — the Lab, unattended.** The one mode that changes stock: black card, one sodium
light, grain instead of halftone, type set as posters. It prints no event, no venue, no date and
no line-up, because there are none to print — one poster says exactly that.

**SONIC ARCHITECTURE — the interface is an instrument.** The score is an elevation: sixteen bays
with a height and a material. Height is pitch *and* nearness, horizontal place is pan, material is
timbre. One scale, six synthesised voices, no audio files — you cannot play a wrong note.

**CHAOS — do not press.** Ten stages of escalating failure, then silence, then exact
reconstruction. The destruction is theatrical: the pieces are a copy the mode owns, no application
state is mutated, and Escape works at maximum chaos. Fifty lines of Verlet integration rather than
a physics dependency.

**TIME MACHINE — the same information through different webs.** Seven eras, each reimplementing
navigation and interaction rather than repainting: 1995 has no hover and no retained state, 2000
gets rollovers, 2007 gets tabs and a modal, 2015 makes scroll into navigation, 2035 has no
navigation at all. One source object renders all seven — there is no per-era copy anywhere.

**PORTAL — bring Hi Anzy into your world.** An aperture cut in the sheet with trim marks at the
corners, not a glowing ring. WebXR support is *reported*, never assumed, and the unsupported path
is the same portal driven by device tilt or the pointer.

**PERFORMANCE — the machine, watched.** Every value is measured in this session or says
`UNKNOWN` by name, in a visibly different type style. Draw calls say "not exposed to pages".
Frame timing is sampled only while sampling runs, using real `performance.now()` intervals.

**INTELLIGENCE — the Commercial Intelligence Engine, on this machine.** The front end of a separate
program that runs on your machine (`uv run comintel serve` in the commercial-intelligence folder),
printed on the index as a section of its own with nine desks: SURVEY (every business of a kind in a
place, with what they share and the records that may be duplicates), BRANDS (what a name stands
for, its legal entities and its news), AREAS (how a place resolves, drawn), LOCATORS (a brand's own
store list for a place), SITES (what a website is built and marketed with), DOMAINS (a domain's
registration, mail records, certificates and archive history), DATASETS (many questions, one
table), ARCHIVE (what the engine already knows) and SOURCES (every source and the registry behind
them). Desks hand work to each other. `npm run dev` forwards `/engine` to the engine (`ENGINE_URL`
to point it elsewhere). Without the engine it says NOT REACHABLE and shows nothing in its place. It
is the one reality that uses the network, and it keeps nothing.

## Materials

The product has three material states rather than one look — the same sheet, treated three ways:
`paper` (launcher, Agency Simulator) → `ink` (index, spatial modes, Anzy.OS) → `blueprint` (X-Ray).
Moving between them *is* the transition. Anzy.OS uses both at once: paper sheets on an ink bench,
with the paper material re-declared locally on the sheet so its contents style themselves.

## Getting out

Escape works. A visible **EXIT EXPERIENCE** control works. Entering and leaving repeatedly does not
corrupt the application — verified across enter/exit cycles, eight rapid Escapes, browser back, and
rapid navigation thrash, with no leaked canvases, hosts, scroll locks, body styles or orphan nodes.

## Accessibility

Semantic structure, skip link, keyboard operation throughout, visible focus, focus trapped in a mode
and restored on exit, `role="dialog"`/`aria-modal`, and `prefers-reduced-motion` as a first-class
path that **preserves the design** — plates still land in register, every layer still arrives, only
the travel is removed. No fake cursor is ever rendered on a coarse pointer.

## Documentation

| File | Contents |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Persistent engineering and creative rules for this project |
| [`docs/EXPERIENCE_LAB_REFERENCES.md`](docs/EXPERIENCE_LAB_REFERENCES.md) | Reference study — principles taken, and what was deliberately not taken |
| [`docs/EXPERIENCE_LAB_VISUAL_SYSTEM.md`](docs/EXPERIENCE_LAB_VISUAL_SYSTEM.md) | Materials, palette, typography, motion vocabulary |
| [`docs/EXPERIENCE_LAB_ARCHITECTURE.md`](docs/EXPERIENCE_LAB_ARCHITECTURE.md) | Stack, engine, cleanup contract, performance |
| [`docs/HI_ANZY_DECK_CONTENT.md`](docs/HI_ANZY_DECK_CONTENT.md) | Full transcription of the source deck |

`qa/` holds the visual-QA screenshots captured during the build.

## Phase discipline

Phases 1–4 are complete. Phase 5 is stabilisation — audit, performance, accessibility, security,
content truth and production readiness — and adds no new realities.

## What has not been verified on real hardware

Three paths are implemented and reviewed but have **never been exercised on the hardware they
need**, because this project was built in an environment that has none. They are listed here
rather than buried, and none of them is described anywhere in the product as working:

| Path | Status | What *was* verified |
|---|---|---|
| **Presence — granted camera stream** | **UNVERIFIED** | No `getUserMedia` before an explicit click; zero video elements before consent and while the consent panel is open; the decline path; complete teardown on every exit route. The procedure for a human to finish the job is [`docs/PRESENCE_HARDWARE_QA.md`](docs/PRESENCE_HARDWARE_QA.md). |
| **Portal — immersive XR session** | **UNVERIFIED** | Session-support detection, which reports whatever this browser answers; the `requestSession` failure path; the spatial and flat fallbacks, which is what almost every visitor sees. |
| **Portal — device tilt parallax** | **UNVERIFIED** | The permission request shape and the pointer fallback. No accelerometer was available. |

Frame rates were never measured here either: the automation browser drives `requestAnimationFrame`
at roughly 1–2 fps, so no number produced in this environment is a benchmark, and none is quoted
as one.

## Fabrication rule

No clients, awards, testimonials, collaborators, metrics, results or partnerships are invented
anywhere in this product. Roadmap statuses describe intent, not shipped software.
