/**
 * THE REALITY GRAPH.
 *
 * Sixteen realities that each work alone still add up to sixteen demos. This is
 * the small set of edges that make them one system — and it is small on
 * purpose. Every edge has to answer "why does this reality lead to that one",
 * in a sentence a visitor would accept.
 *
 * WHAT THIS IS NOT
 * It is not a "next mode" button, and it is not a maze. The Reality Index stays
 * universally reachable, Escape stays universally reliable, and no edge is ever
 * the only way out of anywhere. A reality offers at most two onward moves, in
 * its own ending or resting state, and never interrupts to do it.
 *
 * The edge's `because` is displayed. If it cannot be said plainly, the edge
 * should not exist.
 */

import { MODES } from './lab';

export interface Edge {
  from: string;
  to: string;
  /** Shown to the visitor. The reason the move is worth making. */
  because: string;
}

export const EDGES: Edge[] = [
  {
    from: 'reality-compiler',
    to: 'living-world',
    because: 'The document you just compiled is the territory next door.',
  },
  {
    from: 'living-world',
    to: 'memory',
    because: 'A territory is what an archive looks like before it decays.',
  },
  {
    from: 'memory',
    to: 'director',
    because: 'An archive with an order becomes a film.',
  },
  {
    from: 'director',
    to: 'living-world',
    because: 'The film ends by entering the world it described.',
  },
  {
    from: 'agency-simulator',
    to: 'anzy-os',
    because: 'A method that has been decided becomes a system you can run.',
  },
  {
    from: 'anzy-os',
    to: 'performance',
    because: 'A system that runs can be asked how it is doing.',
  },
  {
    from: 'dream',
    to: 'sonic-architecture',
    because: 'Generated form has a generated sound.',
  },
  {
    from: 'matter-engine',
    to: 'presence',
    because: 'Matter that answers a pointer will answer a body.',
  },
  {
    from: 'chaos',
    to: 'reality-compiler',
    because: 'Everything that was taken apart is put back somewhere.',
  },
  {
    from: 'portal',
    to: 'living-world',
    because: 'Through the aperture is the territory.',
  },
  {
    from: 'x-ray',
    to: 'reality-compiler',
    because: 'A measured document is ready to be lifted off the page.',
  },
  {
    from: 'after-dark',
    to: 'sonic-architecture',
    because: 'The room is already dark. Give it a sound.',
  },
];

/**
 * Every endpoint must be a reality.
 *
 * There was a fourteenth edge here pointing at `reality-index`, which is not a
 * mode. It rendered in the mode host as a button reading "REALITY-INDEX" — the
 * raw id, uppercased, hyphen and all — wired to `enterMode()` with an id no
 * mode has. It survived because both ends were plain strings and nothing ever
 * checked them. The edge is gone (leaving the Index is what EXIT is for, not an
 * onward relationship), and this check makes the next one loud instead of
 * silent. Development only; it is dead code in the production bundle.
 */
if (import.meta.env.DEV) {
  const ids = new Set(MODES.map((m) => m.id));
  for (const e of EDGES) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      console.error(`[graph] edge names a reality that does not exist: ${e.from} -> ${e.to}`);
    }
  }
}

/** Onward moves from a reality. At most two are ever offered. */
export function edgesFrom(id: string): Edge[] {
  return EDGES.filter((e) => e.from === id).slice(0, 2);
}

/*
 * There were two more helpers here — `edgesTo` and `relatedTo` — and the
 * comment on one of them said it was "used by the Index to draw relationships".
 * Nothing used either. A helper with a comment naming a consumer it does not
 * have is a worse artefact than no helper, so both were removed rather than
 * kept warm for a caller that might arrive. `EDGES` is rendered whole by the
 * Reality Index and filtered by `edgesFrom` in the mode host; that is the
 * entire surface, and it is the entire surface that is used.
 */
