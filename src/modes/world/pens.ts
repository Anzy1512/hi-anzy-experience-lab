/**
 * PENS — how each material is actually drawn.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 *
 * Phase 6.5E gave the nine districts nine materials and derived a *value* and
 * an infill *count* from each. That was the right idea executed at half depth:
 * every line in the territory was still the same mark. A district could be
 * dimmer or denser than its neighbour, but nothing was drawn differently from
 * anything else — nine buildings, one pen, varying only in how hard it was
 * pressed.
 *
 * The survey datum proved what the second half buys. It is the same bone, the
 * same line material and the same renderer as everything around it, and it
 * reads as a different kind of object entirely, because its geometry is
 * *drawn* rather than extruded.
 *
 * ── THE CONVENTION ──────────────────────────────────────────────────────────
 *
 * Straight out of Phase 6.5's research, and unchanged since: **materials are
 * distinguished by hatch pattern and line weight, never by hue.** A section
 * drawing uses solid poché for cut concrete, diagonal hatch for masonry, a
 * lighter hatch for timber — and the outline always carries the strong weight
 * while the hatch is the thinnest mark on the sheet.
 *
 * So a pen is two things: how one edge of an outline is *stroked*, and what
 * goes *inside* a closed plate. There is not one colour in this file.
 *
 *   GRAPHITE      construction line — over-runs its corners, never inked
 *   PAPER         a doubled edge: a sheet has two sides and a thickness
 *   RULE          cross-hatch — the thinnest mark, in two directions
 *   INK           poché — dense parallel fill; ink accumulates
 *   TRACE         a decaying dash; a trace that persists is a path
 *   HALFTONE      the outline itself broken into countable marks
 *   ARCHIVE       gapped — preserved, labelled, incomplete
 *   REGISTRATION  drawn twice, slightly out of register
 *   CUT           outline only, and barely that
 *
 * ── WHAT LOOKING AT IT CHANGED ──────────────────────────────────────────────
 *
 * First render, from overview distance: CULTURE and GROWTH had dissolved. Both
 * pens break the outline itself, and at 0.42 duty on a scattered district and a
 * dash decaying to a quarter there was no strong weight left anywhere — two
 * smears where two structures had been. The convention is explicit that the
 * outline carries the strong weight and the infill is secondary, so both duties
 * went up and TRACE's decay now has a floor. PRODUCTION had the opposite
 * problem: poché at a 30-unit pitch aggregated into a solid brighter than its
 * own outline, which is a filled shape rather than a cut one.
 *
 * ── PITCH, NOT COUNT ────────────────────────────────────────────────────────
 *
 * Infill is specified as a spacing in territory units rather than a number of
 * lines, which is how hatching actually works and which fixes a real problem:
 * TECHNOLOGY subdivides every plate into nine cells about a hundred units
 * across, and a fixed count would have packed as many lines into a small cell
 * as into a plate four times its size, turning a lattice into a solid mat.
 */

export type Pt = readonly [number, number, number];

/** Push one drawn segment. `lum` scales the material's own value. */
export type Emit = (a: Pt, b: Pt, lum: number) => void;

/** The extent of a closed plate, in district-local space. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

export interface Pen {
  /** How bright the outline sits in the bone range. */
  value: number;
  /** How much of that value is earned by height rather than given. */
  rise: number;
  /** One edge of an outline. */
  stroke: (a: Pt, b: Pt, emit: Emit) => void;
  /** What goes inside a closed plate. Omitted means nothing does. */
  fill?: (box: Box, emit: Emit) => void;
}

/* -------------------------------------------------------------------------- */

const at = (a: Pt, b: Pt, t: number): Pt => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const length = (a: Pt, b: Pt) =>
  Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;

/**
 * Deterministic per-edge noise. The same edge gaps the same way on every
 * visit, which is what stops a district about preservation from flickering.
 */
const seedOf = (a: Pt, b: Pt) => {
  const s =
    (Math.round(a[0]) * 73856093) ^ (Math.round(a[1]) * 19349663) ^ (Math.round(b[2]) * 83492791);
  return ((s >>> 0) % 997) / 997;
};

/** Break one edge into dashes. `duty` is how much of each period is drawn. */
function dashed(
  a: Pt,
  b: Pt,
  emit: Emit,
  pitch: number,
  duty: number | ((t: number) => number),
  lum = 1,
) {
  const n = Math.max(1, Math.round(length(a, b) / pitch));
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const d = typeof duty === 'function' ? duty(t0) : duty;
    if (d <= 0) continue;
    emit(at(a, b, t0), at(a, b, t0 + d / n), lum);
  }
}

/** Parallel runs across a box at a fixed spacing, along z or along x. */
function hatch(box: Box, emit: Emit, pitch: number, lum: number, alongX = false) {
  const span = alongX ? box.maxX - box.minX : box.maxZ - box.minZ;
  const n = Math.floor(span / pitch);
  for (let i = 1; i <= n; i++) {
    const f = i / (n + 1);
    if (alongX) {
      const x = box.minX + (box.maxX - box.minX) * f;
      emit([x, box.y, box.minZ], [x, box.y, box.maxZ], lum);
    } else {
      const z = box.minZ + (box.maxZ - box.minZ) * f;
      emit([box.minX, box.y, z], [box.maxX, box.y, z], lum);
    }
  }
}

/* -------------------------------------------------------------------------- */

export const PENS: Record<string, Pen> = {
  /**
   * STRATEGY. A drafted line does not stop at the corner it meets — it crosses
   * it, because the intersection is found by two lines rather than declared by
   * one. Over-running every edge is the whole of graphite's character, and it
   * is why the district reads as construction that was never meant to be
   * inked. Nothing inside: there is nothing to fill in yet.
   */
  GRAPHITE: {
    value: 0.3,
    rise: 0.3,
    stroke: (a, b, emit) => {
      const over = Math.min(15 / length(a, b), 0.2);
      emit(at(a, b, -over), at(a, b, 1 + over), 1);
    },
  },

  /**
   * DESIGN. "A sheet has two sides and a thickness." Every edge is drawn twice
   * — once where it is, and once a few units below at a third of the weight,
   * which is the underside of the same cut. The sparse infill is the face of
   * the sheet rather than a texture on it.
   */
  PAPER: {
    value: 0.52,
    rise: 0.4,
    stroke: (a, b, emit) => {
      emit(a, b, 1);
      emit([a[0], a[1] - 3, a[2]], [b[0], b[1] - 3, b[2]], 0.3);
    },
    fill: (box, emit) => hatch(box, emit, 96, 0.3),
  },

  /**
   * TECHNOLOGY. The thinnest mark the display can hold, in two directions.
   * Cross-hatch is what makes a lattice read as structure rather than as a
   * filled shape, and the pitch keeps it honest inside the small subdivided
   * cells this district is mostly made of.
   */
  RULE: {
    value: 0.34,
    rise: 0.34,
    stroke: (a, b, emit) => emit(a, b, 1),
    fill: (box, emit) => {
      hatch(box, emit, 100, 0.28);
      hatch(box, emit, 100, 0.28, true);
    },
  },

  /**
   * PRODUCTION. Poché: the solid fill a section drawing gives to material that
   * has been cut through. The tightest pitch here and the heaviest infill,
   * because ink accumulates and production is the stage where decisions stop
   * being reversible.
   */
  INK: {
    value: 0.44,
    rise: 0.46,
    stroke: (a, b, emit) => emit(a, b, 1),
    fill: (box, emit) => hatch(box, emit, 44, 0.38),
  },

  /**
   * GROWTH. "A trace that persists at full strength is a path, which is a
   * different material." The dash decays along its own run — three quarters
   * drawn at the start of an edge, a quarter by the end — so the outline is
   * visibly evidence of something rather than the thing itself.
   */
  TRACE: {
    value: 0.26,
    rise: 0.5,
    stroke: (a, b, emit) => dashed(a, b, emit, 26, (t) => 0.85 - t * 0.4),
    fill: (box, emit) => hatch(box, emit, 140, 0.3),
  },

  /**
   * CULTURE. "Tone made of countable marks rather than of continuous value."
   * The only pen where the *outline itself* is broken into marks: at distance
   * the district reads as a tone, and up close it is a grid of decisions,
   * which is the argument the culture district exists to make.
   */
  HALFTONE: {
    value: 0.36,
    rise: 0.36,
    stroke: (a, b, emit) => dashed(a, b, emit, 20, 0.62),
    fill: (box, emit) => {
      // Countable marks on a square pitch, not lines.
      const P = 46;
      for (let x = box.minX + P; x < box.maxX; x += P) {
        for (let z = box.minZ + P; z < box.maxZ; z += P) {
          emit([x - 3, box.y, z], [x + 3, box.y, z], 0.3);
        }
      }
    },
  },

  /**
   * IMKAAN. "Preserved, labelled, and incomplete. Gaps are marked, never
   * filled." Each edge is drawn as two pieces with a hole between them, and
   * where the hole falls is fixed per edge so the record does not rewrite
   * itself between visits.
   */
  ARCHIVE: {
    value: 0.4,
    rise: 0.3,
    stroke: (a, b, emit) => {
      const s = seedOf(a, b);
      const gap = 0.18 + s * 0.16;
      const start = 0.22 + s * 0.34;
      emit(a, at(a, b, start), 1);
      emit(at(a, b, start + gap), b, 1);
    },
    fill: (box, emit) => hatch(box, emit, 86, 0.3),
  },

  /**
   * HI ANZY AI. "Misalignment is the state; alignment is the event." The one
   * district drawn twice — once where the plate is, once a few units off in
   * both ground axes at half weight. It is the same misregistration the
   * company's own wordmark is printed with, and the same device the survey
   * datum holds in the air.
   */
  REGISTRATION: {
    value: 0.26,
    rise: 0.2,
    stroke: (a, b, emit) => {
      emit(a, b, 1);
      emit([a[0] + 7, a[1], a[2] + 5], [b[0] + 7, b[1], b[2] + 5], 0.5);
    },
    fill: (box, emit) => hatch(box, emit, 120, 0.28),
  },

  /**
   * THE UNKNOWN. "An edge where material has been removed. The absence has a
   * thickness." Outline only, and barely that — there is nothing inside a hole
   * to hatch.
   */
  CUT: {
    value: 0.18,
    rise: 0.1,
    stroke: (a, b, emit) => emit(a, b, 1),
  },

  /** The Lab's accent has no district. Present so a lookup can never fail. */
  SIGNAL: { value: 0.5, rise: 0.3, stroke: (a, b, emit) => emit(a, b, 1) },
};

export function penFor(material: string): Pen {
  return PENS[material] ?? PENS.PAPER;
}

/**
 * The lite tier's pen.
 *
 * Every technique above multiplies the segment count — halftone turns one edge
 * into a dozen marks, poché fills a plate with thirty runs. On the tier that
 * also loses fog, the pointer bias and half the districts, the mark simplifies
 * to a single line and the *topology* carries the whole of a district's
 * identity, which is what it was doing before any of this existed. Nothing is
 * lost that a visitor on that tier could have seen.
 */
export function plain(pen: Pen): Pen {
  return { value: pen.value, rise: pen.rise, stroke: (a, b, emit) => emit(a, b, 1) };
}
