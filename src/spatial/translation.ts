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
  | 'PROVENANCE_MARK'
  /* ---- Phase 6: extracted from components/three and components/motion ---- */
  | 'LATTICE_ASSEMBLY'
  | 'NOISE_ORDER'
  | 'POSITION_RAIL'
  | 'CONTACT_GAP'
  | 'DERIVED_SUMMARY'
  | 'HALFTONE_FIELD';

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
  /**
   * Whether a reality actually reads this today, or whether it is a mapping
   * that has been made but not yet built.
   *
   * Added in Phase 6 and it is the more useful of the two flags. `consumers`
   * says where a primitive *belongs*; naming a destination is free, and a
   * manifest full of confident destinations is exactly how a translation
   * system comes to describe work nobody did. This says whether the code is
   * there, and PERFORMANCE prints both numbers so the gap is visible rather
   * than implied.
   */
  wired: boolean;
  /** What happens when motion is not wanted. Never "nothing happens". */
  reducedMotion: string;
}

export const PRIMITIVES: Primitive[] = [
  {
    id: 'PINNED_FIELD',
    wired: true,
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
    wired: true,
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
    wired: true,
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
    wired: true,
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
    wired: true,
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
    wired: true,
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
    wired: true,
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
    wired: true,
    origin: 'components/ProvenanceTag.js',
    canonicalBehaviour:
      'Every piece of work carries a typed label saying who did it — direct, or with a collaborator. The key is byte-stable because it is also an API contract.',
    spatialBehaviour:
      'Credit and its absence are both first-class marks. Memory prints UNRECOVERED for fields it does not hold, which is the same discipline applied to a gap instead of a name.',
    consumers: ['memory', 'performance'],
    reducedMotion: 'A label is a label.',
  },
];

/* -------------------------------------------------------------------------- */
/* Phase 6 — the components/three and components/motion families               */
/*                                                                            */
/* Phase 5.5 read the canonical DOM components and stopped there. The site     */
/* also ships eleven WebGL components and three motion utilities, and those    */
/* are the ones that already contain a spatial idea — they did not need        */
/* translating so much as recognising.                                        */
/* -------------------------------------------------------------------------- */

const PHASE_6_PRIMITIVES: Primitive[] = [
  {
    id: 'LATTICE_ASSEMBLY',
    wired: true,
    origin: 'components/three/SystemCore.js',
    canonicalBehaviour:
      'Sixteen scattered nodes assemble into a lattice around one core the moment the scene mounts, each meshing with its two nearest neighbours, then keep drifting while a signal wanders the connections. Its own comment states the argument: "disconnected things, meshed into one system".',
    spatialBehaviour:
      'The Reality Index has sixteen rows and the canonical scene has sixteen nodes, which is a coincidence worth taking seriously: the index is a list of separate demos until something shows they mesh. The lattice is that showing — realities as nodes, the graph’s edges as the mesh, the visitor’s trail as the signal wandering it.',
    consumers: ['reality-index'],
    reducedMotion: 'Assembled. The lattice is the finished state and the assembly is the part that can be skipped.',
  },
  {
    id: 'NOISE_ORDER',
    wired: true,
    origin: 'components/three/LensField.js + motion/OrderingGrid.js',
    canonicalBehaviour:
      'A scatter of points resolves into an exact grid as two lenses cross — the site’s argument that "a note is worth writing when something stops being noise". OrderingGrid does the same thing in the DOM with seeded, never random, offsets resolving into alignment.',
    spatialBehaviour:
      'Ordering as an event rather than a state, and its exact inverse. `spatial/noiseOrder.ts` returns a frozen zero displacement at zero disorder, which is what lets Chaos claim its reconstruction is exact rather than convincing: the ordered state is not animated toward, it is the identity the function already returns. Chaos also uses its `misplaced()` half for taxonomy drift — every category correct, none of them where it belongs.',
    consumers: ['chaos'],
    reducedMotion: 'Ordered. Both source components render their resolved state directly under reduced motion, and so does this.',
  },
  {
    id: 'POSITION_RAIL',
    wired: true,
    origin: 'components/three/IndexSpine.js',
    canonicalBehaviour:
      'A narrow strip beside the section index: a dim rail, a travelling node at the reader’s position, and a slow drift of motes. Its own note is the important part — "nothing here carries information the DOM does not".',
    spatialBehaviour:
      'Where you are, as a physical position on a measured length. Time Machine’s seven eras sit on a rail with one travelling node, so moving era reads as movement along thirty years rather than as changing a tab. It adds no focusable anything — the seven stops were already buttons and still are.',
    consumers: ['time-machine'],
    reducedMotion: 'The rail and the position mark, both static. Position is information; the drift is not.',
  },
  {
    id: 'CONTACT_GAP',
    wired: true,
    origin: 'components/three/SparkGap.js',
    canonicalBehaviour:
      'Two arms approach, something ignites in the space between them at closest approach, then they withdraw. Motes drift toward the contact point so the gap reads as charged rather than empty. "It is the gap, and the fact that something ignites in it."',
    spatialBehaviour:
      'Presence already had a gap and could not see it: `forceRef.sign` crosses a threshold where the field stops being drawn toward the visitor and starts being pushed away, and nothing on screen said where that boundary was. Now a ring sits at the radius of influence and closes to a solid signal edge at the inversion — reporting a number the simulation is already using, not a new one invented to be drawn.',
    consumers: ['presence'],
    reducedMotion: 'The gap is open and the far side is visible. Approach and ignition are both travel.',
  },
  {
    id: 'DERIVED_SUMMARY',
    wired: true,
    origin: 'components/PackageBuilder.js',
    canonicalBehaviour:
      'Pick the systems you want and the summary derives itself — which systems you touched, which method stages that implies, the rough duration band. "Derived, never stored", and deliberately no price, because "a number printed next to a checkbox would be a lie".',
    spatialBehaviour:
      'Systems touched → method stages implied → the span the company itself publishes for those stages, every value looked up rather than estimated, and the three things it cannot know printed at the same weight. No ROI, no probability, no projected outcome — the numbers PackageBuilder refuses for the same stated reason.',
    consumers: ['agency-simulator'],
    reducedMotion: 'The summary is text and was always text.',
  },
  {
    id: 'HALFTONE_FIELD',
    wired: true,
    origin: 'components/three/HalftoneBackdrop.js + HalftoneStatic.js',
    canonicalBehaviour:
      'The brand deck’s dot collage rendered as a fixed field behind the page — a fragment shader, one cell size, dots breathing on a slow travelling wave, crawling diagonally like a scan. Ink at 2–5% effective alpha: "texture, never noise".',
    spatialBehaviour:
      'Tone made of countable marks, and the surface itself rather than a backdrop to it. After Dark is a printed system on black stock with the studio closed; the screen opens under a lamp and closes away from it, which is what a halftone physically does. Built on a 2D canvas — a few thousand arcs redrawn only while the light moves — because a shader would have put a GPU context on a mode with no other use for one.',
    consumers: ['after-dark'],
    reducedMotion: 'The screen holds still. Dot structure is the information; the wave is not.',
  },
];

export function primitive(id: PrimitiveId): Primitive | undefined {
  return ALL_PRIMITIVES.find((p) => p.id === id);
}

/** Phase 5.5's eight plus Phase 6's six. One list, one contract. */
export const ALL_PRIMITIVES: Primitive[] = [...PRIMITIVES, ...PHASE_6_PRIMITIVES];

/** Primitives with no declared consumer — dead infrastructure, if any. */
export function orphanPrimitives(): Primitive[] {
  return ALL_PRIMITIVES.filter((p) => p.consumers.length === 0);
}

/**
 * Mapped but not yet built.
 *
 * These are not defects. A translation system is allowed to describe a
 * relationship before anybody implements it — what it is not allowed to do is
 * let that read as finished work, which is what happens when the only
 * available signal is a list of destinations.
 */
export function unwiredPrimitives(): Primitive[] {
  return ALL_PRIMITIVES.filter((p) => !p.wired);
}
