/**
 * THE PRODUCT REGISTRY — what each of the sixteen realities actually is.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The Lab has been presenting sixteen realities as sixteen equivalent choices
 * since Phase 5, and they are not equivalent. Some are tools a person could use
 * to produce something. Some are instruments that measure. Some are experiences
 * that demonstrate what this studio can build and are not trying to be tools at
 * all. Flattening those into one list was the single biggest reason the product
 * read as "sixteen cool experiments" rather than as a system.
 *
 * `ModeDefinition.tier` already split the index two ways — flagship and
 * experiment — but that is a statement about billing, not about kind: X-Ray is
 * an instrument on the reverse side, and Portal is a delivery surface on the
 * front. This adds the axis that was missing.
 *
 * ── THE CONTRACT IS THE POINT, NOT THE LABEL ────────────────────────────────
 *
 * Each entry also answers the six questions a product-facing tool has to answer
 * — and answers `null` where it currently cannot. That is deliberate: a
 * registry that only records intentions is a wish list. This one records the
 * gap, so `unmetContract()` returns the actual work remaining and the product
 * surface can refuse to claim a continuation that does not exist.
 *
 * An EXPERIENCE is not held to the contract. It is not a failed product; it is
 * a different thing, and marking Dream "incomplete" for having no export would
 * be a category error.
 */

import { MODES } from '../content/lab';

/**
 * What kind of thing a reality is.
 *
 *   PRODUCT     you give it something and take something away.
 *   INSTRUMENT  it measures or senses; the reading is the output.
 *   EXPERIENCE  it demonstrates capability. No artifact is owed.
 *
 * SYSTEM is deliberately not in this union. It is not a reality — it is the
 * backbone (project context, artifact store, handoffs) that the products talk
 * through, and it has no row on the index.
 */
export type ProductLayer = 'PRODUCT' | 'INSTRUMENT' | 'EXPERIENCE';

/**
 * The grouping the index shows, which is finer than the layer.
 *
 * Living World, Memory and Time Machine are all experiences, but they are
 * experiences *about* space and record, and burying them among the experiments
 * loses the thing they have in common.
 */
export type ProductFamily =
  | 'INTELLIGENCE'
  | 'ENVIRONMENT'
  | 'ANALYSIS'
  | 'CREATION'
  | 'DELIVERY'
  | 'INSTRUMENT'
  | 'SPATIAL'
  | 'ARCHIVE'
  | 'EXPERIMENT';

/**
 * The six questions, per §7 of the program brief.
 *
 * `null` means "this tool cannot answer that yet" and is the honest value. It
 * is never filled in with a hopeful sentence — `unmetContract()` counts these,
 * and a count that lies is worse than no count.
 */
export interface ProductContract {
  /** What a visitor can give it. */
  input: string | null;
  /** What information it works from, named so it can be checked. */
  context: string | null;
  /** What it actually does — the real operation, not a mood. */
  process: string | null;
  /** What it determines or creates. */
  result: string | null;
  /** What can be taken away, and in what form. */
  artifact: string | null;
  /** Where the output can go next. */
  continue: string | null;
}

export interface ProductEntry {
  /** A `MODES` id. Checked against it at module load. */
  id: string;
  layer: ProductLayer;
  family: ProductFamily;
  /**
   * One line naming the tool's job, written for somebody deciding whether to
   * open it. Distinct from the index tagline, which is written to intrigue.
   */
  proposition: string;
  contract: ProductContract;
}

/** An experience owes nothing. Stated once rather than repeated nine times. */
const NO_CONTRACT: ProductContract = {
  input: null,
  context: null,
  process: null,
  result: null,
  artifact: null,
  continue: null,
};

export const PRODUCTS: ProductEntry[] = [
  /* ---- PRODUCTS ---------------------------------------------------------- */
  {
    id: 'anzy-os',
    layer: 'PRODUCT',
    family: 'ENVIRONMENT',
    proposition: 'The working environment: a shell, a system surface, and the sheets between them.',
    contract: {
      input: 'A typed command, or a problem stated in your own words after DIAGNOSE.',
      context: 'Hi Anzy’s own service taxonomy, capability list and method, mirrored from the commercial source at a pinned commit.',
      process: 'Matches your words against a fixed lexicon and maps them onto real service areas and method stages. No model, no network.',
      result: 'A problem frame — the areas your words touch, and the stages that follow from them.',
      artifact: 'The brief, as copied text, Markdown or JSON.',
      continue: 'SYSTEM.app holds the frame; AGENCY SIMULATOR can develop it into a full brief.',
    },
  },
  {
    id: 'agency-simulator',
    layer: 'PRODUCT',
    family: 'ANALYSIS',
    proposition: 'State a business problem and watch Hi Anzy’s method take it apart and rebuild it as a system.',
    contract: {
      input: 'A sentence describing what is wrong, then five constraint choices.',
      context: 'The same canonical taxonomy the shell uses, plus whatever frame arrived from Terminal.',
      process: 'Runs the stated problem through AUDIT → ARCHITECT → BUILD → CONNECT → SCALE, marking every line by where it came from.',
      result: 'A five-stage brief in which every line is FACT, DERIVED, UNKNOWN or RECOMMENDATION.',
      artifact: 'HI ANZY SYSTEM BRIEF — copied text, Markdown or JSON.',
      continue: 'SYSTEM.app.',
    },
  },
  {
    id: 'reality-compiler',
    layer: 'PRODUCT',
    family: 'ANALYSIS',
    proposition: 'Take a real Hi Anzy page apart into the structure it is actually built from.',
    contract: {
      input: 'One of five real commercial pages.',
      context: 'The commercial frontend’s own source, read at a pinned commit — not the live site, and not a screenshot.',
      process: 'Reads each page’s section structure, grid, typographic roles, colours and imagery, then separates them into depth.',
      result: 'A structural decomposition: every part named, sourced and counted, including the parts that carry no readable content.',
      artifact: 'A transformation manifest, as Markdown or JSON.',
      continue: 'SYSTEM.app; or X-RAY, which opens on the same page and measures what this browser actually rendered.',
    },
  },
  {
    id: 'matter-engine',
    layer: 'PRODUCT',
    family: 'CREATION',
    proposition: 'Type a phrase and watch it become matter you can keep.',
    contract: {
      input: 'A phrase.',
      context: 'Nothing external — the composition is generated here, from your text and the current settings.',
      process: 'Rasterises the phrase, samples it into particles, and runs them under the current force model.',
      result: 'A rendered composition.',
      artifact: 'A PNG of the frame, and a recipe JSON of the settings that made it.',
      continue: 'SYSTEM.app holds the recipe. The PNG is downloaded and never retained, so the settings are what travel.',
    },
  },
  {
    id: 'director',
    layer: 'PRODUCT',
    family: 'CREATION',
    proposition: 'Turn a brief into a creative treatment, and watch the browser perform it.',
    contract: {
      input: 'A system brief, sent from the Agency Simulator — or nothing, in which case the film runs on the studio’s own material and says so.',
      context: 'The brief’s own stated problem, read from the artifact rather than from another mode’s live state. The shot intents are authored beside the shots in content/director.ts.',
      process: 'Derives a treatment from the cut: acts become the message hierarchy, shot kinds become the visual system, and every shot states what it is doing. Then performs the cut against a real clock.',
      result: 'A treatment you read before the film, and a 1:05 primary cut that previews it. The long edit stays available.',
      artifact: 'DIRECTOR TREATMENT — copied text, Markdown or JSON.',
      continue: 'SYSTEM.app.',
    },
  },
  {
    id: 'portal',
    layer: 'PRODUCT',
    family: 'DELIVERY',
    proposition: 'The crossing: what a page shows you, and what the system behind it holds.',
    contract: {
      input: 'A section of a real page to carry through the aperture.',
      context: 'The same canonical page source the Compiler reads.',
      process: 'Holds one section on both sides of a cut and changes only which facts about it are shown.',
      result: 'The same material, seen as a page and then as a system record — and, on the far side, everything this project has produced, packaged.',
      artifact: 'DELIVERY MANIFEST — a LOCAL package. Nothing is uploaded, hosted or published, and the manifest says so.',
      continue: 'SYSTEM.app; REALITY COMPILER, for the whole page; LIVING WORLD, for the territory.',
    },
  },
  {
    id: 'intelligence',
    layer: 'PRODUCT',
    family: 'INTELLIGENCE',
    proposition:
      'Every business of a kind in a place, every brand, place, store list, site and domain behind it — asked of public sources, taken away with the evidence.',
    contract: {
      input:
        'A question, a brand, a place, a website, a domain, or a list of questions — in your own words.',
      context:
        'The Commercial Intelligence Engine running on this machine, which asks public sources — the map, Overture’s places, brands’ own store locators, businesses’ own sites, public registries — under their usage policies.',
      process:
        'Sends each request to the engine, follows its stages or tasks, and reads back what it found with the evidence behind each fact and the reason for everything it could not decide.',
      result:
        'Businesses matched or undetermined with the reason, and how far the answer can be trusted; what a brand stands for; how a place resolves; the stores a locator states; a site’s stack; a domain’s records; a dataset from many questions; the sources and the registry behind them.',
      artifact:
        'The engine’s own exports of a search or a dataset (CSV, XLSX, GeoJSON, JSON), and a survey summary as copied text, Markdown or JSON.',
      /* Implemented as the desks' own handovers (modes/intelligence/link.ts):
         each names its destination and carries words to start from. */
      continue:
        'Between its own desks: a brand to its stores or a survey, a place to a survey or a store locator, a business to its site and its domain, a question to a dataset, a saved search back to its ledger.',
    },
  },

  /* ---- INSTRUMENTS ------------------------------------------------------- */
  {
    id: 'x-ray',
    layer: 'INSTRUMENT',
    family: 'INSTRUMENT',
    proposition: 'Measure what a rendered interface is actually doing, live, in this browser.',
    contract: {
      input: 'A subject: the Lab’s own specimen plate, or a real canonical page.',
      context: 'The live DOM of whatever is on screen. Sourced facts and measured facts are kept strictly apart.',
      process: 'Observes real elements and reports boxes, positions, depth and type metrics as this window renders them.',
      result: 'A specimen report separating what the source says from what this window measured.',
      artifact: 'SYSTEM SPECIMEN REPORT — Markdown or JSON.',
      /* Inbound only. It CLAIMS the Compiler's manifest and opens on the same
         page, but it offers nothing onward: no `offer()` call, no handoff on
         its artifact bar. This said SYSTEM.app, which was a continuation with
         no mechanism behind it — found by the Phase 8.12 dependency map. */
      continue:
        'Nowhere yet. The report is a download; nothing carries it into the project, and SYSTEM.app does not receive it.',
    },
  },
  {
    id: 'presence',
    layer: 'INSTRUMENT',
    family: 'INSTRUMENT',
    proposition: 'The field reads you rather than your cursor — by pointer, by touch, or by camera if you allow it.',
    contract: {
      input: 'Your movement. The camera is optional, explicit, and never requested on entry.',
      context: 'Frames compared at 32×24 in this tab and discarded. Nothing is recorded, stored or uploaded.',
      process: 'Turns position and energy into a force the particle field answers to.',
      result: 'A live reading, with the camera’s own state reported honestly in nine distinct conditions.',
      artifact: null,
      continue: null,
    },
  },
  {
    id: 'performance',
    layer: 'INSTRUMENT',
    family: 'INSTRUMENT',
    proposition: 'What this session actually measured, and — just as loudly — what it did not.',
    contract: {
      input: 'A sample window.',
      context: 'This browser, this session. Nothing is inferred about your hardware.',
      process: 'Counts frames, subscribers, canvases and chunks against a real clock.',
      result: 'A session report in which anything unmeasured is printed UNKNOWN rather than estimated.',
      artifact: 'The session report, as Markdown or JSON.',
      /* This mode imports neither `project` nor `handoff`. Same correction as
         X-Ray: a stated continuation with nothing implementing it. */
      continue:
        'Nowhere yet. The report is a download; this instrument does not write to the project.',
    },
  },

  /* ---- EXPERIENCES ------------------------------------------------------- */
  {
    id: 'living-world',
    layer: 'EXPERIENCE',
    family: 'SPATIAL',
    proposition: 'The company as territory: districts, routes and a horizon you can walk toward.',
    contract: NO_CONTRACT,
  },
  {
    id: 'memory',
    layer: 'EXPERIENCE',
    family: 'ARCHIVE',
    proposition: 'An archive reconstructed from sampled typography, with its gaps marked rather than filled.',
    contract: NO_CONTRACT,
  },
  {
    id: 'time-machine',
    layer: 'EXPERIENCE',
    family: 'ARCHIVE',
    proposition: 'Seven interaction models, and the company’s own recorded history — which is twelve days long.',
    contract: NO_CONTRACT,
  },
  {
    id: 'dream',
    layer: 'EXPERIENCE',
    family: 'EXPERIMENT',
    proposition: 'Seeded contours that remember the word you gave them.',
    contract: NO_CONTRACT,
  },
  {
    id: 'chaos',
    layer: 'EXPERIENCE',
    family: 'EXPERIMENT',
    proposition: 'A system failing on purpose, over an isolated copy, and recovering.',
    contract: NO_CONTRACT,
  },
  {
    id: 'after-dark',
    layer: 'EXPERIENCE',
    family: 'EXPERIMENT',
    proposition: 'The Lab unattended: night stock, sodium light, poster culture.',
    contract: NO_CONTRACT,
  },
  {
    id: 'sonic-architecture',
    layer: 'EXPERIENCE',
    family: 'EXPERIMENT',
    proposition: 'The elevation as an instrument — every voice synthesised, nothing downloaded.',
    contract: NO_CONTRACT,
  },
];

/* -------------------------------------------------------------------------- */
/* THE INDEX, GROUPED BY KIND                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How the sheet is grouped.
 *
 * NOT the same axis as `ModeDefinition.tier`, and both are kept because both
 * are true. `tier` is a fact about the plate: 01–08 are printed on the front of
 * the index sheet and X1–X8 on the reverse, and those numbers are identity —
 * the graph, the cross-references and the Terminal all name realities by them.
 * This is a fact about kind. They genuinely disagree: X-Ray is an instrument
 * printed on the reverse, Director is a product printed on the reverse, and
 * Living World is an experience printed first on the front.
 *
 * Grouping by kind is the change the program brief asks for — a visitor should
 * not meet sixteen equivalent choices — and keeping the plate numbers means
 * nothing that referred to X1 now refers to nothing.
 */
export interface IndexGroup {
  key: string;
  label: string;
  /** One line on what this group is for, set beside the label on the sheet. */
  note: string;
  families: ProductFamily[];
}

export const INDEX_GROUPS: IndexGroup[] = [
  {
    /* One reality, printed as its desks (content/intelligence.ts): the engine's
       tools are what a visitor comes for, so each is a row of its own. */
    key: 'intelligence',
    label: 'INTELLIGENCE',
    note: 'The Commercial Intelligence Engine on this machine. Public sources, with the evidence.',
    families: ['INTELLIGENCE'],
  },
  {
    key: 'products',
    label: 'PRODUCTS',
    note: 'Give them something. Take something away.',
    families: ['ENVIRONMENT', 'ANALYSIS', 'CREATION', 'DELIVERY'],
  },
  {
    key: 'instruments',
    label: 'INSTRUMENTS',
    note: 'They measure. The reading is the output.',
    families: ['INSTRUMENT'],
  },
  {
    key: 'spatial',
    label: 'SPATIAL & ARCHIVE',
    note: 'Territory and record. Enter them; nothing is owed back.',
    families: ['SPATIAL', 'ARCHIVE'],
  },
  {
    key: 'experiments',
    label: 'EXPERIMENTS',
    note: 'What the studio is willing to try in public.',
    families: ['EXPERIMENT'],
  },
];

/**
 * Mode ids for a group, in registry order.
 *
 * Ids rather than `ModeDefinition`s so this module does not have to import the
 * index's own types, and so a caller that only needs to know *which* can avoid
 * pulling the definitions in at all.
 */
export function groupMembers(key: string): string[] {
  const group = INDEX_GROUPS.find((g) => g.key === key);
  if (!group) return [];
  return PRODUCTS.filter((p) => group.families.includes(p.family)).map((p) => p.id);
}

/* -------------------------------------------------------------------------- */
/* LOOKUPS                                                                     */
/* -------------------------------------------------------------------------- */

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

export function productOf(id: string | null | undefined): ProductEntry | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function byLayer(layer: ProductLayer): ProductEntry[] {
  return PRODUCTS.filter((p) => p.layer === layer);
}

export function byFamily(family: ProductFamily): ProductEntry[] {
  return PRODUCTS.filter((p) => p.family === family);
}

/**
 * Which of the six questions a tool cannot yet answer.
 *
 * Empty for every EXPERIENCE by definition, and empty for a product only once
 * it genuinely satisfies the contract. This is what the phase reports count,
 * so it is computed from the registry rather than maintained beside it.
 */
export function unmetContract(id: string): (keyof ProductContract)[] {
  const p = BY_ID.get(id);
  if (!p || p.layer === 'EXPERIENCE') return [];
  return (Object.keys(p.contract) as (keyof ProductContract)[]).filter(
    (k) => p.contract[k] === null,
  );
}

/** Products and instruments that still owe something. */
export function incompleteProducts(): { id: string; missing: (keyof ProductContract)[] }[] {
  return PRODUCTS.filter((p) => p.layer !== 'EXPERIENCE')
    .map((p) => ({ id: p.id, missing: unmetContract(p.id) }))
    .filter((r) => r.missing.length > 0);
}

/*
 * The registry and the index must describe the same sixteen things.
 *
 * A mode added to `content/lab.ts` without a classification here would appear
 * on the index with no layer and silently fall out of every grouping, which is
 * exactly the kind of drift this file exists to prevent. Dev-only: the check
 * costs a map lookup per mode and is dead code in production.
 */
if (import.meta.env.DEV) {
  const missing = MODES.filter((m) => !BY_ID.has(m.id)).map((m) => m.id);
  const extra = PRODUCTS.filter((p) => !MODES.some((m) => m.id === p.id)).map((p) => p.id);
  if (missing.length || extra.length) {
    console.error(
      `[registry] classification out of step with the index.` +
        (missing.length ? ` Unclassified: ${missing.join(', ')}.` : '') +
        (extra.length ? ` Classified but not a mode: ${extra.join(', ')}.` : ''),
    );
  }
}
