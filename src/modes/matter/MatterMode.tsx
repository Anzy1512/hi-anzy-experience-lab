import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { detectWebGPU } from '../../core/capability';
import { spatialQuality } from '../../spatial/quality';
import { SpatialCanvas } from '../../spatial/SpatialCanvas';
import { clamp01, damp, lerp } from '../../spatial/projection';
import { ParticleField } from './ParticleField';
import {
  STATE_LABEL,
  STATE_NOTE,
  STATE_ORDER,
  type MatterState,
} from './targets';
import './matter.css';

/**
 * MATTER ENGINE — CONTROL DIGITAL MATTER.
 *
 * The interface stops being paper and becomes material. Matter is never
 * decorative and never random: every particle is always travelling between two
 * **authored formations**, and every formation is something the Lab has already
 * said — the sheet, the wordmark, the Compiler's planes, the specimen's contour
 * field.
 *
 * Continuous rendering is genuine here, so this is the one mode that opts into
 * `frameloop="always"`. It takes on the corresponding duty: the simulation stops
 * when the tab is hidden, and the canvas is torn down on exit.
 *
 * Particle counts come from measured capability, not from a number that sounded
 * impressive.
 */

const COUNTS: Record<string, number> = {
  ultra: 160000,
  high: 90000,
  balanced: 36000,
  lite: 0,
};

const SPREAD = 900;
const FORCE_LABEL = { attract: 'ATTRACT', repel: 'REPEL', off: 'OFF' } as const;
type ForceMode = keyof typeof FORCE_LABEL;

export default function MatterMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const quality = useMemo(() => spatialQuality(capability), [capability]);

  const count = COUNTS[quality.profile] ?? 0;
  const webgpu = useMemo(() => detectWebGPU(), []);

  const [state, setState] = useState<MatterState>('dust');
  const [previous, setPrevious] = useState<MatterState>('dust');
  const [force, setForce] = useState<ForceMode>('off');
  const [glFailed, setGlFailed] = useState(false);
  const [armed, setArmed] = useState(false);
  const [hidden, setHidden] = useState(false);

  const progressRef = useRef(1);
  const forceRef = useRef({ x: 0, y: 0, sign: 0 });
  const rootRef = useRef<HTMLDivElement>(null);

  const active = quality.webgl && count > 0 && !glFailed;

  /* ---- transition + pointer force ---------------------------------------- */
  useEffect(() => {
    const stop = onFrame((dt) => {
      // Reduced motion goes straight to the formation: discrete states, no travel.
      progressRef.current = reduced
        ? 1
        : clamp01(progressRef.current + dt / 1400);

      const f = forceRef.current;
      if (force === 'off' || coarse === undefined) {
        f.sign = lerp(f.sign, 0, damp(0.02, dt));
      } else {
        f.sign = lerp(f.sign, force === 'attract' ? -1 : 1, damp(0.02, dt));
      }
      // Pointer → world space. The camera looks down −z from `cameraDistance`,
      // so screen centre is world origin and one pixel is one unit at z = 0.
      f.x = (pointer.sx - capability.viewport.w / 2) * 1.0;
      f.y = -(pointer.sy - capability.viewport.h / 2) * 1.0;
    });
    scope.add(stop);
    return stop;
  }, [reduced, force, coarse, capability.viewport.w, capability.viewport.h, scope]);

  /* ---- state changes ------------------------------------------------------ */
  const goTo = useCallback(
    (next: MatterState) => {
      setPrevious((p) => (next === p ? p : stateRef.current));
      stateRef.current = next;
      setState(next);
      progressRef.current = reduced ? 1 : 0;
    },
    [reduced],
  );
  const stateRef = useRef<MatterState>('dust');

  /* ---- entry --------------------------------------------------------------- */
  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(() => {
      setArmed(true);
      onReady();
      // Arrive as dust, then take the first authored step on its own.
      if (!reduced) window.setTimeout(() => goTo('field'), 900);
    }, reduced ? 160 : 700);
    return () => window.clearTimeout(id);
  }, [onReady, reduced, goTo]);

  /* ---- stop simulating when nobody is looking ----------------------------- */
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    onVis();
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ---- keyboard ------------------------------------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= STATE_ORDER.length) {
        e.preventDefault();
        goTo(STATE_ORDER[n - 1]);
      } else if (e.key.toLowerCase() === 'a') setForce('attract');
      else if (e.key.toLowerCase() === 'r') setForce('repel');
      else if (e.key.toLowerCase() === 'o') setForce('off');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  /* ---- touch: hold to attract --------------------------------------------- */
  useEffect(() => {
    if (!coarse) return;
    const root = rootRef.current;
    if (!root) return;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      setForce('attract');
      forceRef.current.x = e.clientX - capability.viewport.w / 2;
      forceRef.current.y = -(e.clientY - capability.viewport.h / 2);
    };
    const move = (e: PointerEvent) => {
      forceRef.current.x = e.clientX - capability.viewport.w / 2;
      forceRef.current.y = -(e.clientY - capability.viewport.h / 2);
    };
    const up = () => setForce('off');
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    return () => {
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [coarse, capability.viewport.w, capability.viewport.h]);

  const onGlFailure = useCallback((reason: string) => {
    console.warn('[lab] matter engine WebGL unavailable:', reason);
    setGlFailed(true);
  }, []);

  return (
    <div className="mx" ref={rootRef} data-armed={armed ? 'true' : 'false'}>
      {active ? (
        <div className="mx-canvas">
          <SpatialCanvas
            quality={quality}
            viewport={capability.viewport}
            // The one mode that genuinely evolves every frame — and that stops
            // dead when the tab is hidden.
            frameloop={hidden ? 'demand' : 'always'}
            onFailure={onGlFailure}
          >
            <ParticleField
              count={count}
              state={state}
              previous={previous}
              progressRef={progressRef}
              forceRef={forceRef}
              spread={SPREAD}
              reduced={reduced}
            />
          </SpatialCanvas>
        </div>
      ) : (
        <MatterFallback state={state} />
      )}

      <div className="mx-band">
        <header className="mx-band__head">
          <h2 className="t-display t-display-m mx-title">MATTER ENGINE</h2>
          <p className="t-mono t-mono-xs t-dim mx-tag">CONTROL DIGITAL MATTER.</p>
        </header>

        <div className="mx-band__mid">
          <p className="t-mono t-mono-xs mx-now" role="status">
            <span className="t-signal">{STATE_LABEL[state]}</span>
          </p>
          <p className="t-body-s t-dim mx-note">{STATE_NOTE[state]}</p>
        </div>

        <dl className="mx-readout">
          <div>
            <dt>PARTICLES</dt>
            <dd>{active ? count.toLocaleString('en') : '—'}</dd>
          </div>
          <div>
            <dt>PROFILE</dt>
            <dd>{quality.profile.toUpperCase()}</dd>
          </div>
          <div>
            <dt>WEBGPU</dt>
            {/* Reported, not used. Saying so is the honest version. */}
            <dd className="t-faint">{webgpu ? 'PRESENT · UNUSED' : 'ABSENT'}</dd>
          </div>
          <div>
            <dt>DRAW</dt>
            <dd>{active ? '1 CALL' : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="mx-strip" data-disabled={!armed}>
        <div className="mx-strip__group">
          <span className="t-mono t-mono-xs t-faint mx-strip__label">STATE</span>
          <div className="mx-strip__row">
            {STATE_ORDER.map((s, i) => (
              <button
                key={s}
                type="button"
                className="mx-btn t-mono t-mono-xs"
                data-on={state === s ? 'true' : 'false'}
                aria-pressed={state === s}
                onClick={() => goTo(s)}
                onPointerEnter={() => setPointerIntent('discover')}
                onPointerLeave={() => setPointerIntent('default')}
              >
                {STATE_LABEL[s]}
                <span className="mx-btn__key t-faint">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mx-strip__group">
          <span className="t-mono t-mono-xs t-faint mx-strip__label">FORCE</span>
          <div className="mx-strip__row">
            {(Object.keys(FORCE_LABEL) as ForceMode[]).map((f) => (
              <button
                key={f}
                type="button"
                className="mx-btn t-mono t-mono-xs"
                data-on={force === f ? 'true' : 'false'}
                aria-pressed={force === f}
                onClick={() => setForce(f)}
              >
                {FORCE_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-strip__group">
          <span className="t-mono t-mono-xs t-faint mx-strip__label">SET</span>
          <div className="mx-strip__row">
            <button
              type="button"
              className="mx-btn t-mono t-mono-xs"
              onClick={() => {
                setForce('off');
                goTo('dust');
              }}
            >
              RESET
            </button>
          </div>
        </div>

        <p className="t-mono t-mono-xs t-faint mx-hint">
          {coarse ? 'HOLD TO PULL MATTER · TAP A STATE' : 'MOVE TO SHAPE · 1–6 STATES · A/R/O FORCE'}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* No WebGL — the states still exist, as a printed plate                        */
/* -------------------------------------------------------------------------- */
function MatterFallback({ state }: { state: MatterState }) {
  return (
    <div className="mx-fallback">
      <p className="t-mono t-mono-xs mx-fallback__note">
        THIS FIELD NEEDS WEBGL, WHICH IS UNAVAILABLE HERE. THE MATERIAL STATES ARE LISTED BELOW.
      </p>
      <ol className="mx-fallback__list">
        {STATE_ORDER.map((s, i) => (
          <li key={s} data-on={s === state ? 'true' : 'false'}>
            <span className="t-mono t-mono-xs mx-fallback__n">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="t-display t-display-s">{STATE_LABEL[s]}</span>
            <span className="t-body-s t-dim">{STATE_NOTE[s]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
