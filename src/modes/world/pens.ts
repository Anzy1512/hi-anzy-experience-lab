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

/**
 * Push one drawn segment. `lum` scales the material's own value.
 *
 * `detail` marks a segment as belonging to the district's **near layer** —
 * material that is worth drawing when a visitor is close enough to read it and
 * worth nothing from the overview station. Hatch, poché and the second
 * impression of a misregistered print are all detail; outlines, structure and
 * landmarks are not, because those are what a district is recognised by from
 * across the territory. See `Territory`, which keeps the two in separate
 * buffers and shows the near one by distance.
 */
export type Emit = (a: Pt, b: Pt, lum: number, detail?: boolean) => void;

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
  /**
   * A vertical member, drawn the way this material would carry a load.
   *
   * ── WHY THE DISTRICTS NEEDED THIS ───────────────────────────────────────
   *
   * Every district was a stack of horizontal outlines floating at intervals —
   * plans hanging in the air with nothing between them. From the overview
   * station that reads as architecture, because from far enough away any
   * stack of plans does. Walking up to one, which Explore now lets a visitor
   * do, it stops reading as a building and starts reading as a drawing nobody
   * finished: there is no edge going *up*.
   *
   * So each pen gains the one mark it was missing. `districtForms` decides
   * where a member belongs — that is topology, and it is what makes STRATEGY
   * a frame and TECHNOLOGY a lattice. This decides what the member is made
   * of, which is the same division of labour `stroke` and `fill` already use.
   * Nothing here draws a mesh; a construction is still entirely lines.
   */
  riser?: (x: number, z: number, y0: number, y1: number, emit: Emit) => void;
}

/** The plain vertical every riser is a variation on. */
const post = (x: number, z: number, y0: number, y1: number, emit: Emit, lum = 1) =>
  emit([x, y0, z], [x, y1, z], lum);

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
    /* A construction line does not stop where the thing it is measuring stops.
       The post runs past both plates it connects, which is what makes STRATEGY
       read as a frame someone is still deciding rather than a built floor. */
    riser: (x, z, y0, y1, emit) => {
      const over = (y1 - y0) * 0.16;
      emit([x, y0 - over, z], [x, y1 + over, z], 0.9);
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
    /* A sheet has two sides and a thickness — the same claim `stroke` makes
       horizontally, made vertically. The pair reads as a folded edge seen
       on end, which is what turns a stack of plans into stacked paper. */
    riser: (x, z, y0, y1, emit) => {
      post(x, z, y0, y1, emit, 0.85);
      emit([x + 3, y0, z + 2], [x + 3, y1, z + 2], 0.3);
    },
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
    /* Not a post: a cell. The vertical is braced by a diagonal, so the lattice
       is structural in section as well as in plan and TECHNOLOGY becomes a
       frame that could actually stand rather than a grid printed in the air. */
    riser: (x, z, y0, y1, emit) => {
      post(x, z, y0, y1, emit, 0.8);
      emit([x, y0, z], [x + 26, y1, z + 18], 0.34);
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
    /* Ink accumulates, and so does load. Three members where one would do,
       tight enough to read as a single dense column at distance and as
       clustered structure up close. Production carries weight. */
    riser: (x, z, y0, y1, emit) => {
      post(x, z, y0, y1, emit, 1);
      post(x + 7, z + 4, y0, y1, emit, 0.55);
      post(x - 6, z + 5, y0, y1, emit, 0.45);
    },
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
    /* A trace fades as it travels, including upward. The member is drawn in
       decaying dashes so GROWTH reads as something that propagated to here
       and has not yet finished arriving. */
    riser: (x, z, y0, y1, emit) => {
      const h = y1 - y0;
      const n = Math.max(2, Math.round(h / 30));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        emit([x, y0 + h * t, z], [x, y0 + h * (t + 0.62 / n), z], 0.9 - t * 0.55);
      }
    },
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
    /* The screen, seen edge-on: a column of countable marks rather than a
       line. Up close CULTURE is perforated — you can see through it, which is
       what a printed surface does when you get near enough to read the dots. */
    riser: (x, z, y0, y1, emit) => {
      const h = y1 - y0;
      const n = Math.max(3, Math.round(h / 22));
      for (let i = 0; i <= n; i++) {
        const y = y0 + (h * i) / n;
        emit([x - 2, y, z], [x + 2, y, z], 0.5);
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
    /* A rack with something missing from it. The member is drawn in two
       pieces with a hole between them, seeded per position so the same gap is
       in the same place on every visit — a record that rewrites itself is not
       an archive. */
    riser: (x, z, y0, y1, emit) => {
      const s = seedOf([x, y0, z], [x, y1, z]);
      const h = y1 - y0;
      const gap = 0.2 + s * 0.18;
      const start = 0.24 + s * 0.3;
      emit([x, y0, z], [x, y0 + h * start, z], 0.95);
      emit([x, y0 + h * (start + gap), z], [x, y1, z], 0.95);
    },
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
      /* The second impression is detail, which is what lets it move: it lives
         in its own buffer, so approaching HI ANZY AI can slide it toward
         register and leaving can let it drift again. Misalignment is the
         state; alignment is the event. */
      emit([a[0] + 7, a[1], a[2] + 5], [b[0] + 7, b[1], b[2] + 5], 0.5, true);
    },
    fill: (box, emit) => hatch(box, emit, 120, 0.28),
    /* The same member, printed twice, out of true. Misalignment is the state;
       the pair is the structure. Offset in both ground axes so the error is
       legible from any approach rather than only in elevation. */
    riser: (x, z, y0, y1, emit) => {
      post(x, z, y0, y1, emit, 1);
      emit([x + 9, y0, z + 6], [x + 9, y1, z + 6], 0.45, true);
    },
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
    /* Deliberately the least built thing in the territory. A member only at
       the very bottom, so THE UNKNOWN has a footing and then stops — the
       absence above it is the content, and filling it in would be the one
       change that made this district say something it does not mean. */
    riser: (x, z, y0, y1, emit) => {
      emit([x, y0, z], [x, y0 + (y1 - y0) * 0.22, z], 0.7);
    },
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
  return {
    value: pen.value,
    rise: pen.rise,
    stroke: (a, b, emit) => emit(a, b, 1),
    /*
     * The lite tier keeps the structure and loses the technique. A district
     * with no verticals is a stack of floating plans on every tier, not just
     * the expensive one, and the simplification that removes the difference
     * between materials should not also remove the difference between a
     * building and a drawing. One segment per member is the cheapest mark
     * there is — only a pen that draws nothing vertical keeps drawing nothing.
     */
    riser: pen.riser ? (x, z, y0, y1, emit) => post(x, z, y0, y1, emit, 0.9) : undefined,
  };
}
