import { PRODUCTS, productOf, type ProductContract, type ProductLayer } from './registry';
import {
  DIMENSIONS,
  MANIFESTS,
  manifestOf,
  type Check,
  type Dimension,
  type Manifest,
  type Maturity,
} from './maturity';

/**
 * WHAT `PRODUCT` AND `STANDALONE` ACTUALLY MEAN IN THIS LAB.
 *
 * ── WHY THIS IS NOT A THIRD REGISTRY ────────────────────────────────────────
 *
 * `registry.ts` says WHAT a reality is. `maturity.ts` says HOW FAR ALONG it is,
 * dimension by dimension, with the evidence that put it there. Neither of them
 * says what the eighteen dimensions are WORTH — which of them stop a release,
 * which apply only when the product's own declarations invoke them, and which
 * are worth knowing without ever blocking anything.
 *
 * That was the gap `maturity.ts` named out loud: "Nothing in the Lab is PRODUCT
 * or STANDALONE today. The Lab's release contract is not yet written." This is
 * that contract. It adds no dimension, no state, no id and no maturity level.
 * It classifies what already exists and makes the classification executable, so
 * "is this a PRODUCT" is answered by running something rather than by reading a
 * paragraph and agreeing with it.
 *
 * ── A RELEASE IS BINARY ─────────────────────────────────────────────────────
 *
 * There is no score here and there will not be one. Eighteen dimensions of
 * different weights averaged into a percentage produces a number nobody can act
 * on: "84% ready" tells you nothing about Monday. A reality either meets the
 * contract or it has a list of named blockers, each closable by a specific
 * piece of work. `releaseVerdict()` returns that list.
 *
 * ── AND IT IS DELIBERATELY POSSIBLE TO FAIL ─────────────────────────────────
 *
 * A contract everything passes is a description, not a contract. Applied today
 * this one admits nothing to PRODUCT, and that is the correct reading of the
 * evidence rather than a flaw in the rules: two instruments declare a
 * continuation nothing implements, the Compiler has never been shown a
 * malformed page, Portal's artifact path has never been run once, and no
 * reality holding a WebGL surface has been measured on hardware that could
 * produce a real number.
 */

/* -------------------------------------------------------------------------- */
/* WEIGHT                                                                      */
/* -------------------------------------------------------------------------- */

/**
 *   RELEASE_BLOCKING  every product owes this, always. `OPEN` or `UNVERIFIED`
 *                     here is a release blocker with no appeal.
 *   CONDITIONAL       owed only when the product's OWN declarations invoke it.
 *                     Where they do, it blocks exactly as hard as the first
 *                     kind. Where they do not, `N/A` is the correct record.
 *   INFORMATIONAL     worth knowing, never blocking for PRODUCT — and blocking
 *                     for STANDALONE, which is why there are two contracts
 *                     rather than one.
 */
export type Weight = 'RELEASE_BLOCKING' | 'CONDITIONAL' | 'INFORMATIONAL';

export interface DimensionRule {
  weight: Weight;
  /** What a `PASS` requires. Something run, not something believed. */
  evidence: string;
  /**
   * When `N/A` is legitimate — and every entry names a DECLARATION rather than
   * a judgement. `N/A` that cannot be traced to a `null` in the registry
   * contract or to the manifest's own `persistence` field is `OPEN` wearing a
   * better label, and the guard at the bottom of this file says so.
   */
  notApplicableWhen: string | null;
}

/* -------------------------------------------------------------------------- */
/* THE PRODUCT CONTRACT                                                        */
/* -------------------------------------------------------------------------- */

export const RELEASE_CONTRACT: Record<Dimension, DimensionRule> = {
  /* ---- What the thing is, and whether it does it ------------------------- */
  INPUT: {
    weight: 'RELEASE_BLOCKING',
    evidence:
      'A visitor can supply what the registry says they can supply, on every viewport the Lab claims, and the product does something with it.',
    notApplicableWhen: null,
  },
  TRANSFORMATION: {
    weight: 'RELEASE_BLOCKING',
    evidence:
      'The operation the registry names is the operation performed. Not a mood, and not a random walk dressed as analysis: the same input produces the same result.',
    notApplicableWhen: null,
  },
  OUTPUT: {
    weight: 'RELEASE_BLOCKING',
    evidence: 'The result the registry names appears on screen and is legible.',
    notApplicableWhen: null,
  },
  LIMITATIONS: {
    weight: 'RELEASE_BLOCKING',
    evidence:
      'What the product cannot tell you is stated where the result is, not in a document elsewhere. This is the dimension this Lab exists to hold, so nothing ships without it.',
    notApplicableWhen: null,
  },

  /* ---- What leaves with the visitor -------------------------------------- */
  ARTIFACT: {
    weight: 'CONDITIONAL',
    evidence:
      'The artifact the registry names is produced, carries its own limits, and is recorded in the project when it is handed on rather than when it is downloaded.',
    notApplicableWhen: 'registry contract `artifact` is null',
  },
  EXPORT: {
    weight: 'CONDITIONAL',
    evidence:
      'The artifact leaves the browser in the stated formats, byte-identical across runs over the same inputs.',
    notApplicableWhen: 'registry contract `artifact` is null',
  },
  CONTINUE: {
    weight: 'CONDITIONAL',
    evidence:
      'The onward move the registry names is implemented and has been walked end to end. A `continue` string that names no destination is an invoked dimension that is OPEN, not N/A: the product still owes an answer to "and then what".',
    notApplicableWhen: 'registry contract `continue` is null',
  },

  /* ---- What survives the visitor leaving --------------------------------- */
  PERSISTENCE: {
    weight: 'CONDITIONAL',
    evidence:
      'Inputs are written to the project, outputs are derived rather than stored, and the storage failure matrix passes through this product’s own surface.',
    notApplicableWhen: 'manifest `persistence` is NONE or SESSION',
  },
  RESUME: {
    weight: 'CONDITIONAL',
    evidence:
      'After a reload the product returns the visitor to where they were, rebuilt from stored inputs, with nothing re-asked.',
    notApplicableWhen: 'manifest `persistence` is NONE or SESSION',
  },
  STATE_ISOLATION: {
    weight: 'CONDITIONAL',
    evidence:
      'What this product writes to shared project state is scoped to itself: it cannot corrupt, overwrite or silently consume another product’s work.',
    notApplicableWhen: 'manifest `persistence` is NONE',
  },

  /* ---- Whether it holds up ----------------------------------------------- */
  ERROR_STATES: {
    weight: 'RELEASE_BLOCKING',
    evidence:
      'The failure paths a visitor can actually reach have been exercised and say something true. Not "it has a try/catch": somebody drove it into the failure and read what it said.',
    notApplicableWhen: null,
  },
  LIFECYCLE: {
    weight: 'RELEASE_BLOCKING',
    evidence:
      'enter → exit → enter → exit leaves RAF subscribers, canvases, video elements and audio contexts at zero. Escape works, the visible EXIT works, focus returns.',
    notApplicableWhen: null,
  },
  ACCESSIBILITY: {
    weight: 'RELEASE_BLOCKING',
    evidence:
      'Keyboard-operable end to end, visible focus, semantic structure, every control at or above the 32px floor, and reduced motion preserving the concept rather than removing it.',
    notApplicableWhen: null,
  },
  RESPONSIVE: {
    weight: 'RELEASE_BLOCKING',
    evidence: 'No horizontal overflow and no unreachable control at 390, 768, 1440 and 1920.',
    notApplicableWhen: null,
  },
  PRIVACY: {
    weight: 'RELEASE_BLOCKING',
    evidence:
      'What is read, where it goes and what is kept is stated before the reading starts, and the code does what the statement says — verified by instrumenting the API rather than by reading the source.',
    notApplicableWhen: null,
  },

  /* ---- Cost, and whether it could ever leave ----------------------------- */
  PERFORMANCE: {
    weight: 'CONDITIONAL',
    evidence:
      'Evidence sufficient for the product’s ACTUAL workload. A product holding a WebGL surface for as long as it is open owes a real-hardware reading — `window.__labPerf.record()` on a machine that is not headless — because this environment drives rAF at roughly 2fps and nothing measured here is a benchmark. A product whose workload is text and DOM owes the lifecycle evidence instead: no loop outlives the mode, and no work continues while nothing is on screen.',
    notApplicableWhen: 'the product IS the instrument that measures it',
  },
  DEPENDENCY_ISOLATION: {
    weight: 'CONDITIONAL',
    evidence:
      'No implementation is imported from a sibling reality. A shared platform layer is not a coupling; another product’s internals are.',
    notApplicableWhen: null,
  },
  DEPLOYABILITY: {
    weight: 'INFORMATIONAL',
    evidence:
      'An independent build target exists and has produced a bundle. Deliberately NOT blocking for PRODUCT: inside the Lab a product ships when the Lab ships, and requiring a separate build before calling something finished would make PRODUCT unreachable for a reason that has nothing to do with whether the product works. It is blocking for STANDALONE, where it is the entire question.',
    notApplicableWhen: null,
  },
};

export const RELEASE_BLOCKING: Dimension[] = DIMENSIONS.filter(
  (d) => RELEASE_CONTRACT[d].weight === 'RELEASE_BLOCKING',
);
export const CONDITIONAL: Dimension[] = DIMENSIONS.filter(
  (d) => RELEASE_CONTRACT[d].weight === 'CONDITIONAL',
);
export const INFORMATIONAL: Dimension[] = DIMENSIONS.filter(
  (d) => RELEASE_CONTRACT[d].weight === 'INFORMATIONAL',
);

/* -------------------------------------------------------------------------- */
/* WORKLOAD — what PERFORMANCE means for a given reality                       */
/* -------------------------------------------------------------------------- */

/**
 * Which realities hold a WebGL surface for as long as they are open.
 *
 * Measured rather than assumed: each entry names the file that mounts it. This
 * is the one new fact in this file, and it exists because "performance evidence
 * sufficient for its actual workload" means nothing until somebody says which
 * workload each product actually has. Anything absent from this map does its
 * work in text and the DOM, and is held to the lifecycle evidence instead.
 */
export const WEBGL_SURFACE: Record<string, string> = {
  'reality-compiler': 'modes/compiler/CompilerMode.tsx mounts spatial/SpatialCanvas',
  'matter-engine': 'modes/matter/MatterMode.tsx mounts spatial/SpatialCanvas',
  'x-ray': 'modes/xray/DepthField.tsx mounts an @react-three/fiber canvas',
  presence: 'modes/presence/PresenceMode.tsx mounts spatial/SpatialCanvas',
  'living-world': 'modes/world/WorldMode.tsx mounts spatial/SpatialCanvas',
  memory: 'modes/memory/MemoryMode.tsx mounts spatial/SpatialCanvas',
  dream: 'modes/dream/DreamMode.tsx mounts an @react-three/fiber canvas',
  'after-dark': 'modes/afterdark/HalftoneField.tsx mounts an @react-three/fiber canvas',
};

/**
 * The runtime dependencies a reality would have to bring with it, beyond React.
 *
 * `gsap` is deliberately absent from every entry: `app/App.tsx` registers the
 * easing vocabulary and no mode imports `motion/` directly, so gsap is a SHELL
 * dependency every reality inherits and none of them owns.
 */
export function ownedDependencies(id: string): string[] {
  const m = manifestOf(id);
  if (!m) return [];
  /* Presence used to be special-cased here: it reached three and R3F through
     Matter's ParticleField rather than importing them, so its dependencies
     were real but its path to them ran through a sibling. The renderer is in
     `graphics/` now and Presence takes it from the platform like any other
     spatial mode, so there is nothing left to qualify. */
  return WEBGL_SURFACE[id] ? ['three', '@react-three/fiber'] : [];
}

/* -------------------------------------------------------------------------- */
/* WHICH CONDITIONAL DIMENSIONS A REALITY ACTUALLY OWES                        */
/* -------------------------------------------------------------------------- */

/**
 * Derived from the reality's OWN declarations, never asserted here.
 *
 * This is what stops `N/A` becoming a way out. A product does not get to decide
 * it does not owe RESUME; its manifest decides, by saying where its state
 * lives. It does not get to decide it does not owe CONTINUE; its registry
 * contract decides, by either naming an onward move or being honestly `null`.
 */
export function invokedDimensions(id: string): Dimension[] {
  const p = productOf(id);
  const m = manifestOf(id);
  if (!p || !m || p.layer === 'EXPERIENCE') return [];

  const owed: Dimension[] = [];
  const declares = (k: keyof ProductContract) => p.contract[k] !== null;

  if (declares('artifact')) owed.push('ARTIFACT', 'EXPORT');
  if (declares('continue')) owed.push('CONTINUE');
  if (m.persistence === 'PROJECT') owed.push('PERSISTENCE', 'RESUME', 'STATE_ISOLATION');
  /* PERFORMANCE is owed by everything that is not itself the instrument that
     measures it. What it takes to satisfy differs by workload; that it is owed
     does not. */
  if (id !== 'performance') owed.push('PERFORMANCE');
  /* A sibling import changes what the Lab is, not only what could leave it, so
     every product and instrument owes this one. */
  owed.push('DEPENDENCY_ISOLATION');
  return owed;
}

/* -------------------------------------------------------------------------- */
/* THE VERDICT                                                                 */
/* -------------------------------------------------------------------------- */

export interface Blocker {
  dimension: Dimension;
  state: Check;
  weight: Weight;
  /** What would close it. */
  needs: string;
}

export interface ReleaseVerdict {
  id: string;
  layer: ProductLayer;
  maturity: Maturity;
  /** False for an EXPERIENCE: it is not measured against a contract it does not owe. */
  held: boolean;
  product: { meets: boolean; blockers: Blocker[] };
  standalone: { meets: boolean; blockers: string[] };
}

function blockersFor(m: Manifest): Blocker[] {
  const owed = new Set(invokedDimensions(m.id));
  const out: Blocker[] = [];
  for (const d of DIMENSIONS) {
    const rule = RELEASE_CONTRACT[d];
    if (rule.weight === 'INFORMATIONAL') continue;
    if (rule.weight === 'CONDITIONAL' && !owed.has(d)) continue;
    const state = m.graduation[d] ?? 'N/A';
    if (state === 'PASS') continue;
    if (state === 'N/A') {
      /* Owed, and recorded as not applying. That is the one combination this
         contract cannot accept, because it is a gap that has been filed away
         and it looks tidy while it happens. */
      out.push({
        dimension: d,
        state,
        weight: rule.weight,
        needs: `Owed by its own declarations but recorded N/A. ${rule.evidence}`,
      });
      continue;
    }
    out.push({
      dimension: d,
      state,
      weight: rule.weight,
      needs:
        d === 'PERFORMANCE' && WEBGL_SURFACE[m.id]
          ? `A real-hardware reading: ${WEBGL_SURFACE[m.id]}, so the lifecycle evidence is not sufficient here.`
          : rule.evidence,
    });
  }
  return out;
}

/**
 * STANDALONE is PRODUCT plus eight conditions, and it is a higher bar on
 * purpose: PRODUCT asks whether the thing works, STANDALONE asks whether it
 * could be lifted out and still be the same thing somewhere else.
 */
export const STANDALONE_CONDITIONS = [
  'S1 No sibling implementation import.',
  'S2 Its shared-platform contract is declared: every layer it consumes either travels with it or is named as replaced.',
  'S3 Its product-owned runtime dependencies are identified.',
  'S4 An independent route / entry point exists.',
  'S5 An independent build target exists and has produced a bundle.',
  'S6 State and artifact portability is defined: whether a project made in the Lab opens there, or whether the two are explicitly separate.',
  'S7 Isolation verified — the extracted bundle carries no Lab-only code, and the Lab’s own bundle does not grow to accommodate the split.',
  'S8 A deployment has actually been executed once.',
] as const;

function standaloneBlockers(m: Manifest, productMeets: boolean): string[] {
  const out: string[] = [];
  if (!productMeets) {
    out.push('S0 Not a PRODUCT yet. STANDALONE is PRODUCT plus the conditions below.');
  }
  for (const dep of m.dependsOnSiblings) out.push(`S1 Imports ${dep.id}: ${dep.what}`);
  /* S2 and S3 are satisfied for all sixteen: the manifest declares the platform
     contract and `ownedDependencies()` answers the second. That is what Phase
     8.12B produced, and it is the reason those two are not listed as gaps. */
  if ((m.graduation.PERFORMANCE ?? 'N/A') !== 'PASS') {
    out.push(
      'S4/PERFORMANCE A standalone build is a different bundle on unknown hardware, so PERFORMANCE is blocking here regardless of workload.',
    );
  }
  if ((m.graduation.DEPLOYABILITY ?? 'N/A') !== 'PASS') {
    out.push('S5 No independent build target exists (§11–§14 of Phase 8.12).');
    out.push('S7 Bundle isolation has never been verified, because there is nothing yet to verify.');
    out.push('S8 Nothing in the Lab has ever been deployed on its own.');
  }
  for (const b of m.standalone.blockers) out.push(`S6/context ${b}`);
  return out;
}

export function releaseVerdict(id: string): ReleaseVerdict | null {
  const p = productOf(id);
  const m = manifestOf(id);
  if (!p || !m) return null;
  if (p.layer === 'EXPERIENCE') {
    return {
      id,
      layer: p.layer,
      maturity: m.maturity,
      held: false,
      product: { meets: false, blockers: [] },
      standalone: {
        meets: false,
        blockers: ['An experience owes no contract and is not measured against one.'],
      },
    };
  }
  const blockers = blockersFor(m);
  const meets = blockers.length === 0;
  return {
    id,
    layer: p.layer,
    maturity: m.maturity,
    held: true,
    product: { meets, blockers },
    standalone: { meets: false, blockers: standaloneBlockers(m, meets) },
  };
}

/** Every product and instrument, with its verdict. Experiences are excluded. */
export function releaseTable(): ReleaseVerdict[] {
  return MANIFESTS.map((m) => releaseVerdict(m.id)).filter(
    (v): v is ReleaseVerdict => v !== null && v.held,
  );
}

/** The shortest list worth acting on: who is closest, and what stands in the way. */
export function closestToProduct(): ReleaseVerdict[] {
  return releaseTable()
    .slice()
    .sort((a, b) => a.product.blockers.length - b.product.blockers.length);
}

/* -------------------------------------------------------------------------- */
/* THE GUARD                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Two things this contract is worthless without, checked at load in dev.
 *
 * 1. A dimension a reality OWES must not be recorded `N/A`. That is the single
 *    way this whole model could be quietly defeated.
 * 2. A maturity of PRODUCT or STANDALONE must actually meet the contract.
 *    Nothing claims either today; the check exists so that the first thing that
 *    does has to earn it rather than be typed.
 */
if (import.meta.env.DEV) {
  const problems: string[] = [];
  for (const m of MANIFESTS) {
    const p = PRODUCTS.find((x) => x.id === m.id);
    if (!p || p.layer === 'EXPERIENCE') continue;
    for (const d of invokedDimensions(m.id)) {
      if ((m.graduation[d] ?? 'N/A') === 'N/A') {
        problems.push(`${m.id}: ${d} is owed by its own declarations but recorded N/A.`);
      }
    }
    const v = releaseVerdict(m.id);
    if (!v) continue;
    if ((m.maturity === 'PRODUCT' || m.maturity === 'STANDALONE') && !v.product.meets) {
      problems.push(
        `${m.id}: claims ${m.maturity} but does not meet the release contract — ${v.product.blockers
          .map((b) => b.dimension)
          .join(', ')}.`,
      );
    }
    if (m.maturity === 'STANDALONE' && v.standalone.blockers.length) {
      problems.push(
        `${m.id}: claims STANDALONE with ${v.standalone.blockers.length} open condition(s).`,
      );
    }
  }
  if (problems.length) console.error('[release] ' + problems.join(' '));
}
