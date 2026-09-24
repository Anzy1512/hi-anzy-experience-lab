import { PRODUCTS, type ProductLayer } from './registry';
import { MODES } from '../content/lab';

/**
 * WHAT WOULD HAVE TO BE TRUE FOR A REALITY TO LEAVE THE LAB.
 *
 * ── WHY THIS IS NOT A SECOND REGISTRY ───────────────────────────────────────
 *
 * `registry.ts` answers WHAT a reality is: its layer, its family, its
 * proposition, and the six-question contract. Nothing here repeats any of that.
 * This file answers a different question — what it OWNS, what it DEPENDS ON,
 * how far along it is, and what specifically stands between it and being a
 * standalone application. Same ids, one source of truth for each fact, and a
 * dev-time check below that they describe the same sixteen things.
 *
 * ── STATUS IS EVIDENCE, NOT IMPRESSION ──────────────────────────────────────
 *
 * Every `maturity` below carries the evidence that put it there, and every
 * evidence line points at something that was actually run — a flow, a QA
 * driver, a measurement. A reality does not move up for being impressive, and
 * `UNVERIFIED` is a real answer that stays until somebody verifies it. Portal's
 * delivery handoff exists in the source and has never been exercised end to
 * end; that is UNVERIFIED and it keeps Portal at ALPHA, which is the whole
 * point of writing it down.
 *
 * ── AND NOTHING HERE MOVES A FILE ───────────────────────────────────────────
 *
 * Ownership is declared before it is enforced. The dependency map that produced
 * `dependsOnSiblings` was parsed from real imports, and the one coupling it
 * found is recorded with the exact work that would remove it rather than being
 * refactored away on the strength of a diagram. Physical moves are deferred on
 * purpose — see `docs/PHASE_8_12_PRODUCT_ARCHITECTURE.md`.
 */

/* -------------------------------------------------------------------------- */
/* MATURITY                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Six states, defined by what is DEMONSTRABLE rather than by how finished
 * something looks.
 *
 *   EXPERIMENT  proves an interaction or an idea. Owes nothing else.
 *   PROTOTYPE   performs a coherent job; major product gaps remain open.
 *   ALPHA       the core workflow works; named reliability or product
 *               constraints are still open or unverified.
 *   BETA        workflow, persistence, error states, accessibility and the
 *               major edge cases are usable. Production validation remains —
 *               nothing here has been in front of real users on a real domain.
 *   PRODUCT     meets the Lab's release contract in full.
 *   STANDALONE  PRODUCT, plus an independent build, deployment and extraction
 *               contract that has actually been executed.
 *
 * Nothing in the Lab is PRODUCT or STANDALONE today. The Lab's release contract
 * is not yet written, and no reality has ever been built or deployed on its own,
 * so claiming either would be claiming a thing nobody has done.
 */
export type Maturity = 'EXPERIMENT' | 'PROTOTYPE' | 'ALPHA' | 'BETA' | 'PRODUCT' | 'STANDALONE';

export const MATURITY_ORDER: Maturity[] = [
  'EXPERIMENT',
  'PROTOTYPE',
  'ALPHA',
  'BETA',
  'PRODUCT',
  'STANDALONE',
];

/* -------------------------------------------------------------------------- */
/* THE GRADUATION CONTRACT                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `PASS` was demonstrated. `OPEN` is a known gap with work behind it.
 * `UNVERIFIED` means the mechanism exists and nobody has exercised it — which
 * is not the same as broken and must not be recorded as either. `N/A` is for a
 * dimension that does not apply to this kind of thing at all.
 *
 * Deliberately not a score. A percentage over eighteen dimensions of different
 * weights is a number that cannot be acted on; these four can each be answered
 * with a sentence and closed with a specific piece of work.
 */
export type Check = 'PASS' | 'OPEN' | 'UNVERIFIED' | 'N/A';

export type Dimension =
  | 'INPUT'
  | 'TRANSFORMATION'
  | 'OUTPUT'
  | 'ARTIFACT'
  | 'CONTINUE'
  | 'PERSISTENCE'
  | 'RESUME'
  | 'ERROR_STATES'
  | 'LIMITATIONS'
  | 'ACCESSIBILITY'
  | 'RESPONSIVE'
  | 'LIFECYCLE'
  | 'PERFORMANCE'
  | 'DEPENDENCY_ISOLATION'
  | 'STATE_ISOLATION'
  | 'EXPORT'
  | 'PRIVACY'
  | 'DEPLOYABILITY';

export const DIMENSIONS: Dimension[] = [
  'INPUT', 'TRANSFORMATION', 'OUTPUT', 'ARTIFACT', 'CONTINUE',
  'PERSISTENCE', 'RESUME', 'ERROR_STATES', 'LIMITATIONS', 'ACCESSIBILITY',
  'RESPONSIVE', 'LIFECYCLE', 'PERFORMANCE', 'DEPENDENCY_ISOLATION',
  'STATE_ISOLATION', 'EXPORT', 'PRIVACY', 'DEPLOYABILITY',
];

/* -------------------------------------------------------------------------- */
/* PLATFORM CONTRACTS                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The shared layers a reality is allowed to depend on.
 *
 * This is the list a future standalone build would have to bring with it, or
 * replace. Naming them makes "what does this product actually need from the
 * Lab" answerable without re-reading its imports.
 */
export type PlatformContract =
  | 'RUNTIME' /* core/: raf, pointer, cleanup, capability, hooks, store */
  | 'LIFECYCLE' /* experience/: ModeViewProps, scope, phase, Escape */
  | 'SHELL' /* app/: ModeHost chrome, orientation, onward moves */
  | 'PROJECT' /* system/project: the one project in memory */
  | 'PERSISTENCE' /* system/projects + storage: index, bodies, resume */
  | 'ARTIFACT' /* artifacts/: ArtifactBar, composition, provenance */
  | 'HANDOFF' /* system/handoff: offer / claim */
  | 'WORK' /* system/work: the guided journeys */
  | 'REGISTRY' /* system/registry: layer, contract, grouping */
  | 'BRAND' /* content/: the canonical snapshot */
  | 'DESIGN' /* design-system/: tokens, materials, typography */
  | 'MOTION' /* motion/: the easing vocabulary */
  | 'SPATIAL' /* spatial/: canvas, projection, quality, disposal */
  | 'GRAPHICS' /* graphics/: the seeded field, the contour plate */
  | 'AUDIO' /* audio/: the one engine */
  | 'UI'; /* components/: shared furniture */

/** A sibling dependency, with the work that would remove it. */
export interface SiblingDependency {
  /** The reality depended on, by MODES id. */
  id: string;
  /** What is imported, concretely. */
  what: string;
  /** Why it has not been removed. */
  why: string;
  /** What would remove it. */
  removalPath: string;
}

export interface Manifest {
  /** A `MODES` id. Checked against both MODES and PRODUCTS below. */
  id: string;
  layer: ProductLayer;
  /** The directory this reality owns, relative to `src/`. */
  owns: string;
  /** Shared layers it consumes. Parsed from real imports, not aspiration. */
  consumes: PlatformContract[];
  /** Implementation imported from another reality. Empty is the goal. */
  dependsOnSiblings: SiblingDependency[];
  /** Where its state lives when the visitor leaves. */
  persistence: 'PROJECT' | 'SESSION' | 'NONE';
  maturity: Maturity;
  /** What put it at that maturity. Points at something that was run. */
  evidence: string;
  /**
   * Graduation, per dimension. Absent keys are `N/A` — an experience is not
   * scored against a contract it does not owe.
   */
  graduation: Partial<Record<Dimension, Check>>;
  /** Could this become its own application, and what stops it today. */
  standalone: { candidate: boolean; blockers: string[] };
}

/* -------------------------------------------------------------------------- */
/* THE SIXTEEN                                                                 */
/* -------------------------------------------------------------------------- */

/** Every product and instrument depends on these three, without exception. */
const BASE: PlatformContract[] = ['RUNTIME', 'LIFECYCLE', 'SHELL'];

/**
 * What every reality in the Lab shares, and therefore what no single one of
 * them can be extracted without: the chrome that owns the way out, the cleanup
 * scope that guarantees exit, and the frame loop.
 */
const NO_GRADUATION: Partial<Record<Dimension, Check>> = {};

export const MANIFESTS: Manifest[] = [
  /* ---- PRODUCTS --------------------------------------------------------- */
  {
    id: 'anzy-os',
    layer: 'PRODUCT',
    owns: 'modes/os',
    consumes: [...BASE, 'PROJECT', 'PERSISTENCE', 'ARTIFACT', 'HANDOFF', 'BRAND', 'UI', 'SPATIAL'],
    dependsOnSiblings: [],
    persistence: 'PROJECT',
    maturity: 'BETA',
    evidence:
      'Flows A and D end to end with a reload in the middle; project identity, rename, export, delete and the four destructive operations exercised; the storage failure matrix (seven cases) passes through its surface; every control measured at 32px across four viewports.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'PASS',
      CONTINUE: 'PASS', PERSISTENCE: 'PASS', RESUME: 'PASS', ERROR_STATES: 'PASS',
      LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS', RESPONSIVE: 'PASS', LIFECYCLE: 'PASS',
      PERFORMANCE: 'UNVERIFIED', DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'OPEN',
      EXPORT: 'PASS', PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: true,
      blockers: [
        'It is the host of SYSTEM.app, which reads the whole project store — extracting it means deciding whether the project layer travels with it or becomes a service it talks to.',
        'No independent build target exists yet (§11–§14).',
        'PERFORMANCE is UNVERIFIED: nothing has been measured on real hardware, and headless figures are not evidence.',
      ],
    },
  },
  {
    id: 'agency-simulator',
    layer: 'PRODUCT',
    owns: 'modes/simulator',
    consumes: [...BASE, 'PROJECT', 'ARTIFACT', 'HANDOFF', 'BRAND'],
    dependsOnSiblings: [],
    persistence: 'PROJECT',
    maturity: 'BETA',
    evidence:
      'Flow A: statement and five constraints persist, the brief artifact is recorded with its limits, the handoff is offered and claimed, and after a reload the brief is REBUILT from the stored inputs with nothing re-asked.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'PASS',
      CONTINUE: 'PASS', PERSISTENCE: 'PASS', RESUME: 'PASS', ERROR_STATES: 'PASS',
      LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS', RESPONSIVE: 'PASS', LIFECYCLE: 'PASS',
      PERFORMANCE: 'UNVERIFIED', DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'PASS',
      EXPORT: 'PASS', PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: true,
      blockers: [
        'Strongest extraction candidate: no sibling imports, and its reading is a pure function of a sentence plus five choices.',
        'Needs the BRAND snapshot to travel with it — its whole output is a mapping onto the canonical taxonomy.',
        'No independent build target yet.',
      ],
    },
  },
  {
    id: 'reality-compiler',
    layer: 'PRODUCT',
    owns: 'modes/compiler',
    consumes: [...BASE, 'PROJECT', 'ARTIFACT', 'HANDOFF', 'WORK', 'BRAND', 'SPATIAL', 'GRAPHICS', 'UI'],
    dependsOnSiblings: [],
    persistence: 'PROJECT',
    maturity: 'BETA',
    evidence:
      'Flow B: the manifest artifact is recorded at the WORLD stage, INSPECT LIVE IN X-RAY carries it, and X-Ray opens on the same page. Survives a reload with the artifact intact.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'PASS',
      CONTINUE: 'PASS', PERSISTENCE: 'PASS', RESUME: 'PASS', ERROR_STATES: 'UNVERIFIED',
      LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS', RESPONSIVE: 'PASS', LIFECYCLE: 'PASS',
      PERFORMANCE: 'UNVERIFIED', DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'PASS',
      EXPORT: 'PASS', PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: true,
      blockers: [
        'Heaviest SPATIAL consumer after Living World: canvas, projection, quality tiers and disposal would all have to travel or be replaced.',
        'Reads the canonical page snapshot, so BRAND travels with it.',
        'ERROR_STATES UNVERIFIED — what it does with a malformed or missing page snapshot has never been exercised.',
      ],
    },
  },
  {
    id: 'matter-engine',
    layer: 'PRODUCT',
    owns: 'modes/matter',
    consumes: [...BASE, 'ARTIFACT', 'HANDOFF', 'WORK', 'BRAND', 'SPATIAL', 'GRAPHICS'],
    dependsOnSiblings: [],
    persistence: 'PROJECT',
    maturity: 'BETA',
    evidence:
      'Flow C: a typed phrase produces a recipe artifact with its limits, the handoff carries it, and after a reload Director opens on it by name. The PNG is handed to the browser and never retained, which the recipe states.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'PASS',
      CONTINUE: 'PASS', PERSISTENCE: 'PASS', RESUME: 'PASS', ERROR_STATES: 'PASS',
      LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS', RESPONSIVE: 'PASS', LIFECYCLE: 'PASS',
      PERFORMANCE: 'UNVERIFIED', DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'PASS',
      EXPORT: 'PASS', PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: true,
      blockers: [
        'PRESENCE imports its ParticleField. Matter can be extracted; Presence would break unless the renderer moves to the platform first — see that manifest.',
        'Requires WebGL and the SPATIAL canvas; the reduced/no-WebGL path lists states rather than rendering them, which is correct but is a second surface to carry.',
      ],
    },
  },
  {
    id: 'director',
    layer: 'PRODUCT',
    owns: 'modes/director',
    consumes: [...BASE, 'PROJECT', 'ARTIFACT', 'HANDOFF', 'BRAND', 'AUDIO', 'UI'],
    dependsOnSiblings: [],
    persistence: 'PROJECT',
    maturity: 'BETA',
    evidence:
      'Accepts a brief OR a recipe and names its source on screen; verified in Flow A and Flow C after a reload in both. Runs an 84s cut against a real clock rather than clamped frame deltas.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'PASS',
      CONTINUE: 'PASS', PERSISTENCE: 'PASS', RESUME: 'PASS', ERROR_STATES: 'PASS',
      LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS', RESPONSIVE: 'PASS', LIFECYCLE: 'PASS',
      PERFORMANCE: 'UNVERIFIED', DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'PASS',
      EXPORT: 'PASS', PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: true,
      blockers: [
        'The one AUDIO consumer among the products; the engine is shared and would travel with it or be replaced.',
        'Its shot intents are authored in the BRAND snapshot.',
      ],
    },
  },
  {
    id: 'portal',
    layer: 'PRODUCT',
    owns: 'modes/portal',
    consumes: [...BASE, 'PROJECT', 'ARTIFACT', 'HANDOFF', 'BRAND', 'SPATIAL'],
    dependsOnSiblings: [],
    persistence: 'PROJECT',
    maturity: 'ALPHA',
    evidence:
      'The crossing, the aperture and the delivery package render, and WHAT IS NOT IN IT is drawn with hollow UNKNOWN marks. But the delivery handoff — `kind: delivery` in its artifact bar — has NEVER been exercised end to end: no QA run has produced a delivery artifact in the project ledger. Present in source, unproven in behaviour.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'UNVERIFIED',
      CONTINUE: 'UNVERIFIED', PERSISTENCE: 'UNVERIFIED', RESUME: 'UNVERIFIED',
      ERROR_STATES: 'UNVERIFIED', LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS',
      RESPONSIVE: 'PASS', LIFECYCLE: 'PASS', PERFORMANCE: 'UNVERIFIED',
      DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'PASS', EXPORT: 'UNVERIFIED',
      PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: false,
      blockers: [
        'Its delivery package is a reading of the WHOLE project — it is the one product whose output is other products\' output, so it is the least separable by design.',
        'Six graduation dimensions are UNVERIFIED because its artifact path has never been run.',
      ],
    },
  },
  {
    id: 'survey',
    layer: 'PRODUCT',
    owns: 'modes/survey',
    consumes: [...BASE, 'ARTIFACT', 'DESIGN'],
    dependsOnSiblings: [],
    persistence: 'NONE',
    maturity: 'PROTOTYPE',
    evidence:
      'Phase 9.0: asks the Commercial Intelligence Engine on this machine and renders what it answers — stages, counts, ledger, plate, evidence, exports — and says so by name when the engine is not running. Exercised against the live engine in development; not yet against a deployment, where no engine is reachable.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'PASS',
      ERROR_STATES: 'PASS', LIMITATIONS: 'PASS', ACCESSIBILITY: 'UNVERIFIED',
      RESPONSIVE: 'PASS', LIFECYCLE: 'PASS', PERFORMANCE: 'UNVERIFIED',
      DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'PASS', EXPORT: 'PASS',
      PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: true,
      blockers: [
        'It is a front end for a separate program: without the engine running beside it, it can only say that the engine is not there.',
        'A deployed Lab reaches no engine: the address is local, and no hosted engine exists.',
      ],
    },
  },

  /* ---- INSTRUMENTS ------------------------------------------------------ */
  {
    id: 'x-ray',
    layer: 'INSTRUMENT',
    owns: 'modes/xray',
    consumes: [...BASE, 'PROJECT', 'ARTIFACT', 'HANDOFF', 'BRAND', 'GRAPHICS'],
    dependsOnSiblings: [],
    /*
     * NONE, not PROJECT — corrected in Phase 8.12C by the release guard.
     *
     * It read PROJECT, which made its own manifest owe RESUME while its
     * graduation recorded RESUME as N/A: a dimension filed away rather than
     * answered, which is the one combination `system/release.ts` exists to
     * catch. The guard caught it on the first run.
     *
     * NONE is the truthful value. X-Ray imports `getArtifact`, `claim` and
     * `offered` — three reads and no write. It READS the project to open on
     * something the Compiler left; nothing of X-Ray’s own survives the visitor
     * leaving. That its report cannot reach the project is one gap, and it is
     * CONTINUE; recording it three times as PERSISTENCE, RESUME and CONTINUE
     * made one piece of missing work look like three.
     */
    persistence: 'NONE',
    maturity: 'ALPHA',
    evidence:
      'Inbound handoff verified in Flow B — it claims the Compiler manifest and opens on the same page, and keeps SOURCED and MEASURED strictly apart. Outbound it has no mechanism at all: it imports `claim` and `offered` but never `offer`, and its artifact bar carries no handoff. Its report is a download and nothing carries it onward.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'PASS',
      CONTINUE: 'OPEN', PERSISTENCE: 'N/A', RESUME: 'N/A', ERROR_STATES: 'PASS',
      LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS', RESPONSIVE: 'PASS', LIFECYCLE: 'PASS',
      PERFORMANCE: 'UNVERIFIED', DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'N/A',
      EXPORT: 'PASS', PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: true,
      blockers: [
        'CONTINUE is OPEN: the specimen report cannot reach the project. Closing it is one artifact-bar handoff, which is product work rather than architecture work.',
        'Measures the live DOM, so a standalone build needs a subject to measure — today that is the Lab\'s own specimen plate or a canonical page.',
      ],
    },
  },
  {
    id: 'performance',
    layer: 'INSTRUMENT',
    owns: 'modes/performance',
    consumes: [...BASE, 'ARTIFACT', 'BRAND', 'DESIGN', 'AUDIO', 'SPATIAL'],
    dependsOnSiblings: [],
    persistence: 'NONE',
    maturity: 'ALPHA',
    evidence:
      'Reports what this session measured and prints UNKNOWN by name for everything it did not, which is the behaviour that matters most here. But it touches neither project nor handoff — no import of either — so its report is a download only, and its stated continuation to SYSTEM.app has no mechanism behind it.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'PASS',
      CONTINUE: 'OPEN', PERSISTENCE: 'N/A', RESUME: 'N/A', ERROR_STATES: 'PASS',
      LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS', RESPONSIVE: 'PASS', LIFECYCLE: 'PASS',
      PERFORMANCE: 'N/A', DEPENDENCY_ISOLATION: 'PASS', STATE_ISOLATION: 'PASS',
      EXPORT: 'PASS', PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: true,
      blockers: [
        'CONTINUE is OPEN for the same reason as X-Ray, and it has no project integration at all.',
        'It measures the Lab. Extracted, it would need a subject; a performance instrument with nothing to observe is not a product.',
      ],
    },
  },
  {
    id: 'presence',
    layer: 'INSTRUMENT',
    owns: 'modes/presence',
    consumes: [...BASE, 'BRAND', 'SPATIAL'],
    dependsOnSiblings: [
      {
        id: 'matter-engine',
        what: 'modes/presence/PresenceMode.tsx imports modes/matter/ParticleField.tsx',
        why:
          'The renderer is not generic: it calls Matter\'s own buildTargets() over Matter\'s MatterState vocabulary. Moving it to the platform would drag a product\'s domain model into shared code, and giving Presence its own formation would change what it draws — a behaviour regression this phase does not permit. Presence uses exactly one state ("field"), statically.',
        removalPath:
          'Change ParticleField to accept prebuilt from/to Float32Array buffers instead of MatterState names, move it to graphics/, and have each caller build its own formation. Matter keeps buildTargets and its state vocabulary; Presence gains a single static formation of its own. Needs a visual comparison before and after, because the field is the mode.',
      },
    ],
    persistence: 'NONE',
    maturity: 'ALPHA',
    evidence:
      'The camera contract is verified in software with getUserMedia instrumented: zero calls on entry AND zero after pressing USE CAMERA — the consent panel precedes any request, and states 32×24, discarded, nothing recorded, identifies nobody. Zero video elements throughout, after exit and on re-entry. No PHYSICAL camera has ever been tested, and no simulated result may stand in for that.',
    graduation: {
      INPUT: 'PASS', TRANSFORMATION: 'PASS', OUTPUT: 'PASS', ARTIFACT: 'N/A',
      CONTINUE: 'N/A', PERSISTENCE: 'N/A', RESUME: 'N/A', ERROR_STATES: 'PASS',
      LIMITATIONS: 'PASS', ACCESSIBILITY: 'PASS', RESPONSIVE: 'PASS', LIFECYCLE: 'PASS',
      PERFORMANCE: 'UNVERIFIED', DEPENDENCY_ISOLATION: 'OPEN', STATE_ISOLATION: 'PASS',
      EXPORT: 'N/A', PRIVACY: 'PASS', DEPLOYABILITY: 'OPEN',
    },
    standalone: {
      candidate: false,
      blockers: [
        'DEPENDENCY_ISOLATION is OPEN — the only sibling import in the Lab. Extracting Presence today would take Matter Engine with it.',
        'The camera path is UNVERIFIED on physical hardware and must stay marked so.',
      ],
    },
  },

  /* ---- EXPERIENCES ------------------------------------------------------ */
  /*
   * An experience owes no contract, so it is not scored against one. What is
   * still worth recording is what it owns and what it would take with it,
   * because "can this leave" is a fair question even for authored work.
   */
  {
    id: 'living-world', layer: 'EXPERIENCE', owns: 'modes/world',
    consumes: [...BASE, 'BRAND', 'SPATIAL', 'GRAPHICS', 'DESIGN', 'MOTION'],
    dependsOnSiblings: [], persistence: 'SESSION', maturity: 'PROTOTYPE',
    evidence:
      'FROZEN since Phase 8.6 and inspected only. Its district rail measures 21.6–29.6px, below the Lab floor, and three district labels sit off-viewport at 390 and 768 — both recorded, neither fixed, both requiring an explicit exemption from the freeze.',
    graduation: NO_GRADUATION,
    standalone: { candidate: false, blockers: ['Frozen. The heaviest SPATIAL consumer in the Lab.'] },
  },
  {
    id: 'memory', layer: 'EXPERIENCE', owns: 'modes/memory',
    consumes: [...BASE, 'BRAND', 'GRAPHICS'], dependsOnSiblings: [],
    persistence: 'SESSION', maturity: 'PROTOTYPE',
    evidence: 'Deep state exercised in Phase 8.11: reconstruction holds, no chrome collision, focus returns correctly.',
    graduation: NO_GRADUATION,
    standalone: { candidate: false, blockers: ['Authored work about one document; nothing to extract it into.'] },
  },
  {
    id: 'time-machine', layer: 'EXPERIENCE', owns: 'modes/timemachine',
    consumes: [...BASE, 'BRAND'], dependsOnSiblings: [],
    persistence: 'SESSION', maturity: 'PROTOTYPE',
    evidence:
      'Seven checkpoints; the 1995 era reached and verified in Phase 8.11. Holds the Lab\'s one deliberate interaction-floor exception: period-accurate 17.6px links inside a reconstruction that says "Best viewed at 640x480".',
    graduation: NO_GRADUATION,
    standalone: { candidate: false, blockers: ['Its subject is the Agency\'s own history.'] },
  },
  {
    id: 'dream', layer: 'EXPERIENCE', owns: 'modes/dream',
    consumes: [...BASE, 'GRAPHICS'], dependsOnSiblings: [],
    persistence: 'SESSION', maturity: 'EXPERIMENT',
    evidence: 'Proves one idea — a seed that always dreams the same dream. Owes nothing else and claims nothing else.',
    graduation: NO_GRADUATION,
    standalone: { candidate: false, blockers: ['An experiment, by its own description.'] },
  },
  {
    id: 'chaos', layer: 'EXPERIENCE', owns: 'modes/chaos',
    consumes: [...BASE, 'BRAND'], dependsOnSiblings: [],
    persistence: 'SESSION', maturity: 'EXPERIMENT',
    evidence: 'Deterioration runs over an isolated copy; verified in Phase 8.11 that the global chrome survives seven seconds of it without becoming part of the deterioration.',
    graduation: NO_GRADUATION,
    standalone: { candidate: false, blockers: ['Theatrical failure of the Lab itself; there is no Lab to fail outside it.'] },
  },
  {
    id: 'after-dark', layer: 'EXPERIENCE', owns: 'modes/afterdark',
    consumes: [...BASE, 'BRAND', 'AUDIO'], dependsOnSiblings: [],
    persistence: 'SESSION', maturity: 'EXPERIMENT',
    evidence: 'Night state verified in Phase 8.11; chrome contrast measured 10.3:1 against its own ground.',
    graduation: NO_GRADUATION,
    standalone: { candidate: false, blockers: ['Authored atmosphere.'] },
  },
  {
    id: 'sonic-architecture', layer: 'EXPERIENCE', owns: 'modes/sonic',
    consumes: [...BASE, 'BRAND', 'AUDIO'], dependsOnSiblings: [],
    persistence: 'SESSION', maturity: 'EXPERIMENT',
    evidence:
      'Audio lifecycle verified in Phase 8.11: no AudioContext exists before a real gesture, it runs on one, and it is closed outright on exit rather than suspended. Every voice is synthesised — there are no audio files in this project.',
    graduation: NO_GRADUATION,
    standalone: { candidate: false, blockers: ['The instrument is the Lab\'s own elevation.'] },
  },
];

/* -------------------------------------------------------------------------- */
/* LOOKUPS                                                                     */
/* -------------------------------------------------------------------------- */

const BY_ID = new Map(MANIFESTS.map((m) => [m.id, m]));

export function manifestOf(id: string | null | undefined): Manifest | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function byMaturity(m: Maturity): Manifest[] {
  return MANIFESTS.filter((x) => x.maturity === m);
}

/** Every sibling coupling in the Lab. The goal for this list is empty. */
export function siblingCouplings(): { from: string; dep: SiblingDependency }[] {
  return MANIFESTS.flatMap((m) => m.dependsOnSiblings.map((dep) => ({ from: m.id, dep })));
}

/** What stands between a reality and being its own application. */
export function graduationGaps(id: string): { dimension: Dimension; state: Check }[] {
  const m = BY_ID.get(id);
  if (!m) return [];
  return DIMENSIONS.map((d) => ({ dimension: d, state: m.graduation[d] ?? 'N/A' })).filter(
    (r) => r.state === 'OPEN' || r.state === 'UNVERIFIED',
  );
}

/**
 * The registry, the index and this file must describe the same sixteen things.
 *
 * Dev-only, and the same guard `registry.ts` runs for the same reason: a
 * manifest that has drifted out of step with what exists is worse than no
 * manifest, because it reads as though somebody checked.
 */
if (import.meta.env.DEV) {
  const modeIds = new Set(MODES.map((m) => m.id));
  const prodIds = new Set(PRODUCTS.map((p) => p.id));
  const missing = [...modeIds].filter((id) => !BY_ID.has(id));
  const extra = MANIFESTS.filter((m) => !modeIds.has(m.id)).map((m) => m.id);
  const wrongLayer = MANIFESTS.filter((m) => {
    const p = PRODUCTS.find((x) => x.id === m.id);
    return p && p.layer !== m.layer;
  }).map((m) => m.id);
  const unclassified = MANIFESTS.filter((m) => !prodIds.has(m.id)).map((m) => m.id);
  if (missing.length || extra.length || wrongLayer.length || unclassified.length) {
    console.error(
      '[maturity] manifests out of step with the index/registry.' +
        (missing.length ? ` No manifest: ${missing.join(', ')}.` : '') +
        (extra.length ? ` Manifest for a non-mode: ${extra.join(', ')}.` : '') +
        (wrongLayer.length ? ` Layer disagrees with registry: ${wrongLayer.join(', ')}.` : '') +
        (unclassified.length ? ` Not in registry: ${unclassified.join(', ')}.` : ''),
    );
  }
}
