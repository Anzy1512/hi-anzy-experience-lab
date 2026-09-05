import { smoothstep, span } from '../../spatial/projection';
import type { SpatialQuality } from '../../spatial/quality';

/**
 * THE COMPILATION.
 *
 * One number — progress, 0 to 1 — drives everything. Both renderers derive their
 * state from it, which is the only reason the DOM layer and the WebGL layer can
 * stay welded together: there is no second source of truth to fall out of sync.
 *
 * Stages overlap deliberately. A sequence of discrete switches would read as a
 * slideshow; overlapping spans read as one continuous transformation that
 * happens to have nameable moments.
 */

export interface Stage {
  id: string;
  label: string;
  note: string;
  from: number;
  to: number;
}

export const STAGES: Stage[] = [
  { id: 'document', label: 'DOCUMENT', note: 'A page. Nothing else.', from: 0.0, to: 0.08 },
  { id: 'measure', label: 'MEASURE', note: 'The sheet declares its boxes.', from: 0.08, to: 0.22 },
  { id: 'separate', label: 'SEPARATE', note: 'Reading order becomes depth order.', from: 0.22, to: 0.4 },
  { id: 'lift', label: 'LIFT', note: 'The planes leave the page.', from: 0.4, to: 0.56 },
  { id: 'volume', label: 'VOLUME', note: 'Flat regions acquire structure.', from: 0.56, to: 0.68 },
  { id: 'bend', label: 'BEND', note: 'The sheet stops being flat.', from: 0.68, to: 0.8 },
  { id: 'compile', label: 'COMPILE', note: 'Step back. Read the whole form.', from: 0.8, to: 0.92 },
  { id: 'world', label: 'WORLD', note: 'The document is ground.', from: 0.92, to: 1.0 },
];

export function stageAt(p: number): Stage {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (p >= STAGES[i].from) return STAGES[i];
  }
  return STAGES[0];
}

export function stageIndexAt(p: number): number {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (p >= STAGES[i].from) return i;
  }
  return 0;
}

/** Everything the two renderers need, derived once per progress change. */
export interface CompileState {
  p: number;
  /** registration marks on the flat sheet */
  measure: number;
  /** planes take their depth */
  separate: number;
  /** planes leave the page and gain their full separation */
  lift: number;
  /** WebGL scaffolding fades in around each cell */
  volume: number;
  /** the whole form tilts */
  bend: number;
  /** the world recedes so the form can be read whole */
  compile: number;
  /** terrain */
  world: number;
  /** total depth applied per plane index, in CSS pixels */
  planeDepth: number;
  /** world transform, shared by the CSS container and the Three group */
  tiltX: number;
  pushZ: number;
  /** CSS-space vertical offset (negative is up) */
  liftY: number;
}

/**
 * A single mutable state object, written in place.
 *
 * Progress changes every frame while the visitor is compiling. Allocating a new
 * state object per frame and passing it as a prop would re-render the whole
 * WebGL tree at input rate; mutating one stable object means React renders the
 * scene once and `useFrame` simply reads the current values.
 */
export function createCompileState(): CompileState {
  return {
    p: 0, measure: 0, separate: 0, lift: 0, volume: 0,
    bend: 0, compile: 0, world: 0, planeDepth: 0, tiltX: 0, pushZ: 0, liftY: 0,
  };
}

export function applyCompileState(t: CompileState, p: number, quality: SpatialQuality): void {
  const s = compileState(p, quality);
  t.p = s.p;
  t.measure = s.measure;
  t.separate = s.separate;
  t.lift = s.lift;
  t.volume = s.volume;
  t.bend = s.bend;
  t.compile = s.compile;
  t.world = s.world;
  t.planeDepth = s.planeDepth;
  t.tiltX = s.tiltX;
  t.pushZ = s.pushZ;
  t.liftY = s.liftY;
}

export function compileState(p: number, quality: SpatialQuality): CompileState {
  /*
   * MEASURE is a pulse, not a switch. The registration marks appear, do the job
   * of declaring the sheet's boxes, and then hand over to the WebGL scaffolding
   * that supersedes them. Leaving them on for the rest of the compilation left
   * two competing descriptions of the same geometry on screen at once.
   */
  const measure = span(p, 0.08, 0.18) * (1 - span(p, 0.3, 0.42));
  const separate = smoothstep(span(p, 0.22, 0.4));
  const lift = smoothstep(span(p, 0.4, 0.56));
  const volume = smoothstep(span(p, 0.56, 0.68));
  const bend = smoothstep(span(p, 0.68, 0.8));
  const compile = smoothstep(span(p, 0.8, 0.92));
  const world = smoothstep(span(p, 0.92, 1));

  return {
    p,
    measure,
    separate,
    lift,
    volume,
    bend,
    compile,
    world,
    // Separation begins during SEPARATE and completes during LIFT, so the two
    // stages are one continuous movement rather than two shoves.
    planeDepth: quality.depthScale * (separate * 0.55 + lift * 0.45),
    /*
     * BEND tips the sheet; WORLD keeps tipping until the view is genuinely
     * looking *down* over the ground. At 15° a horizontal plane is edge-on and
     * effectively invisible — the terrain was being drawn correctly and simply
     * could not be seen. The two stages share one continuous rotation.
     */
    tiltX: bend * 14 + world * 18,
    pushZ: -(compile * 360 + world * 110),
    /*
     * Tilting far enough to see the ground swings the deep end of the corridor
     * down and off the bottom of the frame. Raising the whole world by the same
     * measure buys the downward view without paying for it in lost structure —
     * the ground spreads out below, the corridor stays composed.
     */
    liftY: -world * 200,
  };
}
