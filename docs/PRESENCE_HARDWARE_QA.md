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

---

# PHASE 8.6 — ACCEPTANCE TEST

Ten minutes on a real machine with a real webcam. Everything below is a thing to
*look at*, not a thing to take on trust: the mode now prints its own vitals
while the camera runs, so a single screenshot of the readout answers most of it.

## What has already been proven, and what has not

Verified automatically on 2026-09-12, in Chromium on this machine:

| | |
|---|---|
| Nothing requested on load or on entry | PASS — zero `<video>` elements until USE CAMERA |
| Granted path end to end | PASS **against a Windows virtual camera device** (`Lenovo Virtual Camera`). A live 320×240 stream, track `live`, frame count advancing. |
| STOP CAMERA tears down | PASS — 0 tracks, 0 video elements, 0 transient nodes, loop stopped, diagnostics reset |
| Escape out of the mode tears down | PASS — same, and the hook itself unmounts |
| Re-entry does not reuse a stale stream | PASS — returns to `idle` with nothing attached |
| denied / nodevice / busy / unsupported / other | PASS — each maps to its own sentence, none leaves a video element |

**Not proven, and only a person can prove it:**

- Behaviour with a *physical* webcam rather than a virtual device.
- Whether the motion sensing actually feels responsive to a human body in a
  real room, at real light levels. Frame differencing is sensitive to lighting
  and this is the part no automated check can judge.
- The browser's own camera indicator going out on stop. The Lab stops every
  track, but the indicator is the operating system's and has to be *seen*.
- Safari and Firefox. Only Chromium was exercised here.
- `insecure` — localhost is a secure context, so the HTTPS branch could not be
  reached on this machine. Load the Lab over plain `http://` on a LAN address to
  see it.

## The test

1. **Open Presence. Do not touch anything.**
   The status must read `POINTER` (or `TOUCH`). The browser's camera indicator
   must be off. Move the pointer — the field must respond. *Presence is fully
   usable without ever granting the camera; if that is not true, stop here.*

2. **Press USE CAMERA.** A consent panel appears and states what is read, at
   what size, that frames are compared in-tab and discarded, that nothing is
   recorded, stored or uploaded, and that it identifies nobody. Read it. Press
   KEEP USING POINTER. Nothing must have started.

3. **Press USE CAMERA again, then ALLOW CAMERA.** Grant at the browser prompt.
   - Status reads `CAMERA · LOCAL MOTION SENSING`.
   - The readout appears. Screenshot it. It must show `PERMISSION GRANTED`, a
     real `STREAM` resolution, `TRACK LIVE`, and a `FRAMES READ` count.
   - Watch the frame count for five seconds. **It must keep rising.** A count
     that stops is a stream that has frozen, and it is the failure no status
     word can show.
   - Wave. The field must follow, and `ENERGY` must rise.

4. **Press STOP CAMERA.**
   - **The browser's camera indicator must go out.** This is the one that
     matters most.
   - The readout disappears; the status returns to `POINTER`.
   - In the console: `window.__labCam.report()` — `videoElementsInDocument: 0`,
     `transientNodes: 0`, `tracks: []`, `samplingLoopRunning: false`.

5. **Start it again, then leave with Escape.** The indicator must go out again.
   Re-enter Presence: the status must read `POINTER`, not `CAMERA`.

6. **Deny it.** Reset the site's camera permission, press USE CAMERA, and click
   Block. The status must read `CAMERA DECLINED · POINTER STILL WORKS`, and the
   pointer must still drive the field.

7. **Unplug it.** With the camera running on an external webcam, unplug it. The
   status must change to `CAMERA DISCONNECTED · POINTER STILL WORKS` rather
   than freezing on `active`.

## What a failure looks like

Any of these is a defect worth stopping for:

- The camera indicator stays on after STOP, after Escape, or after leaving the
  Lab entirely.
- `FRAMES READ` stops rising while the status still says active.
- A `<video>` element survives in the DOM after teardown.
- Any state that says something went wrong when the truthful answer is "this
  needs HTTPS" or "there is no camera here".
- Presence being unusable because the camera was declined.
