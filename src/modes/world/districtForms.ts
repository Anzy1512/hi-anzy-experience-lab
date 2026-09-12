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
  /**
   * Push a vertical member between two heights at a ground position.
   *
   * The plates were always the whole of a district, which meant every district
   * was a set of plans hanging at intervals with nothing holding them up. That
   * survives an overview and does not survive being walked up to. This is the
   * structure between them — where it goes is the form's business, what it is
   * drawn with is the pen's (see `Pen.riser`).
   */
  riser: (x: number, z: number, y0: number, y1: number) => void;
}

/**
 * Members at the corners of a footprint, from the ground to a height.
 *
 * Corners rather than a regular grid because a corner is where a real frame
 * puts one, and because it keeps the segment count proportional to the
 * silhouette the district already has rather than to its area.
 */
const columns = (
  sink: PlateSink,
  cx: number,
  cz: number,
  w: number,
  dp: number,
  y0: number,
  y1: number,
  rot = 0,
) => {
  const hw = w / 2;
  const hd = dp / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const [dx, dz] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]) {
    sink.riser(cx + dx * c - dz * s, cz + dx * s + dz * c, y0, y1);
  }
};

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
    /* The frame the plates are registered against. Full height at the
       footprint corners, so STRATEGY reads as a structure being measured
       rather than a stack of decisions already taken. */
    const h = (d.plates - 1) * d.rise;
    columns(sink, 0, 0, w, dp, 0, h);

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
    /* The fan opens as it rises, so its members lean outward with it: each
       one runs from the plate below to the wider plate above, which is what
       makes DESIGN read as stacked sheets held apart rather than a pile. */
    for (let i = 1; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      const grow = 0.5 + t * 0.85;
      columns(sink, 0, 0, d.w * grow, d.d * grow, (i - 1) * d.rise, i * d.rise);
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
    /* A lattice is only a lattice in three dimensions. Members at the cell
       grid, full height, skipping the same core the plates skip — so the
       structure has a void through the middle rather than a filled shaft. */
    const h = (d.plates - 1) * d.rise;
    const cw = d.w / cells;
    const cd = d.d / cells;
    for (let a = 0; a < cells; a++) {
      for (let b = 0; b < cells; b++) {
        if (a === 1 && b === 1) continue;
        sink.riser((a - 1) * cw, (b - 1) * cd, 0, h);
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
    /* Each terrace is a working floor and a floor needs carrying. The members
       step sideways with the plates they hold, so the assembly leans the way
       the production line runs. */
    for (let i = 1; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      columns(
        sink,
        (t - 0.5) * d.shear * 5,
        (t - 0.5) * d.shear * 1.6,
        d.w * (1 - t * 0.34),
        d.d * (1 - t * 0.12),
        (i - 1) * d.rise,
        i * d.rise,
      );
    }
  },

  /** GROWTH — plates rotate as they stack. Propagation. */
  radial: (d, sink) => {
    for (let i = 0; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      rect(sink, 0, i * d.rise, 0, d.w * (0.6 + t * 0.55), d.d * (0.6 + t * 0.55), t * 1.15);
    }
    /* The members rotate with the plates, so the structure twists as it
       climbs: GROWTH is a path that kept going rather than a tower that was
       planned. Each one spans only its own storey, which is what lets the
       spiral be read one step at a time. */
    for (let i = 1; i < d.plates; i++) {
      const t = i / Math.max(1, d.plates - 1);
      columns(
        sink,
        0,
        0,
        d.w * (0.6 + t * 0.55),
        d.d * (0.6 + t * 0.55),
        (i - 1) * d.rise,
        i * d.rise,
        t * 1.15,
      );
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
    /* Every scattered plate is a printed surface standing on its own leg —
       so CULTURE reads as a field of images planted in the ground rather than
       fragments floating in it. The seed is reset so the legs land under the
       plates the same loop just drew. */
    seed = 7;
    for (let i = 0; i < d.plates; i++) {
      const n = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        rnd();
        const px = (rnd() - 0.5) * d.shear * 4;
        const py = i * d.rise + (rnd() - 0.5) * d.rise * 0.5;
        const pz = (rnd() - 0.5) * d.shear * 3;
        rnd();
        sink.riser(px, pz, 0, py);
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
    /* The racks the record is kept on, set around the ring: eight members on
       the widest tier, each running to the seating height it carries. The
       ARCHIVE pen gaps them, so what stands around the gathering is storage
       with things missing from it. */
    const h = (d.plates - 1) * d.rise;
    const r = (d.w / 2) * 1.05;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2 + Math.PI / 16;
      sink.riser(Math.cos(ang) * r, Math.sin(ang) * r, 0, h);
    }

    // The stage itself.
    rect(sink, 0, 2, 0, d.w * 0.22, d.d * 0.22);
  },

  /** Markers — present, named, deliberately unbuilt. */
  stub: (d, sink) => {
    for (let i = 0; i < d.plates; i++) {
      rect(sink, 0, i * d.rise, 0, d.w * (1 - i * 0.18), d.d * (1 - i * 0.18));
    }
    /* HI ANZY AI is a marker with a REGISTRATION pen, so its members print
       twice and out of true — the misalignment is the structure, and it is
       the one district whose construction is about its own error. */
    columns(sink, 0, 0, d.w * 0.8, d.d * 0.8, 0, (d.plates - 1) * d.rise);
  },

  /**
   * THE UNKNOWN — a hole, and the thickness of the stock it was cut from.
   *
   * This was a `stub`: one shrinking plate, which is what a small building
   * looks like, and the district is explicitly "left blank on purpose". A thing
   * that is deliberately not there should not be drawn as a short version of a
   * thing that is. CUT is the Lab's material for exactly this — "an edge where
   * material has been removed; the absence has a thickness" — and the only
   * honest architecture for a sealed survey square is an aperture: the stock,
   * the cut in it, the bevel of the cut, and nothing inside.
   */
  aperture: (d, sink) => {
    const r = d.w * 0.3;
    const y = d.rise;
    // The stock, lying on the land.
    rect(sink, 0, y, 0, d.w, d.d);
    // The cut through it, and the same cut on the underside — a bevelled edge,
    // which is the only way a flat material shows it has a thickness.
    ngon(sink, 0, y, 0, r, 20);
    ngon(sink, 0, y - 16, 0, r * 0.88, 20);
    // The thickness itself, drawn at four points of the cut.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
      sink.poly([
        [Math.cos(a) * r, y, Math.sin(a) * r],
        [Math.cos(a) * r * 0.88, y - 16, Math.sin(a) * r * 0.88],
      ]);
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
