import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { METHOD } from '../../content/canonical';
import { useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { setPointerIntent } from '../../core/pointer';
import { useAudio } from '../../audio/useAudio';
import { bed, degree, play } from '../../audio/voices';
import { pointer } from '../../core/pointer';
import { HalftoneField, type LampPosition } from './HalftoneField';
import './afterdark.css';

/**
 * AFTER DARK — THE LAB, UNATTENDED.
 *
 * The cultural side of the universe, and the one mode that changes stock: the
 * sheet becomes **black paper**, orange becomes a **sodium** light rather than a
 * signal mark, halftone becomes grain, and registration becomes a stage lamp
 * sweeping across a poster wall.
 *
 * What it is not: a purple nightclub site, neon cyberpunk, or a music
 * visualiser. It is poster culture — big type, cheap stock, one colour, printed
 * to be seen at night from across a road.
 *
 * **Nothing here fabricates an event.** There are no venues, no line-ups, no
 * dates and no artists, because the Lab has none to report. The posters are the
 * Lab's own vocabulary set as posters, which is the only honest version of
 * "night culture" this product can print.
 */

interface Poster {
  kicker: string;
  lines: string[];
  foot: string;
  /** Which of the three poster layouts. */
  layout: 'stack' | 'split' | 'block';
}

const POSTERS: Poster[] = [
  {
    kicker: 'AFTER HOURS',
    lines: ['THE', 'SYSTEM', 'KEEPS', 'RUNNING'],
    foot: 'NO ONE IS WATCHING · THE GRID STILL HOLDS',
    layout: 'stack',
  },
  {
    kicker: 'NIGHT PLATE',
    lines: ['BLACK', 'STOCK'],
    foot: 'ONE COLOUR · SODIUM · PRINTED TO BE READ FROM A ROAD',
    layout: 'split',
  },
  {
    kicker: 'CULTURE',
    lines: ['A ROOM', 'IS NOT', 'A CHANNEL'],
    foot: 'MUSIC · GAMING · FESTIVALS · ON-GROUND',
    layout: 'block',
  },
  {
    /* This poster was still printing ABSORB · CLARIFY · BLUEPRINT · ASSEMBLE ·
       SUSTAIN — the method from an older printed deck. Phase 5.5 replaced that
       with the company's real sequence across five realities and missed this
       one, because a poster is not where anybody looks for a data dependency.
       It is the canonical method now, and it comes from `canonical.METHOD`
       rather than from a second copy typed here. */
    kicker: 'THE METHOD, LATE',
    lines: [METHOD[0].label, METHOD[1].label, METHOD[2].label],
    foot: `${METHOD[3].label} · ${METHOD[4].label}`,
    layout: 'stack',
  },
  {
    kicker: 'UNATTENDED',
    lines: ['REGISTRATION', 'IN', 'TOLERANCE'],
    foot: 'THE MARKS STILL LINE UP AT 04:00',
    layout: 'split',
  },
  {
    kicker: 'NOTICE',
    lines: ['NO DATE.', 'NO VENUE.', 'NO LINE-UP.'],
    foot: 'THIS IS A POSTER FOR A SYSTEM, NOT AN EVENT',
    layout: 'block',
  },
];

const HOLD_MS = 7200;
/** How long the visitor keeps the lamp after they stop moving. */
const HOLD_LAMP_MS = 2000;

export default function AfterDarkMode({ onReady, scope }: ModeViewProps) {
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { state: audioState, scene, enable, muted, toggleMute } = useAudio(scope);

  const [armed, setArmed] = useState(false);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  const lampRef = useRef<HTMLDivElement>(null);
  const stopBed = useRef<(() => void) | null>(null);

  /*
   * Where the light is, 0..1 in each axis.
   *
   * A ref rather than state: the halftone reads it every frame and the posters
   * must never re-render because a lamp moved. It starts at centre so the wall
   * is lit before anybody touches anything — the studio is closed, but the
   * light is still on.
   */
  const lamp = useRef<LampPosition>({ x: 0.5, y: 0.46 });
  /*
   * When the visitor last moved. `held` is derived from this inside the frame
   * callback rather than kept in state.
   *
   * The first version bound the lamp to pointer enter/leave on the whole mode,
   * which meant the light was "held" whenever the mouse happened to be in the
   * window — i.e. permanently, on any desktop. That is not somebody picking up
   * a lamp; that is the pointer existing. Movement is the signal: while the
   * visitor is moving they have the light, and two seconds after they stop the
   * wall goes back to sweeping on its own, which is the mode's whole premise.
   */
  const lastMove = useRef(0);

  const poster = POSTERS[i % POSTERS.length];

  const advance = useCallback(() => {
    elapsed.current = 0;
    setI((n) => (n + 1) % POSTERS.length);
  }, []);

  useEffect(() => {
    setPointerIntent('scan');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 140 : 560,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- the wall turns over on its own. It is unattended, after all. ------- */
  useEffect(() => {
    const stop = onFrame((dt) => {
      if (paused) return;
      elapsed.current += dt;
      if (elapsed.current >= HOLD_MS) advance();

      /*
       * The lamp.
       *
       * Unattended, it sweeps on its own — that is the mode's premise and it
       * has to keep being true when nobody is there. The moment a pointer is
       * over the wall the visitor is holding the light instead, and the sweep
       * hands over rather than fighting it. Written straight to custom
       * properties and to a ref, so neither the posters nor the halftone
       * re-render for a light that moved.
       */
      if (!reduced) {
        const held = performance.now() - lastMove.current < HOLD_LAMP_MS;
        if (held) {
          lamp.current.x = pointer.nx;
          lamp.current.y = pointer.ny;
        } else {
          const t = performance.now() / 9000;
          lamp.current.x = 0.5 + Math.sin(t) * 0.34;
          lamp.current.y = 0.46 + Math.cos(t * 0.73) * 0.22;
        }
        if (lampRef.current) {
          lampRef.current.style.setProperty('--lx', `${lamp.current.x * 100}%`);
          lampRef.current.style.setProperty('--ly', `${lamp.current.y * 100}%`);
        }
        if (rootRef.current) {
          rootRef.current.dataset.held = held ? 'true' : 'false';
        }
      }
    });
    scope.add(stop);
    return stop;
  }, [paused, advance, reduced, scope]);

  /* ---- sound: a room tone, and a strike as each poster lands ------------- */
  useEffect(() => {
    if (!scene) return;
    stopBed.current = bed(scene, degree(0.18), 0.1);
    return () => {
      stopBed.current?.();
      stopBed.current = null;
    };
  }, [scene]);

  useEffect(() => {
    if (!scene || !armed) return;
    play(scene, 'PAPER', degree(0.45 + (i % 4) * 0.1), { level: 0.5, pan: (i % 3) - 1 });
    play(scene, 'CULTURE', degree(0.2 + (i % 5) * 0.06), { level: 0.34, when: 0.1, distance: 0.35 });
  }, [i, scene, armed]);

  /* ---- interaction: tap the wall to turn it, space to hold ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  const grain = useMemo(() => grainDataUri(), []);

  return (
    <div
      className="ad"
      ref={rootRef}
      data-armed={armed ? 'true' : 'false'}
      data-paused={paused ? 'true' : 'false'}
      data-held="false"
      /* Moving is holding. Touch has no hover, so a finger down counts too. */
      onPointerMove={() => {
        lastMove.current = performance.now();
      }}
      onPointerDown={() => {
        lastMove.current = performance.now();
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        advance();
      }}
    >
      {/* THE HALFTONE. The stock itself, as a dot screen that opens under the
          light and closes away from it — HALFTONE_FIELD, running. */}
      <HalftoneField lampRef={lamp} scope={scope} reduced={reduced} />

      {/* Sodium lamp. One warm light on black stock, never a neon glow. */}
      <div className="ad-lamp" ref={lampRef} aria-hidden="true" />

      {/* Grain, not halftone. The night version of the same screen. */}
      <div className="ad-grain" style={{ backgroundImage: `url(${grain})` }} aria-hidden="true" />

      <article className="ad-poster" data-layout={poster.layout} key={i} aria-live="polite">
        <p className="t-mono t-mono-xs ad-poster__kicker">{poster.kicker}</p>
        <div className="ad-poster__lines">
          {poster.lines.map((l) => (
            <span key={l} className="t-display ad-poster__line">
              {l}
            </span>
          ))}
        </div>
        <p className="t-mono t-mono-xs ad-poster__foot">{poster.foot}</p>
      </article>

      <header className="ad-head">
        <h1 className="t-mono t-mono-xs ad-head__title">
          <span className="ad-sodium">AFTER DARK</span>
          <span className="t-faint"> · </span>
          <span>THE LAB, UNATTENDED.</span>
        </h1>
      </header>

      <div className="ad-strip">
        {audioState === 'on' ? (
          <button type="button" className="ad-btn" onClick={toggleMute} aria-pressed={muted}>
            {muted ? 'UNMUTE' : 'MUTE'}
          </button>
        ) : (
          <button type="button" className="ad-btn ad-btn--sodium" onClick={() => void enable()}>
            SOUND ON
          </button>
        )}
        <button type="button" className="ad-btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? 'RESUME WALL' : 'HOLD'}
        </button>
        {/* Clicking the wall is the pleasant way to turn it. This is the way
            that works from the keyboard, and it is not hidden. */}
        <button type="button" className="ad-btn" onClick={advance}>
          NEXT POSTER
        </button>
        <span className="t-mono t-mono-xs ad-count">
          {String(i + 1).padStart(2, '0')} / {String(POSTERS.length).padStart(2, '0')}
        </span>
        <span className="t-mono t-mono-xs ad-hint">
          {coarse ? 'TAP TO TURN THE WALL' : 'CLICK TO TURN · → NEXT · SPACE TO HOLD'}
        </span>
      </div>
    </div>
  );
}

/**
 * A small tile of deterministic grain, generated once.
 *
 * Grain rather than a halftone screen is the whole point of the night stock —
 * and generating it means no image asset, no request and no licence.
 */
function grainDataUri(): string {
  const n = 96;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(n, n);
  let s = 0x2f6e2b1;
  for (let i = 0; i < n * n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = (s >>> 24) & 255;
    img.data[i * 4] = 233;
    img.data[i * 4 + 1] = 226;
    img.data[i * 4 + 2] = 208;
    img.data[i * 4 + 3] = v > 226 ? 22 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
