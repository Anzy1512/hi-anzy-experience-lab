/**
 * PROJECTION PARITY — the piece of arithmetic Phase 2 is built on.
 *
 * A CSS `perspective: P` container and a Three perspective camera placed at
 * distance `P` from the z=0 plane, with
 *
 *     fov = 2 · atan( (viewportHeight / 2) / P )
 *
 * produce *identical* projections. An element at `translateZ(z)` therefore lands
 * exactly where a mesh at world z lands, at exactly the same size.
 *
 * That equivalence is what lets Reality Compiler keep its typography as real,
 * selectable, accessible DOM while WebGL draws the structure around it. Without
 * it the only way to move text into depth is to rasterise it into a texture —
 * which costs a dependency, the accessibility tree, and text crispness, and buys
 * nothing.
 *
 * Conventions:
 *   - DOM rects are viewport-space, origin top-left, y down.
 *   - World space is origin-centre, y up, one unit = one CSS pixel at z=0.
 */

export interface Viewport {
  w: number;
  h: number;
}

/** The shared perspective distance, in CSS pixels. Used by BOTH renderers. */
export const PERSPECTIVE = 1400;

/** Vertical field of view, in degrees, that matches `PERSPECTIVE` at this height. */
export function fovForViewport(height: number, perspective = PERSPECTIVE): number {
  return (2 * Math.atan(height / 2 / perspective) * 180) / Math.PI;
}

/** Camera distance from the z=0 plane. Equal to the CSS perspective by definition. */
export function cameraDistance(perspective = PERSPECTIVE): number {
  return perspective;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Viewport rect → world-space centre.
 * The only transform involved is a translation and a y flip.
 */
export function rectToWorld(rect: Rect, view: Viewport): { x: number; y: number } {
  return {
    x: rect.x + rect.w / 2 - view.w / 2,
    y: -(rect.y + rect.h / 2 - view.h / 2),
  };
}

/** Pointer position → normalised device-ish bias in [-1, 1], y up. */
export function pointerBias(px: number, py: number, view: Viewport): { x: number; y: number } {
  return {
    x: (px / Math.max(view.w, 1)) * 2 - 1,
    y: -((py / Math.max(view.h, 1)) * 2 - 1),
  };
}

/**
 * Frame-rate independent damping.
 *
 * `lerp(current, target, damp(0.12, dt))` behaves the same at 60Hz and 144Hz,
 * which a bare `+= (t - c) * 0.12` does not.
 */
export function damp(smoothing: number, dtMs: number): number {
  return 1 - Math.pow(smoothing, dtMs / 1000);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Progress within [from, to], clamped to 0..1. The workhorse of stage mapping. */
export function span(p: number, from: number, to: number): number {
  if (to <= from) return p >= to ? 1 : 0;
  return clamp01((p - from) / (to - from));
}

/** Smoothstep, for stage transitions that should not start or stop abruptly. */
export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}
