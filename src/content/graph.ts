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
    from: 'time-machine',
    to: 'reality-index',
    because: 'The last era on the scrubber is the Lab you are standing in.',
  },
  {
    from: 'after-dark',
    to: 'sonic-architecture',
    because: 'The room is already dark. Give it a sound.',
  },
];

/** Onward moves from a reality. At most two are ever offered. */
export function edgesFrom(id: string): Edge[] {
  return EDGES.filter((e) => e.from === id).slice(0, 2);
}

/** What leads here — used by the Index to draw relationships. */
export function edgesTo(id: string): Edge[] {
  return EDGES.filter((e) => e.to === id);
}

export function relatedTo(id: string): string[] {
  return [
    ...new Set([...edgesFrom(id).map((e) => e.to), ...edgesTo(id).map((e) => e.from)]),
  ];
}
