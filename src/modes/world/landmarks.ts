import type { PlateSink } from './districtForms';

/**
 * LANDMARKS — the things in this territory that are not districts.
 *
 * ── WHY THERE IS ONE AND NOT NINE ───────────────────────────────────────────
 *
 * The territory had nine district silhouettes, a contour ground and orange
 * routes, and read as a survey of a place nobody had ever been to. What it was
 * missing is the evidence that somebody built it: an object at a scale nothing
 * else reaches, that could not have been generated, and that means something
 * specific to this company rather than to worlds in general.
 *
 * The temptation is to decorate every district. That is the wrong trade — a
 * dozen small objects read as set dressing, and set dressing makes a place look
 * more generic rather than less. One monument, visible from everywhere, does
 * the whole job.
 *
 * ── WHY THIS PARTICULAR OBJECT ──────────────────────────────────────────────
 *
 * The Lab's standing rule is that every spatial form must be derived from a 2D
 * form that preceded it: the ground is the specimen plate's own field, the
 * districts are the Compiler's separated page layers, the routes are the
 * sheet's rules. A landmark has to obey that too or it is an ornament.
 *
 * So the monument is a **registration mark**, which is the one piece of press
 * furniture whose entire job is to say "these separated plates came off one
 * sheet" — the exact claim a territory of nine differently-built districts
 * needs to make about itself. And it is not a generic one. `content/specimens.ts`
 * records what opening the commercial wordmark showed: a rounded geometric sans
 * with two offset bars, one signal-hot above "hi" and one orange below "zy" —
 * a misregistered two-plate print, and the origin of the Lab's REGISTRATION
 * material. The two plates held apart in the air at the top of the mast, with
 * their offset drawn between them, are that mark at building scale.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 *
 * Not a district: it is not in `DISTRICTS`, it cannot be travelled to, and it
 * carries no line, notes or status, because inventing a tenth place would be
 * inventing a fact about the company. It is a monument standing on the land.
 *
 * Not orange. Orange is signal — the acquired object, the active control, the
 * routes. The datum is the brightest bone in the territory instead, which is
 * how this product has said "most important" since Phase 6: by weight.
 */

/** Where the monument stands, in territory units. */
export const DATUM = { x: -150, z: -420 } as const;

/**
 * Clear of every footprint by at least 370 units, and near enough to the middle
 * of the survey to be visible from all nine districts. Origin itself would have
 * been the better story and the worse drawing — the ground mark's arms run
 * straight under TECHNOLOGY's lattice from there, and a monument you have to
 * pick out of another building is not a landmark. A survey datum is a monument
 * at a surveyed point, not at the coordinate zero, so nothing is lost.
 */

/*
 * Tuned by looking, not by arithmetic.
 *
 * The first cut was a 40-unit mast at 820: from overview distance the legs
 * converged into a single hairline and the monument read as a flagpole, and it
 * stood so far above the territory that its head printed into the band the
 * district labels occupy. 96 gives the mast a section you can see; 640 keeps it
 * the tallest thing here — STRATEGY's crown is 580 — without leaving the world.
 */
const MAST = 96;
const MAST_TOP = 640;
const RING = 210;
const ARM = 290;

/* The misregistration, in plan and in elevation. The offset has to be large
   enough to read as two plates that missed each other rather than as one solid
   with a lid: at (38, 26) over a 94-unit gap the vertical dominated and the
   whole device collapsed into a box. */
const BAR_W = 300;
const BAR_D = 74;
const BAR_GAP = 58;
const BAR_OFF_X = 78;
const BAR_OFF_Z = 46;

/** Line segments for the survey datum, relative to its own ground position. */
export function buildDatum(sink: PlateSink): void {
  const ring = (y: number, r: number, n = 32) => {
    const pts: Array<readonly [number, number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r] as const);
    }
    sink.poly(pts);
  };
  const line = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
  ) => sink.poly([a, b]);

  /* ---- THE MARK ON THE GROUND -------------------------------------------
     A register target, drawn at the scale of the land: two rings and a cross
     whose arms run past them. This is the mark the whole survey is squared
     from, and it is drawn flat because that is where a registration mark
     belongs — on the sheet. */
  ring(2, RING);
  ring(2, RING * 0.52);
  line([-ARM, 2, 0], [ARM, 2, 0]);
  line([0, 2, -ARM], [0, 2, ARM]);

  /* ---- THE MAST ----------------------------------------------------------
     Four legs and their ties. A mast has a section, and drawing it as a single
     line would make the tallest object in the territory the thinnest one. */
  const h = MAST / 2;
  const legs = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ] as const;
  for (const [lx, lz] of legs) line([lx, 4, lz], [lx, MAST_TOP, lz]);
  for (let t = 1; t <= 4; t++) {
    const y = (t / 5) * MAST_TOP;
    sink.poly(legs.map(([lx, lz]) => [lx, y, lz] as const));
  }

  /* ---- THE TWO PLATES, HELD OUT OF REGISTER ------------------------------
     The company's own wordmark: two bars printed from two plates that do not
     quite line up. Here they are the same bar twice, held apart in the air,
     with the offset between them drawn — which is exactly what a registration
     diagram draws, and the reason this monument is about Hi Anzy and not about
     monuments. */
  const bar = (y: number, ox: number, oz: number) => {
    const w = BAR_W / 2;
    const d = BAR_D / 2;
    return [
      [ox - w, y, oz - d],
      [ox + w, y, oz - d],
      [ox + w, y, oz + d],
      [ox - w, y, oz + d],
    ] as const;
  };
  const lower = bar(MAST_TOP - BAR_GAP - 24, 0, 0);
  const upper = bar(MAST_TOP - 24, BAR_OFF_X, BAR_OFF_Z);
  sink.poly([...lower]);
  sink.poly([...upper]);
  // The misregistration itself, measured. Four ties, one per corner.
  for (let i = 0; i < 4; i++) line(lower[i], upper[i]);
}
