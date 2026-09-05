import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from '../../core/hooks';

/**
 * CAMERA MOTION SENSING — optional, consented, local, and honest about itself.
 *
 * WHAT THIS IS: frame differencing. Two successive video frames are downsampled
 * to a tiny grid and compared; where they differ, something moved. The centroid
 * of that movement and its magnitude become a presence signal.
 *
 * WHAT THIS IS NOT: hand tracking. It does not find landmarks, it does not
 * recognise gestures, and it is not called either of those things anywhere in
 * the interface. A MediaPipe hand-landmark pipeline was the obvious reach here
 * and was deliberately not taken: it is a multi-megabyte WASM dependency whose
 * gesture behaviour could not be verified in this environment, and shipping
 * unverifiable gesture recognition would be a claim rather than a feature.
 * Frame differencing is small, dependency-free, robust, and does what it says.
 *
 * PRIVACY, enforced by construction rather than by promise:
 *  - `start()` is only ever called from an explicit click. Nothing requests the
 *    camera on load or on mode entry.
 *  - Frames are read into a 32×24 canvas in this tab and never leave it. There
 *    is no upload, no recording, no storage, no network call of any kind here.
 *  - `stop()` stops every track, clears srcObject, drops the element, and
 *    cancels the loop, so the browser's camera indicator goes out on exit.
 */

/**
 * DEV-only observation surface for real-hardware verification.
 *
 * This environment has no camera, so the granted-stream path cannot be tested
 * here. `window.__labCam.report()` gives a human on a real device a one-call
 * answer to every question in docs/PRESENCE_HARDWARE_QA.md — how many video
 * elements exist, what state each track is in, and whether the sampling loop is
 * running. It is installed only while the hook is mounted and only in DEV, so
 * it is dead-code-eliminated from production.
 */
export interface CameraReport {
  status: string;
  videoElementsInDocument: number;
  transientNodes: number;
  samplingLoopRunning: boolean;
  tracks: { kind: string; readyState: string; enabled: boolean; muted: boolean; label: string }[];
}

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'unsupported'
  | 'error';

export interface PresenceSignal {
  /** Normalised centroid of movement, 0..1, mirrored to feel like a mirror. */
  x: number;
  y: number;
  /** How much is moving, 0..1. */
  energy: number;
}

const GRID_W = 32;
const GRID_H = 24;

export function useCameraMotion(signal: { current: PresenceSignal }) {
  const [status, setStatus] = useState<CameraStatus>('idle');
  // Mirrored so the DEV report reads the live value without re-installing it.
  const statusRef = useLatest(status);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef(0);
  const prevRef = useRef<Uint8ClampedArray | null>(null);

  /** Total teardown. Safe to call any number of times, from anywhere. */
  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    const stream = streamRef.current;
    if (stream) {
      // Stopping every track is what actually turns the camera indicator off.
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
      video.remove();
      videoRef.current = null;
    }
    prevRef.current = null;
    setStatus((s) => (s === 'denied' || s === 'unsupported' || s === 'error' ? s : 'idle'));
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      streamRef.current = stream;

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      // Never in the layout: this element exists only to be sampled.
      video.setAttribute('aria-hidden', 'true');
      video.style.position = 'fixed';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.setAttribute('data-lab-transient', 'true');
      document.body.appendChild(video);
      videoRef.current = video;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = GRID_W;
      canvas.height = GRID_H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setStatus('error');
        stop();
        return;
      }

      setStatus('active');

      const tick = () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        ctx.drawImage(v, 0, 0, GRID_W, GRID_H);
        const frame = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
        const prev = prevRef.current;

        if (prev) {
          let sum = 0;
          let sx = 0;
          let sy = 0;
          for (let y = 0; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
              const i = (y * GRID_W + x) * 4;
              const lum = frame[i] * 0.3 + frame[i + 1] * 0.59 + frame[i + 2] * 0.11;
              const plum = prev[i] * 0.3 + prev[i + 1] * 0.59 + prev[i + 2] * 0.11;
              const d = Math.abs(lum - plum);
              if (d < 18) continue; // sensor noise floor
              sum += d;
              sx += x * d;
              sy += y * d;
            }
          }
          if (sum > 400) {
            // Mirrored horizontally so moving right moves the field right.
            signal.current.x = 1 - sx / sum / GRID_W;
            signal.current.y = sy / sum / GRID_H;
            signal.current.energy = Math.min(1, sum / 42000);
          } else {
            signal.current.energy *= 0.9;
          }
        }
        prevRef.current = frame;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const name = (err as DOMException)?.name;
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      stop();
    }
  }, [signal, stop]);

  // Whatever happens, the camera does not outlive this hook.
  useEffect(() => stop, [stop]);

  /* ---- DEV-only hardware verification surface ---------------------------- */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const report = (): CameraReport => ({
      status: statusRef.current,
      videoElementsInDocument: document.querySelectorAll('video').length,
      transientNodes: document.querySelectorAll('[data-lab-transient]').length,
      samplingLoopRunning: rafRef.current !== 0,
      tracks: (streamRef.current?.getTracks() ?? []).map((t) => ({
        kind: t.kind,
        readyState: t.readyState,
        enabled: t.enabled,
        muted: t.muted,
        label: t.label ? 'present' : '(none)',
      })),
    });
    window.__labCam = { report };
    return () => {
      delete window.__labCam;
    };
  }, [statusRef]);

  return { status, start, stop };
}

declare global {
  interface Window {
    __labCam?: { report: () => CameraReport };
  }
}
