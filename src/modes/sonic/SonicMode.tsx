import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCoarsePointer, useLatest, useMediaQuery, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { setPointerIntent } from '../../core/pointer';
import { useAudio } from '../../audio/useAudio';
import {
  degreeIndex,
  FAMILIES,
  FAMILY_NOTE,
  SCALE,
  SCALE_NAMES,
  play,
  type Family,
} from '../../audio/voices';
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
 *
 * ── PHASE 6: IT HAD TO STOP BEING A BAR CHART ───────────────────────────────
 *
 * All of the above was true before this phase and the mode still read as a row
 * of coloured bars, because that is what it was drawn as. The thesis says
 * architecture; the drawing said chart. Four changes, all of them borrowed from
 * how an elevation is actually drawn, and none of them WebGL:
 *
 *   DATUM LINES   Nine levels ruled across the whole field, each labelled with
 *                 the note a bay reaching it will sound. Height stops being a
 *                 quantity and becomes a storey you can name.
 *   COURSING      A bay of seven draws seven courses. A solid block is a bar; a
 *                 subdivided one is a building, and the subdivision is the
 *                 quantisation the audio is already doing.
 *   HATCH         Materials are drawn as hatches rather than flat tones —
 *                 poché, the convention every section drawing uses to say what
 *                 something is made of. Six fills that differ in *pattern*
 *                 survive being small, printed, or seen by someone who cannot
 *                 separate the hues.
 *   SECTION CUT   The bay the playhead is on is drawn cut: heavy outline, solid
 *                 poché. One device doing two jobs — it is the drawing
 *                 convention for "we are looking through here", and it is also
 *                 the bay that is sounding.
 *
 * The mobile instrument is a different drawing, not this one shrunk. See
 * `sonic.css` — the elevation turns on its side and becomes a section through
 * stacked floors, so the height axis gets the full width of the phone instead
 * of 21 pixels of it.
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
  /*
   * Below 900px the drawing turns ninety degrees and becomes a SECTION —
   * floors stacked down the page, height running across it. Not a preference:
   * on a 390px screen the elevation gives the height axis 21px per bay, which
   * is the entire musical range of the instrument squeezed into a thumbnail,
   * while the section hands that axis the full width of the phone.
   *
   * Same DOM, same bays, same audio. The drag axes swap and the CSS lays it on
   * its side, which is what "a different instrument rather than a cramped one"
   * has to mean if it is going to mean anything.
   */
  const section = narrow;

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

    /* One gesture, two orientations. In elevation the height is up the screen
       and the bay is across it; in section they are exactly swapped. */
    const heightFromEvent = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      const t = section ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height;
      return Math.round(Math.max(0, Math.min(1, t)) * MAX_H);
    };
    const bayFromEvent = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      const n = baysRef.current.length;
      const t = section ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
      return Math.max(0, Math.min(n - 1, Math.floor(t * n)));
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
  }, [setHeight, baysRef, section]);

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
      <div
        className="sn-field"
        ref={fieldRef}
        role="group"
        aria-label={section ? 'Section' : 'Elevation'}
        data-orientation={section ? 'section' : 'elevation'}
      >
        {/* Datum lines. Every level is named with the note a bay reaching it
            sounds — a measured value, which is why it is set in mono. */}
        <div className="sn-datums" aria-hidden="true">
          {Array.from({ length: MAX_H + 1 }, (_, level) => MAX_H - level).map((level) => (
            <div className="sn-datum" key={level}>
              <span className="t-mono t-mono-xs sn-datum__note">
                {level === 0 ? 'REST' : SCALE_NAMES[degreeIndex(level / MAX_H)]}
              </span>
              <span className="sn-datum__rule" />
            </div>
          ))}
        </div>

        {bays.map((bay, i) => (
          <div className="sn-bay" key={i} data-now={i === step ? 'true' : 'false'}>
            {/* What this bay will sound, printed at its head. In flow above the
                mass so it rides the roofline instead of being pinned to the
                baseline — the first version put every note on the ground. */}
            <span className="t-mono t-mono-xs sn-bay__note" aria-hidden="true">
              {bay.h === 0 ? '·' : SCALE_NAMES[degreeIndex(bay.h / MAX_H)]}
            </span>
            <button
              type="button"
              className="sn-bay__mass"
              /* One number, two axes: height in elevation, width in section.
                 The custom property is what the section stylesheet reads. */
              style={
                {
                  height: `${(bay.h / MAX_H) * 100}%`,
                  '--sn-len': `${(bay.h / MAX_H) * 100}%`,
                } as CSSProperties
              }
              data-family={bay.family}
              data-storeys={bay.h}
              onClick={(e) => {
                e.stopPropagation();
                cycleFamily(i);
              }}
              /* Dragging is a pointer gesture. The same two properties are on
                 the keyboard: arrows set the height, Enter cycles material. */
              onKeyDown={(e) => {
                /* Both axes are bound in both orientations. A keyboard visitor
                   should not have to know which way the drawing is turned. */
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  setHeight(i, bay.h + 1);
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setHeight(i, bay.h - 1);
                }
              }}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={MAX_H}
              aria-valuenow={bay.h}
              aria-valuetext={`Height ${bay.h} of ${MAX_H}, material ${bay.family}`}
              aria-label={`Bay ${i + 1}. ${
                section ? 'Left and right arrows' : 'Up and down arrows'
              } set height; Enter changes material.`}
            >
              {/* Coursing: one rule per storey. A block is a bar; a coursed
                  block is a building, and the courses are the quantisation the
                  audio already performs. */}
              <span className="sn-bay__courses" aria-hidden="true">
                {Array.from({ length: bay.h }, (_, c) => (
                  <span className="sn-bay__course" key={c} />
                ))}
              </span>
              <span className="t-mono sn-bay__label">{bay.family.slice(0, 2)}</span>
            </button>
            <span className="t-mono t-mono-xs sn-bay__n">{String(i + 1).padStart(2, '0')}</span>
          </div>
        ))}
        {/* Ground line, with earth hatched below it. An elevation that floats
            is a diagram; one that stands on something is a building. */}
        <span className="sn-ground" aria-hidden="true" />
        <span className="sn-earth" aria-hidden="true" />
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
            ? 'DRAG A FLOOR ACROSS TO SET ITS NOTE · TAP TO CHANGE MATERIAL'
            : 'DRAG TO BUILD · CLICK A MASS TO CHANGE MATERIAL · TAB THEN ↑ ↓ TO PLAY BY KEYBOARD'}
        </p>
        <p className="t-mono t-mono-xs t-faint sn-hint" aria-hidden="true">
          {section ? 'SECTION · SIXTEEN FLOORS BECOME EIGHT' : ''}
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
