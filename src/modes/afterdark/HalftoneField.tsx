import { useEffect, useRef } from 'react';
import { onFrame } from '../../core/raf';
import type { CleanupScope } from '../../core/cleanup';

/**
 * HALFTONE_FIELD — the primitive, as actual runtime behaviour.
 *
 * SOURCE
 * `components/three/HalftoneBackdrop.js` in the commercial frontend: a dot
 * screen at a fixed cell, radius modulated by a slow travelling wave, ink at
 * two to five percent alpha. Its own note is the discipline — "texture, never
 * noise" — and it runs as a near-invisible field *behind* the page.
 *
 * WHAT CHANGES HERE
 * The screen stops being a backdrop and becomes the subject. After Dark's
 * premise is a printed system on black stock with the studio closed, and a
 * halftone is what a printed surface actually is when you get close enough:
 * not a tone, a grid of decisions. Under a lamp the dots open and the surface
 * resolves; away from it they close and the sheet goes back to being black.
 * That is not an effect applied to the mode — it is the mode's sentence.
 *
 * WHY CANVAS AND NOT WEBGL
 * The Lab's rule is the cheapest technology that produces the experience. This
 * is a few thousand filled arcs on a grid, redrawn only when the lamp moves.
 * A WebGL context, a shader compile and a renderer would buy nothing here and
 * would put a GPU context on a mode that has no other use for one. The
 * canonical component reached for a shader because it sat behind every page of
 * a site; this sits inside one reality that a visitor chose to enter.
 *
 * COST
 * One canvas, one 2D context, no per-frame allocation. It subscribes to the
 * shared frame loop only while the lamp is actually moving and unsubscribes
 * the moment it settles, so an After Dark left open on screen holds no loop.
 */

export interface LampPosition {
  /** 0..1 across the field. */
  x: number;
  /** 0..1 down the field. */
  y: number;
}

interface Props {
  /** Read every frame without re-rendering. Mutated by the mode. */
  lampRef: React.RefObject<LampPosition>;
  scope: CleanupScope;
  /** Static field, drawn once, at its resting density. */
  reduced: boolean;
}

/** Cell size in CSS pixels. Large enough to read as a screen, not as noise. */
const CELL = 13;
/** How far the lamp reaches, as a fraction of the field's diagonal. */
const REACH = 0.42;
/** Largest dot radius, as a fraction of the cell. Never a solid fill. */
const MAX_R = 0.42;

export function HalftoneField({ lampRef, scope, reduced }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    /*
     * Per-cell tone, seeded once.
     *
     * Deterministic, because a stock that reprints itself differently on every
     * reload is noise rather than paper — the same reason the canonical
     * `OrderingGrid` refuses `Math.random`. This is the sheet's own fibre, and
     * a sheet has the fibre it has.
     */
    let tone = new Float32Array(0);
    const seedTone = () => {
      tone = new Float32Array(cols * rows);
      let s = 20260906;
      for (let i = 0; i < tone.length; i += 1) {
        s = (s * 16807) % 2147483647;
        tone[i] = 0.55 + (s / 2147483647) * 0.45;
      }
    };

    const measure = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL) + 1;
      rows = Math.ceil(h / CELL) + 1;
      seedTone();
    };

    const draw = () => {
      const lamp = lampRef.current ?? { x: 0.5, y: 0.5 };
      const lx = lamp.x * w;
      const ly = lamp.y * h;
      const reach = Math.hypot(w, h) * REACH;

      ctx.clearRect(0, 0, w, h);

      for (let cy = 0; cy < rows; cy += 1) {
        const py = cy * CELL;
        for (let cx = 0; cx < cols; cx += 1) {
          const px = cx * CELL;
          // Falloff is squared so the lit area has an edge rather than a haze —
          // a lamp on a wall, not a gradient over a page.
          const d = Math.hypot(px - lx, py - ly) / reach;
          const lit = d >= 1 ? 0 : (1 - d) * (1 - d);
          if (lit <= 0.004) continue;

          const t = tone[cy * cols + cx];
          const radius = lit * t * CELL * MAX_R;
          if (radius < 0.28) continue;

          // Sodium, dimming to nothing. One colour on black stock, which is
          // what a night poster is actually printed with.
          ctx.fillStyle = `rgba(241, 144, 32, ${(0.1 + lit * 0.5).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    measure();
    draw();

    if (reduced) {
      // A static screen is still a screen. The lamp rests at centre and the
      // surface holds — nothing is hidden behind motion.
      const ro = new ResizeObserver(() => {
        measure();
        draw();
      });
      ro.observe(canvas);
      const stop = () => ro.disconnect();
      scope.add(stop);
      return stop;
    }

    /*
     * The frame subscription is conditional on the lamp actually moving. A
     * settled lamp means a settled sheet, and a settled sheet costs nothing.
     */
    let lastX = -1;
    let lastY = -1;
    const stopFrame = onFrame(() => {
      const lamp = lampRef.current ?? { x: 0.5, y: 0.5 };
      if (Math.abs(lamp.x - lastX) < 0.0015 && Math.abs(lamp.y - lastY) < 0.0015) return;
      lastX = lamp.x;
      lastY = lamp.y;
      draw();
    });

    const ro = new ResizeObserver(() => {
      measure();
      lastX = -1;
      draw();
    });
    ro.observe(canvas);

    const stop = () => {
      stopFrame();
      ro.disconnect();
    };
    scope.add(stop);
    return stop;
  }, [lampRef, scope, reduced]);

  return <canvas className="ad-halftone" ref={canvasRef} aria-hidden="true" />;
}
