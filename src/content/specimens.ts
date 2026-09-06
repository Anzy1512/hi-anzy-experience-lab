/**
 * THE SPECIMENS — the company's own collages, and what the Lab is allowed to
 * do with them.
 *
 * ── THE FINDING THAT STARTED PHASE 6.5 ──────────────────────────────────────
 *
 * The Lab shipped zero images for six phases. Phase 5.5's manifest excluded
 * every brand asset with the rationale that the Lab "generates every mark
 * procedurally and importing raster art would add payload for decoration".
 * That was written from a directory listing. Nobody opened the files.
 *
 * They are not decoration. `frontend/public/brand/` holds a coherent, owned
 * photomontage library in the company's exact palette: monochrome cut-out
 * figures with an object where the head should be — a Rubik's cube, a balloon,
 * a Praktica SLR — standing on a halftone dot field the colour of the
 * canonical `--paper`, sometimes with a signal-orange shape behind. Seven
 * archetypes, seven object studies. Nobody in them is identifiable, because
 * nobody in them has a face.
 *
 * ── WHY THIS IS NOT "ADD PICTURES" ──────────────────────────────────────────
 *
 * A collage is not a flat image. It is a stack of cut paper photographed from
 * above. The Lab's entire material vocabulary — PAPER, INK, HALFTONE, CUT,
 * REGISTRATION, GRAIN — was built to describe precisely that object and has
 * never been given one to describe. So the image system is not display. It is
 * separation: take the company's own collages and put the space back into them.
 *
 * ── SCALE, AND A DECISION THE COMPANY ALREADY MADE ──────────────────────────
 *
 * `components/deck/MotifFrame.js` on the commercial site records a considered
 * refusal: "They are not the deck's photographs. Reproducing scanned pop-art
 * collage at hero scale would look like a screenshot of a PDF." That is right,
 * and the file sizes prove it — these are 321–522px wide. Blown across a
 * viewport they are mush.
 *
 * So the Lab does the opposite of hero scale. These are **specimens**: held at
 * or near native size, framed, examined, taken apart. At that scale the scan
 * artefacts stop being resolution failure and become material evidence — the
 * halftone rosette, the paper tone, the scissored edge. Which is the Lab's
 * register anyway. X-Ray is a specimen plate. Memory is an archive.
 *
 * ── PAYLOAD ─────────────────────────────────────────────────────────────────
 *
 * AVIF only: 14 files, ~390 kB total, 10–58 kB each. None reaches the entry
 * chunk; each is fetched by the one reality that shows it, when it shows it.
 * The canonical repo also ships png/webp of each — not mirrored, because AVIF
 * is supported everywhere this product already requires `:has()` and
 * `color-mix()`, both of which shipped later.
 *
 *   source   Anzy1512/hi-anzy-platform @ 6e36db1, frontend/public/brand/
 */

export type SpecimenFamily = 'ARCHETYPE' | 'OBJECT';

export interface Specimen {
  /** File stem in `/brand/`. */
  id: string;
  family: SpecimenFamily;
  /** What is actually in the frame. Written from looking, not from the name. */
  subject: string;
  /**
   * Where the head is not.
   *
   * Every archetype in this set replaces the face with an object, which is why
   * the set carries no consent question — and it is also the whole idea, so it
   * is recorded rather than left as an observation somebody has to re-make.
   */
  instead: string | null;
  /** sha256/12 of the mirrored AVIF, against the canonical file. */
  hash: string;
  /** Native pixel size. Nothing should be drawn larger than this. */
  w: number;
  h: number;
}

export const SPECIMENS: Specimen[] = [
  {
    id: 'char-visionary',
    family: 'ARCHETYPE',
    subject: 'A suited figure raising a hat, on a halftone paper field with a signal shape below.',
    instead: 'a balloon',
    hash: '5efe13abb7d3',
    w: 321,
    h: 720,
  },
  {
    id: 'char-walkers',
    family: 'ARCHETYPE',
    subject: 'Two figures walking in step, arm in arm.',
    instead: 'a Praktica SLR and a Polaroid',
    hash: 'e29b017b52be',
    w: 522,
    h: 980,
  },
  {
    id: 'char-anchor',
    family: 'ARCHETYPE',
    subject: 'A standing figure, weight settled.',
    instead: 'an object',
    hash: '1f0c5c82d117',
    w: 410,
    h: 720,
  },
  {
    id: 'char-challenger',
    family: 'ARCHETYPE',
    subject: 'A figure mid-gesture, leaning into something.',
    instead: 'an object',
    hash: '65f2ce90cd7c',
    w: 520,
    h: 657,
  },
  {
    id: 'char-expressionist',
    family: 'ARCHETYPE',
    subject: 'A figure whose posture is doing the talking.',
    instead: 'an object',
    hash: '8f8f705d61ca',
    w: 464,
    h: 720,
  },
  {
    id: 'char-fixer',
    family: 'ARCHETYPE',
    subject: 'A figure with its hands already occupied.',
    instead: 'an object',
    hash: '416f0019f818',
    w: 494,
    h: 720,
  },
  {
    id: 'char-trendsetter',
    family: 'ARCHETYPE',
    subject: 'A figure half-turned, going somewhere.',
    instead: 'an object',
    hash: 'e8a6c1f93815',
    w: 412,
    h: 720,
  },
  {
    id: 'pop-cube-thinker',
    family: 'OBJECT',
    subject: 'A seated figure in a period blouse, hand raised to where a chin would be, on a grey disc.',
    instead: 'a Rubik’s cube',
    hash: '23277c0c1520',
    w: 422,
    h: 591,
  },
  {
    id: 'pop-camera-duo',
    family: 'OBJECT',
    subject: 'Two cameras, composed as a pair.',
    instead: null,
    hash: '096a6ca1bb5e',
    w: 402,
    h: 621,
  },
  {
    id: 'pop-clock-watch',
    family: 'OBJECT',
    subject: 'A clock and a watch — the same measure at two scales.',
    instead: null,
    hash: '0931f55c306a',
    w: 428,
    h: 583,
  },
  {
    id: 'pop-hands-a',
    family: 'OBJECT',
    subject: 'Two hands, and the space between them.',
    instead: null,
    hash: '9dc87ab81b87',
    w: 435,
    h: 573,
  },
  {
    id: 'pop-hat-balloon',
    family: 'OBJECT',
    subject: 'A hat and a balloon, the lighter thing tethered to the heavier.',
    instead: null,
    hash: 'ba5a0c75b44a',
    w: 392,
    h: 637,
  },
  {
    id: 'pop-bulb-armchair',
    family: 'OBJECT',
    subject: 'A bulb and an armchair — the idea and the place you have it.',
    instead: null,
    hash: '9a4d637f397b',
    w: 376,
    h: 664,
  },
  {
    id: 'pop-white-flag',
    family: 'OBJECT',
    subject: 'A white flag, raised.',
    instead: null,
    hash: '87513658fec6',
    w: 375,
    h: 666,
  },
];

/**
 * DELIBERATELY NOT MIRRORED.
 *
 * Recorded here rather than left as an absence, because "we did not get to it"
 * and "we looked and declined" are different states and only one of them is an
 * argument.
 */
export const SPECIMENS_EXCLUDED = [
  {
    id: 'art-thinker, art-cube-head',
    reason:
      'Drawn comic illustration rather than photomontage — a different and much more generic register, and `art-thinker` carries an illustrated face where every asset the Lab did take has an object instead. Two images that would weaken a set of fourteen.',
  },
  {
    id: 'logo-light, logo-dark',
    reason:
      'The commercial wordmark. Worth having opened: it is a rounded geometric sans in paper tone with two offset bars — one signal-hot above "hi", one orange below "zy" — which is a misregistered two-plate print, and therefore the actual origin of the Lab’s REGISTRATION material. That lineage is now recorded in `design-system/materials.ts`. The mark itself stays on the commercial site: shipping Reality 0’s logotype into the experimental runtime is exactly the blurring this product exists to avoid.',
  },
  {
    id: 'png / webp variants of every mirrored file',
    reason:
      'AVIF only. Every browser this design system already requires — `:has()`, `color-mix()` — shipped AVIF earlier. Carrying three encodings of fourteen images to serve nobody would triple the payload of the one thing Phase 6.5 adds.',
  },
];

export function specimen(id: string): Specimen | undefined {
  return SPECIMENS.find((s) => s.id === id);
}

export const ARCHETYPES = SPECIMENS.filter((s) => s.family === 'ARCHETYPE');
export const OBJECTS = SPECIMENS.filter((s) => s.family === 'OBJECT');

/** The path a reality loads. Nothing here is bundled; these are public files. */
export function specimenSrc(id: string): string {
  return `/brand/${id}.avif`;
}
