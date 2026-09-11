/**
 * THE TERRITORY.
 *
 * Living World is what the compiled document became. Every district is built
 * from the same print vocabulary Reality Compiler leaves behind — stacked
 * plates, rules, registration marks — standing on the contour ground that came
 * out of the specimen's own figure.
 *
 * Districts are *capabilities as places*. The lines describe how Hi Anzy works,
 * drawn from the source deck's own service language. Nothing here names a
 * client, a result, a metric, an award or a partnership.
 *
 * Coordinates are in territory units (roughly CSS pixels at ground level),
 * x east/west, z north/south. Height is the number of stacked plates.
 */

export type DistrictStatus = 'open' | 'forming' | 'sealed';

/**
 * A district's TOPOLOGY — how its plates are arranged, and therefore what its
 * silhouette is from across the territory.
 *
 * This is the whole of a district's identity. Colour is not available for it
 * (orange is signal, not category) and literal themed buildings would be a
 * different project, so form has to carry the meaning: STRATEGY is a narrow
 * tower of near-perfectly registered plates because it is about taking
 * sightings; TECHNOLOGY is a lattice because it is a machine; CULTURE scatters
 * because it is the least ordered thing here.
 */
import type { MaterialId } from '../design-system/materials';

export type DistrictForm =
  | 'tower'    // narrow, tall, in register
  | 'fan'      // plates widen as they rise
  | 'lattice'  // each plate subdivided — dense and regular
  | 'terrace'  // steps sideways, wide and low
  | 'radial'   // plates rotate as they stack
  | 'scatter'  // irregular offsets and sizes
  | 'ring'     // an amphitheatre rather than a stack
  | 'aperture' // a hole cut in the stock, and nothing behind it
  | 'stub';    // barely there

export interface District {
  id: string;
  index: string;
  name: string;
  line: string;
  /** Two or three notes revealed on arrival. Service language, not claims. */
  notes: string[];
  /** ground position */
  x: number;
  z: number;
  /** plan footprint */
  w: number;
  d: number;
  /** number of stacked plates; the district's architecture */
  plates: number;
  /** vertical gap between plates */
  rise: number;
  /** how far plates shear as they stack — the district's character */
  shear: number;
  /** the district's architecture, and its silhouette */
  form: DistrictForm;
  /**
   * What the district is made of.
   *
   * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
   *
   * The nine districts already differed in topology — eight silhouette
   * builders, varying plate counts, rise and shear — and on screen they read
   * as one thing, because every plate in the territory went through a single
   * colour formula and a single bone hue. Eight different buildings drawn with
   * one pen.
   *
   * A section drawing solves this the same way every time: materials are
   * distinguished by **hatch pattern and line weight**, never by hue. Solid
   * poché for cut concrete, diagonal hatch for masonry, a lighter hatch for
   * timber — the outline carrying the strong weight, the hatch drawn at the
   * thinnest line in the drawing.
   *
   * So each district is assigned a material from the Lab's own vocabulary
   * (`design-system/materials.ts`) and `Territory.tsx` derives its value and
   * its infill density from that. No district gets a colour of its own; the
   * Lab has one accent and it means signal.
   */
  material: MaterialId;
  status: DistrictStatus;
}

export const DISTRICTS: District[] = [
  {
    id: 'strategy',
    index: 'D1',
    name: 'STRATEGY',
    line: 'Where ambition is turned into a position.',
    notes: ['FOUNDATION WORKSHOP', 'MARKET & COMPETITION ANALYSIS', 'POSITIONING & ROADMAP'],
    x: -880,
    z: -240,
    w: 300,
    d: 300,
    // Tall, narrow, almost perfectly aligned: a structure for taking sightings.
    plates: 11,
    rise: 46,
    shear: 2,
    form: 'tower',
    /* Sightings and provisional construction. Graphite is the line that measures a thing it is not part of — drawn to be worked from, never meant to be inked. */
    material: 'GRAPHITE',
    status: 'open',
  },
  {
    id: 'design',
    index: 'D2',
    name: 'DESIGN',
    line: 'Where a position acquires a form.',
    notes: ['IDENTITY SYSTEM', 'TYPOGRAPHY & COLOUR', 'PACKAGING & GUIDELINES'],
    x: -300,
    z: 260,
    w: 420,
    d: 320,
    // Offset plates: a composition being worked out in the open.
    plates: 8,
    rise: 50,
    shear: 26,
    form: 'fan',
    /* Where a position acquires a form. Planar, cuttable, the brightest stock in the territory: design is the district literally made of sheets. */
    material: 'PAPER',
    status: 'open',
  },
  {
    id: 'technology',
    index: 'D3',
    name: 'TECHNOLOGY',
    line: 'Where the form is made to run.',
    notes: ['WEB & APP DEVELOPMENT', 'CLOUD & CMS', 'MAR-TECH & AUTOMATION'],
    x: 340,
    z: -140,
    w: 380,
    d: 380,
    // Dense, regular, machine-like.
    plates: 14,
    rise: 34,
    shear: 4,
    form: 'lattice',
    /* Fourteen plates, each subdivided. Rule is the thinnest mark the display can hold, and a lattice at that weight reads as dense structure rather than as a solid. */
    material: 'RULE',
    status: 'open',
  },
  {
    id: 'production',
    index: 'D4',
    name: 'PRODUCTION',
    line: 'Where it is actually made.',
    notes: ['FILM & PHOTOGRAPHY', 'SOUND & SONIC BRANDING', 'ON-GROUND EXPERIENCE'],
    x: 900,
    z: 300,
    w: 460,
    d: 300,
    plates: 7,
    rise: 54,
    shear: 34,
    form: 'terrace',
    /* Terraced and heavy. Ink accumulates and stains — production is the stage where decisions stop being reversible. */
    material: 'INK',
    status: 'open',
  },
  {
    id: 'growth',
    index: 'D5',
    name: 'GROWTH',
    line: 'Where it is made to keep going.',
    notes: ['SEARCH & PAID MEDIA', 'FUNNELS & REMARKETING', 'ADVANCED LEVERS'],
    x: 180,
    z: 760,
    w: 340,
    d: 340,
    // Stepping outward — propagation.
    plates: 10,
    rise: 44,
    shear: 30,
    form: 'radial',
    /* Plates rotating as they stack. Trace is evidence that something moved through: fainter than the thing that made it, and the only honest material for a district about travel. */
    material: 'TRACE',
    status: 'open',
  },
  {
    id: 'culture',
    index: 'D6',
    name: 'CULTURE',
    line: 'Where the work meets people who are not being sold to.',
    notes: ['ARTISTS & CREATORS', 'FESTIVALS & VENUES', 'COMMUNITY'],
    x: -760,
    z: 760,
    w: 380,
    d: 280,
    // Irregular and low: less ordered, more human.
    plates: 6,
    rise: 40,
    shear: 62,
    form: 'scatter',
    /* Irregular and made of countable marks. At reading distance a tone; up close a grid of decisions — the argument the culture district exists to make. */
    material: 'HALFTONE',
    status: 'open',
  },
  {
    id: 'imkaan',
    index: 'D7',
    name: 'IMKAAN',
    line: 'A gathering, kept warm.',
    notes: ['STAGE', 'PROGRAMME', 'PEOPLE'],
    x: 760,
    z: -760,
    w: 300,
    d: 300,
    plates: 5,
    rise: 34,
    shear: 0,
    form: 'ring',
    /* An amphitheatre rather than a stack. Archive is preserved, labelled and incomplete, and its gaps are marked rather than filled. */
    material: 'ARCHIVE',
    status: 'open',
  },

  /* ---- distant markers: named, reachable, deliberately unbuilt ---------- */
  {
    id: 'anzy-ai',
    index: 'M1',
    name: 'HI ANZY AI',
    line: 'Under construction, and honest about it.',
    notes: ['NOT YET A PLACE'],
    x: -180,
    z: -1180,
    w: 260,
    d: 260,
    plates: 3,
    rise: 60,
    shear: 18,
    form: 'stub',
    /* Forming, not formed. Registration is misalignment as a state and alignment as an event — the correct material for something that has not quite arrived. */
    material: 'REGISTRATION',
    status: 'forming',
  },
  {
    id: 'unknown',
    index: 'M2',
    name: 'THE UNKNOWN',
    line: 'Left blank on purpose.',
    notes: ['NO SURVEY'],
    x: 1320,
    z: -1080,
    w: 200,
    d: 200,
    plates: 1,
    rise: 24,
    shear: 0,
    /* Not a short building. A cut: the stock, the hole in it, the bevel of the
       hole, and nothing inside. A district that is deliberately blank has to be
       drawn as an absence or the claim is not true. */
    form: 'aperture',
    /* Sealed. Cut is an edge where material has been removed and the absence has a thickness — an aperture with nothing yet behind it. */
    material: 'CUT',
    status: 'sealed',
  },
];

export const WORLD_COPY = {
  title: 'LIVING WORLD',
  tagline: 'ENTER HI ANZY.',
  overview: 'OVERVIEW',
  hintPointer: 'DRAG TO LOOK · CLICK A DISTRICT TO TRAVEL',
  hintTouch: 'DRAG TO LOOK · TAP A DISTRICT',
  mapLabel: 'TERRITORY',
  arriving: 'ARRIVING',
  /* The reason clause is derived — see `spatialFallbackReason` in brand.ts.
     This is only the half that is always true: what is still here. */
  fallbackRemains: 'The district index below is the same map, and every place in it is listed.',
  fallbackSubject: 'This territory',
  intro:
    'A territory assembled from the sheet: contour ground from the specimen plate, districts built as stacked plates, routes drawn as rules.',
  /*
   * The two ways of being in the territory, named as places to stand rather
   * than as modes. "WALK THE TERRITORY" says what happens; "MODE: EXPLORE"
   * would say what the software is doing, which is the visitor's problem only
   * if we make it theirs.
   *
   * The key line names the pointer route first. A visitor who has never held
   * WASD can drag to look, scroll to move and click a district to arrive — the
   * keys are an accelerator for people who already expect them, not the price
   * of entry.
   */
  exploreEnter: 'WALK THE TERRITORY',
  exploreLeave: 'BACK TO THE MAP · ESC',
  exploreKeys: 'DRAG TO LOOK · SCROLL TO MOVE · WASD OPTIONAL · R LEVELS THE HORIZON',
} as const;
