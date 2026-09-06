import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { setPointerIntent } from '../../core/pointer';
import { METHOD, SERVICES } from '../../content/canonical';
import { MATERIALS } from '../../design-system/materials';
import { disorder, misplaced } from '../../spatial/noiseOrder';
import './chaos.css';

/**
 * CHAOS — DO NOT PRESS.
 *
 * The Lab proving it understands its own structure well enough to take it apart
 * and put it back exactly. Ten stages, escalating; then silence; then a
 * reconstruction that has to be better than the destruction.
 *
 * **The destruction is theatrical.** Nothing here mutates application state,
 * canonical content, the DOM outside this mode, or any shared module. What is
 * being thrown around is an *isolated copy* — a local array of fragments
 * rendered by this component and thrown away on exit. The real launcher, index
 * and every other reality are untouched the whole time, which is the entire
 * point of the piece: the visible failure is a performance, and underneath it
 * the architecture never moves.
 *
 * The physics is fifty lines of Verlet integration in this file. A physics
 * library was considered and rejected: one falling-text sequence does not
 * justify a dependency, and this needs gravity, a floor and restitution, which
 * is all of it.
 *
 * **Escape works at every stage, including maximum chaos** — the key handler is
 * the mode host's, it is never intercepted here, and no stage disables input.
 */

const STAGES = [
  { n: '01', name: 'REGISTRATION SLIPS', note: 'The plates stop agreeing.' },
  { n: '02', name: 'BASELINE LOST', note: 'Type forgets what it was sitting on.' },
  { n: '03', name: 'GRAVITY', note: 'Down becomes a direction.' },
  { n: '04', name: 'TAXONOMY DRIFT', note: 'Every category is still correct. None of them is where it belongs.' },
  { n: '05', name: 'MATERIAL MISMATCH', note: 'Paper behaves like ink. Ink behaves like structure.' },
  { n: '06', name: 'HIERARCHY COLLAPSES', note: 'Everything is the same size now.' },
  { n: '07', name: 'THE WORLD FRAGMENTS', note: 'Structure stops being load-bearing.' },
  { n: '08', name: 'NEAR-TOTAL FAILURE', note: 'Almost nothing is legible.' },
  { n: '09', name: 'SILENCE', note: '' },
  { n: '10', name: 'RECONSTRUCTION', note: 'Every piece back where it began.' },
];

/**
 * The fragments — the actual system, not a list of words that resemble it.
 *
 * This was a hand-typed array, and it still contained ABSORB · CLARIFY ·
 * BLUEPRINT · ASSEMBLE · SUSTAIN: the method from a printed deck the company
 * stopped using, surviving here because nobody looks for a data dependency in
 * a pile of falling type. Two realities were still printing it (After Dark had
 * the other copy).
 *
 * Derived now, from the three things the Lab actually claims to be made of:
 * the canonical method, the canonical service taxonomy, and the material
 * vocabulary. The mode's premise — that the system can survive being taken
 * apart because its structure is understood — only means something if what
 * comes apart is the structure rather than a souvenir of it.
 *
 * Each fragment carries its register, because the taxonomy stage needs to be
 * able to put a thing in the wrong one and have that be legible as wrong.
 */
interface Fragment {
  word: string;
  register: 'METHOD' | 'SERVICE' | 'MATERIAL';
}

const FRAGMENTS: Fragment[] = [
  { word: 'HI ANZY', register: 'MATERIAL' },
  ...METHOD.map((m) => ({ word: m.label, register: 'METHOD' as const })),
  ...SERVICES.slice(0, 6).map((c) => ({ word: c.label.split(/[,&]/)[0].trim().toUpperCase(), register: 'SERVICE' as const })),
  ...Object.keys(MATERIALS).slice(0, 8).map((m) => ({ word: m, register: 'MATERIAL' as const })),
];

const WORDS = FRAGMENTS.map((f) => f.word);

interface Body {
  /** Home — where the fragment belongs, in fractions of the viewport. */
  hx: number;
  hy: number;
  /** Current and previous position, in pixels. Verlet needs both. */
  x: number;
  y: number;
  px: number;
  py: number;
  rot: number;
  prot: number;
  w: number;
  h: number;
  size: number;
  word: string;
  weight: number;
}

const DURATIONS = [2.2, 2.4, 3.0, 3.4, 2.8, 2.6, 3.2, 3.0, 2.4, 5.0];
const TOTAL = DURATIONS.reduce((a, b) => a + b, 0);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export default function ChaosMode({ onReady, scope }: ModeViewProps) {
  const reduced = useReducedMotion();

  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);
  // Coarse, for the progress rule. The clock itself stays in a ref.
  const [prog, setProg] = useState(0);

  const fieldRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<(HTMLSpanElement | null)[]>([]);
  const bodiesRef = useRef<Body[]>([]);
  const clock = useRef(0);

  const bodies = useMemo(() => {
    const r = rng(0xc4a05);
    return WORDS.map((word, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const size = i === 0 ? 3.4 : 0.9 + r() * 1.1;
      return {
        hx: 0.1 + col * 0.2 + (r() - 0.5) * 0.03,
        hy: 0.22 + row * 0.17,
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        rot: 0,
        prot: 0,
        w: 0,
        h: 0,
        size,
        word,
        weight: 0.7 + size * 0.35,
      } satisfies Body;
    });
  }, []);

  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 130 : 420,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- the performance ----------------------------------------------------- */
  const begin = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    bodiesRef.current = bodies.map((b, i) => {
      const el = nodesRef.current[i];
      const w = el?.offsetWidth ?? 80;
      const h = el?.offsetHeight ?? 24;
      const x = b.hx * rect.width;
      const y = b.hy * rect.height;
      return { ...b, x, y, px: x, py: y, rot: 0, prot: 0, w, h };
    });
    clock.current = 0;
    setProg(0);
    setStage(0);
    setDone(false);
    setRunning(true);
  }, [bodies]);

  useEffect(() => {
    if (!running) return;
    const field = fieldRef.current;
    if (!field) return;

    const r = rng(0x51de);
    const startedAt = performance.now();
    const stop = onFrame((dtms) => {
      // Two different times, deliberately.
      //
      // The performance clock is WALL TIME, read straight from the clock — not
      // accumulated frame deltas. `core/raf` clamps dt to 64ms so a tab-restore
      // spike cannot teleport an animation, which is right for physics and
      // wrong for a timed piece: on any machine dropping frames, a ten-stage
      // sequence built from clamped deltas quietly runs in slow motion.
      //
      // The physics step keeps the clamp, because a long frame fed into Verlet
      // integration does not slow the simulation down — it detonates it.
      clock.current = (performance.now() - startedAt) / 1000;
      const dt = Math.min(dtms, 42) / 1000;

      // Which stage the performance is in.
      let acc = 0;
      let st = 0;
      for (let i = 0; i < DURATIONS.length; i++) {
        if (clock.current >= acc) st = i;
        acc += DURATIONS[i];
      }
      setStage((prev) => (prev === st ? prev : st));
      const p = Math.round((clock.current / TOTAL) * 50) / 50;
      setProg((prev) => (prev === p ? prev : p));

      if (clock.current >= TOTAL) {
        setRunning(false);
        setDone(true);
        return;
      }

      const rect = field.getBoundingClientRect();
      const floor = rect.height - 8;
      const list = bodiesRef.current;

      // Stage 10 is not "chaos with less force". It is a separate law: every
      // body is pulled home, exactly, and lands there.
      //
      // Reduced motion holds every body at home for the whole performance: the
      // ten stages still run, are still announced, and the type still loses and
      // regains its contrast — what is removed is being thrown across a screen,
      // which is the part that actually causes harm.
      const reconstructing = st >= 9 || reduced;

      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const el = nodesRef.current[i];
        if (!el) continue;

        if (reconstructing) {
          const hx = b.hx * rect.width;
          const hy = b.hy * rect.height;
          const k = 1 - Math.pow(0.0016, dt);
          b.x += (hx - b.x) * k;
          b.y += (hy - b.y) * k;
          b.px = b.x;
          b.py = b.y;
          b.rot += (0 - b.rot) * k;
          b.prot = b.rot;
        } else {
          // Verlet. Velocity is implied by the gap between now and last frame.
          const vx = (b.x - b.px) * 0.992;
          const vy = (b.y - b.py) * 0.992;
          const vr = (b.rot - b.prot) * 0.985;
          b.px = b.x;
          b.py = b.y;
          b.prot = b.rot;

          // Gravity arrives at stage 03 and never leaves.
          const g = st >= 2 ? 1750 * dt * dt : 0;
          // Stage 05 detaches things sideways; 07 shakes the whole field.
          const kick =
            st >= 6 ? (r() - 0.5) * 260 * dt : st >= 4 ? (r() - 0.5) * 90 * dt : 0;

          b.x += vx + kick;
          b.y += vy + g / b.weight;
          b.rot += vr + (st >= 1 ? (r() - 0.5) * 0.02 * st : 0);

          // Floor and walls, with restitution. This is the whole physics.
          if (b.y + b.h > floor) {
            b.y = floor - b.h;
            b.py = b.y + vy * 0.42;
            b.rot += vx * 0.0022;
          }
          if (b.x < 0) {
            b.x = 0;
            b.px = b.x + vx * 0.5;
          }
          if (b.x + b.w > rect.width) {
            b.x = rect.width - b.w;
            b.px = b.x + vx * 0.5;
          }

          // Stage 04: the pieces discover each other. One separation pass —
          // enough to read as collision, cheap enough to stay honest.
          if (st >= 3) {
            for (let j = i + 1; j < list.length; j++) {
              const o = list[j];
              const dx = o.x - b.x;
              const dy = o.y - b.y;
              const ox = (b.w + o.w) / 2 - Math.abs(dx + (o.w - b.w) / 2);
              const oy = (b.h + o.h) / 2 - Math.abs(dy + (o.h - b.h) / 2);
              if (ox > 0 && oy > 0 && oy < 26) {
                const push = Math.min(oy, 4) * 0.5;
                b.y -= push;
                o.y += push;
              }
            }
          }
        }

        // Written straight to the element. No React state per frame, ever.
        el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) rotate(${b.rot}rad)`;
      }
    });
    scope.add(stop);
    return stop;
  }, [running, reduced, scope]);

  const current = STAGES[stage];

  /*
   * NOISE_ORDER, driving presentation only.
   *
   * The disorder ramps in over the taxonomy and material stages and is gone
   * again by the reconstruction. Two things read it, and neither of them
   * touches data:
   *
   *   `misplaced` decides which register's word a slot shows — so at stage 04
   *   every category on screen is still a real category and not one of them is
   *   where it belongs, which is a far more unsettling failure than a word
   *   being wrong.
   *
   *   `disorder` supplies the resting offset before the physics takes over and
   *   after it hands back. `disorder(i, 0)` returns a shared frozen zero, so
   *   the reconstructed state is not "animated close to home" — it is the
   *   identity the function returns when there is no disorder left.
   */
  const noise = !running || stage >= 9 ? 0 : Math.max(0, Math.min(1, (stage - 2) / 5));

  return (
    <div className="ch" data-armed={armed ? 'true' : 'false'} data-stage={stage} data-running={running ? 'true' : 'false'}>
      <div className="ch-field" ref={fieldRef} aria-hidden="true">
        {bodies.map((b, i) => (
          <span
            key={b.word}
            className="t-display ch-frag"
            data-lead={i === 0 ? 'true' : 'false'}
            /* At stage 05 a fragment is drawn in another register's material.
               The word is still true; what it is made of is not. */
            data-register={
              noise > 0
                ? FRAGMENTS[misplaced(i, noise, FRAGMENTS.length)].register
                : FRAGMENTS[i].register
            }
            ref={(el) => {
              nodesRef.current[i] = el;
            }}
            style={{
              fontSize: `${b.size}rem`,
              transform: running
                ? undefined
                : (() => {
                    // Exactly home when there is no disorder — the identity
                    // case, not a small number that rounds to it.
                    const d = disorder(i, 0);
                    return `translate3d(calc(${b.hx * 100}% + ${d.x}px), calc(${b.hy * 100}% + ${d.y}px), 0) rotate(${d.rotate}deg)`;
                  })(),
              left: running ? 0 : undefined,
              top: running ? 0 : undefined,
            }}
          >
            {noise > 0 ? WORDS[misplaced(i, noise, WORDS.length)] : b.word}
          </span>
        ))}
      </div>

      <header className="ch-head">
        <h1 className="t-mono t-mono-xs ch-head__title" role="status" aria-live="polite">
          <span className="t-signal">CHAOS</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">
            {running ? `${current.n} ${current.name}` : done ? 'RECONSTRUCTED' : 'DO NOT PRESS.'}
          </span>
        </h1>
        {running && current.note && (
          <p className="t-body-s t-dim ch-head__note">{current.note}</p>
        )}
      </header>

      {!running && !done && (
        <div className="ch-gate">
          <p className="t-mono t-mono-xs t-faint ch-gate__note">
            Nothing below is real destruction. The pieces are a copy this reality owns; the
            launcher, the index and every other reality are untouched throughout, and Escape
            works at every stage.
          </p>
          <button type="button" className="ch-press" onClick={begin}>
            DO NOT PRESS
          </button>
        </div>
      )}

      {done && (
        <div className="ch-end">
          <p className="t-display t-display-m ch-end__line">
            WE BREAK THINGS DELIBERATELY
            <br />
            SO THEY DO NOT BREAK BY THEMSELVES.
          </p>
          <button type="button" className="ch-btn" onClick={begin}>
            AGAIN
          </button>
        </div>
      )}

      {running && (
        <div
          className="ch-progress"
          role="progressbar"
          aria-label="Failure sequence"
          aria-valuemin={0}
          aria-valuemax={STAGES.length}
          aria-valuenow={stage + 1}
          aria-valuetext={`Stage ${stage + 1} of ${STAGES.length}: ${current.name}`}
        >
          <span
            className="ch-progress__fill"
            style={{ transform: `scaleX(${Math.min(1, prog)})` }}
          />
        </div>
      )}

      <p className="t-mono t-mono-xs t-faint ch-esc">ESC ALWAYS WORKS</p>
    </div>
  );
}
