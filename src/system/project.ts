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
  | 'session';

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
  /**
   * The visitor's own words about their own problem, if they have given any.
   *
   * Held here as well as in `brief.ts` because it is the one piece of context
   * every product can legitimately use — the Compiler cannot, but the Simulator,
   * the shell and Director all can, and none of them should have to reach into
   * the brief store to find out whether a project has a subject yet.
   */
  statement: string | null;
  artifacts: ArtifactRecord[];
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
  return { id: id('prj'), createdAt: Date.now(), statement: null, artifacts: [] };
}

let state: Project = fresh();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getProject(): Project {
  return state;
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
  state = fresh();
  emit();
  return state;
}

/** Record the visitor's statement. Idempotent for the same words. */
export function setStatement(statement: string): void {
  const trimmed = statement.trim();
  if (!trimmed || trimmed === state.statement) return;
  state = { ...state, statement: trimmed };
  emit();
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
  state = { ...state, artifacts: [...state.artifacts, record] };
  emit();
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
