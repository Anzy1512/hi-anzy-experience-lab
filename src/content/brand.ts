/**
 * Copy for the Lab.
 *
 * Derived from the source deck's philosophy (docs/HI_ANZY_DECK_CONTENT.md) and
 * rewritten for this medium, as the brief permits. What is NOT here, by rule:
 * clients, creators, venues, media partners, reach figures, awards, results.
 * Those are factual records and they stay in the source document.
 */

export const WORDMARK = {
  a: 'HI',
  b: 'ANZY',
} as const;

export const LAB = {
  system: 'HA/XL',
  sheet: 'SHEET 01',
  label: 'EXPERIENCE LAB',
  statement: ['ONE COMPANY.', 'MULTIPLE REALITIES.'],
  enter: 'ENTER THE LAB',
  initialising: 'INITIALISING',
} as const;

export const INDEX_COPY = {
  eyebrow: 'REALITY INDEX',
  /**
   * Deliberately NOT a sentence with a number written into it.
   *
   * This line read "ONE REALITY IS ONLINE" for two phases after that stopped
   * being true — the product's own copy was making a false claim about the
   * product. The count now comes from the index itself; see `indexNote()`.
   */
  reverse: 'REVERSE SIDE — SUPPORTING EXPERIMENTS',
} as const;

/** The honest version of the note above, computed from the actual index. */
export function indexNote(online: number, total: number): string {
  if (online === 0) return `NONE OF ${total} REALITIES ARE ENTERABLE YET, AND THEY SAY SO.`;
  if (online === 1) return `ONE OF ${total} REALITIES IS ONLINE. THE REST SAY SO.`;
  // All of them. There is no "rest" to be honest about, so do not claim one —
  // the previous line read "16 of 16 are online, the rest are not built".
  if (online === total) return `ALL ${total} REALITIES ARE ONLINE. EVERY ROW BELOW CAN BE ENTERED.`;
  return `${online} OF ${total} REALITIES ARE ONLINE. THE REST ARE NOT BUILT, AND SAY SO.`;
}

/**
 * The X-Ray specimen. A real editorial composition, built so that X-Ray has
 * something honest to measure. The text is the Lab's own position statement,
 * carrying the deck's ideas without repeating its sentences.
 */
export const SPECIMEN = {
  plate: 'PLATE 01',
  kicker: 'SPECIMEN',
  title: 'THE SHEET',
  subtitle: 'A composition, and everything holding it up.',
  standfirst:
    'Every interface is two things at once: the surface someone reads, and the structure that makes the surface possible. Only one of them is usually allowed to be seen.',
  columns: [
    {
      head: 'ABSORB',
      body: 'Nothing useful starts with an answer. It starts with a long, undefended look at the thing as it actually is — including the parts that contradict each other.',
    },
    {
      head: 'CLARIFY',
      body: 'Ambiguity is not removed, it is ordered. What matters is separated from what is merely loud, and the shape of the real problem is allowed to appear.',
    },
    {
      head: 'BLUEPRINT',
      body: 'A problem becomes a drawing: measured, annotated, and specific enough that other people can build from it without being in the room.',
    },
    {
      head: 'ASSEMBLE',
      body: 'The right capabilities are brought to the drawing, in the order the drawing asks for. The team follows the work; the work does not follow the team.',
    },
  ],
  caption: 'FIG. 01 — CONTOUR SPECIMEN. PROCEDURAL. SEEDED. NO PHOTOGRAPHIC SOURCE.',
  colophon:
    'SET IN RAJDHANI AND IBM PLEX. COMPOSED ON A 12-COLUMN SHEET. MEASURED LIVE BY THE X-RAY INSTRUMENT.',
} as const;

export const XRAY_COPY = {
  title: 'X-RAY',
  tagline: 'SEE BENEATH THE INTERFACE.',
  hintPointer: 'MOVE TO SCAN · CLICK TO HOLD',
  hintTouch: 'TAP AN ELEMENT TO SCAN',
  exit: 'EXIT EXPERIENCE',
} as const;
