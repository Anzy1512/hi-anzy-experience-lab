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
 * canonical `--paper`, sometimes with a signal-orange shape behind. Nobody in
 * them is identifiable, because nobody in them has a face.
 *
 * Every `subject` below was written after opening the file. The first pass
 * wrote five of them from the filename and got them wrong — `pop-hat-balloon`
 * was recorded as "a hat and a balloon" when it is a headless suited figure
 * lifting a hat, and `pop-hands-a` as "two hands and the space between them"
 * when the hands are clasped and form the apex of a letter A. These strings
 * become alt text: they are a factual claim about what an image contains, made
 * to somebody who cannot check it.
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

/**
 * CUT, or MOUNTED.
 *
 * The first version of this file called the two families ARCHETYPE and OBJECT,
 * from the `char-` and `pop-` filename prefixes. Opening all fourteen shows
 * something far better: they are the *same seven works in two states*. `pop-`
 * is the collage cut out against white. `char-` is that same collage mounted
 * on the halftone paper field, with a grey disc behind it and a signal shape at
 * the edge.
 *
 * pop-clock-watch   is char-anchor, cut out.
 * pop-bulb-armchair is char-challenger, cut out.
 * pop-cube-thinker  is char-fixer, cut out.
 * pop-hat-balloon   is char-visionary, cut out.
 * pop-camera-duo    is char-walkers, cut out.
 *
 * Which is the entire argument of SPECIMEN_PLATE, shipped by the company as
 * files: a collage is a cut thing and a mounted thing, and the difference
 * between those two states is the space this Lab puts back.
 */
export type SpecimenFamily = 'CUT' | 'MOUNTED';

export interface Specimen {
  /** File stem in `/brand/`. */
  id: string;
  family: SpecimenFamily;
  /** What is actually in the frame. Written from looking, not from the name. */
  subject: string;
  /**
   * What stands where the head is not.
   *
   * Twelve of the fourteen replace the face with an object, which is why the
   * set carries no consent question — and it is also the whole idea, so it is
   * recorded rather than left as an observation somebody has to re-make. The
   * two that are not figures (`pop-hands-a`, `pop-white-flag`) hold `null`.
   */
  instead: string | null;
  /** sha256/12 of the mirrored AVIF, against the canonical file. */
  hash: string;
  /** Native pixel size. Nothing should be drawn larger than this. */
  w: number;
  h: number;
}

export const SPECIMENS: Specimen[] = [
  /* ---- MOUNTED — the collage on its halftone paper field ----------------- */
  {
    id: 'char-anchor',
    family: 'MOUNTED',
    subject:
      'A figure in a windowpane-check suit, checking a wristwatch, mounted on halftone paper with a signal shape at the foot.',
    instead: 'a ringing alarm clock reading eight o’clock',
    hash: '1f0c5c82d117',
    w: 410,
    h: 720,
  },
  {
    id: 'char-challenger',
    family: 'MOUNTED',
    subject:
      'A figure in a dinner jacket and bow tie, sprawled across a buttoned armchair, mounted on halftone paper.',
    instead: 'a large filament light bulb',
    hash: '65f2ce90cd7c',
    w: 520,
    h: 657,
  },
  {
    id: 'char-expressionist',
    family: 'MOUNTED',
    subject:
      'A seated figure in a fedora with its arms folded, mounted on halftone paper. No cut-out version of this one was supplied.',
    instead: 'a vintage ribbon microphone',
    hash: '8f8f705d61ca',
    w: 464,
    h: 720,
  },
  {
    id: 'char-fixer',
    family: 'MOUNTED',
    subject:
      'A figure in a period blouse, one hand raised to where a chin would be, on a grey disc over halftone paper.',
    instead: 'a Rubik’s cube',
    hash: '416f0019f818',
    w: 494,
    h: 720,
  },
  {
    id: 'char-trendsetter',
    family: 'MOUNTED',
    subject:
      'A figure in a patterned top, arm raised, against an orange bar and halftone paper. No cut-out version of this one was supplied.',
    instead: 'a burst of striped foliage',
    hash: 'e8a6c1f93815',
    w: 412,
    h: 720,
  },
  {
    id: 'char-visionary',
    family: 'MOUNTED',
    subject:
      'A suited figure lifting a hat clear of its shoulders, mounted on halftone paper with a signal shape at the foot.',
    instead: 'a balloon on a string',
    hash: '5efe13abb7d3',
    w: 321,
    h: 720,
  },
  {
    id: 'char-walkers',
    family: 'MOUNTED',
    subject:
      'Two figures walking arm in arm in tailored suits, mounted on halftone paper beside a dark bar.',
    instead: 'a Praktica SLR and a Polaroid camera',
    hash: 'e29b017b52be',
    w: 522,
    h: 980,
  },

  /* ---- CUT — the same works, scissored out against white ----------------- */
  {
    id: 'pop-clock-watch',
    family: 'CUT',
    subject: 'A figure in a check suit checking a wristwatch, cut out against white.',
    instead: 'a ringing alarm clock reading eight o’clock',
    hash: '0931f55c306a',
    w: 428,
    h: 583,
  },
  {
    id: 'pop-bulb-armchair',
    family: 'CUT',
    subject:
      'A figure in a dinner jacket sprawled across a buttoned armchair, cut out against white.',
    instead: 'a large filament light bulb',
    hash: '9a4d637f397b',
    w: 376,
    h: 664,
  },
  {
    id: 'pop-cube-thinker',
    family: 'CUT',
    subject:
      'A figure in a period blouse, one hand raised to where a chin would be, on a grey disc.',
    instead: 'a Rubik’s cube',
    hash: '23277c0c1520',
    w: 422,
    h: 591,
  },
  {
    id: 'pop-hat-balloon',
    family: 'CUT',
    subject: 'A suited figure lifting a hat clear of its shoulders, cut out against white.',
    instead: 'a balloon on a string',
    hash: 'ba5a0c75b44a',
    w: 392,
    h: 637,
  },
  {
    id: 'pop-camera-duo',
    family: 'CUT',
    subject: 'Two figures walking arm in arm in tailored suits, cut out against white.',
    instead: 'a Praktica SLR and a Polaroid camera',
    hash: '096a6ca1bb5e',
    w: 402,
    h: 621,
  },
  {
    id: 'pop-hands-a',
    family: 'CUT',
    subject:
      'Two hands clasped at the wrist, forming the apex of a letter A whose serif legs are drawn in solid black beneath them. A letterform built out of a grip.',
    instead: null,
    hash: '9dc87ab81b87',
    w: 435,
    h: 573,
  },
  {
    id: 'pop-white-flag',
    family: 'CUT',
    subject:
      'A hand reaching up through a hole cut in a grey card, waving a small white flag, with a black disc in the upper corner.',
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

export const CUT = SPECIMENS.filter((s) => s.family === 'CUT');
export const MOUNTED = SPECIMENS.filter((s) => s.family === 'MOUNTED');

/**
 * The same work in its other state, where one exists.
 *
 * Two of the cut-outs (`pop-hands-a`, `pop-white-flag`) were never mounted, and
 * two of the mounted plates (`char-expressionist`, `char-trendsetter`) were
 * never supplied cut out. Recorded as `null` rather than guessed.
 */
export const COUNTERPART: Record<string, string | null> = {
  'char-anchor': 'pop-clock-watch',
  'char-challenger': 'pop-bulb-armchair',
  'char-fixer': 'pop-cube-thinker',
  'char-visionary': 'pop-hat-balloon',
  'char-walkers': 'pop-camera-duo',
  'char-expressionist': null,
  'char-trendsetter': null,
  'pop-clock-watch': 'char-anchor',
  'pop-bulb-armchair': 'char-challenger',
  'pop-cube-thinker': 'char-fixer',
  'pop-hat-balloon': 'char-visionary',
  'pop-camera-duo': 'char-walkers',
  'pop-hands-a': null,
  'pop-white-flag': null,
};

/** The path a reality loads. Nothing here is bundled; these are public files. */
export function specimenSrc(id: string): string {
  return `/brand/${id}.avif`;
}
