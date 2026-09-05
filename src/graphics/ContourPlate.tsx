import { useEffect, useRef } from 'react';
import { fieldAt } from './field';

/**
 * THE CONTOUR PLATE — the specimen's image.
 *
 * Procedural, seeded, drawn to a canvas at mount. There is no photograph here
 * and there is no generated "AI image": a stock photo would be a borrowed
 * aesthetic and a synthesised one would be a lie about the source material.
 * A seeded topographic field is honest, weighs nothing, and — crucially — gives
 * X-Ray something with real luminance to process.
 *
 * Processing states are computed on ImageData, once per state change. Nothing
 * here runs per frame; CSS and canvas do the work a shader would have done
 * without earning it.
 */

export type PlateProcess = 'normal' | 'mono' | 'threshold' | 'halftone' | 'edge';

const BANDS = 9;

/* ---- the plate ---------------------------------------------------------- */
/**
 * The field itself now lives in `./field.ts` because Reality Compiler displaces
 * terrain with the same function. This module's job is only to *print* it.
 */
function renderField(w: number, h: number): Float32Array {
  const field = new Float32Array(w * h);
  let min = Infinity;
  let max = -Infinity;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const val = fieldAt(x / w, y / h);
      field[y * w + x] = val;
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  const range = max - min || 1;
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - min) / range;
  return field;
}

/** Terraced luminance + brighter band boundaries = a topographic plate. */
function fieldToImage(field: Float32Array, w: number, h: number): ImageData {
  const img = new ImageData(w, h);
  const d = img.data;
  const bandOf = (i: number) => Math.floor(field[i] * BANDS);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const band = bandOf(i);
      // terrace luminance, kept low so the plate sits inside the ink material
      let lum = 26 + (band / (BANDS - 1)) * 108;

      // contour line where the band index changes
      const right = x + 1 < w ? bandOf(i + 1) : band;
      const down = y + 1 < h ? bandOf(i + w) : band;
      if (right !== band || down !== band) lum = 226;

      const o = i * 4;
      // warm bone tint rather than neutral grey — the plate is on our stock
      d[o] = Math.min(255, lum * 1.03);
      d[o + 1] = Math.min(255, lum * 0.99);
      d[o + 2] = Math.min(255, lum * 0.9);
      d[o + 3] = 255;
    }
  }
  return img;
}

function luminance(d: Uint8ClampedArray, o: number) {
  return 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
}

function process(base: ImageData, mode: PlateProcess, ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = base;

  if (mode === 'normal') {
    ctx.putImageData(base, 0, 0);
    return;
  }

  if (mode === 'halftone') {
    // Print halftone: sample on a rotated-ish grid, dot radius by luminance.
    ctx.fillStyle = '#0b0e0e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e4ddca';
    const step = 6;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const o = (y * w + x) * 4;
        const l = luminance(base.data, o) / 255;
        const r = l * (step * 0.62);
        if (r < 0.35) continue;
        ctx.beginPath();
        ctx.arc(x + step / 2, y + step / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  const out = new ImageData(w, h);
  const s = base.data;
  const d = out.data;

  if (mode === 'edge') {
    // Sobel on luminance.
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const at = (xx: number, yy: number) => luminance(s, (yy * w + xx) * 4);
        const gx =
          -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
          at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
        const gy =
          -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
          at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
        const g = Math.min(255, Math.hypot(gx, gy));
        const o = (y * w + x) * 4;
        d[o] = g * 1.02;
        d[o + 1] = g * 0.98;
        d[o + 2] = g * 0.86;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return;
  }

  for (let i = 0; i < s.length; i += 4) {
    const l = luminance(s, i);
    const v = mode === 'threshold' ? (l > 96 ? 235 : 14) : l;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = mode === 'threshold' ? v : v * 0.95;
    d[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

interface Props {
  process: PlateProcess;
  className?: string;
}

export function ContourPlate({ process: mode, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Generate once per size. The field is deterministic, so a resize reproduces
  // the same terrain rather than a different one.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    const build = () => {
      const rect = canvas.getBoundingClientRect();
      /*
       * Generation is synchronous, so the cap is a main-thread budget, not a
       * quality setting. At 360x460 the field is ~165k pixels and builds in a
       * few milliseconds; the browser scales it up to the element and the
       * slight softness reads as a scan rather than a defect. The earlier
       * 620x820 cap could block entry long enough to trip the engine watchdog
       * on a slow frame budget.
       */
      const w = Math.max(1, Math.min(Math.round(rect.width), 360));
      const h = Math.max(1, Math.min(Math.round(rect.height), 460));
      if (w === sizeRef.current.w && h === sizeRef.current.h && baseRef.current) return;

      sizeRef.current = { w, h };
      canvas.width = w;
      canvas.height = h;

      const field = renderField(w, h);
      baseRef.current = fieldToImage(field, w, h);

      const ctx = canvas.getContext('2d');
      if (ctx) process(baseRef.current, mode, ctx);
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(build);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mode]);

  // Re-process on state change without regenerating the field.
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext('2d');
    if (ctx) process(base, mode, ctx);
  }, [mode]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
