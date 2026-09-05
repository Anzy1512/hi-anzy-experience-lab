import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useExperience } from '../../experience/context';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { damp, lerp } from '../../spatial/projection';
import './portal.css';

/**
 * PORTAL — BRING HI ANZY INTO YOUR WORLD.
 *
 * An aperture cut in the sheet, with the Lab's territory behind it. Not a
 * glowing sci-fi ring: it is a **rectangle of paper with a hole in it**, trim
 * marks at the corners, and depth on the other side — the same geometry and
 * material language as every other reality.
 *
 * Three tiers, chosen by what the device can actually do:
 *
 *   XR         an immersive session, if `navigator.xr` reports one is supported
 *   SPATIAL    the aperture with parallax from device orientation or the pointer
 *   FLAT       the aperture, composed and still
 *
 * **Support is reported, never assumed.** The readout says exactly what this
 * browser answered, including "not asked yet" and "this browser has no WebXR
 * API at all". The unsupported path is not a dead end — it is the same portal,
 * driven by a different input, and it is what most visitors will see.
 *
 * The immersive path has **not been exercised on a headset in this
 * environment**; there is none here. It is written against the WebXR session
 * API and reports its own failures rather than pretending.
 */

type XrSupport = 'unasked' | 'unavailable' | 'none' | 'ar' | 'vr' | 'both';
type Tier = 'xr' | 'spatial' | 'flat';

interface XrNavigator {
  xr?: { isSessionSupported: (mode: string) => Promise<boolean> };
}

const LAYERS = 7;

export default function PortalMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { enterMode } = useExperience();

  const [armed, setArmed] = useState(false);
  const [support, setSupport] = useState<XrSupport>('unasked');
  const [sessionNote, setSessionNote] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'idle' | 'on' | 'denied' | 'unsupported'>('idle');

  const apertureRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const tier: Tier = useMemo(() => {
    if (support === 'ar' || support === 'vr' || support === 'both') return 'xr';
    if (reduced || capability.profile === 'lite') return 'flat';
    return 'spatial';
  }, [support, reduced, capability.profile]);

  useEffect(() => {
    setPointerIntent('discover');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 130 : 520,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- ask the browser what it can do, and print the answer -------------- */
  useEffect(() => {
    let cancelled = false;
    const xr = (navigator as Navigator & XrNavigator).xr;
    void (async () => {
      if (!xr?.isSessionSupported) {
        if (!cancelled) setSupport('unavailable');
        return;
      }
      try {
        const [ar, vr] = await Promise.all([
          xr.isSessionSupported('immersive-ar').catch(() => false),
          xr.isSessionSupported('immersive-vr').catch(() => false),
        ]);
        if (cancelled) return;
        setSupport(ar && vr ? 'both' : ar ? 'ar' : vr ? 'vr' : 'none');
      } catch {
        if (!cancelled) setSupport('none');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- the aperture's parallax ------------------------------------------- */
  useEffect(() => {
    if (tier === 'flat') return;
    const stop = onFrame((dt) => {
      const t = tiltRef.current;
      if (orientation !== 'on') {
        // Pointer drives it when the device cannot.
        t.tx = (pointer.sx / Math.max(1, capability.viewport.w) - 0.5) * 2;
        t.ty = (pointer.sy / Math.max(1, capability.viewport.h) - 0.5) * 2;
      }
      const k = damp(0.05, dt);
      t.x = lerp(t.x, t.tx, k);
      t.y = lerp(t.y, t.ty, k);
      const el = apertureRef.current;
      if (el) {
        el.style.setProperty('--tx', t.x.toFixed(4));
        el.style.setProperty('--ty', t.y.toFixed(4));
      }
    });
    scope.add(stop);
    return stop;
  }, [tier, orientation, capability.viewport.w, capability.viewport.h, scope]);

  /* ---- device orientation, only ever after an explicit request ----------- */
  const askOrientation = useCallback(async () => {
    interface Requestable {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    }
    const DOE = (window as unknown as { DeviceOrientationEvent?: Requestable }).DeviceOrientationEvent;
    if (!DOE) {
      setOrientation('unsupported');
      return;
    }
    try {
      if (typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') {
          setOrientation('denied');
          return;
        }
      }
      const handler = (e: DeviceOrientationEvent) => {
        const t = tiltRef.current;
        t.tx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 34));
        t.ty = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 40) / 34));
      };
      window.addEventListener('deviceorientation', handler);
      scope.add(() => window.removeEventListener('deviceorientation', handler));
      setOrientation('on');
    } catch {
      setOrientation('denied');
    }
  }, [scope]);

  /* ---- the immersive path ------------------------------------------------ */
  const enterXr = useCallback(async () => {
    const xr = (navigator as Navigator & XrNavigator).xr as
      | { requestSession?: (m: string, o?: unknown) => Promise<unknown> }
      | undefined;
    if (!xr?.requestSession) {
      setSessionNote('This browser exposes no WebXR session API.');
      return;
    }
    const mode = support === 'vr' ? 'immersive-vr' : 'immersive-ar';
    try {
      const session = (await xr.requestSession(mode, {
        optionalFeatures: ['local-floor', 'hit-test'],
      })) as { end?: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void };
      setSessionNote(`SESSION OPEN · ${mode.toUpperCase()}`);
      // A session must not outlive the mode under any exit path.
      scope.add(() => {
        void session.end?.();
      });
      session.addEventListener?.('end', () => setSessionNote('SESSION ENDED'));
    } catch (err) {
      // The honest outcome: say what the browser said.
      setSessionNote(
        `SESSION REFUSED — ${(err as Error)?.message || 'no reason given by the browser'}`,
      );
    }
  }, [support, scope]);

  const supportLine =
    support === 'unasked'
      ? 'ASKING THIS BROWSER…'
      : support === 'unavailable'
        ? 'NO WEBXR API IN THIS BROWSER'
        : support === 'none'
          ? 'WEBXR PRESENT · NO IMMERSIVE SESSION SUPPORTED HERE'
          : support === 'both'
            ? 'IMMERSIVE AR AND VR REPORTED SUPPORTED'
            : support === 'ar'
              ? 'IMMERSIVE AR REPORTED SUPPORTED'
              : 'IMMERSIVE VR REPORTED SUPPORTED';

  return (
    <div className="pt" data-armed={armed ? 'true' : 'false'} data-tier={tier}>
      {/* ---- the aperture: a sheet with a hole cut in it ------------------- */}
      <div className="pt-stage">
        <div className="pt-aperture" ref={apertureRef}>
          {/* Depth: the Lab's own rules, receding through the opening. */}
          <div className="pt-depth" aria-hidden="true">
            {Array.from({ length: LAYERS }, (_, i) => (
              <span
                key={i}
                className="pt-layer"
                style={{
                  ['--i' as string]: i,
                  ['--k' as string]: (i / (LAYERS - 1)).toFixed(3),
                }}
              />
            ))}
            <span className="pt-horizon" />
          </div>

          {/* The paper the hole is cut in. Trim marks, not a glowing ring. */}
          <span className="pt-trim pt-trim--tl" aria-hidden="true" />
          <span className="pt-trim pt-trim--tr" aria-hidden="true" />
          <span className="pt-trim pt-trim--bl" aria-hidden="true" />
          <span className="pt-trim pt-trim--br" aria-hidden="true" />
        </div>
      </div>

      <header className="pt-head">
        <h1 className="t-mono t-mono-xs pt-head__title">
          <span className="t-signal">PORTAL</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">BRING HI ANZY INTO YOUR WORLD.</span>
        </h1>
      </header>

      {/* ---- what this device can actually do ----------------------------- */}
      <div className="pt-strip">
        <dl className="pt-read">
          <div>
            <dt>WEBXR</dt>
            <dd>{supportLine}</dd>
          </div>
          <div>
            <dt>RUNNING</dt>
            <dd>
              {tier === 'xr' ? 'XR OFFERED' : tier === 'spatial' ? 'SPATIAL APERTURE' : 'FLAT APERTURE'}
            </dd>
          </div>
          <div>
            <dt>PARALLAX</dt>
            <dd>
              {tier === 'flat'
                ? 'NONE — BY PREFERENCE OR TIER'
                : orientation === 'on'
                  ? 'DEVICE ORIENTATION'
                  : orientation === 'denied'
                    ? 'ORIENTATION DECLINED · POINTER'
                    : orientation === 'unsupported'
                      ? 'NO ORIENTATION API · POINTER'
                      : coarse
                        ? 'TOUCH'
                        : 'POINTER'}
            </dd>
          </div>
        </dl>

        <div className="pt-actions">
          {tier === 'xr' && (
            <button type="button" className="pt-btn pt-btn--signal" onClick={() => void enterXr()}>
              ENTER IMMERSIVE
            </button>
          )}
          {tier !== 'flat' && coarse && orientation === 'idle' && (
            <button type="button" className="pt-btn" onClick={() => void askOrientation()}>
              USE DEVICE TILT
            </button>
          )}
          <button type="button" className="pt-btn" onClick={() => enterMode('living-world')}>
            GO THROUGH
          </button>
        </div>
      </div>

      {sessionNote && (
        <p className="t-mono t-mono-xs pt-session" role="status">
          {sessionNote}
        </p>
      )}

      <p className="t-mono t-mono-xs t-faint pt-hint">
        {tier === 'flat'
          ? 'THE APERTURE IS COMPOSED AND STILL — THE PORTAL IS STILL A PORTAL'
          : coarse
            ? 'TILT OR DRAG TO LOOK THROUGH'
            : 'MOVE TO LOOK THROUGH'}
      </p>
    </div>
  );
}
