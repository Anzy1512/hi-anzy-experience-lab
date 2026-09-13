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
   * Why this shot is in the film.
   *
   * Not a caption and never drawn over the picture. It is the line a director
   * would write beside a frame in a treatment, and it exists because the honest
   * test of a cut is whether every shot can answer "what is this one doing" in
   * one sentence. A shot that needs a paragraph is a weak shot; a shot with no
   * answer should be cut. Writing these is how the primary edit gets audited.
   *
   * It is read by `treatment.ts` and printed in the exported treatment — the
   * film itself stays uncovered.
   */
  intent?: string;
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
export const SHOTS_LONG: Shot[] = [
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
    intent: 'State the thesis once, flat, with no motion. Everything after this is evidence for it.',
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
    intent: 'Name the problem the company exists to solve. The first line the viewer can disagree with.',
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
    intent: 'A puzzle held, unfinished. The pivot from problem to method — it can be solved, and nobody has solved it yet.',
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
    intent: 'The thesis shot. A travelling crop finds a clock, then a wristwatch — the camera discovers the repetition instead of the caption asserting it. The longest shot in the cut because it is the one doing the most work.',
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
    intent: 'Close on possibility rather than on a promise. The crop rises to a balloon that is still held — ambition with something anchoring it.',
  },
  { kind: 'end', act: 5, dur: 6.5, still: true },
];

/* -------------------------------------------------------------------------- */
/* THE PRIMARY CUT                                                             */
/* -------------------------------------------------------------------------- */

/**
 * THE CUT THAT SHIPS — fourteen shots, about sixty seconds.
 *
 * The long edit above runs 1:51 across twenty-two shots, and length was its
 * real problem: not one of those shots is bad, but a film that asks for two
 * minutes has to *need* two minutes, and this one restates itself three times
 * to fill them. "A COMPANY IS NOT A LIST OF SERVICES" says what "MOST BRANDS
 * ARE ASSEMBLED FROM PARTS THAT NEVER MET" has already said, better. Two of the
 * three `mark` shots are punctuation with nothing between them to punctuate.
 * Both `grid` shots make the same argument at different captions.
 *
 * ── WHAT SURVIVED, AND ON WHAT TEST ─────────────────────────────────────────
 *
 * Every shot has to answer three questions the instant it appears: what am I
 * looking at, why is it here, and what changed from the last frame. Anything
 * that could only answer the first was cut.
 *
 * All four specimens survived, and they are the reason the cut works. They are
 * photographs the company owns, each one carrying an argument no line of type
 * on black can make: two figures walking in step with cameras for heads; a
 * figure with an unsolved cube where its head should be; a clock and a wristwatch
 * measuring the same thing at two scales; a hat tethered to a balloon. The
 * `pop-clock-watch` shot in particular *is* the thesis — the camera travels from
 * the clock to the watch and finds the repetition rather than asserting it.
 *
 * The method survives whole, because it is the one piece of canonical content in
 * the film. `stages` loses two seconds, not a stage.
 *
 * ── THE SHAPE ───────────────────────────────────────────────────────────────
 *
 *   IDENTITY   the wordmark, and the claim
 *   HUMAN      two people, one direction
 *   PROBLEM    parts that never met, and the thing still unsolved
 *   MEASURE    look before you build
 *   METHOD     the five stages, named
 *   SYSTEM     the field resolved, rendered many ways
 *   WORLD      enter
 *   POSSIBILITY  tethered, and still rising
 */
export const SHOTS_PRIMARY: Shot[] = [
  /* ---- IDENTITY --------------------------------------------------------- */
  {
    kind: 'wordmark',
    act: 0,
    dur: 4.0,
    anchor: 'centre',
    intent: 'Establish whose film this is before anything is claimed. The logotype is out of register and pulls into it — the company introducing itself by showing its own construction.',
  },
  {
    kind: 'statement',
    act: 0,
    dur: 3.4,
    lines: ['ONE COMPANY.', 'MULTIPLE REALITIES.'],
    still: true,
    anchor: 'left',
  },
  /* ---- HUMAN ------------------------------------------------------------- */
  {
    kind: 'specimen',
    act: 0,
    dur: 4.6,
    specimen: 'char-walkers',
    caption: 'TWO WAYS OF LOOKING · ONE DIRECTION',
    lens: 'hold',
    anchor: 'right',
    intent: 'Put people in the film early. Two figures walking the same way is the thesis as a picture rather than as a sentence.',
  },

  /* ---- PROBLEM ----------------------------------------------------------- */
  {
    kind: 'statement',
    act: 1,
    dur: 4.2,
    lines: ['MOST BRANDS ARE ASSEMBLED', 'FROM PARTS THAT NEVER MET.'],
    anchor: 'left',
  },
  {
    kind: 'scatter',
    act: 1,
    dur: 4.6,
    caption: 'FOUR AGENCIES. FOUR ANSWERS. ONE COMPANY.',
    intent: 'Show the problem as behaviour: four disciplines answering separately and never converging. The scatter is the argument.',
  },
  {
    kind: 'specimen',
    act: 1,
    dur: 5.0,
    specimen: 'pop-cube-thinker',
    caption: 'SOLVABLE. NOT YET SOLVED.',
    lens: 'close',
    focus: 0.27,
    anchor: 'left',
  },

  /* ---- MEASURE ----------------------------------------------------------- */
  {
    kind: 'grid',
    act: 2,
    dur: 4.2,
    caption: 'MEASURE FIRST',
    intent: 'The method begins with measurement, so the film draws the measure before it draws any answer.',
  },
  /* The thesis shot. The camera finds the repetition instead of claiming it. */
  {
    kind: 'specimen',
    act: 2,
    dur: 5.4,
    specimen: 'pop-clock-watch',
    caption: 'THE SAME MEASURE, TWICE',
    lens: 'down',
    focus: 0.34,
    focusTo: 0.71,
    anchor: 'right',
  },

  /* ---- METHOD ------------------------------------------------------------ */
  {
    kind: 'stages',
    act: 2,
    dur: 6.6,
    caption: 'THE METHOD',
    anchor: 'left',
    intent: 'The five stages, named. The only shot that states process directly, and the reason it can be this long is that it is the one thing a viewer might write down.',
  },

  /* ---- SYSTEM ------------------------------------------------------------ */
  {
    kind: 'plate',
    act: 3,
    dur: 4.4,
    caption: 'ONE FIELD, RESOLVED',
    intent: 'The scattered field from act one, now resolved into a single plate. The visual answer to the visual problem.',
  },
  {
    kind: 'roster',
    act: 3,
    dur: 5.0,
    caption: 'THE SAME SYSTEM, RENDERED MANY WAYS',
    anchor: 'left',
    intent: 'Breadth without a client list. Many renderings of one system is what the company can honestly show.',
  },

  /* ---- WORLD ------------------------------------------------------------- */
  {
    kind: 'statement',
    act: 4,
    dur: 3.8,
    lines: ['ENTER', 'HI ANZY.'],
    intent: 'The turn outward. Two words, short, because the film is about to stop explaining and start inviting.',
  },

  /* ---- POSSIBILITY -------------------------------------------------------- */
  {
    kind: 'specimen',
    act: 5,
    dur: 5.2,
    specimen: 'pop-hat-balloon',
    caption: 'TETHERED, AND STILL RISING',
    lens: 'up',
    focus: 0.55,
    focusTo: 0.13,
  },
  {
    kind: 'end',
    act: 5,
    dur: 5.0,
    still: true,
    intent: 'Hold on the mark and let the film end without a call to action. The index is one keystroke away and does not need selling.',
  },
];

export interface Edit {
  shots: Shot[];
  /** Cumulative start time of each shot. */
  cues: number[];
  runtime: number;
}

/** Derive the cue sheet for a cut. Both cuts go through this; neither is special. */
export function makeEdit(shots: Shot[]): Edit {
  let t = 0;
  const cues = shots.map((s) => {
    const start = t;
    t += s.dur;
    return start;
  });
  return { shots, cues, runtime: t };
}

export const PRIMARY_EDIT = makeEdit(SHOTS_PRIMARY);
export const LONG_EDIT = makeEdit(SHOTS_LONG);

/** The cut a visitor gets unless they ask for the other one. */
export const SHOTS = SHOTS_PRIMARY;
export const CUES = PRIMARY_EDIT.cues;
export const RUNTIME = PRIMARY_EDIT.runtime;

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
  cutPrimary: 'THE CUT',
  cutLong: 'THE LONG EDIT',
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
