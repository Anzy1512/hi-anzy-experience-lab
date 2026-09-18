import type { ArtifactRecord } from './project';

/**
 * WHAT A PROJECT IS, ONCE IT HAS TO SURVIVE BEING CLOSED.
 *
 * ── THE RULE THIS FILE WAS WRITTEN UNDER ────────────────────────────────────
 *
 * Every field below had to answer three questions before it was allowed in:
 *
 *   WHO PRODUCES IT    a real caller, not a hypothetical one
 *   WHO CONSUMES IT    a surface that reads it today
 *   WHY SURVIVE        what breaks for a visitor if it is gone after a reload
 *
 * Anything that could not answer all three is not here. The audit is written
 * out in `docs/PHASE_8_10_PROJECT_MEMORY.md` field by field, including the
 * things that were considered and rejected.
 *
 * ── INPUTS ARE STORED; OUTPUTS ARE DERIVED ──────────────────────────────────
 *
 * The largest thing a project holds is the Agency Simulator's five-stage brief:
 * 8.4 kB of Markdown and 16.9 kB of JSON, measured. It is also, entirely, a
 * pure function of two inputs — the sentence the visitor typed and the five
 * options they chose. `frame()`, `run()` and `buildRun()` have no randomness
 * and no clock in them.
 *
 * So the brief is not persisted. Its INPUTS are, at about 200 bytes, and the
 * document is rebuilt on load by the code that is running then. That is the
 * honest behaviour for a deterministic model: if the model is corrected, a
 * resumed project gets the corrected reading rather than a replay of an old
 * one — while the artifact already in the ledger still holds, word for word,
 * what was actually produced and possibly already sent to somebody.
 *
 * It is the same decision Phase 8.9 made about work progress, one level down.
 *
 * ── AND COMPONENT STATE IS NOT ARCHITECTURE ─────────────────────────────────
 *
 * No panel position, no open sheet, no camera transform, no scroll offset, no
 * phase, no step index. A resumed project puts the visitor back in a product
 * that knows what they told it. It does not pretend they never left.
 */

/**
 * Bumped when a stored shape changes in a way older data cannot satisfy.
 *
 * Version 1 is the first durable shape this product has ever written. There is
 * nothing to migrate FROM, so the migration policy is the honest minimum:
 * recognise this version, refuse anything newer by name, and never reinterpret
 * a record written by a shape we do not know.
 */
export const SCHEMA_VERSION = 1;

/** The key the index lives under, and the IndexedDB database name. */
export const INDEX_KEY = 'hi-anzy-lab.projects.v1';
export const DB_NAME = 'hi-anzy-lab';
export const DB_STORE = 'projects';

/**
 * One answer the visitor gave, kept as the choice rather than as its effect.
 *
 * PRODUCER   Agency Simulator, one per question.
 * CONSUMER   the brief, rebuilt on load; SYSTEM.app's "what you told us".
 * SURVIVES   because it is the visitor's own decision. Losing it means asking
 *            the same five questions again, which is the exact failure Phase
 *            8.9 fixed for the statement and would be no better here.
 */
export interface StoredConstraint {
  /** A `QUESTIONS` id. */
  question: string;
  /** The option id they chose. */
  option: string;
  at: number;
}

/**
 * Something that happened to this project, worth explaining later.
 *
 * Deliberately not an event log. Pointer moves, frames, hovers and scrolls are
 * not here and must never be: this exists to answer "how did the project get
 * into this state", and a stream of render events answers nothing.
 */
export type HistoryKind =
  | 'PROJECT_CREATED'
  | 'STATEMENT_SET'
  | 'DECISION_ACCEPTED'
  | 'ARTIFACT_CREATED'
  | 'HANDOFF_OFFERED'
  | 'HANDOFF_ACCEPTED'
  | 'HANDOFF_DECLINED'
  | 'WORK_CHOSEN'
  | 'WORK_LEFT'
  | 'PROJECT_EXPORTED'
  | 'PROJECT_RESUMED';

export interface HistoryEntry {
  at: number;
  kind: HistoryKind;
  /** A sentence a person can read. Never a stringified object. */
  note: string;
  /** An artifact or mode id, when the entry is about one. */
  ref?: string;
}

/**
 * The stored project.
 *
 * `artifacts` carries `text` and `data` in full: they are what a resumed
 * project can actually hand over, and a manifest that lists documents it can no
 * longer produce would be worse than no manifest. Measured, the largest single
 * artifact in the product is 25.3 kB and a project holding one of every kind is
 * under 100 kB — which is what made the storage decision, not a guess about it.
 */
export interface StoredProject {
  schemaVersion: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  /**
   * What the visitor called it, or null.
   *
   * Null is not a missing value: it means nobody has named this, and every
   * surface that shows a project must say so rather than inventing a name that
   * looks like one somebody chose. `projectTitle()` is the one place that
   * decides what to show instead.
   */
  title: string | null;
  /** Exactly what they typed, the first time they typed it. */
  statement: string | null;
  constraints: StoredConstraint[];
  artifacts: ArtifactRecord[];
  history: HistoryEntry[];
  /** The piece of work being followed, if any. A preference, not a fact. */
  work: string | null;
}

/**
 * What the boot path reads: enough to list projects, and nothing else.
 *
 * Kept apart from the body on purpose. The index is small, synchronous and read
 * on every load; the body is up to a hundred kilobytes and is read only when a
 * visitor actually opens something. Merging them would put every project's
 * artifacts on the critical path of opening the Lab at all.
 */
export interface ProjectSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string | null;
  /** First line of the statement, for the list. Never the whole thing. */
  excerpt: string | null;
  artifactCount: number;
}

export interface StoredIndex {
  schemaVersion: number;
  /** Newest first. */
  projects: ProjectSummary[];
  /** The project this browser had open last, so RESUME means something. */
  last: string | null;
}

/* -------------------------------------------------------------------------- */
/* READING SOMETHING WE DID NOT WRITE                                          */
/* -------------------------------------------------------------------------- */

export type ReadOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'EMPTY' | 'UNREADABLE' | 'FUTURE_VERSION'; detail: string };

/**
 * Never silently reinterpret data from a shape we do not know.
 *
 * A record written by a newer version of this product may use the same field
 * names to mean different things. Reading it "best effort" would produce a
 * project that looks assembled and describes something else — the exact failure
 * the brief store was written to prevent one phase ago. So a future version is
 * refused by name and left on disk untouched, and the visitor is told which
 * version wrote it.
 */
export function checkVersion(raw: unknown, what: string): ReadOutcome<Record<string, unknown>> {
  if (raw === null || raw === undefined) return { ok: false, reason: 'EMPTY', detail: `no ${what} stored` };
  if (typeof raw !== 'object') return { ok: false, reason: 'UNREADABLE', detail: `${what} is not an object` };
  const v = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v !== 'number') {
    return { ok: false, reason: 'UNREADABLE', detail: `${what} carries no schema version` };
  }
  if (v > SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'FUTURE_VERSION',
      detail: `${what} was written by version ${v}; this build reads version ${SCHEMA_VERSION}`,
    };
  }
  /* v < SCHEMA_VERSION would migrate here. Version 1 is the first shape that
     has ever existed, so there is nothing below it and nothing to pretend. */
  return { ok: true, value: raw as Record<string, unknown> };
}

/**
 * A stored project, validated rather than trusted.
 *
 * This runs on data from this browser and on data a visitor may one day paste
 * in, and those have to be held to the same standard: a field that is not the
 * shape it claims is dropped, and anything without an identity is refused
 * outright. Nothing here throws — a corrupt record must never take down the
 * list that contains it.
 */
export function readProject(raw: unknown): ReadOutcome<StoredProject> {
  const head = checkVersion(raw, 'project');
  if (!head.ok) return head;
  const o = head.value;

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && isFinite(v) ? v : fallback);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  const id = str(o.id);
  if (!id) return { ok: false, reason: 'UNREADABLE', detail: 'project has no id' };

  const created = num(o.createdAt, Date.now());

  const artifacts: ArtifactRecord[] = arr(o.artifacts).flatMap((a) => {
    if (typeof a !== 'object' || a === null) return [];
    const r = a as Record<string, unknown>;
    const aid = str(r.id);
    const kind = str(r.kind);
    const title = str(r.title);
    const producer = str(r.producer);
    const limits = str(r.limits);
    /* `limits` is required by the type for a reason — an artifact that cannot
       say what it is unable to tell you is not one this product will hand to
       anybody. A record missing it is dropped rather than patched. */
    if (!aid || !kind || !title || !producer || !limits) return [];
    return [
      {
        id: aid,
        kind: kind as ArtifactRecord['kind'],
        title,
        createdAt: num(r.createdAt, created),
        producer,
        projectId: str(r.projectId) ?? id,
        sourceIds: arr(r.sourceIds).filter((s): s is string => typeof s === 'string'),
        limits,
        ...(typeof r.text === 'string' ? { text: r.text } : {}),
        ...('data' in r ? { data: r.data } : {}),
      },
    ];
  });

  const constraints: StoredConstraint[] = arr(o.constraints).flatMap((c) => {
    if (typeof c !== 'object' || c === null) return [];
    const r = c as Record<string, unknown>;
    const q = str(r.question);
    const opt = str(r.option);
    return q && opt ? [{ question: q, option: opt, at: num(r.at, created) }] : [];
  });

  const history: HistoryEntry[] = arr(o.history).flatMap((h) => {
    if (typeof h !== 'object' || h === null) return [];
    const r = h as Record<string, unknown>;
    const kind = str(r.kind);
    const note = str(r.note);
    if (!kind || !note) return [];
    return [{ at: num(r.at, created), kind: kind as HistoryKind, note, ...(str(r.ref) ? { ref: str(r.ref)! } : {}) }];
  });

  return {
    ok: true,
    value: {
      schemaVersion: SCHEMA_VERSION,
      id,
      createdAt: created,
      updatedAt: num(o.updatedAt, created),
      title: str(o.title),
      statement: str(o.statement),
      constraints,
      artifacts,
      history,
      work: str(o.work),
    },
  };
}

/**
 * What to call a project that nobody has named.
 *
 * Derived, and labelled as derived wherever it is shown. It is never written
 * into `title`, so "has this been named" stays answerable.
 */
export function projectTitle(p: { title: string | null; statement: string | null }): {
  text: string;
  named: boolean;
} {
  if (p.title) return { text: p.title, named: true };
  if (p.statement) {
    const first = p.statement.split(/(?<=[.!?])\s+/)[0].trim() || p.statement.trim();
    const short = first.length > 58 ? `${first.slice(0, 57).trimEnd()}…` : first;
    return { text: short, named: false };
  }
  return { text: 'UNTITLED', named: false };
}

/**
 * How far along a project is, read off what it holds.
 *
 * Stored as nothing. There is no control anywhere in this product that closes
 * or archives a project, so a stored status field would be a value with a
 * producer that does not exist — which is the one thing this file's own rule
 * forbids.
 */
export function projectStatus(p: { statement: string | null; artifacts: ArtifactRecord[] }):
  | 'EMPTY'
  | 'STATED'
  | 'WORKING'
  | 'PACKAGED' {
  if (p.artifacts.some((a) => a.kind === 'delivery')) return 'PACKAGED';
  if (p.artifacts.length > 0) return 'WORKING';
  if (p.statement) return 'STATED';
  return 'EMPTY';
}
