/**
 * THE TRANSLATION SYSTEM — canonical 2D behaviour, spatialised.
 *
 * The commercial Hi Anzy frontend has an interaction language of its own. This
 * file is where that language crosses into the Lab — **as behaviour, never as
 * code**. No React component is copied across the repository boundary; what
 * crosses is the answer to "what does this thing actually do", expressed as a
 * primitive the Lab's realities can consume.
 *
 * Each primitive names its canonical origin so the lineage is inspectable, and
 * `src/content/canonicalManifest.ts` records the mapping in the other
 * direction.
 *
 * WHAT THIS IS NOT
 * It is not a DOM-to-mesh converter. Turning boxes into extruded boxes is the
 * cheap reading of "make it 3D" and produces a worse version of the page. Every
 * primitive here is a *relationship* — held position, ordered assembly, drawn
 * connection, resolution out of noise — which is what actually survives being
 * moved into space.
 *
 * PROGRESSIVE SPATIALISATION
 * `Stage` describes one source object at six levels of spatialisation. The
 * point is that it is one object: a reality moves it up and down the scale
 * rather than keeping six copies of the content.
 */

/* -------------------------------------------------------------------------- */
/* Progressive spatialisation                                                  */
/* -------------------------------------------------------------------------- */

export const STAGES = [
  /** Semantic HTML, flowing. No transform. */
  'FLAT',
  /** Still flat, but measured — trim, baseline, registration visible. */
  'REGISTERED',
  /** Layers pulled apart in z, still readable as a document. */
  'SEPARATED',
  /** Layers acquire depth relationships and parallax. */
  'DEPTH',
  /** Objects arranged in space rather than on a page. */
  'ASSEMBLED',
  /** A continuous world; the page is no longer the frame. */
  'WORLD',
] as const;

export type Stage = (typeof STAGES)[number];

export function stageIndex(s: Stage): number {
  return STAGES.indexOf(s);
}

/** 0..1 across the whole scale, for driving a continuous transformation. */
export function stageProgress(s: Stage): number {
  return stageIndex(s) / (STAGES.length - 1);
}

/**
 * Whether semantic DOM should still be the delivery mechanism at this stage.
 *
 * The rule the Lab has held since Phase 2: content stays real text for as long
 * as it possibly can. Only past ASSEMBLED does a reality earn the right to
 * deliver meaning through geometry alone — and even then the semantic layer
 * stays in the document for assistive technology.
 */
export function domCarriesContent(s: Stage): boolean {
  return stageIndex(s) <= stageIndex('ASSEMBLED');
}

/* -------------------------------------------------------------------------- */
/* The primitives                                                              */
/* -------------------------------------------------------------------------- */

export type PrimitiveId =
  | 'PINNED_FIELD'
  | 'SPATIAL_DECK'
  | 'ANATOMY_SPINE'
  | 'ORBIT_CLUSTER'
  | 'ROUTE_TRACE'
  | 'GRAIN_RESOLVE'
  | 'DIAGNOSTIC_FIELD'
  | 'PROVENANCE_MARK';

export interface Primitive {
  id: PrimitiveId;
  /** The canonical component this behaviour came from. */
  origin: string;
  /** What the canonical component actually does. */
  canonicalBehaviour: string;
  /** What the Lab does with it. */
  spatialBehaviour: string;
  /** Realities that consume it. A primitive with no consumer is dead weight. */
  consumers: string[];
  /** What happens when motion is not wanted. Never "nothing happens". */
  reducedMotion: string;
}

export const PRIMITIVES: Primitive[] = [
  {
    id: 'PINNED_FIELD',
    origin: 'components/PinnedSequence.js',
    canonicalBehaviour:
      'A section holds still while scroll advances it through its steps, so a five-part method reads as one move rather than five blocks. Every step stays in the DOM; only opacity and transform change.',
    spatialBehaviour:
      'The frame is held and the *content* moves through it. Reality Compiler holds the document plane fixed while its stages advance; Director holds the frame while shots change against a single clock.',
    consumers: ['reality-compiler', 'director'],
    reducedMotion: 'The pin is dropped and the steps render as an ordered list — content is never gated behind the animation.',
  },
  {
    id: 'SPATIAL_DECK',
    origin: 'components/EvidenceDeck.js',
    canonicalBehaviour:
      'A fan of cards in 3D with one forward at a time; a side card can be brought forward, the front one opened. Geometry is tuned per breakpoint rather than hardcoded.',
    spatialBehaviour:
      'Plates arranged in depth with exactly one in focus, the rest legible but receded. Anzy.OS sheets are this at rest; Memory records are this along a corridor.',
    consumers: ['anzy-os', 'memory'],
    reducedMotion: 'The deck lays flat as an ordered stack; selection still works, travel does not.',
  },
  {
    id: 'ANATOMY_SPINE',
    origin: 'components/CaseAnatomy.js',
    canonicalBehaviour:
      'The shape a case study follows, drawn as a spine of ordered steps that fill in one at a time. Steps are passed in rather than duplicated so the diagram cannot drift from the sections it describes.',
    spatialBehaviour:
      "Ordered registers drawn whether or not they are filled, so the surface shows how much of the sequence is still ahead. The Agency Simulator's working table is this primitive.",
    consumers: ['agency-simulator'],
    reducedMotion: 'All registers render at once; the ordering is carried by position and number, not by arrival.',
  },
  {
    id: 'ORBIT_CLUSTER',
    origin: 'components/OrbitSection.js + three/SignalField.js',
    canonicalBehaviour:
      'Relationships arranged around a conceptual centre, opening from a collapsed bar rather than dropping a full 3D fan on the reader. Pulses travel out from the core and back, a few at a time.',
    spatialBehaviour:
      'Districts placed around a centre with routes drawn between them; the centre is the company, the orbit is what it assembles per problem.',
    consumers: ['living-world'],
    reducedMotion: 'Positions hold; pulses stop. The relationships are in the geometry, not the animation.',
  },
  {
    id: 'ROUTE_TRACE',
    origin: 'components/RouteLine.js',
    canonicalBehaviour:
      'The signature orange route — an SVG path that draws itself as you scroll, rendered fully drawn under reduced motion.',
    spatialBehaviour:
      'A drawn connection between two things that have a real dependency. Living World routes, the Agency Simulator\'s ties between fragments of one answer, and the cross-reality graph all use it.',
    consumers: ['living-world', 'agency-simulator', 'reality-index'],
    reducedMotion: 'The route renders complete. It is a relationship, and the relationship exists whether or not it was animated into being.',
  },
  {
    id: 'GRAIN_RESOLVE',
    origin: 'components/DissolveImage.js',
    canonicalBehaviour:
      'Turbulence feeds a displacement map; scrolling scrubs displacement to zero so a picture resolves out of grain rather than appearing. Done as an SVG filter to avoid a third canvas context.',
    spatialBehaviour:
      'Material resolves out of its own residue. Memory reconstructs sampled type from scatter; Dream surfaces words out of a contour field. Both were built before this mapping was made, which is the strongest evidence the two products share a language.',
    consumers: ['memory', 'dream'],
    reducedMotion: 'The resolved state is the rendered state.',
  },
  {
    id: 'DIAGNOSTIC_FIELD',
    origin: 'components/SystemDiagnostic.js',
    canonicalBehaviour:
      'Five parts of a business wired in a loop with one link that fails. The point: nothing is broken on its own — the connection between two working things is what failed.',
    spatialBehaviour:
      'Capability clusters with explicit dependencies, where the reading names what needs what. The Agency Simulator prints exactly this as its dependency section.',
    consumers: ['agency-simulator'],
    reducedMotion: 'The failing link is marked rather than animated.',
  },
  {
    id: 'PROVENANCE_MARK',
    origin: 'components/ProvenanceTag.js',
    canonicalBehaviour:
      'Every piece of work carries a typed label saying who did it — direct, or with a collaborator. The key is byte-stable because it is also an API contract.',
    spatialBehaviour:
      'Credit and its absence are both first-class marks. Memory prints UNRECOVERED for fields it does not hold, which is the same discipline applied to a gap instead of a name.',
    consumers: ['memory', 'performance'],
    reducedMotion: 'A label is a label.',
  },
];

export function primitive(id: PrimitiveId): Primitive | undefined {
  return PRIMITIVES.find((p) => p.id === id);
}

/** Primitives with no declared consumer — dead infrastructure, if any. */
export function orphanPrimitives(): Primitive[] {
  return PRIMITIVES.filter((p) => p.consumers.length === 0);
}
