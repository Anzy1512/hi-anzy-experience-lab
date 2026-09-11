import { EDGES } from './graph';
import { MODES } from './lab';

/**
 * THE CURATED JOURNEY.
 *
 * Sixteen realities is a collection. This is the six that make an argument.
 *
 * ── WHY A PATH AT ALL ───────────────────────────────────────────────────────
 *
 * The Reality Index is a good map and a bad first move. A visitor arriving from
 * the commercial site has no way to know that Memory is the best thing here, or
 * that Living World costs the most to load, or which two realities are actually
 * the same idea seen twice. Handing them sixteen equal rows asks them to do the
 * curation, and most people answer that question by leaving.
 *
 * So there are two doors, and the Index is the second one. Neither is hidden.
 *
 * ── HOW THE ORDER WAS CHOSEN ────────────────────────────────────────────────
 *
 * Rhythm first, then evidence. The path alternates what it asks of the visitor
 * — read, walk, answer, operate, hold, watch — and it alternates material so
 * that no two consecutive stops look like the same room. It ends on the one
 * stop that asks nothing at all, because a film is the right thing to hand
 * somebody before asking whether they would like to talk.
 *
 *   01 REALITY COMPILER   ink     read     a page becomes a place
 *   02 LIVING WORLD       ink     walk     the place is a territory
 *   03 AGENCY SIMULATOR   paper   answer   the territory has a method
 *   04 ANZY.OS            ink     operate  the method is a system you run
 *   05 MEMORY             ink     hold     the system keeps a record
 *   06 DIRECTOR           ink     watch    the record has an order
 *
 * ── THE TRANSITIONS ARE NOT INVENTED ────────────────────────────────────────
 *
 * Three of the five moves are edges that already exist in `graph.ts`, authored
 * long before this path, and those use the graph's own `because` verbatim —
 * `edgeBecause()` reads it rather than restating it, so the two can never drift.
 * The other two are curatorial: they are a curator saying why this room follows
 * that one, and they are written in that voice. Neither claims one reality
 * produced the other, because neither did.
 *
 * ── WHAT IT DELIBERATELY LEAVES OUT ─────────────────────────────────────────
 *
 * X-Ray, Performance, Chaos, After Dark, Dream, Sonic, Time Machine, Matter,
 * Portal and Presence are not on it. Several are among the strongest work in
 * the Lab — Performance and Sonic especially. They are left off because a path
 * that contains everything is the Index with extra steps, and because finding
 * Chaos yourself is a better version of Chaos than being walked to it.
 */

/** What a stop is here to demonstrate. Shown to the visitor. */
export type Capability =
  | 'SYSTEM THINKING'
  | 'SPATIAL DESIGN'
  | 'BUSINESS THINKING'
  | 'TECHNOLOGY'
  | 'TRUTH & EVIDENCE'
  | 'VISUAL CULTURE';

export interface Stop {
  id: string;
  /** The capability this stop is carrying for the path. */
  capability: Capability;
  /**
   * Why this reality follows the one before it.
   *
   * `null` on the first stop, and on any stop whose move is already an edge in
   * `graph.ts` — there the graph's own sentence is used, so there is exactly
   * one copy of it. See `reasonInto()`.
   */
  curatorial: string | null;
}

export const PATH: Stop[] = [
  {
    id: 'reality-compiler',
    capability: 'SYSTEM THINKING',
    curatorial: null,
  },
  {
    id: 'living-world',
    capability: 'SPATIAL DESIGN',
    // graph: reality-compiler -> living-world
    curatorial: null,
  },
  {
    id: 'agency-simulator',
    capability: 'BUSINESS THINKING',
    curatorial: 'You have walked the territory. This is the method that decides what gets built in it.',
  },
  {
    id: 'anzy-os',
    capability: 'TECHNOLOGY',
    // graph: agency-simulator -> anzy-os
    curatorial: null,
  },
  {
    id: 'memory',
    capability: 'TRUTH & EVIDENCE',
    curatorial: 'A system that runs leaves a record. This one is honest about the parts of it that did not survive.',
  },
  {
    id: 'director',
    capability: 'VISUAL CULTURE',
    // graph: memory -> director
    curatorial: null,
  },
];

/**
 * THE FIRST MAJOR EXPERIENCE.
 *
 * Weighed against Living World, Memory and Anzy.OS on orientation, recognition,
 * cognitive load and cost to arrive:
 *
 *   LIVING WORLD   the biggest payoff and the worst opener. Extreme cost, and
 *                  it drops a visitor into an unexplained territory with a
 *                  drag-to-look control they have not been taught yet.
 *   MEMORY         the best reality in the Lab and still not the door. It is
 *                  an archive of something you have not been shown, so its
 *                  restraint reads as emptiness on arrival rather than as care.
 *   ANZY.OS        needs interface literacy before it rewards anything.
 *   REALITY COMPILER ▸ starts as a page — the exact thing the visitor was just
 *                  looking at on the commercial site — sets HI ANZY large in
 *                  the real wordmark, and then takes the page apart into space.
 *                  It teaches the Lab's whole premise using the one interface
 *                  the visitor already knows how to read.
 *
 * It is also the cheapest of the four to be wrong about: `cost: 'high'` rather
 * than `'extreme'`, and its document is legible before a single plane moves.
 *
 * Nothing in Reality Compiler was changed to qualify it for this.
 */
export const ENTRY_ID = PATH[0].id;

/**
 * THE MOBILE PATH IS THE SAME PATH.
 *
 * Checked against each stop's own declared requirements rather than assumed:
 * four of the six are `mobile: 'full'`, and the two that are `'adapted'`
 * (Reality Compiler, Living World) have authored mobile presentations rather
 * than degraded ones. Nothing on the path needs a camera, an immersive session
 * or device tilt, so nothing on it can land on hardware the Lab cannot verify.
 *
 * Reordering was considered and rejected: it would break the three authored
 * edges that give the path its logic, to solve a problem the requirements say
 * does not exist. Living World on a phone is the drawn fallback, which is a
 * weaker payoff and an honest one — and it stays on the path, because hiding
 * the heavier realities from mobile visitors would be deciding for them.
 */
export const MOBILE_PATH = PATH;

/* -------------------------------------------------------------------------- */

export function stopAt(index: number): Stop | null {
  return PATH[index] ?? null;
}

export function indexOfStop(id: string): number {
  return PATH.findIndex((s) => s.id === id);
}

export function isOnPath(id: string): boolean {
  return indexOfStop(id) >= 0;
}

/**
 * The sentence for moving into `PATH[i]`, preferring the graph's own.
 *
 * A stop whose predecessor is a real edge has no `curatorial` line, and reads
 * the edge instead — so the path can never contradict the graph, and editing
 * the graph edits the path.
 */
export function reasonInto(i: number): string | null {
  const stop = PATH[i];
  if (!stop || i === 0) return null;
  const prev = PATH[i - 1];
  const edge = EDGES.find((e) => e.from === prev.id && e.to === stop.id);
  return edge ? edge.because : stop.curatorial;
}

/** Whether the move into `PATH[i]` is an authored graph edge rather than curation. */
export function isEdgeMove(i: number): boolean {
  const stop = PATH[i];
  if (!stop || i === 0) return false;
  const prev = PATH[i - 1];
  return EDGES.some((e) => e.from === prev.id && e.to === stop.id);
}

/**
 * Every stop must be a reality that exists and is enterable, and every
 * curatorial line must be doing work the graph is not already doing.
 *
 * `graph.ts` learned this lesson the expensive way — it shipped an edge naming
 * a mode that did not exist, which rendered as a button reading the raw id,
 * because both ends were plain strings and nothing checked them.
 * Development only; dead code in production.
 */
if (import.meta.env.DEV) {
  const byId = new Map(MODES.map((m) => [m.id, m]));
  PATH.forEach((s, i) => {
    const mode = byId.get(s.id);
    if (!mode) {
      console.error(`[journey] stop ${i} names a reality that does not exist: ${s.id}`);
      return;
    }
    if (mode.status !== 'online') {
      console.error(`[journey] stop ${i} is not online: ${s.id}`);
    }
    if (i > 0 && !isEdgeMove(i) && !s.curatorial) {
      console.error(`[journey] stop ${i} (${s.id}) has no edge and no curatorial reason`);
    }
    if (isEdgeMove(i) && s.curatorial) {
      console.error(`[journey] stop ${i} (${s.id}) restates an edge the graph already says`);
    }
  });
}
