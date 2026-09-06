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

export interface Shot {
  kind: ShotKind;
  act: number;
  /** Seconds. */
  dur: number;
  lines?: string[];
  caption?: string;
  /** No movement. The shot arrives and holds. */
  still?: boolean;
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

export const SHOTS: Shot[] = [
  /* ---- ACT I — SIGNAL --------------------------------------------------- */
  { kind: 'slate', act: 0, dur: 3.4, caption: 'HA/XL — DIRECTOR', still: true },
  { kind: 'wordmark', act: 0, dur: 5.2 },
  { kind: 'statement', act: 0, dur: 3.6, lines: ['ONE COMPANY.', 'MULTIPLE REALITIES.'], still: true },
  /* Two figures walking in step with cameras for heads. The act is called
     SIGNAL and the line before it is "one company, multiple realities" — this
     is that sentence as a photograph the company already owns. */
  { kind: 'specimen', act: 0, dur: 5.0, specimen: 'char-walkers', caption: 'TWO WAYS OF LOOKING · ONE DIRECTION' },

  /* ---- ACT II — THE PROBLEM --------------------------------------------- */
  {
    kind: 'statement',
    act: 1,
    dur: 4.8,
    lines: ['MOST BRANDS ARE ASSEMBLED', 'FROM PARTS THAT NEVER MET.'],
  },
  { kind: 'scatter', act: 1, dur: 6.2, caption: 'FOUR AGENCIES. FOUR ANSWERS. ONE COMPANY.' },
  { kind: 'statement', act: 1, dur: 4.0, lines: ['A COMPANY IS NOT', 'A LIST OF SERVICES.'], still: true },
  /* A figure with a Rubik's cube where its head should be. There is no better
     image for the act called THE PROBLEM: a thing you can turn all day and
     still not have solved. */
  { kind: 'specimen', act: 1, dur: 5.6, specimen: 'pop-cube-thinker', caption: 'SOLVABLE. NOT YET SOLVED.' },

  /* ---- ACT III — STRUCTURE ---------------------------------------------- */
  { kind: 'grid', act: 2, dur: 5.4, caption: 'MEASURE FIRST' },
  /* A clock and a watch — the same measure at two scales, which is what the
     method is: one sequence that runs a fortnight or a year. */
  { kind: 'specimen', act: 2, dur: 4.8, specimen: 'pop-clock-watch', caption: 'THE SAME MEASURE, TWICE' },
  { kind: 'stages', act: 2, dur: 8.6, caption: 'THE METHOD' },
  { kind: 'statement', act: 2, dur: 3.8, lines: ['STRUCTURE IS', 'THE PRODUCT.'], still: true },

  /* ---- ACT IV — SYSTEM --------------------------------------------------- */
  { kind: 'plate', act: 3, dur: 6.0, caption: 'ONE FIELD, RESOLVED' },
  { kind: 'roster', act: 3, dur: 7.4, caption: 'THE SAME SYSTEM, RENDERED MANY WAYS' },
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
  },
  { kind: 'statement', act: 5, dur: 3.2, lines: ['AND IT SAYS SO.'], still: true },
  /* A hat and a balloon: the lighter thing tethered to the heavier one. The
     act is POSSIBILITY and the film has just finished insisting on structure,
     so it closes on the object that needs both. */
  { kind: 'specimen', act: 5, dur: 5.2, specimen: 'pop-hat-balloon', caption: 'TETHERED, AND STILL RISING' },
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
