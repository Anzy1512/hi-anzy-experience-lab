import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCoarsePointer, useLatest, useMediaQuery, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { setPointerIntent } from '../../core/pointer';
import { useAudio } from '../../audio/useAudio';
import { FAMILIES, FAMILY_NOTE, SCALE, play, type Family } from '../../audio/voices';
import './sonic.css';

/**
 * SONIC ARCHITECTURE — THE INTERFACE IS AN INSTRUMENT.
 *
 * The score is an **elevation**. Sixteen bays stand in a row; each has a height
 * and a material. A playhead crosses the elevation and every bay sounds as it
 * is passed:
 *
 *   height            → pitch, quantised to one scale, so it cannot be wrong
 *   horizontal place  → stereo pan
 *   height again      → distance, so tall bays are near and short ones are far,
 *                       which attenuates *and* dulls them the way distance does
 *   material          → which of the six voice families speaks
 *
 * The musical system is deliberately small: one scale (D minor pentatonic),
 * six timbres, sixteen positions. You cannot play a wrong note here, which is
 * what makes it an instrument rather than a noise generator.
 *
 * Nothing sounds until sound is switched on, and the whole graph is torn down
 * by the shared engine on exit.
 */

/**
 * Sixteen bays on a desk, eight on a phone.
 *
 * At 390px, sixteen bays are 21px wide — fine to drag across, too narrow to tap
 * accurately, and tapping is how the material changes. Fewer, wider bays is a
 * different instrument rather than a cramped one, which is the rule for mobile
 * everywhere else in this Lab.
 */
const DESK_BAYS = 16;
const TOUCH_BAYS = 8;
const MAX_H = 9;

interface Bay {
  h: number;
  family: Family;
}

/** An opening figure that already sounds like something, at either size. */
function initialBays(count: number): Bay[] {
  const shape = [4, 6, 3, 7, 2, 5, 8, 4, 6, 3, 7, 5, 2, 6, 4, 8];
  return Array.from({ length: count }, (_, i) => ({
    h: shape[i % shape.length],
    family: FAMILIES[i % FAMILIES.length],
  }));
}

const TEMPOS = [88, 112, 140];

export default function SonicMode({ onReady, scope }: ModeViewProps) {
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { state: audioState, scene, enable, muted, toggleMute } = useAudio(scope);

  const narrow = useMediaQuery('(max-width: 900px)');
  const bayCount = narrow || coarse ? TOUCH_BAYS : DESK_BAYS;

  const [bays, setBays] = useState<Bay[]>(() => initialBays(bayCount));

  // Crossing the breakpoint rebuilds the elevation at the other size. Adjusted
  // during render rather than in an effect, so the frame that reports the new
  // width is already drawing the right instrument.
  const [builtFor, setBuiltFor] = useState(bayCount);
  if (builtFor !== bayCount) {
    setBuiltFor(bayCount);
    setBays(initialBays(bayCount));
  }
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [tempo, setTempo] = useState(1);
  const [armed, setArmed] = useState(false);

  const acc = useRef(0);
  const stepRef = useRef(0);
  // Read by the playhead every beat without making it a dependency.
  const baysRef = useLatest(bays);
  const sceneRef = useLatest(scene);

  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 130 : 460,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- one voice per bay, as the playhead reaches it ---------------------- */
  const sound = useCallback((bay: Bay, i: number, count: number) => {
    const s = sceneRef.current;
    if (!s) return;
    const t = bay.h / MAX_H;
    play(s, bay.family, SCALE[Math.round(t * (SCALE.length - 1))], {
      level: 0.42 + t * 0.3,
      // Horizontal place is pan; height is nearness.
      pan: (i / Math.max(1, count - 1)) * 1.6 - 0.8,
      distance: 1 - t,
    });
  }, [sceneRef]);

  /* ---- the playhead ------------------------------------------------------- */
  useEffect(() => {
    if (!running) return;
    const stop = onFrame((dt) => {
      const beat = 60000 / TEMPOS[tempo] / 2;
      acc.current += dt;
      while (acc.current >= beat) {
        acc.current -= beat;
        const i = stepRef.current % baysRef.current.length;
        sound(baysRef.current[i], i, baysRef.current.length);
        setStep(i);
        stepRef.current = (i + 1) % bayCount;
      }
    });
    scope.add(stop);
    return stop;
  }, [running, tempo, sound, scope, baysRef, bayCount]);

  const toggleRun = useCallback(async () => {
    if (audioState !== 'on') {
      const ok = await enable();
      if (!ok) return;
    }
    setRunning((r) => {
      if (r) setStep(-1);
      return !r;
    });
  }, [audioState, enable]);

  /* ---- building the elevation --------------------------------------------- */
  const setHeight = useCallback(
    (i: number, h: number) => {
      const clamped = Math.max(0, Math.min(MAX_H, h));
      setBays((prev) => {
        if (prev[i].h === clamped) return prev;
        const next = [...prev];
        next[i] = { ...next[i], h: clamped };
        return next;
      });
      if (!running) sound({ ...baysRef.current[i], h: clamped }, i, baysRef.current.length);
    },
    [running, sound, baysRef],
  );

  const cycleFamily = useCallback(
    (i: number) => {
      setBays((prev) => {
        const next = [...prev];
        const at = FAMILIES.indexOf(next[i].family);
        next[i] = { ...next[i], family: FAMILIES[(at + 1) % FAMILIES.length] };
        if (!running) sound(next[i], i, next.length);
        return next;
      });
    },
    [running, sound],
  );

  const fieldRef = useRef<HTMLDivElement>(null);

  /* ---- drag a bay to its height. Touch and pointer, same code. ------------ */
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    let active = -1;

    const heightFromEvent = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      const t = 1 - (e.clientY - r.top) / r.height;
      return Math.round(Math.max(0, Math.min(1, t)) * MAX_H);
    };
    const bayFromEvent = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      const n = baysRef.current.length;
      return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    };

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      active = bayFromEvent(e);
      field.setPointerCapture(e.pointerId);
      setHeight(active, heightFromEvent(e));
    };
    const move = (e: PointerEvent) => {
      if (active < 0) return;
      setHeight(bayFromEvent(e), heightFromEvent(e));
    };
    const up = (e: PointerEvent) => {
      if (active < 0) return;
      active = -1;
      field.releasePointerCapture?.(e.pointerId);
    };

    field.addEventListener('pointerdown', down);
    field.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      field.removeEventListener('pointerdown', down);
      field.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [setHeight, baysRef]);

  return (
    <div className="sn" data-armed={armed ? 'true' : 'false'}>
      <header className="sn-head">
        <h1 className="t-mono t-mono-xs sn-head__title">
          <span className="t-signal">SONIC ARCHITECTURE</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">THE INTERFACE IS AN INSTRUMENT.</span>
        </h1>
      </header>

      {/* ---- the elevation ------------------------------------------------ */}
      <div className="sn-field" ref={fieldRef} role="group" aria-label="Elevation">
        {bays.map((bay, i) => (
          <div className="sn-bay" key={i} data-now={i === step ? 'true' : 'false'}>
            <button
              type="button"
              className="sn-bay__mass"
              style={{ height: `${(bay.h / MAX_H) * 100}%` }}
              data-family={bay.family}
              onClick={(e) => {
                e.stopPropagation();
                cycleFamily(i);
              }}
              /* Dragging is a pointer gesture. The same two properties are on
                 the keyboard: arrows set the height, Enter cycles material. */
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHeight(i, bay.h + 1);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHeight(i, bay.h - 1);
                }
              }}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={MAX_H}
              aria-valuenow={bay.h}
              aria-valuetext={`Height ${bay.h} of ${MAX_H}, material ${bay.family}`}
              aria-label={`Bay ${i + 1}. Up and down arrows set height; Enter changes material.`}
            >
              <span className="t-mono sn-bay__label">{bay.family.slice(0, 2)}</span>
            </button>
            <span className="t-mono t-mono-xs sn-bay__n">{String(i + 1).padStart(2, '0')}</span>
          </div>
        ))}
        {/* Ground line — the elevation stands on the sheet's own rule. */}
        <span className="sn-ground" aria-hidden="true" />
      </div>

      {/* ---- the instrument's controls ------------------------------------ */}
      <div className="sn-strip">
        <button type="button" className="sn-btn sn-btn--signal" onClick={() => void toggleRun()}>
          {running ? 'STOP' : audioState === 'on' ? 'RUN' : 'SOUND ON · RUN'}
        </button>
        {audioState === 'on' && (
          <button type="button" className="sn-btn" onClick={toggleMute} aria-pressed={muted}>
            {muted ? 'UNMUTE' : 'MUTE'}
          </button>
        )}
        <div className="sn-tempo">
          <span className="t-mono t-mono-xs t-faint">TEMPO</span>
          <div className="sn-tempo__row">
            {TEMPOS.map((bpm, n) => (
              <button
                key={bpm}
                type="button"
                className="sn-btn sn-btn--tiny"
                data-on={tempo === n ? 'true' : 'false'}
                onClick={() => setTempo(n)}
              >
                {bpm}
              </button>
            ))}
          </div>
        </div>

        <dl className="sn-legend">
          {FAMILIES.map((f) => (
            <div key={f}>
              <dt data-family={f}>{f}</dt>
              <dd>{FAMILY_NOTE[f]}</dd>
            </div>
          ))}
        </dl>

        <p className="t-mono t-mono-xs t-faint sn-hint">
          {coarse
            ? 'DRAG A BAY UP · TAP ITS MASS TO CHANGE MATERIAL'
            : 'DRAG TO BUILD · CLICK A MASS TO CHANGE MATERIAL · TAB THEN ↑ ↓ TO PLAY BY KEYBOARD'}
        </p>
      </div>

      {audioState !== 'on' && (
        <p className="t-mono t-mono-xs t-faint sn-silent" role="status">
          SILENT UNTIL YOU SWITCH SOUND ON. NOTHING IS PLAYING.
        </p>
      )}
    </div>
  );
}
