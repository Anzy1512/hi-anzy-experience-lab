import { METHOD_LABELS } from './canonical';
/**
 * THE SCRIPT.
 *
 * Director is not a showreel, a slideshow or a video. It is a **timeline of
 * authored shots**, and this file is the edit: durations, acts, and the exact
 * words. Everything is progress-driven — each shot receives `p` from 0 to 1 —
 * so pausing is simply not advancing the clock, and there is no CSS animation
 * anywhere that could keep running after the film has stopped.
 *
 * Pacing is part of the writing. Several shots deliberately contain no movement
 * at all: `still: true` means the composition arrives and then holds, because a
 * film where every second moves has no emphasis left to spend.
 */

export type ShotKind =
  | 'slate'
  | 'wordmark'
  | 'statement'
  | 'scatter'
  | 'grid'
  | 'stages'
  | 'plate'
  | 'roster'
  | 'mark'
  | 'specimen'
  | 'end';

/**
 * WHERE IN THE GATE THE SHOT SITS.
 *
 * Every shot used to be centred, because `.dr-shot` was `place-items: center`
 * and nothing ever overrode it. Twenty-one consecutive centred compositions is
 * not an edit, it is a slideshow — and it is the same failure the OS had with
 * seven identically-constructed windows. A frame has corners and thirds, and
 * using them is what makes one shot cut to another instead of replacing it.
 */
export type Anchor = 'centre' | 'left' | 'right' | 'low';

/**
 * HOW THE CAMERA HOLDS A SPECIMEN.
 *
 * The four brand plates were all shown the same way: whole, centred, 330px
 * wide, in a 1440px frame — a postcard on a wall, four times. A film has a lens
 * and this gives it one.
 *
 *   hold   the whole plate, held. Composed to one side with type opposite.
 *   close  a tight crop, aimed at `focus`, still.
 *   down   a crop that travels down the plate, `focus` → `focusTo`.
 *   up     the same, travelling up.
 *
 * `close`, `down` and `up` magnify past native, and that is deliberate rather
 * than careless. `MotifFrame.js` on the commercial site refuses hero scale
 * because "reproducing scanned pop-art collage at hero scale would look like a
 * screenshot of a PDF" — true of a whole plate blown up, which is why `hold`
 * never exceeds native. A close-up is the opposite claim: it does not pretend
 * the scan is sharp, it puts the halftone rosette and the scissored edge on
 * screen at the size where they read as material. `specimens.ts` already makes
 * that argument at specimen scale; this is the same argument one step in.
 */
export type Lens = 'hold' | 'close' | 'down' | 'up';

export interface Shot {
  kind: ShotKind;
  act: number;
  /** Seconds. */
  dur: number;
  lines?: string[];
  caption?: string;
  /** No movement. The shot arrives and holds. */
  still?: boolean;
  /** Where in the gate this shot composes. Defaults to `centre`. */
  anchor?: Anchor;
  /** For `kind: 'specimen'`. Defaults to `hold`. */
  lens?: Lens;
  /**
   * Where the subject sits in the plate, 0 at the top edge and 1 at the
   * bottom. Read off the images themselves rather than guessed: the cube in
   * `pop-cube-thinker` runs 0.08–0.45, the alarm clock in `pop-clock-watch`
   * 0.18–0.52 with the wristwatch at 0.68–0.75, the balloon in
   * `pop-hat-balloon` 0.03–0.22.
   */
  focus?: number;
  /** Where a travelling crop ends. Ignored unless `lens` is `down` or `up`. */
  focusTo?: number;
  /**
   * A `SPECIMENS` id, for `kind: 'specimen'`.
   *
   * Four of these across six acts, and each one is chosen because the image
   * argues the line beside it — not because the film needed a picture. A film
   * about a company that had no images of anything was the largest single gap
   * in this reality; four is enough to close it and few enough that it does not
   * become a slideshow.
   */
  specimen?: string;
}

export const ACTS = [
  'SIGNAL',
  'THE PROBLEM',
  'STRUCTURE',
  'SYSTEM',
  'WORLD',
  'POSSIBILITY',
] as const;

/**
 * THE EDIT.
 *
 * `anchor` is doing as much work here as `dur` does. Read the column: low,
 * centre, left, centre · left, centre, right, left · centre, right, left, low ·
 * centre, left, centre · centre, centre, centre · left, low, centre, centre.
 * Nothing sits in the same place twice in a row except where the pairing is
 * deliberate — Act V is three centred shots because it is the act that says
 * ENTER, and by then a centred frame has become an event rather than a habit.
 */
export const SHOTS: Shot[] = [
  /* ---- ACT I — SIGNAL --------------------------------------------------- */
  /* A slate is stamped at the foot of the frame, not floated in the middle. */
  { kind: 'slate', act: 0, dur: 3.4, caption: 'HA/XL — DIRECTOR', still: true, anchor: 'low' },
  { kind: 'wordmark', act: 0, dur: 5.2, anchor: 'centre' },
  {
    kind: 'statement',
    act: 0,
    dur: 3.6,
    lines: ['ONE COMPANY.', 'MULTIPLE REALITIES.'],
    still: true,
    anchor: 'left',
  },
  /* Two figures walking in step with cameras for heads. The act is called
     SIGNAL and the line before it is "one company, multiple realities" — this
     is that sentence as a photograph the company already owns.

     Held whole, and the only one of the four that is: the line is about both
     of them together, and cropping in would leave one figure outside the
     frame arguing the opposite. */
  {
    kind: 'specimen',
    act: 0,
    dur: 5.0,
    specimen: 'char-walkers',
    caption: 'TWO WAYS OF LOOKING · ONE DIRECTION',
    lens: 'hold',
    /* Right, not left. Played back, Act I ran statement-left, specimen-left,
       statement-left — three consecutive shots composed into the same third,
       which is the habit this whole pass exists to break. It also spreads the
       four specimens across the frame: right, left, right, centre. */
    anchor: 'right',
  },

  /* ---- ACT II — THE PROBLEM --------------------------------------------- */
  {
    kind: 'statement',
    act: 1,
    dur: 4.8,
    lines: ['MOST BRANDS ARE ASSEMBLED', 'FROM PARTS THAT NEVER MET.'],
    anchor: 'left',
  },
  { kind: 'scatter', act: 1, dur: 6.2, caption: 'FOUR AGENCIES. FOUR ANSWERS. ONE COMPANY.' },
  {
    kind: 'statement',
    act: 1,
    dur: 4.0,
    lines: ['A COMPANY IS NOT', 'A LIST OF SERVICES.'],
    still: true,
    anchor: 'right',
  },
  /* A figure with a Rubik's cube where its head should be. There is no better
     image for the act called THE PROBLEM: a thing you can turn all day and
     still not have solved — so the film stops turning and looks straight at
     it. A still close-up, aimed at the cube, which runs 0.08–0.45 down the
     plate. */
  {
    kind: 'specimen',
    act: 1,
    dur: 5.6,
    specimen: 'pop-cube-thinker',
    caption: 'SOLVABLE. NOT YET SOLVED.',
    lens: 'close',
    focus: 0.27,
    anchor: 'left',
  },

  /* ---- ACT III — STRUCTURE ---------------------------------------------- */
  { kind: 'grid', act: 2, dur: 5.4, caption: 'MEASURE FIRST' },
  /* A clock and a watch — the same measure at two scales, which is what the
     method is: one sequence that runs a fortnight or a year.

     The caption *is* the camera move. The shot opens on the alarm clock where
     the head should be (0.34) and travels down to the wristwatch the figure is
     checking (0.71): the same measure, twice, found by moving rather than
     asserted by a line of type. This is the shot the whole lens idea is for. */
  {
    kind: 'specimen',
    act: 2,
    dur: 6.4,
    specimen: 'pop-clock-watch',
    caption: 'THE SAME MEASURE, TWICE',
    lens: 'down',
    focus: 0.34,
    focusTo: 0.71,
    anchor: 'right',
  },
  { kind: 'stages', act: 2, dur: 8.6, caption: 'THE METHOD', anchor: 'left' },
  {
    kind: 'statement',
    act: 2,
    dur: 3.8,
    lines: ['STRUCTURE IS', 'THE PRODUCT.'],
    still: true,
    anchor: 'low',
  },

  /* ---- ACT IV — SYSTEM --------------------------------------------------- */
  { kind: 'plate', act: 3, dur: 6.0, caption: 'ONE FIELD, RESOLVED' },
  { kind: 'roster', act: 3, dur: 7.4, caption: 'THE SAME SYSTEM, RENDERED MANY WAYS', anchor: 'left' },
  { kind: 'mark', act: 3, dur: 3.2, still: true },

  /* ---- ACT V — WORLD ----------------------------------------------------- */
  { kind: 'statement', act: 4, dur: 4.4, lines: ['ENTER', 'HI ANZY.'] },
  { kind: 'grid', act: 4, dur: 5.0, caption: 'TERRITORY' },
  { kind: 'mark', act: 4, dur: 3.4, still: true },

  /* ---- ACT VI — POSSIBILITY ---------------------------------------------- */
  {
    kind: 'statement',
    act: 5,
    dur: 4.2,
    lines: ['THE REST IS', 'NOT BUILT YET.'],
    still: true,
    anchor: 'left',
  },
  { kind: 'statement', act: 5, dur: 3.2, lines: ['AND IT SAYS SO.'], still: true, anchor: 'low' },
  /* A hat and a balloon: the lighter thing tethered to the heavier one. The
     act is POSSIBILITY and the film has just finished insisting on structure,
     so it closes on the object that needs both.

     The last image in the film rises. The crop starts on the suited figure
     lifting its hat (0.55) and travels up to the balloon (0.13), so the closing
     move of the edit is the one the caption describes. */
  {
    kind: 'specimen',
    act: 5,
    dur: 6.0,
    specimen: 'pop-hat-balloon',
    caption: 'TETHERED, AND STILL RISING',
    lens: 'up',
    focus: 0.55,
    focusTo: 0.13,
  },
  { kind: 'end', act: 5, dur: 6.5, still: true },
];

/** Cumulative start time of each shot, and the total running time. */
export const CUES: number[] = (() => {
  let t = 0;
  return SHOTS.map((s) => {
    const start = t;
    t += s.dur;
    return start;
  });
})();

export const RUNTIME = SHOTS.reduce((a, s) => a + s.dur, 0);

/** The disconnected fragments of Act II. Service language, nothing claimed. */
export const FRAGMENTS = ['STRATEGY', 'DESIGN', 'TECHNOLOGY', 'CULTURE'];

/** The method, as the company's own site states it. */
export const STAGES = METHOD_LABELS;

export const DIRECTOR_COPY = {
  title: 'DIRECTOR',
  tagline: 'WATCH HI ANZY BECOME A SYSTEM.',
  runtime: 'RUNNING TIME',
  soundOn: 'SOUND ON',
  silent: 'SILENT',
  soundNote:
    'The film is written to work in silence. Sound is a layer, never the story, and nothing plays until you choose.',
  begin: 'BEGIN',
  skip: 'SKIP',
  pause: 'PAUSE',
  resume: 'RESUME',
  replay: 'REPLAY',
  endTitle: 'HI ANZY',
  endSub: 'EXPERIENCE LAB',
  /** Counted at render time; a number written into copy goes stale. */
  endLine: (online: number, total: number) =>
    online === total
      ? `All ${total} realities are open.`
      : `${online} of ${total} realities are open. The rest are honest about not existing yet.`,
} as const;
