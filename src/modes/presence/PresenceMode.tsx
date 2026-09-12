import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Presence never requests a capture; one shared no-op keeps the ref stable. */
const NO_CAPTURE: { current: ((b: Blob | null) => void) | null } = { current: null };
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { spatialFallbackReason } from '../../content/brand';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { spatialQuality } from '../../spatial/quality';
import { SpatialCanvas } from '../../spatial/SpatialCanvas';
import { clamp01, damp, lerp } from '../../spatial/projection';
import { ParticleField } from '../matter/ParticleField';
import {
  useCameraMotion,
  type CameraDiagnostics,
  type CameraStatus,
  type PresenceSignal,
} from './useCameraMotion';
import './presence.css';

/**
 * PRESENCE — YOU ARE THE CONTROLLER.
 *
 * The Lab stops treating the visitor as a cursor and starts treating them as a
 * position with energy. That signal has three sources, and **all three are
 * complete experiences**:
 *
 *   POINTER   where you are and how fast you are moving
 *   TOUCH     the same, by hand
 *   CAMERA    optional, consented, local motion sensing
 *
 * The camera is an enhancement, never a requirement. Nothing asks for it on
 * load or on entry: there is a consent panel that explains exactly what happens,
 * and the mode is fully usable if the visitor never touches it — or if their
 * browser refuses, or has no camera at all.
 *
 * The field itself reuses Matter Engine's `ParticleField` rather than standing
 * up a second particle system, which is the reason Matter was built first.
 */

const COUNTS: Record<string, number> = {
  ultra: 60000,
  high: 34000,
  balanced: 16000,
  lite: 0,
};

type Source = 'pointer' | 'camera';

/**
 * What each camera state says out loud.
 *
 * `insecure`, `nodevice` and `busy` used to be folded into a single "CAMERA
 * UNAVAILABLE", which is the least useful true thing that could be said: one of
 * them is fixed by loading over https, one by plugging a camera in, and one by
 * closing the app that is already holding it.
 */
const CAMERA_LINE: Partial<Record<CameraStatus, string>> = {
  active: 'CAMERA · LOCAL MOTION SENSING',
  requesting: 'ASKING YOUR BROWSER…',
  denied: 'CAMERA DECLINED · POINTER STILL WORKS',
  unsupported: 'NO CAMERA API IN THIS BROWSER · POINTER STILL WORKS',
  insecure: 'CAMERA NEEDS HTTPS · POINTER STILL WORKS',
  nodevice: 'NO CAMERA ON THIS DEVICE · POINTER STILL WORKS',
  busy: 'CAMERA IN USE BY ANOTHER APP · POINTER STILL WORKS',
  lost: 'CAMERA DISCONNECTED · POINTER STILL WORKS',
  error: 'CAMERA UNAVAILABLE · POINTER STILL WORKS',
};

/**
 * Where attraction becomes repulsion.
 *
 * Not a display constant: `forceRef.sign` is what the particle field is handed,
 * and this is the value it crosses. Change the physics and this has to move
 * with it, which is the correct coupling — a threshold drawn somewhere other
 * than where it actually is would be worse than not drawing it.
 */
const INVERSION = 0.7;

export default function PresenceMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const quality = useMemo(() => spatialQuality(capability), [capability]);
  const count = COUNTS[quality.profile] ?? 0;

  const [source, setSource] = useState<Source>('pointer');
  const [armed, setArmed] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  const signal = useRef<PresenceSignal>({ x: 0.5, y: 0.5, energy: 0 });
  const { status, start, stop, diagRef } = useCameraMotion(signal);
  const forceRef = useRef({ x: 0, y: 0, sign: 0 });
  /*
   * CONTACT_GAP.
   *
   * `three/SparkGap.js` on the commercial site draws two arms approaching, a
   * burst firing at closest approach, and motes drifting toward the contact
   * point so the space between reads as charged rather than empty. Its own
   * comment names the subject: "it is the gap, and the fact that something
   * ignites in it."
   *
   * The gap already existed in this mode and was invisible. `forceRef.sign`
   * crosses a threshold as the visitor's energy rises — below it the field is
   * drawn toward them, above it the field is pushed away — and that inversion
   * is the single most consequential thing happening here. Nothing on screen
   * said where it was, so the field simply changed its mind and the visitor
   * had no way to know why.
   *
   * This draws it: a ring at the current radius of influence, and a mark at
   * the moment the relationship inverts. It reports a parameter the simulation
   * is already using — no new physics, no second signal, and nothing about
   * hardware that has not actually been measured.
   */
  const gapRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(1);
  const [energy, setEnergy] = useState(0);

  const active = quality.webgl && count > 0 && !glFailed;

  /* ---- the presence signal drives the field ------------------------------- */
  useEffect(() => {
    let shown = 0;
    const stopFrame = onFrame((dt) => {
      const k = damp(0.02, dt);
      const vw = capability.viewport.w;
      const vh = capability.viewport.h;

      if (source === 'camera' && status === 'active') {
        forceRef.current.x = lerp(forceRef.current.x, (signal.current.x - 0.5) * vw, k);
        forceRef.current.y = lerp(forceRef.current.y, -(signal.current.y - 0.5) * vh, k);
        forceRef.current.sign = lerp(
          forceRef.current.sign,
          -clamp01(signal.current.energy * 2.2),
          k,
        );
        shown = lerp(shown, signal.current.energy, k);
      } else {
        // Pointer or touch: position is presence, speed is energy.
        forceRef.current.x = lerp(forceRef.current.x, pointer.sx - vw / 2, k);
        forceRef.current.y = lerp(forceRef.current.y, -(pointer.sy - vh / 2), k);
        const e = clamp01(pointer.velocity / 26);
        forceRef.current.sign = lerp(forceRef.current.sign, -(0.35 + e * 0.65), k);
        shown = lerp(shown, e, k);
      }
      /* The gap, written straight to custom properties. A ring that grows with
         energy, and a state flip at the inversion — which is a real boundary in
         the force this mode applies, not a number chosen to look like one. */
      if (gapRef.current) {
        const g = gapRef.current;
        const px = source === 'camera' && status === 'active' ? signal.current.x : pointer.nx;
        const py = source === 'camera' && status === 'active' ? signal.current.y : pointer.ny;
        g.style.setProperty('--gx', `${px * 100}%`);
        g.style.setProperty('--gy', `${py * 100}%`);
        g.style.setProperty('--gr', `${(0.18 + shown * 0.82).toFixed(3)}`);
        g.dataset.inverted = forceRef.current.sign < -INVERSION ? 'true' : 'false';
      }

      // React only hears about energy in coarse steps, for the readout.
      const rounded = Math.round(shown * 20) / 20;
      setEnergy((prev) => (Math.abs(prev - rounded) > 0.049 ? rounded : prev));
    });
    scope.add(stopFrame);
    return stopFrame;
  }, [source, status, capability.viewport.w, capability.viewport.h, scope]);

  /* ---- entry --------------------------------------------------------------- */
  useEffect(() => {
    setPointerIntent('scan');
    const id = window.setTimeout(() => {
      setArmed(true);
      onReady();
    }, reduced ? 160 : 620);
    return () => window.clearTimeout(id);
  }, [onReady, reduced]);

  /* ---- the camera must not outlive the mode, by any exit path -------------- */
  useEffect(() => {
    scope.add(() => {
      stop();
      setPointerIntent('default');
    });
    return () => {
      stop();
      setPointerIntent('default');
    };
  }, [scope, stop]);

  const grantCamera = useCallback(() => {
    setConsentOpen(false);
    setSource('camera');
    void start();
  }, [start]);

  const dropCamera = useCallback(() => {
    stop();
    setSource('pointer');
  }, [stop]);

  /*
   * One sentence per state, and every one of them ends with what still works.
   * A visitor who cannot use the camera has not hit a dead end — the mode is
   * fully usable from the pointer, and the line says so rather than leaving
   * them looking at a failure.
   */
  const statusLine = CAMERA_LINE[status] ?? (coarse ? 'TOUCH' : 'POINTER');

  /*
   * The diagnostics live in a ref because they are written from the sampling
   * loop, which must not render anything. This copies them out once a second —
   * often enough that a frozen frame count is visible within a second of it
   * freezing, rarely enough that reading the camera's own health never costs
   * the field a frame.
   */
  /* A literal default rather than a read of the ref: the initialiser runs
     during render, and nothing may look at a ref there. Before the camera is
     started these are the true values anyway. */
  const [diag, setDiag] = useState<CameraDiagnostics>({
    permission: 'unknown',
    videoW: 0,
    videoH: 0,
    frames: 0,
    track: 'none',
  });
  useEffect(() => {
    if (status !== 'active') return;
    const id = window.setInterval(() => setDiag({ ...diagRef.current }), 1000);
    return () => window.clearInterval(id);
  }, [status, diagRef]);

  return (
    <div className="pr" data-armed={armed ? 'true' : 'false'}>
      {active ? (
        <div className="pr-canvas">
          <SpatialCanvas
            quality={quality}
            viewport={capability.viewport}
            frameloop="always"
            onFailure={(r) => {
              console.warn('[lab] presence WebGL unavailable:', r);
              setGlFailed(true);
            }}
          >
            {/* Matter Engine's field, reused. Presence supplies the force. */}
            <ParticleField
              count={count}
              state="field"
              previous="field"
              progressRef={progressRef}
              forceRef={forceRef}
              spread={860}
              reduced={reduced}
              captureRef={NO_CAPTURE}
            />
          </SpatialCanvas>
          {/* CONTACT_GAP — the threshold the field is actually using, drawn. */}
          <div className="pr-gap" ref={gapRef} data-inverted="false" aria-hidden="true" />
        </div>
      ) : (
        <p className="pr-fallback t-mono t-mono-xs" role="status">
          {`${spatialFallbackReason('This field', capability)} Presence is still being read — the readout below responds to your pointer or touch.`}
        </p>
      )}

      {/* ---- the reading ------------------------------------------------- */}
      <div className="pr-band">
        <header>
          <h2 className="t-display t-display-m pr-title">PRESENCE</h2>
          <p className="t-mono t-mono-xs t-dim pr-tag">YOU ARE THE CONTROLLER.</p>
        </header>

        <div className="pr-read">
          <p className="t-mono t-mono-xs pr-source" role="status">
            <span className="t-signal">{statusLine}</span>
          </p>
          <div className="pr-meter" aria-hidden="true">
            <span className="pr-meter__fill" style={{ transform: `scaleX(${energy})` }} />
          </div>
          <p className="t-mono t-mono-xs t-faint pr-energy">
            ENERGY {Math.round(energy * 100).toString().padStart(3, '0')}
          </p>
        </div>

        {/*
          THE CAMERA READOUT.

          Live, and only while the camera is running. The point is that a single
          screenshot answers every question on the hardware sheet without anybody
          opening a console: what the browser says about permission, what
          resolution it is actually handing over, whether the track is live, and
          whether frames are still arriving. A frame count that has stopped
          moving is the difference between "active" as a claim and "active" as a
          fact — and it is the failure a status word alone can never show.
        */}
        {status === 'active' && (
          <dl className="pr-diag" aria-label="Camera diagnostics">
            <div>
              <dt>PERMISSION</dt>
              <dd>{diag.permission.toUpperCase()}</dd>
            </div>
            <div>
              <dt>STREAM</dt>
              <dd>{diag.videoW > 0 ? `${diag.videoW}×${diag.videoH}` : 'NO FRAMES YET'}</dd>
            </div>
            <div>
              <dt>TRACK</dt>
              <dd>{diag.track.toUpperCase()}</dd>
            </div>
            <div>
              <dt>FRAMES READ</dt>
              <dd>{diag.frames.toLocaleString('en')}</dd>
            </div>
            <div>
              <dt>SAMPLED AT</dt>
              <dd>32×24 · IN THIS TAB</dd>
            </div>
            <div>
              <dt>SENT ANYWHERE</dt>
              <dd className="t-signal">NO</dd>
            </div>
          </dl>
        )}

        <div className="pr-controls">
          {source === 'camera' && status === 'active' ? (
            <button type="button" className="pr-btn" onClick={dropCamera}>
              STOP CAMERA
            </button>
          ) : (
            <button
              type="button"
              className="pr-btn pr-btn--signal"
              onClick={() => setConsentOpen(true)}
              onPointerEnter={() => setPointerIntent('enter')}
              onPointerLeave={() => setPointerIntent('scan')}
            >
              USE CAMERA
            </button>
          )}
        </div>
      </div>

      {/* ---- consent: shown only on request, never on entry ---------------- */}
      {consentOpen && (
        <div className="pr-consent" role="dialog" aria-modal="true" aria-label="Camera consent">
          <div className="pr-consent__sheet">
            <p className="t-mono t-mono-xs t-signal">OPTIONAL · CAMERA</p>
            <h3 className="t-display t-display-m pr-consent__title">
              Your movement, read locally.
            </h3>
            <ul className="pr-consent__list t-body-s">
              <li>The camera is used to sense <strong>movement</strong> — where something moved and how much.</li>
              <li>Frames are compared inside this tab at 32×24 pixels and then discarded.</li>
              <li>
                Nothing is recorded, stored, uploaded or sent anywhere. There is no account and no
                network request involved.
              </li>
              <li>This is motion sensing, not face or hand recognition. It identifies nobody.</li>
              <li>You can stop it at any time, and leaving this reality stops it for you.</li>
            </ul>
            <div className="pr-consent__actions">
              <button type="button" className="pr-btn pr-btn--signal" onClick={grantCamera}>
                ALLOW CAMERA
              </button>
              <button type="button" className="pr-btn" onClick={() => setConsentOpen(false)}>
                KEEP USING POINTER
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="t-mono t-mono-xs t-faint pr-hint">
        {coarse ? 'MOVE YOUR HAND ACROSS THE SCREEN' : 'MOVE · THE FIELD IS READING YOU'}
      </p>
    </div>
  );
}
