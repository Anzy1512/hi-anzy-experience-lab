import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { spatialFallbackReason } from '../../content/brand';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { spatialQuality } from '../../spatial/quality';
import { SpatialCanvas } from '../../spatial/SpatialCanvas';
import { clamp01, damp, lerp } from '../../spatial/projection';
import { ParticleField } from '../matter/ParticleField';
import { useCameraMotion, type PresenceSignal } from './useCameraMotion';
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
  const { status, start, stop } = useCameraMotion(signal);
  const forceRef = useRef({ x: 0, y: 0, sign: 0 });
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

  const statusLine =
    status === 'active'
      ? 'CAMERA · LOCAL MOTION SENSING'
      : status === 'requesting'
        ? 'ASKING YOUR BROWSER…'
        : status === 'denied'
          ? 'CAMERA DECLINED · POINTER STILL WORKS'
          : status === 'unsupported'
            ? 'NO CAMERA API HERE · POINTER STILL WORKS'
            : status === 'error'
              ? 'CAMERA UNAVAILABLE · POINTER STILL WORKS'
              : coarse
                ? 'TOUCH'
                : 'POINTER';

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
            />
          </SpatialCanvas>
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
