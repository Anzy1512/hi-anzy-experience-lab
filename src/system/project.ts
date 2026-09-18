/**
 * PROJECT CONTEXT — the one thing every product is working on.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Phase 8.6 gave the Lab cross-tool continuity by having the Terminal write a
 * frame into `system/brief.ts` and having SYSTEM.app and the Simulator read it.
 * That works, and it is exactly one wire: one producer, one shape, one pair of
 * consumers. Adding the Compiler, X-Ray, Matter and Director to it would mean
 * five more wires and five more chances for one tool to reach into another's
 * state — which is the failure mode the program brief names outright.
 *
 * So products stop talking to each other and start talking to this: a project
 * they are all working on, and an artifact store that records what each of them
 * produced. A handoff (see `handoff.ts`) then carries an artifact ID and a
 * project ID rather than component state, which means every continuation is
 * inspectable, reversible, and cannot silently mutate the tool it came from.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 *
 * No persistence. Nothing is written to localStorage, IndexedDB, a cookie or a
 * server, and PERFORMANCE still reports STORAGE — NONE because that is still
 * true. Choosing a storage architecture is Phase 8.10's job and it is supposed
 * to be made on evidence; building a store now and deciding later would be
 * deciding now and documenting later.
 *
 * No fields without a consumer. The program brief sketches a Project with
 * nineteen properties — evidence, assumptions, risks, decisions, outputs — and
 * explicitly says not to implement what nothing reads. Four fields have real
 * consumers today and four fields are what this holds. The rest arrive when a
 * product needs them, which is also when their shape stops being a guess.
 *
 * ── IDENTITY ────────────────────────────────────────────────────────────────
 *
 * A project id is a random string with no relationship to the visitor. It is
 * not a user id, it does not survive a reload, and nothing about a person is
 * kept — the statement a visitor types is their own words about their own
 * business, held in memory for as long as the tab is open and no longer.
 */

import { useSyncExternalStore } from 'react';
import type { HistoryEntry, HistoryKind, StoredConstraint, StoredProject } from './schema';

/** What kind of thing an artifact is. Drives how a receiver reads it. */
export type ArtifactKind =
  /** A framed problem — the Terminal's `diagnose` output. */
  | 'frame'
  /** A five-stage system brief — the Simulator's run. */
  | 'brief'
  /** A structural decomposition of a real page — the Compiler. */
  | 'manifest'
  /** A measured report of live DOM — X-Ray. */
  | 'specimen'
  /** Settings that produced a composition — Matter. */
  | 'recipe'
  /** Measured session values — Performance. */
  | 'session'
  /** A creative treatment for a film — Director. */
  | 'treatment'
  /** A packaged deliverable — Portal. */
  | 'delivery';

export interface ArtifactRecord {
  id: string;
  kind: ArtifactKind;
  /** Human title, as the producing tool named it. */
  title: string;
  createdAt: number;
  /** The mode id that produced it, so the store can say where it came from. */
  producer: string;
  projectId: string;
  /**
   * Artifacts this one was derived from.
   *
   * The whole reason a brief can say "developed from the frame you stated in
   * TERMINAL" and have that be checkable rather than decorative.
   */
  sourceIds: string[];
  /**
   * What this artifact cannot tell you. Never empty, and never optional.
   *
   * Every artifact in this product travels — somebody forwards the Markdown and
   * the screen that qualified it is gone. A limits line that a producer has to
   * supply at the point of recording is the only version of this that survives.
   */
  limits: string;
  /** The document, when there is one. What a receiving tool actually reads. */
  text?: string;
  /** The structured payload, when there is one. */
  data?: unknown;
}

export interface Project {
  id: string;
  createdAt: number;
  /** Last time anything in it changed. What the project list sorts on. */
  updatedAt: number;
  /**
   * What the visitor called it, or null when nobody has.
   *
   * Null is a real answer rather than a missing one, and every surface that
   * shows a project has to say so instead of printing a derived name as though
   * somebody chose it. `projectTitle()` in `schema.ts` is the one place that
   * decides what to show in its place.
   */
  title: string | null;
  /**
   * The visitor's own words about their own problem, if they have given any.
   *
   * Held here as well as in `brief.ts` because it is the one piece of context
   * every product can legitimately use — the Compiler cannot, but the Simulator,
   * the shell and Director all can, and none of them should have to reach into
   * the brief store to find out whether a project has a subject yet.
   */
  statement: string | null;
  /**
   * The five choices the Agency Simulator asked for, kept as the choices.
   *
   * These used to live in a component and die with it. They are not component
   * state: they are the visitor's stated constraints, and the entire five-stage
   * brief is a pure function of them plus the statement. Storing the inputs and
   * rebuilding the document is what keeps a 25 kB report out of the database
   * — see the note at the top of `schema.ts`.
   */
  constraints: StoredConstraint[];
  artifacts: ArtifactRecord[];
  /** How the project got into this state. Never an event log — see `schema.ts`. */
  history: HistoryEntry[];
}

/* -------------------------------------------------------------------------- */
/* STORE                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Ids are short, random and meaningless.
 *
 * `crypto.randomUUID` is not used: it is unavailable on insecure origins, and
 * this has to work when the Lab is opened from a file or over plain http on a
 * phone on somebody's desk. Collision risk across a handful of artifacts in one
 * tab is not a real risk.
 */
function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function fresh(): Project {
  const at = Date.now();
  return {
    id: id('prj'),
    createdAt: at,
    updatedAt: at,
    title: null,
    statement: null,
    constraints: [],
    artifacts: [],
    history: [{ at, kind: 'PROJECT_CREATED', note: 'Project started.' }],
  };
}

let state: Project = fresh();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getProject(): Project {
  return state;
}

/* -------------------------------------------------------------------------- */
/* EVERY CHANGE GOES THROUGH ONE DOOR                                          */
/* -------------------------------------------------------------------------- */

/**
 * Apply a change, stamp the clock, tell everybody, and save.
 *
 * Every mutator below goes through here so that three things cannot drift apart:
 * `updatedAt`, the subscribers, and what is on disk. A mutator that set `state`
 * directly would be a mutator whose change silently does not survive a reload,
 * and that is precisely the bug this phase exists to make impossible.
 *
 * Saving is fire-and-forget by design. A write that fails reports itself through
 * the storage state — which SYSTEM.app prints — and the visitor keeps working
 * with an intact in-memory project either way. Persistence is a feature that can
 * be missing; it is never something a product waits for.
 */
let persist: ((p: Project) => void) | null = null;

/**
 * Handed in by the persistence layer at start-up.
 *
 * Injected rather than imported so this module keeps knowing nothing about
 * storage. It is also what lets a resumed project be installed without the act
 * of installing it writing itself straight back out again.
 */
export function attachPersistence(fn: ((p: Project) => void) | null): void {
  persist = fn;
}

function commit(next: Project, entry?: { kind: HistoryKind; note: string; ref?: string }): void {
  const at = Date.now();
  state = {
    ...next,
    updatedAt: at,
    history: entry ? [...next.history, { at, ...entry }] : next.history,
  };
  emit();
  persist?.(state);
}

/**
 * Put a project back the way it was found, without recording that as a change.
 *
 * `commit` would stamp `updatedAt` and write it out again, so resuming a project
 * would keep bumping its position in the list without anything having happened
 * to it. Opening something is not editing it.
 */
export function installProject(p: StoredProject): void {
  state = {
    id: p.id,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    title: p.title,
    statement: p.statement,
    constraints: p.constraints,
    artifacts: p.artifacts,
    history: p.history,
  };
  emit();
}

/**
 * Start again.
 *
 * A new project, not a cleared one: the id changes, so an artifact recorded
 * against the old project cannot be mistaken for part of this one. Callers that
 * also hold working state — the brief store — reset themselves; this does not
 * reach into them, for the same reason products do not reach into each other.
 */
export function newProject(): Project {
  const next = fresh();
  state = next;
  emit();
  persist?.(state);
  return state;
}

/** Record the visitor's statement. Idempotent for the same words. */
export function setStatement(statement: string): void {
  const trimmed = statement.trim();
  if (!trimmed || trimmed === state.statement) return;
  commit({ ...state, statement: trimmed }, {
    kind: 'STATEMENT_SET',
    note: `Stated: “${trimmed.length > 90 ? `${trimmed.slice(0, 89)}…` : trimmed}”`,
  });
}

/**
 * Name the project, or take the name off again.
 *
 * The only field in the whole model a visitor sets for its own sake. Clearing it
 * returns the project to being unnamed rather than naming it something empty,
 * so "has anybody named this" stays a question with an answer.
 */
export function setTitle(title: string | null): void {
  const trimmed = title?.trim() || null;
  if (trimmed === state.title) return;
  commit({ ...state, title: trimmed }, {
    kind: 'STATEMENT_SET',
    note: trimmed ? `Named “${trimmed}”.` : 'Name removed.',
  });
}

/**
 * Record a decision the visitor made, as the decision rather than its effect.
 *
 * Re-answering a question replaces that answer instead of appending a second
 * one: the constraint list is what they currently think, not a transcript of
 * them changing their mind. The transcript is the history.
 */
export function setConstraint(question: string, option: string, note: string): void {
  const existing = state.constraints.find((c) => c.question === question);
  if (existing && existing.option === option) return;
  const constraints = [
    ...state.constraints.filter((c) => c.question !== question),
    { question, option, at: Date.now() },
  ];
  commit({ ...state, constraints }, { kind: 'DECISION_ACCEPTED', note, ref: question });
}

/** Forget the constraints without touching the statement. Used by START AGAIN. */
export function clearConstraints(): void {
  if (!state.constraints.length) return;
  commit({ ...state, constraints: [] });
}

/** Something worth explaining later happened. */
export function note(kind: HistoryKind, text: string, ref?: string): void {
  commit({ ...state }, { kind, note: text, ...(ref ? { ref } : {}) });
}

/**
 * Put an artifact in the store and return its record.
 *
 * The producer supplies everything except identity and time, so a record cannot
 * exist without a `limits` line — the type makes that a compile error rather
 * than a review comment.
 */
export function recordArtifact(
  spec: Omit<ArtifactRecord, 'id' | 'createdAt' | 'projectId'>,
): ArtifactRecord {
  const record: ArtifactRecord = {
    ...spec,
    id: id('art'),
    createdAt: Date.now(),
    projectId: state.id,
  };
  commit({ ...state, artifacts: [...state.artifacts, record] }, {
    kind: 'ARTIFACT_CREATED',
    note: `${record.title} — made in ${record.producer.toUpperCase().replace(/-/g, ' ')}.`,
    ref: record.id,
  });
  return record;
}

export function getArtifact(artifactId: string | null | undefined): ArtifactRecord | undefined {
  if (!artifactId) return undefined;
  return state.artifacts.find((a) => a.id === artifactId);
}

/** Most recent first — every surface that lists artifacts wants this order. */
export function artifactsOf(kind?: ArtifactKind): ArtifactRecord[] {
  const all = [...state.artifacts].reverse();
  return kind ? all.filter((a) => a.kind === kind) : all;
}

export function subscribeProject(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Read the project in a component.
 *
 * `useSyncExternalStore` for the same reason `useBrief` uses it: artifacts are
 * recorded from inside command handlers and export callbacks, which are not
 * React events the reading component knows about.
 */
export function useProject(): Project {
  return useSyncExternalStore(subscribeProject, getProject, getProject);
}
