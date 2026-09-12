import type { PlateSink } from './districtForms';
import type { District } from '../../content/world';

/**
 * DISTRICT LANDMARKS — one form per district, built from that district's meaning.
 *
 * ── THIS REVERSES A DOCUMENTED DECISION, ON PURPOSE ─────────────────────────
 *
 * `landmarks.ts` argues for exactly one monument and against decorating every
 * district: "a dozen small objects read as set dressing, and set dressing makes
 * a place look more generic rather than less." That was right, and the premise
 * it rested on has since changed rather than the reasoning being wrong.
 *
 * It was written when the districts were distant silhouettes on a plan, read
 * from a single establishing station. A visitor can now walk into the territory,
 * and at eye level the overview's legibility is gone — the nine districts hide
 * behind one another, and the only thing tall enough to steer by is the datum,
 * which is one object and therefore tells you nothing about *which way* you are
 * facing. These exist to answer that, which is a different job from the
 * monument's. The datum is still the only thing the survey is squared from.
 *
 * ── EACH IS DRAWN BY ITS OWN DISTRICT'S PEN ─────────────────────────────────
 *
 * They are emitted into the district's own buffer, so the material logic
 * arrives for free and cannot drift: CULTURE's wall is perforated because
 * HALFTONE perforates, IMKAAN's rack has records missing because ARCHIVE gaps
 * its members, HI ANZY AI's arch prints twice because REGISTRATION prints
 * twice, and THE UNKNOWN's supports stop a fifth of the way up because CUT
 * refuses to carry anything. Not one line of per-district drawing code.
 */

type Landmark = (d: District, sink: PlateSink) => void;

/** A vertical frame standing in the ground plane: two legs and a head. */
function portal(
  sink: PlateSink,
  cx: number,
  cz: number,
  span: number,
  height: number,
): void {
  sink.riser(cx - span / 2, cz, 0, height);
  sink.riser(cx + span / 2, cz, 0, height);
  sink.poly([
    [cx - span / 2, height, cz],
    [cx + span / 2, height, cz],
  ]);
}

const LANDMARKS: Record<string, Landmark> = {
  /* STRATEGY — a frame with one side missing. Set out, measured, and not yet
     decided: the head runs on past the leg that is there, toward the leg that
     is not. Graphite over-runs everything anyway, which is the point of it. */
  strategy: (d, sink) => {
    const h = d.plates * d.rise * 0.92;
    const span = d.w * 1.5;
    const z = d.d * 0.95;
    sink.riser(-span / 2, z, 0, h);
    sink.poly([
      [-span / 2, h, z],
      [span * 0.62, h, z],
    ]);
    sink.poly([
      [-span / 2, h * 0.52, z],
      [span * 0.2, h * 0.52, z],
    ]);
  },

  /* DESIGN — one sheet, folded once, big enough to stand under. The fold is
     the whole form: a plane that became a structure by being bent. */
  design: (d, sink) => {
    const h = d.plates * d.rise * 0.78;
    const w = d.w * 1.15;
    const z = -d.d * 1.05;
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const y = h * (1 - Math.abs(t - 0.5) * 1.35);
      sink.poly([
        [-w / 2 + w * t, y, z - 60],
        [-w / 2 + w * t, y, z + 60],
      ]);
    }
    for (const edge of [z - 60, z + 60]) {
      sink.poly([
        [-w / 2, 0, edge],
        [0, h, edge],
      ]);
      sink.poly([
        [0, h, edge],
        [w / 2, 0, edge],
      ]);
    }
  },

  /* TECHNOLOGY — one structural cell, stood up alone and scaled to the whole
     district: the lattice's unit, made large enough to walk into. */
  technology: (d, sink) => {
    const h = d.plates * d.rise * 0.62;
    const s = d.w * 0.5;
    const z = d.d * 1.15;
    for (const [dx, dz] of [
      [-s / 2, -s / 2],
      [s / 2, -s / 2],
      [s / 2, s / 2],
      [-s / 2, s / 2],
    ]) {
      sink.riser(dx, z + dz, 0, h);
    }
    for (const y of [0, h * 0.5, h]) {
      sink.poly([
        [-s / 2, y, z - s / 2],
        [s / 2, y, z - s / 2],
        [s / 2, y, z + s / 2],
        [-s / 2, y, z + s / 2],
      ]);
    }
  },

  /* PRODUCTION — a gantry over the terraces. The thing that moves work along
     the line: it spans the floors rather than standing beside them. */
  production: (d, sink) => {
    const h = d.plates * d.rise * 1.22;
    const span = d.w * 1.35;
    const near = -d.d * 0.9;
    const far = d.d * 0.9;
    portal(sink, 0, near, span, h);
    portal(sink, 0, far, span, h);
    for (const x of [-span / 2, span / 2]) {
      sink.poly([
        [x, h, near],
        [x, h, far],
      ]);
    }
  },

  /* GROWTH — a mast that divides. One trunk, two arms, four tips: the same
     propagation the plates make in plan, stood up so it reads from across the
     territory. TRACE decays it as it rises, so the newest growth is faintest. */
  growth: (d, sink) => {
    const h = d.plates * d.rise;
    const z = -d.d * 1.1;
    sink.riser(0, z, 0, h * 0.6);
    for (const sx of [-1, 1]) {
      sink.poly([
        [0, h * 0.6, z],
        [sx * d.w * 0.42, h * 0.84, z],
      ]);
      for (const t of [-1, 1]) {
        sink.poly([
          [sx * d.w * 0.42, h * 0.84, z],
          [sx * d.w * 0.42 + t * d.w * 0.2, h * 1.02, z + t * 40],
        ]);
      }
    }
  },

  /* CULTURE — a wall to print on, standing in the open ground the scattered
     plates leave empty. The halftone pen perforates its members, so it reads
     as a screen you can see through rather than a slab. */
  culture: (d, sink) => {
    const h = d.plates * d.rise * 1.5;
    const w = d.w * 1.4;
    const z = d.d * 1.0;
    sink.riser(-w / 2, z, 0, h);
    sink.riser(w / 2, z, 0, h);
    for (let i = 0; i <= 4; i++) {
      const y = (h * i) / 4;
      sink.poly([
        [-w / 2, y, z],
        [w / 2, y, z],
      ]);
    }
  },

  /* IMKAAN — the rack behind the stage. An archive turned to face the
     gathering: storage on one side, somewhere to stand on the other. ARCHIVE
     gaps every upright, so the record is visibly incomplete. */
  imkaan: (d, sink) => {
    const h = d.plates * d.rise * 1.35;
    const w = d.w * 1.25;
    const z = -d.d * 1.15;
    for (let i = 0; i <= 4; i++) {
      sink.riser(-w / 2 + (w * i) / 4, z, 0, h);
    }
    for (let s = 1; s <= 3; s++) {
      const y = (h * s) / 3.4;
      sink.poly([
        [-w / 2, y, z],
        [w / 2, y, z],
      ]);
    }
  },

  /* HI ANZY AI — an arch printed twice. REGISTRATION doubles every member on
     its own, so the reconciliation is drawn rather than described: one
     structure, two impressions, not quite agreeing about where it is. */
  'anzy-ai': (d, sink) => {
    const h = d.plates * d.rise * 2.1;
    const z = d.d * 1.2;
    portal(sink, 0, z, d.w * 1.3, h);
    sink.poly([
      [-d.w * 0.65, h * 0.62, z],
      [d.w * 0.65, h * 0.62, z],
    ]);
  },

  /* THE UNKNOWN — an aperture with nothing behind it. The only landmark that
     is a hole, and the only one whose supports give up: CUT carries a member
     a fifth of the way and stops, so even the thing holding it is unfinished. */
  unknown: (d, sink) => {
    const r = d.w * 0.62;
    const z = -d.d * 1.1;
    const y = d.plates * d.rise * 0.9;
    const pts: Array<readonly [number, number, number]> = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      pts.push([Math.cos(a) * r, y + Math.sin(a) * r, z] as const);
    }
    sink.poly(pts);
    sink.riser(-r * 0.7, z, 0, y - r * 0.6);
    sink.riser(r * 0.7, z, 0, y - r * 0.6);
  },
};

/**
 * The district's own landmark, if it has one.
 *
 * Emitted into the district's buffer with the district's pen, so a landmark
 * can never drift out of the material it belongs to.
 */
export function buildLandmark(d: District, sink: PlateSink): void {
  LANDMARKS[d.id]?.(d, sink);
}

/** Whether a district has a landmark at all. Used by the detail gate. */
export function hasLandmark(id: string): boolean {
  return id in LANDMARKS;
}
