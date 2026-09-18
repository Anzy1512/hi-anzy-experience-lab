import { useSyncExternalStore } from 'react';
import type { ArtifactKind, Project } from './project';
import { getProject, note, subscribeProject } from './project';
import { attachWorkAdopter, rememberWork, rememberedWork } from './projects';

/**
 * A PIECE OF WORK — several tools, one job, one outcome.
 *
 * ── WHY THIS IS NOT A STATE MACHINE ─────────────────────────────────────────
 *
 * The obvious way to build this is a workflow engine: a current step, a
 * completed set, transitions, and a reducer keeping them in step. That engine
 * would then be a second source of truth about work the project already
 * records, and the two would disagree the first time somebody declined a
 * handoff, walked off to Chaos, came back, and re-ran a tool.
 *
 * So progress is **derived, never stored**. A step is done when the project
 * holds the artifact that step produces. That single decision means:
 *
 *   · declining a continuation cannot corrupt progress, because there is no
 *     progress to corrupt — the reading simply stays where the artifacts are;
 *   · entering a product directly and producing something advances the work,
 *     which is what a visitor would expect and what a step counter would get
 *     wrong;
 *   · re-running a tool does not double-count;
 *   · nothing has to be cleaned up when a project is reset.
 *
 * Exactly one thing is stored: which piece of work the visitor chose. That is
 * a preference, not a fact about the project, and it is the only part that
 * cannot be read back from what exists.
 *
 * ── NOT THE CURATED ROUTE ───────────────────────────────────────────────────
 *
 * `experience/journey.ts` is a different thing that happens to share a word.
 * That is the sightseeing route — which realities a visitor has wandered
 * through, in order, for the "SHOW ME" door. This is a job of work with an
 * outcome. They are kept apart deliberately: merging them would make walking
 * into After Dark out of curiosity look like progress on somebody's brief.
 *
 * ── SESSION ONLY ────────────────────────────────────────────────────────────
 *
 * Like the project it reads, this lives in memory for one tab. A reload loses
 * it, PERFORMANCE still reports STORAGE — NONE, and the surfaces that show a
 * piece of work say so rather than letting somebody discover it.
 */

export interface WorkStep {
  /** A `MODES` id. The step is performed by entering that product. */
  product: string;
  /**
   * The artifact kind whose presence means this step produced something.
   *
   * `null` marks a place to look rather than a thing to finish — SYSTEM.app in
   * the middle of a journey is a review, and gating progress on "did you visit
   * it" would be counting attendance instead of work.
   */
  produces: ArtifactKind | null;
  /** Skipping is legitimate; the outcome package records that it was skipped. */
  optional?: boolean;
  /** What the visitor gives this step. Their language, not the contract's. */
  gives: string;
  /** What comes out of it. */
  gets: string;
}

export interface WorkDefinition {
  id: string;
  /** Visitor-facing. Never "Journey A". */
  title: string;
  /** One line on what having done this leaves you with. */
  purpose: string;
  steps: WorkStep[];
}

/**
 * The three guided pieces of work, and the open one.
 *
 * Each step names a product that already exists and an artifact kind that
 * product already produces. Nothing here duplicates product logic — a step is
 * a pointer and a sentence.
 */
export const WORK: WorkDefinition[] = [
  {
    id: 'problem',
    title: 'TURN A PROBLEM INTO A SYSTEM',
    purpose:
      'State what is wrong in your own words and leave with a structured brief, a creative treatment, and a package you can send on.',
    steps: [
      {
        product: 'agency-simulator',
        produces: 'brief',
        gives: 'The problem, in one or two sentences, and five constraints.',
        gets: 'A five-stage brief where every line says whether it is a fact, a derivation, an unknown or a recommendation.',
      },
      {
        product: 'anzy-os',
        produces: null,
        gives: 'Nothing — this is where you read what you have so far.',
        gets: 'The assembled project: what you said, what was made, and what is still unknown.',
      },
      {
        product: 'director',
        produces: 'treatment',
        gives: 'The brief.',
        gets: 'A creative treatment, and a film that performs it.',
      },
      {
        product: 'portal',
        produces: 'delivery',
        gives: 'Everything the project holds.',
        gets: 'A package, with what it carries and what it deliberately does not.',
      },
    ],
  },
  {
    id: 'inspect',
    title: 'TAKE A SYSTEM APART',
    purpose:
      'Find out how a real Hi Anzy page is built, and — separately — what a browser actually does with it.',
    steps: [
      {
        product: 'reality-compiler',
        produces: 'manifest',
        gives: 'One of five real commercial pages.',
        gets: 'A structural read of the page’s own source: grid, type roles, colour, imagery, components.',
      },
      {
        product: 'x-ray',
        produces: 'specimen',
        optional: true,
        gives: 'The same page, live.',
        gets: 'Measurements taken off this browser. Skip it and the package says the page was never measured.',
      },
      {
        product: 'anzy-os',
        produces: null,
        gives: 'Nothing.',
        gets: 'Both readings side by side, with what each one cannot tell you.',
      },
    ],
  },
  {
    id: 'matter',
    title: 'TURN A MESSAGE INTO MATTER',
    purpose: 'Take one phrase and leave with a composition, the recipe that made it, and a package.',
    steps: [
      {
        product: 'matter-engine',
        produces: 'recipe',
        gives: 'A phrase — one line, not a document.',
        gets: 'A rendered composition, a PNG, and the settings that reproduce it.',
      },
      {
        product: 'director',
        produces: 'treatment',
        gives: 'The message and what was made from it.',
        gets: 'A treatment that says what the sequence is for.',
      },
      {
        product: 'portal',
        produces: 'delivery',
        gives: 'Everything the project holds.',
        gets: 'A package, stated as local rather than published.',
      },
    ],
  },
];

/** The open route has no steps by design — see `OPEN_WORK`. */
export const OPEN_WORK = {
  id: 'open',
  title: 'OPEN THE SYSTEM',
  purpose:
    'No sequence. The shell, the terminal, the project and every product, in whatever order you want them.',
  product: 'anzy-os',
} as const;

export function workById(id: string | null | undefined): WorkDefinition | undefined {
  return id ? WORK.find((w) => w.id === id) : undefined;
}

/* -------------------------------------------------------------------------- */
/* PROGRESS — read, never written                                              */
/* -------------------------------------------------------------------------- */

export type WorkStatus = 'NEW' | 'ACTIVE' | 'COMPLETE';

export interface StepProgress {
  step: WorkStep;
  index: number;
  done: boolean;
  /** The artifact that satisfied this step, when one did. */
  artifactId: string | null;
  /** An optional step passed over while a later step was completed. */
  skipped: boolean;
}

export interface WorkProgress {
  definition: WorkDefinition;
  status: WorkStatus;
  steps: StepProgress[];
  /** The first step that has produced nothing yet, or null when finished. */
  next: StepProgress | null;
  doneCount: number;
  /** Steps that can actually be completed — review stops are not counted. */
  gateCount: number;
  /**
   * An optional step that is still open, with the work otherwise COMPLETE.
   *
   * TAKE A SYSTEM APART is complete the moment the Compiler has produced a
   * manifest, because X-RAY is optional — but a visitor standing in X-RAY,
   * having been sent there by the previous step, must not be told there is
   * nothing left to make. Status and this are different facts and the surfaces
   * need both.
   */
  optionalOpen: StepProgress | null;
}

/**
 * Where a piece of work has got to, read off the project.
 *
 * A step is satisfied by an artifact of its kind FROM its product. Kind alone
 * would let Director's treatment satisfy a step that named Matter, which is the
 * kind of quiet wrongness that makes a progress display worth less than nothing.
 */
export function progressOf(definition: WorkDefinition, project: Project): WorkProgress {
  const steps: StepProgress[] = definition.steps.map((step, index) => {
    const hit = step.produces
      ? project.artifacts.find((a) => a.kind === step.produces && a.producer === step.product)
      : undefined;
    return {
      step,
      index,
      done: Boolean(hit),
      artifactId: hit?.id ?? null,
      skipped: false,
    };
  });

  /* An optional step counts as skipped only once something AFTER it is done —
     before that it is simply still ahead of the visitor. */
  const lastDone = steps.reduce((n, s) => (s.done ? s.index : n), -1);
  for (const s of steps) {
    if (s.step.optional && !s.done && s.index < lastDone) s.skipped = true;
  }

  const gates = steps.filter((s) => s.step.produces !== null);
  const required = gates.filter((s) => !s.step.optional);
  const doneCount = gates.filter((s) => s.done).length;
  const next = steps.find((s) => s.step.produces !== null && !s.done && !s.skipped) ?? null;

  const status: WorkStatus =
    required.every((s) => s.done) && required.length > 0
      ? 'COMPLETE'
      : doneCount > 0
        ? 'ACTIVE'
        : 'NEW';

  const optionalOpen =
    status === 'COMPLETE' ? (steps.find((s) => s.step.optional && !s.done && !s.skipped) ?? null) : null;

  return { definition, status, steps, next, doneCount, gateCount: gates.length, optionalOpen };
}

/* -------------------------------------------------------------------------- */
/* THE ONE STORED THING: WHICH WORK WAS CHOSEN                                 */
/* -------------------------------------------------------------------------- */

let chosen: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startWork(id: string): void {
  if (chosen === id) return;
  chosen = workById(id) ? id : null;
  /* The one stored thing is now also a persisted thing. Which job somebody is
     doing is exactly what a resumed project should put back. */
  rememberWork(chosen);
  const def = workById(chosen);
  if (def) note('WORK_CHOSEN', `Following ${def.title}.`, def.id);
  emit();
}

/**
 * Step out of the guided route without abandoning the work itself.
 *
 * The artifacts stay, so the progress reading stays — choosing the same piece
 * of work again later picks up exactly where the project actually is. That is
 * the whole benefit of deriving progress instead of storing it.
 */
export function leaveWork(): void {
  if (chosen === null) return;
  const was = workById(chosen);
  chosen = null;
  rememberWork(null);
  if (was) note('WORK_LEFT', `Stopped following ${was.title}. Everything made is still in the project.`, was.id);
  emit();
}

export function activeWorkId(): string | null {
  return chosen;
}

/**
 * Adopt the work a resumed project was following.
 *
 * Called once the stored project is installed. `chosen` is module state and a
 * reload empties it, so without this a visitor resumes their project and finds
 * the route they were following quietly dropped.
 */
export function adoptStoredWork(): void {
  const id = rememberedWork();
  const next = id && workById(id) ? id : null;
  if (chosen === next) return;
  chosen = next;
  emit();
}

attachWorkAdopter(adoptStoredWork);

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  /* Progress is a function of the project, so a consumer of this hook has to
     re-read when either changes. Subscribing to both here keeps that out of
     every component. */
  const offProject = subscribeProject(fn);
  return () => {
    listeners.delete(fn);
    offProject();
  };
}

/**
 * The active piece of work and where it has got to, or null.
 *
 * Recomputed on read rather than memoised into a stable object: the snapshot
 * that `useSyncExternalStore` compares is the chosen id and the project
 * reference, both of which are stable between real changes.
 */
function snapshot(): string | null {
  return chosen;
}

export function useActiveWork(): WorkProgress | null {
  const id = useSyncExternalStore(subscribe, snapshot, snapshot);
  const project = useSyncExternalStore(subscribeProject, getProject, getProject);
  const def = workById(id);
  return def ? progressOf(def, project) : null;
}

/* -------------------------------------------------------------------------- */
/* WHERE A PRODUCT'S OUTPUT GOES NEXT                                          */
/* -------------------------------------------------------------------------- */

/**
 * The destination a product should offer its artifact to, given the work.
 *
 * ── WHY THE PRODUCT STILL DECIDES ───────────────────────────────────────────
 *
 * The obvious version of this reads the next step out of the active work and
 * sends there. It is wrong, because a handoff is a thing being *carried into a
 * tool that needs it*, and most steps do not need one: PORTAL reads the whole
 * project and takes no input, so an offer addressed to it would sit in the
 * pending slot forever with nothing to claim it.
 *
 * So the product passes `accepts` — the destinations it actually knows how to
 * hand to, all of which claim offers — and the work only gets to choose among
 * them. With no work active, or a work whose remaining steps are none of them,
 * the product's own default stands. That keeps every product correct when
 * entered directly, which is the condition the whole Lab is built on.
 *
 * Walking the route is a different gesture and belongs to the strip: SEND TO
 * carries something, NEXT just opens a door.
 */
export function useHandoffTarget(product: string, accepts: string[], fallback: string): string {
  const work = useActiveWork();
  if (!work) return fallback;
  const here = work.steps.findIndex((s) => s.step.product === product);
  if (here < 0) return fallback;
  const ahead = work.steps.slice(here + 1).find((s) => accepts.includes(s.step.product));
  return ahead ? ahead.step.product : fallback;
}
