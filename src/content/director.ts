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

  /* ---- ACT II — THE PROBLEM --------------------------------------------- */
  {
    kind: 'statement',
    act: 1,
    dur: 4.8,
    lines: ['MOST BRANDS ARE ASSEMBLED', 'FROM PARTS THAT NEVER MET.'],
  },
  { kind: 'scatter', act: 1, dur: 6.2, caption: 'FOUR AGENCIES. FOUR ANSWERS. ONE COMPANY.' },
  { kind: 'statement', act: 1, dur: 4.0, lines: ['A COMPANY IS NOT', 'A LIST OF SERVICES.'], still: true },

  /* ---- ACT III — STRUCTURE ---------------------------------------------- */
  { kind: 'grid', act: 2, dur: 5.4, caption: 'MEASURE FIRST' },
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

/** The method, as the deck states it. */
export const STAGES = ['ABSORB', 'CLARIFY', 'BLUEPRINT', 'ASSEMBLE', 'SUSTAIN'];

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
