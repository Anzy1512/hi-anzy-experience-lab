# PRESENCE — real-device verification

This procedure exists because **the granted-camera path has never been observed**.
The environment this Lab was built in has no camera, so automated QA could only
verify the paths that do not need one: nothing requested before consent, the
decline path, and teardown. Everything below has to be done by a human on real
hardware, and until someone does, the Lab does not claim it passed.

Development only. `window.__labCam` does not exist in a production build.

## Setup

```bash
npm run dev
```

Open `http://localhost:5173/#/presence` on the device under test. `getUserMedia`
requires a secure context: `localhost` counts, a bare LAN IP does not — use
`npm run dev -- --host` plus an HTTPS tunnel, or test on the machine itself.

Keep DevTools open. Every step below is one call:

```js
await window.__labCam.report()
```

It returns `{ status, videoElementsInDocument, transientNodes, samplingLoopRunning, tracks[] }`.

## The eight checks

| # | Step | Run | Pass condition |
|---|---|---|---|
| 1 | **Land on the mode. Touch nothing.** | `__labCam.report()` | `status: "idle"`, `videoElementsInDocument: 0`, `tracks: []`, and **no browser permission prompt has appeared**. |
| 2 | **Open the consent panel** (USE CAMERA). Do not allow yet. | `__labCam.report()` | Still `0` video elements, still `[]` tracks, still no OS/browser prompt. The panel is copy, not a request. |
| 3 | **Decline** (KEEP USING POINTER). | `__labCam.report()` | `0` videos, `0` tracks. Move the pointer: the field and the ENERGY readout still respond. |
| 4 | **Allow.** Reopen the panel, press ALLOW CAMERA, accept the browser prompt. | `__labCam.report()` | `status: "active"`, `videoElementsInDocument: 1`, one track with `readyState: "live"`, `enabled: true`, `samplingLoopRunning: true`. |
| 5 | **Confirm the pipeline is reading you.** Wave a hand across the camera. | watch the ENERGY meter | ENERGY rises with movement and falls back when you hold still. The readout says `CAMERA · LOCAL MOTION SENSING`. It is frame differencing — it will **not** track fingers, and nothing in the UI claims it does. |
| 6 | **Fallback is still there.** Press STOP CAMERA. | `__labCam.report()` | Back to `0` videos, `0` tracks, `samplingLoopRunning: false`; readout returns to `POINTER`/`TOUCH` and still responds. |
| 7 | **Exit while the camera is live.** Allow again, then leave by **each** route in turn: `ESC`, the EXIT control, browser Back, and a hash change to `#index`. After each: | `__labCam.report()` → should throw (hook unmounted), so also check `document.querySelectorAll('video').length` and `document.querySelectorAll('[data-lab-transient]').length` | Both `0`. **The browser's camera indicator (tab dot / OS light) must go out within a second.** This is the check that matters most; a stopped loop with a live track still holds the camera. |
| 8 | **Re-enter.** Return to `#/presence` and allow again. | `__labCam.report()` | `status: "active"` with exactly `1` video element — not 2. Repeat the enter/exit cycle five times and confirm the count never climbs. |

## What a failure looks like

- **Indicator stays on after exit** → a track was not stopped. Look at `stop()` in
  `useCameraMotion.ts`; every path must call `stream.getTracks().forEach(t => t.stop())`.
- **`videoElementsInDocument` climbs across cycles** → an element was not removed.
- **A prompt appears at step 1 or 2** → something calls `start()` outside the ALLOW
  click. That is the one behaviour this mode must never have.

## Recording a result

Note device, OS, browser + version, and the outcome of each numbered step. Until
that table is filled in by a human, the honest status of the granted-camera path
is **unverified**, and it is described that way in the README and the
architecture notes.
