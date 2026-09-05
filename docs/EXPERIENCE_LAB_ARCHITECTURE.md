# Experience Lab — Architecture

## Stack

| Choice | Version | Why |
|---|---|---|
| React | 19.2.8 | Component model for the shell and mode lifecycle. |
| TypeScript | 5.9 | Strict. **Not** TS 7 — see note below. |
| Vite | 8.2.2 | Build + dev. Dynamic-import code splitting is load-bearing here. |
| three | 0.185.1 | One justified use in Phase 1: the depth field. |
| @react-three/fiber | 9.7.0 | React lifecycle integration for that canvas. |
| gsap | 3.15.0 | Timelines + CustomEase. |

**12 direct dependencies, 70 packages resolved.** Deliberately absent, with reasons:

- **@react-three/drei** — the depth field needs ~60 lines of raw three. Drei would be weight for nothing.
- **A router** — three shell states do not justify one. Hash routing is ~40 lines and deep links work
  on any static host with no rewrite rules.
- **A state library** — the only shared state is the mode lifecycle and the X-Ray layer set. Both are
  small; the pointer (the highest-frequency signal in the product) deliberately never touches React.
- **A second motion library** — GSAP + CSS covers everything.
- **ESLint** — strict TS plus the build gate. A known gap, listed as such.

TypeScript is pinned to `~5.9` rather than the current 7.0.2. TS 7 is the new native compiler and the
project's type surface leans on `@types/three` and R3F's generics; that is not a risk worth taking on
a foundation build. Worth revisiting in Phase 2.

## Layout

```
src/
  app/            shell (App), mode host, mode chrome
  core/           store · raf · pointer · capability · cleanup · hooks · useScope
  design-system/  tokens.css · base.css · typography.css
  motion/         easing (CustomEase vocabulary) · primitives
  experience/     mode types + the lifecycle engine
  modes/xray/     the one built reality
  components/     Launcher · LabIndex · Sheet furniture · Pointer instrument
  content/        lab.ts (the reality index) · brand.ts (copy)
```

Content is separated from rendering: `content/lab.ts` is the entire reality index as data, and no
component hard-codes a title, tagline or status.

## The three load-bearing systems

### 1. One RAF loop — `core/raf.ts`

Every continuously-running system subscribes to a single `onFrame`. The loop **does not exist** when
nothing is subscribed, so an idle Lab genuinely idles. `haltAllFrames()` is the emergency stop.

Nothing in feature code calls `requestAnimationFrame` directly.

### 2. CleanupScope — `core/cleanup.ts`

Nothing may register a listener, timer, frame callback, tween or GPU resource except through a scope.
The engine disposes the mode's scope on exit whatever happened in between, so a mode cannot outlive
its own exit.

- `useScopedEffect` creates a scope per effect run — StrictMode-safe, since the same run disposes it.
- The mode-level scope from the engine is the net beneath that.
- `emergencyReset(reason)` is the floor: halts all frames, kills every GSAP tween, strips scroll
  lock / pointer attributes / inline body styles, removes `[data-lab-transient]` nodes, and restores
  focus. Wired to `window.error` and `unhandledrejection`.

### 3. The pointer never touches React — `core/pointer.ts`

A single mutable record, smoothed in the shared loop, published two ways: CSS custom properties on
`<html>` (so the instrument renders with zero JS per frame) and a plain subscriber list for readouts.
The instrument component renders once and never again.

X-Ray's hit-testing polls that record once per frame and commits to state **only when the acquired
object changes** — so a fast sweep across the sheet is a handful of renders, not hundreds.

## The experience engine — `experience/ExperienceProvider.tsx`

Shell stages: `launcher → index → mode`. Mode lifecycle:

```
idle → loading → entering → active → exiting → idle
                     ↘ error ↗
```

Two rules make repeated entry safe forever:

1. **Every mode gets a scope the engine disposes on exit.**
2. **Every transition has a watchdog.** A mode that never reports ready within 6s is force-recovered
   to the index rather than left mid-flight.

Modes declare metadata in `content/lab.ts`: id, index, title, tagline, description, status, tier,
material, and requirements (webgl / webgpu / audio / camera / cost / mobile / reducedMotion). Only
`status: 'online'` with a `load()` is enterable — there is no path by which an unbuilt mode renders a
fake preview.

### Routing

Hash-based. `#` launcher, `#index` index, `#/<id>` mode. `popstate` syncs the stage. A deep link to an
unbuilt mode resolves to the index rather than erroring.

> **Fixed during QA:** the initial scope was created only inside `applyLocation`, which never runs at
> mount — so a deep link straight to `#/x-ray` produced a mode with no scope, `ModeHost` bailed, and
> the watchdog bounced a valid URL six seconds later. The scope is now created in the initial state
> and mirrored into React state so it actually reaches the host.

## X-Ray — `modes/xray/`

The concept: the sheet turned to its own construction. **Everything measured is measured off live
DOM** — that honesty is why it is defensible rather than decorative, and it is why the overlays stay
correct at any viewport without a second layout system to keep in sync.

```
XRayMode      orchestration, entry sequence, scanning, keyboard
useMeasure    ONE measurement pass feeding every layer; ResizeObserver + fonts.ready
Layers        one SVG: grid · box · structure · type · space · motion · acquired object
Specimen      the real editorial composition being measured (data-xr markers)
ContourPlate  seeded procedural canvas image + NORMAL/MONO/THRESHOLD/HALFTONE/EDGE
ControlStrip  the printer's control strip — layer patches, presets, plate processing
Readout       live viewport / DPR / GL / profile / object count / frame timing / pointer
DepthField    lazy R3F — measured boxes lifted onto real z (the one justified WebGL)
xrayStore     layer set, entry step, hold, easter egg
```

### Entry is progressive

Nine steps over ~2.1s: surface → colour drains → grid → boxes → structure → type → space → motion →
scanner armed. Switching nine overlays on at once produces noise; revealing them in the order a sheet
is actually built produces an argument.

### Restraint is structural, not tacit

- SPACE dimensions are drawn for the **acquired object only**.
- TYPE **labels** appear only on the acquired object; baselines (cheap lines) are budgeted by capability.
- Region labels are skipped for regions under 150px tall, whose labels would print through their own heading.
- The inspector is **docked in the instrument band** with a drafting leader line, never floating over
  the subject.

### The one WebGL use

`DepthField` lifts the measured boxes onto real z and views them through a perspective camera. The
DOM knows each object's nesting depth and has no way to show it. It is **off in the default layer
set**, so the graphics chunk and its render loop do not exist until asked for.

## Performance

Verified against the production build with network capture:

| Stage | Added | gzip |
|---|---|---|
| Launcher | `index.js` + `index.css` | **101 kB** |
| Enter X-Ray | `XRayMode.js` + `.css` | +10 kB |
| Enable DEPTH | `DepthField.js` (three.js) | +234 kB |

> **Fixed during QA:** a `manualChunks` config intended to keep three out of the entry did the
> opposite — naming the chunk hoisted it into the entry's graph and Vite emitted a
> `<link rel="modulepreload">` for it, so every visitor downloaded ~890 kB of WebGL on the launcher.
> Removing `manualChunks` lets the bundler split along the dynamic-import seams that already express
> the intent correctly.

Other measures: single RAF loop that stops when idle; pointer via CSS custom properties; hit-testing
committed only on change; capability profiles (`ultra/high/balanced/lite`) budgeting overlay density;
DPR capped at 1.75 for the canvas; procedural imagery instead of assets; no images, no video, no fonts
beyond three Google families.

## Capability detection

Viewport, pointer type, DPR, `prefers-reduced-motion`, `hardwareConcurrency`, and whether WebGL can
actually produce a context (the probe context is explicitly released). No UA sniffing, no
fingerprinting, no "desktop therefore fast".

## Room left for Phase 2

Nothing here blocks Living World or Reality Compiler: modes are lazy and renderer-agnostic, the
engine already carries requirement metadata and capability tiers, the cleanup contract scales to GPU
resources, and the material system extends by adding a `data-material` block.

---

# Phase 2 — spatial architecture

## Preflight hardening

| Debt | Resolution |
|---|---|
| Fonts fetched from Google at runtime | Six OFL woff2 files self-hosted in `public/fonts`, ~128 kB total. Zero third-party requests. The wordmark viewBox is byte-identical to before, so there is no layout shift. |
| No lint gate | Flat-config ESLint (`js` + type-checked `typescript-eslint` + `react-hooks` + `react-refresh`). 0 errors is the gate; formatting is deliberately not linted. |
| No frame-budget tooling | `src/dev/` — an overlay on Ctrl+Alt+P plus `window.__labPerf.sample(ms)` for headless profiling. It subscribes to the shared RAF loop **only while sampling**, and is dead-code eliminated from production. |

The lint gate immediately found real defects, all fixed rather than suppressed: `ref.current`
assignment during render in five files (now `useLatest`, assigned in a layout effect); a lazy
component minted during render in `ModeHost` (now a module-level record); a cascading
`setState` inside an effect in `XRayMode` (the acquired object is now derived during render
from its element); a Promise used as a boolean; and an unbound method handed to
`useSyncExternalStore`.

## `src/spatial/` — shared infrastructure

Built because two modes needed it, not in anticipation of a third.

```
projection.ts      CSS perspective <-> Three camera parity; rect -> world; damping
SpatialCanvas.tsx  one canvas: demand frameloop, DPR from quality, context-loss containment
useSpatialCells.ts transform-immune layout measurement
quality.ts         capability profile -> an actual scene budget
disposal.ts        GPU resource release (R3F only disposes what it created)
```

### The projection contract

A CSS `perspective: P` container and a Three perspective camera at distance `P` with
`fov = 2·atan((h/2)/P)` project **identically**. An element at `translateZ(z)` lands exactly
where a mesh at world `z` lands.

This is the decision Reality Compiler rests on: **the DOM carries content into depth; WebGL
carries the structure around it.** The title in the world is the `<h2>` — selectable, crisp,
in the accessibility tree — where rasterising typography into a texture would have cost all
three and a dependency besides.

### Measuring under transform

`getBoundingClientRect()` returns the *transformed* box. Using it during compilation means the
system measures its own output and drifts a little further every frame.
`offsetLeft/offsetTop/offsetWidth` ignore transforms, so walking the offsetParent chain yields
the layout rect at any point in the compilation. X-Ray keeps its own `useMeasure` because it
deliberately wants the *rendered* rect — different question, different tool.

### The camera never moves

Both spatial modes transform the world group instead. One transform stays authoritative, CSS
and WebGL cannot drift apart, and nothing writes to renderer-owned state.

## Reality Compiler

One number — progress 0 to 1 — drives both renderers; there is no second source of truth.
Stages overlap deliberately, so it reads as one transformation with nameable moments rather
than a slideshow. Nothing re-renders while compiling: progress lives in refs, cell transforms
are written imperatively, and the scene reads a stable mutable object. React hears about
*stage* changes — eight times, not eight thousand.

The scaffold bakes every vertex at unit depth (`z = −planeIndex`) so separation is a single
`scale.z`, never a rebuild.

> **Fixed during QA.** `overflow: hidden` on the document wrapper forced
> `transform-style: flat` — it is a grouping property — so every cell's `translateZ` collapsed
> into a flat scale: the scaffolding receded correctly while the text it was meant to wrap
> stayed pinned to the page. Separately, `perspective-origin` was not the viewport centre,
> which sheared the DOM layer away from the WebGL layer as depth increased.

## Living World

A territory you *read*. Ground is the specimen plate's own field traced as **isolines by
marching squares** — two earlier attempts drew a displaced wireframe grid and both read as a
videogame landscape. Districts are stacked plates whose architecture is their character
(STRATEGY tall and almost perfectly in register; TECHNOLOGY dense and machine-regular; CULTURE
low and out of true). Four static geometries, four draw calls; travel only transforms the
group.

District names are DOM anchored to projected world points, with a nearest-first collision pass
so districts that line up along the view axis never print their names on top of each other.

## Performance

Measured against the production build with network capture:

| Stage | Added | gzip |
|---|---|---|
| Launcher | `index.js` + `index.css` | **101.7 kB** |
| Reality Compiler | mode + three.js + shared (field, disposal, plate) | +243 kB |
| Living World *after* Compiler | `WorldMode.js` + `.css` only | **+6.4 kB** |
| X-Ray | mode + css | +9 kB |

Living World costing 6.4 kB on top is the shared-infrastructure payoff made visible.

`frameloop="demand"` on both spatial canvases: the GPU renders when progress or the pointer
changes, and rests when the visitor does.

> **Fixed during QA.** A `manualChunks` config meant to keep three.js out of the entry did the
> opposite — naming the chunk hoisted it into the entry graph and Vite emitted a
> `modulepreload` for it, so every visitor downloaded ~890 kB of WebGL on the launcher.

## The disposed-scope bug

The provider disposed the mode's `CleanupScope` in a mount effect. React StrictMode mounts,
tears down and re-mounts effects — so the scope created for a deep link was disposed while the
`scope` *state* still held the dead object. `CleanupScope.add()` runs a teardown immediately on
a disposed scope, so every subscription Reality Compiler registered was cancelled the instant
it was made: the animation loop unsubscribed itself on creation, silently, with no error.

Two fixes. Scope lifetime now belongs solely to `openScope`/`closeScope`, driven by navigation
— the provider wraps the whole application and is never unmounted in practice. And `add()` on
a disposed scope now warns loudly in development, so this class of failure can never be silent
again.


---

# Phase 3

Four realities: **Agency Simulator**, **Matter Engine**, **Presence**, **Anzy.OS**. Each one
had to pass its own gate before the next was started.

## Payload

Production build **as it stood at the end of Phase 3**, with seven realities online
(superseded by the Phase 4 table further down):

| Chunk | Raw | gzip |
|---|---|---|
| `index.js` (shell, React, engine) | 301.3 kB | **102.1 kB** |
| `react-three-fiber` (three.js) | 880.5 kB | 233.7 kB |
| `XRayMode` | 18.0 kB | 6.1 kB |
| `SimulatorMode` | 16.7 kB | 6.1 kB |
| `CompilerMode` | 15.7 kB | 6.2 kB |
| `WorldMode` | 15.2 kB | 6.1 kB |
| `OsMode` | 14.9 kB | **5.9 kB** |
| `PresenceMode` | 6.8 kB | 3.0 kB |
| `MatterMode` | 6.1 kB | 2.2 kB |
| `ParticleField` (shared by Matter + Presence) | 5.9 kB | 2.8 kB |

`dist/index.html` emits **no `modulepreload` at all** — only the stylesheet link — and the
three.js chunk appears in the entry only as a dynamic-import *string*. The Phase-1
`manualChunks` regression has not returned.

**Anzy.OS is the cheapest flagship**: 5.9 kB gzip and no WebGL, which is why its index entry
declares `webgl: false`, `cost: low`, `mobile: full`.

**Presence costs 3.0 kB** because it reuses Matter Engine's `ParticleField` instead of standing
up a second particle system. That is the reason Matter was built first.

## Matter Engine — analytic particles

Every particle carries `tFrom`, `tTo`, `delay` and `seed` as static attributes. Position is
`mix(tFrom, tTo, staged(progress, delay))` plus a pointer force, computed in the vertex shader.
There is no GPGPU ping-pong, no simulation texture, and **no simulation state to leak** — one
`BufferGeometry`, one `ShaderMaterial`, one draw call.

It is the only mode that opts into `frameloop="always"`, and it takes on the matching duty: the
canvas drops back to `demand` the moment `document.visibilityState` is `hidden`.

Counts come from measured capability, not from a number that sounded impressive:
`ultra 160,000 / high 90,000 / balanced 36,000 / lite 0` — and `lite` gets the states as a
printed plate rather than a broken canvas.

## Presence — the camera contract

Enforced by construction rather than by promise:

- `start()` is only ever reached from a click on ALLOW. **No video element exists** before that
  — verified: 0 video elements before consent, 0 while the consent dialog is open.
- Frames are drawn into a 32×24 canvas in-tab and discarded. No upload, recording, storage or
  network call of any kind.
- `stop()` stops every track, clears `srcObject`, removes the element and cancels the loop, so
  the browser's camera indicator goes out. It is registered on the mode's `CleanupScope` *and*
  returned from the effect, so every exit path runs it.
- Declining falls back to pointer with no loss of function.

It is **frame differencing, not hand tracking**, and is never labelled as either in the
interface. MediaPipe was the obvious reach and was deliberately not taken: a multi-megabyte
WASM dependency whose gesture behaviour could not be verified in this environment would have
shipped a claim rather than a feature.

## Anzy.OS — the fictional shell

`modes/os/commands.ts` is a `switch` over a fixed word table, operating only on the mode's own
React state. There is no `eval`, no dynamic dispatch, no filesystem, no `import.meta.env`, no
`process`, no `document.cookie`, no storage and no network. An unknown word returns
`unknown command`. Nothing a visitor types can reach outside that file.

`run <reality>` is the one effect that leaves the mode, and it goes through the engine's own
`enterMode` — so `applyLocation` disposes the outgoing scope before opening the next, exactly as
any other navigation would.

Sheet placement is **shelf packing on one row**: a new sheet starts where the sheets already on
the bench end. There is deliberately no second row — sheet height is content-driven, so a
row-two slot chosen from x alone lands on top of a tall row-one sheet while claiming to sit
beside it. When the bench is full the sheet goes on the pile with a clear diagonal offset,
which is honest about what happened.

Dragging writes `transform` straight to the element and commits once on release, so a moving
sheet never re-renders React and the pointer never becomes application state.

## Fast Refresh and the context split

`ExperienceProvider.tsx` exported both a component and `useExperience`. Fast Refresh cannot
preserve state for a mixed module, so every edit to the provider produced a **second module
instance with a second context object** — and components that had not been re-evaluated kept
the old one and threw `useExperience must be used inside <ExperienceProvider>` against a
provider that was plainly mounted. During Phase 3 QA this repeatedly looked like a mode defect.

The context now lives in `experience/context.ts`. The project's ESLint output is zero errors
and zero warnings, and `react-refresh/only-export-components` is treated as load-bearing rather
than cosmetic.

## Lifecycle stress test

The full sequence, hash-navigated with the mode allowed to arm at each step:

`X-RAY → INDEX → COMPILER → WORLD → AGENCY → MATTER → INDEX → PRESENCE → INDEX → ANZY.OS →
MATTER → WORLD → X-RAY → INDEX`

| Check | Result |
|---|---|
| Console errors | **0** |
| Canvases at each index visit | **0** |
| RAF subscribers at rest | **0** — the shared loop does not exist when idle |
| `<video>` elements, ever | **0** |
| `[data-lab-transient]` nodes | **0** |
| OS sheets after leaving Anzy.OS | **0** |
| Body classes / inline body styles | none |
| Scroll lock left on | no |

The only console output across the whole run is three.js's own `THREE.Clock` deprecation notice
(emitted by `@react-three/fiber`, not by this codebase — our only `Clock` is the OS wall clock)
and `THREE.WebGLRenderer: Context Lost`, which is three.js reporting the contexts being
deliberately released on exit.

---

# Phase 4

Nine systems: **Memory**, **Director**, **Dream**, the **Audio Engine**, **After Dark**,
**Sonic Architecture**, **Chaos**, **Time Machine**, **Portal** and **Performance**. All
sixteen realities are now `online`.

## The dt bug, and the rule it produced

`core/raf` clamps `dt` to 64ms so a tab-restore spike cannot teleport an animation. That is
correct for animation and **wrong for time**, and Phase 4 hit it three separate ways:

- Chaos's ten-stage sequence was assembled from accumulated deltas. In an environment
  delivering 1.5 fps it ran at roughly one twelfth of real speed — stage 01 was still on
  screen thirteen seconds in.
- Director's 84-second film had the same defect, less visibly.
- Performance was reporting frame times taken from the clamped `dt`, so its mean, p95 and
  longest-frame readouts were all pinned at exactly 64ms — a measurement instrument
  physically unable to exceed its own clamp.

The rule now recorded in `CLAUDE.md`: **`dt` is for animation, never for time.** A timed
performance or a measurement reads `performance.now()` itself. Chaos keeps the clamped step
for its Verlet integration, because a long frame fed into Verlet does not slow the
simulation down — it detonates it.

## The audio engine

One `AudioContext` for the Lab, in `src/audio/`.

- Nothing is constructed until `enable()` runs inside a user gesture. Not a suspended
  context, not a node, not a scheduled event.
- A `Scene` registers every node, source and timer a mode creates; `dispose()` stops and
  disconnects all of it, and `disable()` closes the context.
- The context suspends on `visibilitychange` and resumes when the tab returns.
- Six synthesised voice families and one scale (D minor pentatonic across three octaves).
  **There are no audio files in this project** — nothing to download, nothing to license,
  and nothing to keep in sync.

`window.__labAudio.report()` is the DEV probe, mirroring the camera probe in Presence.

## Payload

| Chunk | Raw | gzip |
|---|---|---|
| `index.js` (shell, React, engine) | 304.0 kB | **103.1 kB** |
| `react-three-fiber` (three.js) | 880.5 kB | 233.7 kB |
| `MemoryMode` | 14.6 kB | 6.1 kB |
| `TimeMachineMode` | 13.3 kB | 4.6 kB |
| `DirectorMode` | 13.1 kB | 4.2 kB |
| `PerformanceMode` | 6.2 kB | 2.3 kB |
| `DreamMode` | 5.6 kB | 2.6 kB |
| `ChaosMode` | 5.2 kB | 2.5 kB |
| `PortalMode` | 5.1 kB | 2.1 kB |
| `SonicMode` | 4.6 kB | 1.9 kB |
| `AfterDarkMode` | 4.2 kB | 2.0 kB |
| `voices` + `engine` (audio, shared) | 6.6 kB | 2.6 kB |

**The entry grew 2.7 kB across nine new realities** (301.3 → 304.0 kB) because every one of
them is behind a dynamic import. `dist/index.html` still emits **no `modulepreload` at all**,
and three.js appears in the entry only as a dynamic-import string.

Only four of the sixteen realities load three.js. Memory is the only Phase 4 mode that does;
Dream, Chaos, Portal and After Dark are canvas or DOM, and Director, Time Machine, Sonic and
Performance are DOM only.

## Chaos: why there is no physics library

Fifty lines of Verlet integration in `ChaosMode.tsx` — gravity, a floor, walls with
restitution, and one separation pass. That is the entire requirement. A physics dependency
for one falling-text sequence would have been the largest package in the tree.

The destruction is theatrical and that is enforced structurally: the fragments are a local
array this component owns and renders, positions are written directly to its own elements,
and nothing outside the mode is read or written. The launcher, the index and every other
reality are untouched while it runs.

## Cross-mode stress test — all sixteen

Every reality in sequence, then rapid switching:

`X-RAY → COMPILER → WORLD → AGENCY → MATTER → PRESENCE → ANZY.OS → MEMORY → DIRECTOR →
DREAM → AFTER DARK → SONIC → CHAOS → TIME MACHINE → PORTAL → PERFORMANCE → INDEX`
then `MATTER → ANZY.OS → DREAM → MEMORY → AFTER DARK → X-RAY → INDEX` at 900ms each.

| Check | Result |
|---|---|
| Console errors | **0** |
| Canvases at rest | **0** |
| RAF subscribers at rest | **0** |
| Video elements, ever | **0** |
| `[data-lab-transient]` nodes | **0** |
| OS sheets after exit | **0** |
| Chaos fragments after exit | **0** |
| Audio engine / context at rest | **off / none** |
| Body classes, inline body styles | none |

The only console output across the whole run is three.js's own `THREE.Clock` deprecation
notice (emitted by `@react-three/fiber`) and `THREE.WebGLRenderer: Context Lost`, which is
three.js reporting the contexts being deliberately released on exit.
