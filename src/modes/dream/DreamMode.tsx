import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { setPointerIntent } from '../../core/pointer';
import { DreamField, isoline, paramsFor } from './field';
import './dream.css';

/**
 * DREAM — WHEN THE SYSTEM STOPS EXPLAINING ITSELF.
 *
 * One thesis, and everything serves it: **the contours remember the words they
 * came from.** A word is mixed into the same scalar field the Lab draws its
 * terrain from, held while the memory lasts, then withdrawn — so type becomes
 * landscape, the landscape keeps its shape for a while, and the next word
 * surfaces out of the same ground.
 *
 * What this deliberately is not: a shader playground, a screensaver, a fractal
 * demo, or a collection of effects. There is one visual idea here. Several
 * others were built and deleted, which is why this one reads.
 *
 * Nothing uses `Math.random()` after entry. A seed produces a dream, and the
 * same seed always produces the same dream — the visitor can ask for another
 * one, and that is the whole control surface.
 */

const WORDS = ['PAPER', 'INK', 'SIGNAL', 'STRUCTURE', 'REGISTER', 'FIELD', 'TRACE', 'SHEET'];

/** Grid resolution by capability. Contours are CPU work, so this is the dial. */
const GRID: Record<string, { cols: number; rows: number }> = {
  ultra: { cols: 190, rows: 122 },
  high: { cols: 150, rows: 96 },
  balanced: { cols: 108, rows: 70 },
  lite: { cols: 76, rows: 50 },
};

export default function DreamMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();

  const [seed, setSeed] = useState(() => Math.floor(Date.now() % 100000));
  const [armed, setArmed] = useState(false);
  const [word, setWord] = useState(WORDS[0]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const params = useMemo(() => paramsFor(seed), [seed]);
  const grid = GRID[capability.profile] ?? GRID.balanced;

  const reseed = useCallback(() => setSeed(Math.floor(Math.random() * 100000)), []);

  useEffect(() => {
    setPointerIntent('scan');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 140 : 520,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- the dream ---------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const field = new DreamField(params);
    const dpr = Math.min(capability.dpr, 2);
    const { cols, rows } = grid;
    const values = new Float32Array(cols * rows);

    // The word, rasterised once per word into a small mask the field can read.
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = cols;
    maskCanvas.height = rows;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    let mask = new Float32Array(cols * rows);

    const rasterise = (w: string) => {
      if (!maskCtx) return;
      maskCtx.fillStyle = '#000';
      maskCtx.fillRect(0, 0, cols, rows);
      maskCtx.fillStyle = '#fff';
      maskCtx.textAlign = 'center';
      maskCtx.textBaseline = 'middle';
      const size = Math.floor(rows * 0.52);
      maskCtx.font = `700 ${size}px 'Rajdhani', 'Arial Narrow', sans-serif`;
      maskCtx.fillText(w, cols / 2, rows / 2);
      const data = maskCtx.getImageData(0, 0, cols, rows).data;
      const next = new Float32Array(cols * rows);
      for (let i = 0; i < next.length; i++) next[i] = data[i * 4] / 255;
      mask = next;
    };
    rasterise(WORDS[0]);

    let t = 0;
    let wordIndex = 0;
    let phase = 0; // seconds inside the current word's cycle

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      // The word's life: surfaces, is held for `memory`, withdraws.
      const cycle = params.memory + 4;
      const local = phase % cycle;
      const weight =
        local < 1.6
          ? local / 1.6
          : local < params.memory
            ? 1
            : Math.max(0, 1 - (local - params.memory) / 2.4);
      if (phase > cycle) {
        phase = 0;
        wordIndex = (wordIndex + 1) % WORDS.length;
        rasterise(WORDS[wordIndex]);
        setWord(WORDS[wordIndex]);
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          values[i] = field.at(c / cols, r / rows, t, mask[i], weight);
        }
      }

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = Math.max(1, dpr * 0.8);
      ctx.lineCap = 'round';

      const levels = params.density;
      for (let l = 0; l < levels; l++) {
        const level = 0.18 + (l / levels) * 0.72;
        const major = l % 3 === 0;
        // Bone contours. The one place orange is allowed is the level the word
        // is currently strongest at, and only for seeds that carry signal.
        const isSignal = params.signal === 1 && l === Math.floor(levels * 0.55) && weight > 0.7;
        ctx.strokeStyle = isSignal
          ? `rgba(242, 145, 27, ${0.5 + weight * 0.35})`
          : `rgba(233, 226, 208, ${major ? 0.34 : 0.13})`;
        ctx.beginPath();
        isoline(values, cols, rows, level, w, h, ctx);
        ctx.stroke();
      }
    };

    draw();
    const stop = onFrame((dt) => {
      // Reduced motion: the dream still exists and still changes word, it just
      // does not drift. The concept survives; the travel does not.
      const step = Math.min(dt, 60) / 1000;
      if (!reduced) t += step;
      phase += step * (reduced ? 0.35 : 1);
      draw();
    });
    scope.add(stop);

    return () => {
      stop();
      window.removeEventListener('resize', onResize);
    };
  }, [params, grid, capability.dpr, reduced, scope]);

  return (
    <div className="dm" data-armed={armed ? 'true' : 'false'}>
      <canvas className="dm-canvas" ref={canvasRef} aria-hidden="true" />

      <header className="dm-head">
        <h1 className="t-mono t-mono-xs dm-head__title">
          <span className="t-signal">DREAM</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">WHEN THE SYSTEM STOPS EXPLAINING ITSELF.</span>
        </h1>
      </header>

      {/* The word the field is currently remembering. Real state, not a caption. */}
      <p className="t-display t-display-m dm-word" aria-live="polite">
        {word}
      </p>

      {/* Not a control panel. The seed is the interface; the rest is a readout
          of what this seed actually produced. */}
      <div className="dm-strip">
        <button type="button" className="dm-btn" onClick={reseed}>
          ANOTHER DREAM
        </button>
        <dl className="dm-read">
          <div>
            <dt>SEED</dt>
            <dd>{seed.toString().padStart(5, '0')}</dd>
          </div>
          <div>
            <dt>DENSITY</dt>
            <dd>{params.density}</dd>
          </div>
          <div>
            <dt>TEMPO</dt>
            <dd>{params.tempo.toFixed(2)}</dd>
          </div>
          <div>
            <dt>DISTORTION</dt>
            <dd>{params.distortion.toFixed(2)}</dd>
          </div>
          <div>
            <dt>MEMORY</dt>
            <dd>{params.memory.toFixed(1)}s</dd>
          </div>
          <div>
            <dt>GRAVITY</dt>
            <dd>{params.gravity >= 0 ? '+' : ''}{params.gravity.toFixed(2)}</dd>
          </div>
          <div>
            <dt>SIGNAL</dt>
            <dd>{params.signal ? 'PRESENT' : 'ABSENT'}</dd>
          </div>
        </dl>
      </div>

      <p className="t-mono t-mono-xs t-faint dm-hint">
        THE SAME SEED ALWAYS DREAMS THE SAME DREAM
      </p>
    </div>
  );
}
