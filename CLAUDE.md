# HI ANZY — EXPERIENCE LAB

Standalone experimental product. Not a website redesign, not a marketing site, not a
component showcase. Read this before changing anything.

**CURRENT PROJECT STATE:** `docs/PROJECT_STATE_PRE_PHASE_6_5.md` — read it before starting
work. This file holds permanent engineering rules; that one holds what phase the product is
actually in, what is built, and what remains open. When they disagree about anything other
than a standing rule, the state doc and the source code win.

## What this is

An interface institution: one company, multiple realities. A launcher, a Reality Index, and
and **seventeen** realities, all of them built and enterable. There is no longer a
"not yet" row on the index — which raises the bar rather than lowering it: the index is
now a promise the product has to keep every time.

## Non-negotiable rules

### Truth
- **Never fabricate business facts.** No clients, awards, testimonials, collaborators,
  metrics, revenue, case-study results, campaign statistics or partnerships.
- The factual record is `docs/HI_ANZY_DECK_CONTENT.md` and stays there. Lab copy is
  original and must not turn a source-deck appearance into a new claim.
- Roadmap statuses (`RESEARCH`, `DORMANT`, …) describe intent, not shipped software.
- **Never build a fake half-working mode.** A mode is `online` and real, or it is a row on
  the index. There is no third option.

### Architecture
- Every listener, timer, frame callback, tween and GPU resource is registered on a
  `CleanupScope`. Use `useScopedEffect` in components; the engine disposes the mode-level
  scope on exit no matter what happened.
- One RAF loop for the whole app (`core/raf.ts`). Never call `requestAnimationFrame`
  directly in feature code. The loop must not exist when nothing is subscribed.
- The pointer never goes through React state. It is a mutable record plus CSS custom
  properties written once per frame.
- Heavy modes lazy-load. `three` and `@react-three/fiber` must never reach the entry chunk,
  and **never add `manualChunks` for them** — naming the chunk hoists it into the entry graph
  and Vite emits a modulepreload for it. The dynamic-import seams already express the intent.
- Spatial work goes through `src/spatial/`: one projection contract, one canvas, one quality
  tier, one disposal helper. Do not stand up a second canvas or a second camera convention.
- **The camera never moves; the world does.** One transform stays authoritative, and nothing
  writes to renderer-owned state.
- Measure layout with `offsetLeft/offsetTop`, never `getBoundingClientRect`, on anything the
  spatial layer is transforming — a rect includes the transform and the system reads its own
  output.
- GPU resources are not garbage collected. Anything built imperatively is disposed via
  `useDisposable`.
- Every mode supports enter → exit → enter → exit forever without corrupting the document.
  Escape works. A visible EXIT control works. `emergencyReset()` is the floor.
- No dependency without a specific, stated purpose. The tree is 5 runtime + 13 build
  dependencies resolving to 173 packages, and that is a feature. No UI kits, no state
  libraries, no router, no second motion library. **Presence deliberately does not use
  MediaPipe**: shipping a multi-megabyte gesture model whose behaviour cannot be verified
  here would be a claim, not a feature. It uses frame differencing and says so.
- **`core/raf` clamps `dt` to 64ms, so `dt` is for animation and never for time.** A mode
  running a timed performance (Director's film, Chaos's ten stages) or *measuring* frame
  behaviour (Performance) must read `performance.now()` itself. Building a clock out of
  clamped deltas makes a sequence run in slow motion on any machine dropping frames, and
  makes a frame-time readout physically unable to exceed its own clamp.
- **A module never exports both a component and a hook or context.** `ExperienceProvider`
  did, Fast Refresh could not preserve it, and every edit produced a second context object
  — so live components threw "useExperience must be used inside <ExperienceProvider>"
  against a provider that was plainly mounted. The context lives in `experience/context.ts`
  for that reason, and the `react-refresh/only-export-components` rule is load-bearing.

### Design
- Material states on `<html data-material>`: `paper` (launcher), `ink` (index and the
  spatial modes), `blueprint` (X-Ray). Components consume semantic tokens (`--ground`,
  `--figure`, `--rule`) and never raw palette values.
- **Every spatial form must be derived from a 2D form that preceded it.** Ground is the
  specimen plate's own field; districts are the Compiler's separated page layers; routes are
  the sheet's rules. If a visitor cannot trace an object back to the document, it does not
  belong in the world.
- **Orange means signal.** It marks the acquired object, the one online reality, and active
  controls. If it starts appearing anywhere else, remove it.
- **Never blueprint-blue.** X-Ray is bone-on-ink.
- Mono (`t-mono`) is the instrument's voice: use it only for values the system actually
  measured. Decorative pseudo-technical strings are banned.
- Typography is three voices kept apart: **Rajdhani** display/system voice, **Newsreader**
  body/human voice (adopted in Phase 6 from the canonical site's own locked pairing —
  "Rajdhani = System Voice, Newsreader = Human Voice (serif)" in its `App.css` — replacing
  the Lab's previous IBM Plex Sans body face), **IBM Plex Mono** the instrument's voice. No
  fourth voice.
- One named easing vocabulary (`snap / glide / weight / mechanical / cinematic`), shared by
  CSS tokens and GSAP CustomEase. No `ease-in-out`, no GSAP defaults.
- No generic `fadeUp`. Reveals use masks, clipping, tracking, drawn rules or registration.

### Banned visual language
Purple/cyan AI gradients · glowing orbs · glass cards · bento grids · universal border-radius ·
meaningless particles · fake holograms · matrix rain · scanline decoration · HUD noise over
non-data · background video as spectacle · AI stock imagery · 3D for its own sake · fade-up on
every section · constant ambient parallax · everything moving at once.

### Motion
- Contrast is the design: stillness before motion, small before huge, quiet before loud.
- `prefers-reduced-motion` is first-class and must **preserve the concept** — remove travel,
  keep hierarchy, materials, layers and all information. Never disable the design.

### Four contracts that are not negotiable
- **Camera (PRESENCE).** Nothing requests the camera on load or on entry. Consent is an
  explicit panel that states what is read, that frames are compared at 32×24 in-tab and
  discarded, that nothing is recorded, stored or uploaded, that it identifies nobody, and
  that it can be stopped. Exiting the mode stops every track, clears `srcObject`, removes
  the element and cancels the loop, so the browser's camera indicator goes out.
- **Shell (ANZY.OS).** The terminal is fictional by construction, not by policy. It maps a
  fixed table of words onto the mode's own state in `modes/os/commands.ts` — no `eval`, no
  dynamic dispatch, no filesystem, no environment, no network, no storage. An unknown word
  is an unknown word. Nothing a visitor types can reach outside that switch statement.
- **Audio (`src/audio/`).** One engine for the whole Lab. No `AudioContext` exists — not
  even a suspended one — until `enable()` is called from a real user gesture. Every node a
  mode creates is registered on a `Scene` so exit disconnects all of it, the context is
  closed outright, and it suspends while the tab is hidden. Every voice is synthesised:
  there are no audio files in this project, so nothing to download and nothing to license.
- **Network (INTELLIGENCE).** The one reality that uses the network, and only to the
  Commercial Intelligence Engine: `src/modes/intelligence/engine.ts` is the Lab's whole
  network surface —
  `/engine/...` (forwarded by Vite to `ENGINE_URL`) or `VITE_ENGINE_URL`. Nothing else in
  `src/` fetches. Every request is cancelled on exit; `onReady()` never waits on a response;
  every failure is a value the mode prints, never a rejection (which would reset the Lab).
  Without the engine it says NOT REACHABLE and shows nothing in its place. Nothing is stored.
  Its desks (`src/content/intelligence.ts`) are one reality, printed on the index as a
  section; a desk hands another words to start from, never a result.

### Accessibility
- Semantic structure, keyboard operation, visible focus, focus restoration on mode exit,
  Escape, skip link. Touch is a first-class interaction model, not a degraded one.
- Never render a fake cursor on a coarse pointer.

## Working practice

- **Prefer current documentation when an API is uncertain.** Use Context7 / `ctx7` rather
  than recalling an API surface.
- **Use Playwright to look at substantial UI work.** A passing build says nothing about
  whether the design is any good. Take screenshots and actually read them.
- **Use Chrome DevTools when diagnosing performance**, not guesswork.
- Research before introducing a major new visual system; record it in
  `docs/EXPERIENCE_LAB_REFERENCES.md`.
- **Do not call something complete because it compiles.** Run it, look at it, and fix weak
  execution before saying it is done.

## Commands

```bash
npm run dev        # vite dev server
npm run build      # tsc -b && vite build
npm run lint       # eslint (0 errors is the gate)
npm run typecheck  # types only
npm run preview    # serve the production build
```

### Development-only instruments

| Trigger | What it is |
|---|---|
| **Ctrl+Alt+P**, or `?perf=1` on any URL | Frame-budget overlay. Holds no RAF subscription while hidden. |
| `window.__labPerf.sample(ms)` | One headless sample — frames, fps, p95, long frames, RAF subscribers, canvases. |
| `window.__labPerf.record(label, ms)` | Same sample, labelled and kept, for building a real-browser table by hand. |
| `window.__labPerf.results()` / `.csv()` / `.clear()` | Read or clear what this session recorded. |
| `window.__labCam.report()` | Presence camera state: video elements, track readyState/enabled, sampling loop. See `docs/PRESENCE_HARDWARE_QA.md`. |
| `window.__labAudio.report()` | Audio engine state and context state — "is anything still making sound?" in one call. |

All of it is behind `import.meta.env.DEV` and dead-code-eliminated from production.

**There is no adaptive frame-rate governor and there will not be one built on numbers from
this environment.** Headless Chrome drives rAF at roughly 2fps, so nothing measured here is a
benchmark. `record()` exists so a person on real hardware can write down what they actually
saw. Quality tiers come from device capability, never from invented timings.

## Layout

```
src/
  app/            shell, routing surface, mode host
  core/           store, raf, pointer, capability, cleanup, hooks
  design-system/  tokens, base, typography
  motion/         easing vocabulary + motion primitives
  experience/     mode types, the context, and the lifecycle engine
  spatial/        projection parity, shared canvas, quality tiers, disposal
  graphics/       the seeded field + the contour plate that both modes share
  modes/xray/      X-Ray
  modes/compiler/  Reality Compiler
  modes/world/     Living World
  modes/simulator/ Agency Simulator — deterministic reading, never a prediction
  modes/matter/    Matter Engine — the shared analytic particle field
  modes/presence/  Presence — consented, local, camera-optional motion sensing
  modes/os/        Anzy.OS — ink bench, paper sheets, fictional shell
  modes/memory/    Memory — the archive reconstructed from sampled typography
  modes/director/  Director — an 84s film the browser performs from one clock
  modes/dream/     Dream — seeded contours that remember words
  modes/afterdark/ After Dark — night stock, sodium, poster culture
  modes/sonic/     Sonic Architecture — the elevation as an instrument
  modes/chaos/     Chaos — theatrical failure over an isolated copy
  modes/timemachine/ Time Machine — one source, seven interaction models
  modes/portal/    Portal — the aperture, with XR reported not assumed
  modes/performance/ Performance — measured values, or UNKNOWN by name
  modes/intelligence/ Intelligence — nine desks over the Commercial Intelligence Engine (9.0–9.1)
  audio/           the one audio engine, its voices, and the React binding
  dev/            frame-budget harness (development only)
  components/     launcher, index, sheet furniture, pointer instrument
  content/        copy, the reality index and the territory, apart from rendering
```

### Phase 5 material decisions

- **PORTAL is a paper mode.** It was a dark rectangle on a dark ground, legible as geometry
  rather than as an opening. The sheet is now bone and the aperture is a hole cut in it with
  the territory beyond — which is both the correct metaphor and the thing that stops four
  dark screens running consecutively. Its registered `material` is `paper` so the mode host's
  chrome stays legible; declaring `ink` there printed a bone EXIT control onto bone stock.
- **AGENCY SIMULATOR's table is ruled into the five method registers.** Material lands in the
  register of the stage that produced it, fragments from one answer are tied by a drawn rule,
  and untouched registers are drawn but empty so the surface shows how much method is ahead.
  The blank space is composed rather than absent — that was the single largest gap between
  concept and execution in the Lab.
- **The Reality Index records where the visitor has walked**, in memory, for the session only
  (`experience/visited.ts`). Nothing is written to storage: PERFORMANCE reports
  `STORAGE — NONE` and that has to keep being true.

## Phase discipline

All seventeen realities are `online`. Phases 1 through 6 are complete or partially complete —
see `docs/PROJECT_STATE_PRE_PHASE_6_5.md` for exactly which, and for what the next phase is.

**Do not start a new phase without explicit instruction**, and do not infer scope for one
from this file — phase scope is stated fresh each time by whoever is directing the work.
