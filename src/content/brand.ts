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

/**
 * THE TWO DOORS.
 *
 * `enter` above is kept and still means what it said — it is the label on the
 * launcher's own control. These are the choice that follows it.
 *
 * Neither door is a downgrade of the other and the copy is written so that
 * neither reads as one: "show me" is not a beginner's mode and "show me
 * everything" is not the advanced one. They are a route and a map, and a
 * visitor is trusted to know which they want.
 *
 * The counts are not written here. `six` and `sixteen` are read off `PATH` and
 * `MODES` at render, because a number typed into marketing copy is a claim that
 * goes stale the first time the product changes — this file has already had to
 * fix exactly that once, in `INDEX_COPY.reverse`.
 */
export const DOORS = {
  curated: 'SHOW ME',
  curatedNote: 'A ROUTE THROUGH THE LAB, IN ORDER.',
  free: 'SHOW ME EVERYTHING',
  freeNote: 'THE FULL INDEX, AS A MAP.',
} as const;

/**
 * THE RETURN.
 *
 * Offered once, at the end of the path, and never as an interruption.
 *
 * The brief for this was "do not ruin it with CONTACT US NOW", and the reason
 * that would ruin it is not that it is loud — it is that it changes what the
 * preceding twenty minutes were for. A visitor who has just been shown a
 * company thinking in public will read a hard ask as the reveal that the
 * thinking was bait. So the line does not ask for anything. It states what
 * just happened and offers the obvious next move, which the visitor is free
 * to decline by pressing Escape like everywhere else in the Lab.
 */
export const RETURN_COPY = {
  eyebrow: 'END OF THE ROUTE',
  line: 'You have seen the system explain itself.',
  sub: 'It does the same thing with a real problem, and that version has a client in the room.',
  /** Stays inside the Lab. The rehearsal before the real one. */
  simulate: 'GIVE IT A PROBLEM',
  simulateNote: 'AGENCY SIMULATOR — A DETERMINISTIC MODEL, NOT A PITCH.',
  /** Leaves for the commercial site. */
  commercial: 'TALK TO HI ANZY',
  commercialNote: 'BACK TO THE SITE.',
  /** Neither, thanks. */
  stay: 'KEEP EXPLORING',
  stayNote: 'THE REST OF THE INDEX.',
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
 * WHY THIS REALITY IS NOT BEING DRAWN IN WEBGL.
 *
 * The `lite` spatial tier sets `webgl: false` whatever the machine can actually
 * do, and four realities printed "…which is unavailable here" off the back of
 * it. On a reduced-motion visitor's perfectly capable browser that sentence is
 * simply false — the Lab telling someone their browser is broken because they
 * asked for less movement. It is the same failure as the index note that
 * claimed one reality was online for two phases: copy asserting something the
 * system had not checked.
 *
 * So the reason is derived from the actual capability, and there are three of
 * them. `indexNote()` above exists for the same reason and is worth reading
 * alongside this.
 */
export function spatialFallbackReason(
  subject: string,
  cap: { webgl: boolean; reducedMotion: boolean },
): string {
  if (!cap.webgl) return `${subject} needs WebGL, which is unavailable here.`;
  if (cap.reducedMotion)
    return `${subject} is not drawn in WebGL here: you have asked for reduced motion, and this is the calm version.`;
  return `${subject} is not drawn in WebGL here, to stay light on this device.`;
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
  /*
   * These four headings were ABSORB · CLARIFY · BLUEPRINT · ASSEMBLE — the
   * stage names of a methodology the company stopped using. Nothing here ever
   * claimed to be the method, and that is exactly why it survived three
   * content-truth sweeps: it is a specimen about interfaces, so nobody read it
   * as a methodology statement. A visitor who knows the real five stages would
   * have, and the Lab spent Phase 5.5 removing precisely that confusion.
   *
   * The words are now what the columns actually argue, and deliberately none
   * of them collides with AUDIT · ARCHITECT · BUILD · CONNECT · SCALE either.
   * The specimen is about reading a sheet; it is not a second method.
   *
   * ASSEMBLE was the last of the retired five still standing here. It read as
   * ordinary English rather than as a stage name, which is why it survived the
   * earlier sweep — but it is one of the exact words the retired method used,
   * and a visitor who has seen the old deck has no way to know this column is
   * not quoting it. GATHER argues the same thing and belongs to neither method.
   */
  columns: [
    {
      head: 'LOOK',
      body: 'Nothing useful starts with an answer. It starts with a long, undefended look at the thing as it actually is — including the parts that contradict each other.',
    },
    {
      head: 'ORDER',
      body: 'Ambiguity is not removed, it is ordered. What matters is separated from what is merely loud, and the shape of the real problem is allowed to appear.',
    },
    {
      head: 'DRAW',
      body: 'A problem becomes a drawing: measured, annotated, and specific enough that other people can build from it without being in the room.',
    },
    {
      head: 'GATHER',
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
  subjectLabel: 'SUBJECT',
  reportLabel: 'SYSTEM SPECIMEN REPORT',
} as const;
