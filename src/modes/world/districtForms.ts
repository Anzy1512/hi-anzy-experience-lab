import type { District } from '../../content/world';

/**
 * DISTRICT GEOMETRY — one builder per topology.
 *
 * The Phase 2 build gave every district the same shape (a stack of rectangles)
 * and varied only count, spacing and shear. From overview distance STRATEGY and
 * TECHNOLOGY were indistinguishable, which meant the claim that "a district's
 * character is legible from its plan" was not actually true.
 *
 * Colour is not available to fix that — orange is signal, never category — and
 * literal themed buildings would be a different and much worse project. So form
 * has to carry it: proportion, subdivision, rotation, repetition and silhouette.
 *
 * Every builder emits **line segments only**, in territory space, relative to
 * the district's ground position. The caller adds the base height.
 */

export interface PlateSink {
  /** Push a closed outline through these points (x, y, z triples). */
  poly: (points: Array<readonly [number, number, number]>) => void;
}

type Builder = (d: District, sink: PlateSink) => void;

const rect = (
  sink: PlateSink,
  cx: number,
  y: number,
  cz: number,
  w: number,
  dp: number,
  rot = 0,
) => {
  const hw = w / 2;
  const hd = dp / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (dx: number, dz: number) =>
    [cx + dx * c - dz * s, y, cz + dx * s + dz * c] as const;
  sink.poly([at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)]);
};

const ngon = (sink: PlateSink, cx: number, y: number, cz: number, r: number, n = 8) => {
  const pts: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r] as const);
  }
  sink.poly(pts);
};

/* -------------------------------------------------------------------------- */

const BUILDERS: Record<District['form'], Builder> = {
  /** STRATEGY — a narrow tower of near-perfectly registered plates. */
  tower: (d, sink) => {
    const w = d.w * 0.46;
    const dp = d.d * 0.46;
    for (let i = 0; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      // Barely moves. The point of this structure is that it is in register.
      const j = Math.sin(t * Math.PI * 3) * d.shear;
      rect(sink, j, i * d.rise, j * 0.4, w, dp);
    }
    // A sighting line up the middle: the instrument the tower exists to hold.
    sink.poly([
      [0, 0, 0],
      [0, (d.plates - 1) * d.rise + d.rise * 1.6, 0],
    ]);
  },

  /** DESIGN — plates widen as they rise: a composition opening out. */
  fan: (d, sink) => {
    for (let i = 0; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      const grow = 0.5 + t * 0.85;
      rect(
        sink,
        Math.sin(t * Math.PI * 1.1) * d.shear,
        i * d.rise,
        Math.cos(t * Math.PI * 0.7) * d.shear * 0.5,
        d.w * grow,
        d.d * grow,
      );
    }
  },

  /** TECHNOLOGY — every plate subdivided. Dense, regular, machine. */
  lattice: (d, sink) => {
    const cells = 3;
    for (let i = 0; i < d.plates; i++) {
      const y = i * d.rise;
      // The outer boundary every few floors keeps the mass readable.
      if (i % 4 === 0) rect(sink, 0, y, 0, d.w, d.d);
      const cw = d.w / cells;
      const cd = d.d / cells;
      for (let a = 0; a < cells; a++) {
        for (let b = 0; b < cells; b++) {
          // A regular void in the middle: a machine with a core, not a solid.
          if (a === 1 && b === 1) continue;
          rect(
            sink,
            (a - 1) * cw,
            y,
            (b - 1) * cd,
            cw * 0.82,
            cd * 0.82,
          );
        }
      }
    }
  },

  /** PRODUCTION — steps sideways. Wide, low, a working floor. */
  terrace: (d, sink) => {
    for (let i = 0; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      rect(
        sink,
        (t - 0.5) * d.shear * 5,
        i * d.rise,
        (t - 0.5) * d.shear * 1.6,
        d.w * (1 - t * 0.34),
        d.d * (1 - t * 0.12),
      );
    }
  },

  /** GROWTH — plates rotate as they stack. Propagation. */
  radial: (d, sink) => {
    for (let i = 0; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      rect(sink, 0, i * d.rise, 0, d.w * (0.6 + t * 0.55), d.d * (0.6 + t * 0.55), t * 1.15);
    }
  },

  /** CULTURE — irregular, low, out of true. The least ordered thing here. */
  scatter: (d, sink) => {
    // Deterministic pseudo-randomness: the same district every visit.
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < d.plates; i++) {
      const n = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const sz = 0.3 + rnd() * 0.42;
        rect(
          sink,
          (rnd() - 0.5) * d.shear * 4,
          i * d.rise + (rnd() - 0.5) * d.rise * 0.5,
          (rnd() - 0.5) * d.shear * 3,
          d.w * sz,
          d.d * sz,
          (rnd() - 0.5) * 0.8,
        );
      }
    }
  },

  /** IMKAAN — an amphitheatre. A gathering has a centre, not a summit. */
  ring: (d, sink) => {
    for (let i = 0; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      // Widens as it *descends*: seating around a stage.
      ngon(sink, 0, i * d.rise, 0, (d.w / 2) * (1.15 - t * 0.6), 8);
    }
    // The stage itself.
    rect(sink, 0, 2, 0, d.w * 0.22, d.d * 0.22);
  },

  /** Markers — present, named, deliberately unbuilt. */
  stub: (d, sink) => {
    for (let i = 0; i < d.plates; i++) {
      rect(sink, 0, i * d.rise, 0, d.w * (1 - i * 0.18), d.d * (1 - i * 0.18));
    }
  },
};

export function buildDistrict(d: District, sink: PlateSink): void {
  BUILDERS[d.form](d, sink);
}

/** Crown height, for placing labels and aiming the view. */
export function districtTop(d: District): number {
  const extra = d.form === 'tower' ? d.rise * 1.6 : d.form === 'fan' ? d.rise * 0.4 : 0;
  return (d.plates - 1) * d.rise + extra;
}
