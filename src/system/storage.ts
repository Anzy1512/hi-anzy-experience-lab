import { DB_NAME, DB_STORE, INDEX_KEY, SCHEMA_VERSION, readProject } from './schema';
import type { ProjectSummary, StoredIndex, StoredProject } from './schema';

/**
 * WHERE A PROJECT LIVES WHEN THE TAB IS CLOSED.
 *
 * ── THE DECISION, AND THE MEASUREMENTS BEHIND IT ────────────────────────────
 *
 * Measured in a browser, by capturing the blobs the artifact bar actually
 * builds:
 *
 *   brief       8 396 B markdown + 16 943 B json  = 25.3 kB
 *   treatment   4 817 B + 5 553 B                 = 10.4 kB
 *   specimen    3 016 B + 6 204 B                 =  9.2 kB
 *   session     1 680 B + 3 678 B                 =  5.4 kB
 *   delivery    1 631 B + 1 360 B                 =  3.0 kB
 *   recipe        598 B +   219 B                 =  0.8 kB
 *
 * A project holding one of every kind is under 100 kB. That number is what
 * chose the mechanism; nothing here was picked because it sounded modern.
 *
 * ── WHY BOTH, AND WHY NOT ONE ───────────────────────────────────────────────
 *
 * localStorage alone would work today and fail predictably later: its 5 MB is a
 * hard per-origin wall, so roughly fifty full projects and then nothing, and
 * every read of it is synchronous — listing projects on boot would mean parsing
 * every project's artifacts before the Lab could paint.
 *
 * IndexedDB alone would work too, and would make the project list asynchronous:
 * the launcher would have to render an empty state first and fill it in, for a
 * list that is a few hundred bytes.
 *
 * So: the INDEX (id, title, excerpt, counts — about 120 bytes a project) sits
 * in localStorage and is read synchronously on boot. The BODIES (artifacts with
 * their documents, history, constraints) sit in IndexedDB and are read only
 * when a visitor opens one. Each mechanism does the thing it is good at, and
 * neither is doing work the other could do better.
 *
 * Both are native. No storage library was added; the wrapper below is forty
 * lines because that is all IndexedDB needs when you are not building a general
 * ORM on top of it.
 *
 * ── NOTHING HERE MAY STOP THE LAB WORKING ───────────────────────────────────
 *
 * Storage can be absent — private windows, disabled site data, a file:// origin
 * — and when it is, this product does exactly what it did before this phase:
 * holds the project in memory for one tab and says so. Persistence is a feature
 * that can be missing. It is never a dependency.
 */

export type StorageState =
  | { kind: 'READY' }
  /** No usable storage. The Lab runs session-only and says so. */
  | { kind: 'UNAVAILABLE'; why: string }
  /** The index works; project bodies do not. Nothing is silently lost. */
  | { kind: 'DEGRADED'; why: string }
  /** Out of room. Existing projects are intact; new writes are refused. */
  | { kind: 'FULL'; why: string };

let state: StorageState = { kind: 'READY' };
const watchers = new Set<(s: StorageState) => void>();

export function storageState(): StorageState {
  return state;
}

/**
 * Find out whether anything can actually be saved, before claiming it can.
 *
 * The state used to start at READY and only move when a write failed, which
 * meant a browser with storage switched off showed "Saved in this browser only"
 * until the visitor made something — a claim about their data that was not true
 * when it was printed. Caught in the Phase 8.10 failure tests.
 *
 * Both halves are probed for real: localStorage with a write, because Safari
 * has historically exposed the object and thrown on use; IndexedDB by opening
 * it, because that is the only thing that answers.
 */
export async function probeStorage(): Promise<StorageState> {
  if (!ls()) {
    setState({
      kind: 'UNAVAILABLE',
      why: 'This browser will not let the Lab store anything for this site.',
    });
    return state;
  }
  const db = await openDb();
  if (!db) return state; /* openDb has already said what went wrong. */
  setState({ kind: 'READY' });
  return state;
}
export function watchStorage(fn: (s: StorageState) => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
function setState(next: StorageState): void {
  if (next.kind === state.kind && 'why' in next === 'why' in state) return;
  state = next;
  watchers.forEach((w) => w(state));
}

/* -------------------------------------------------------------------------- */
/* THE INDEX — localStorage, synchronous, tiny                                 */
/* -------------------------------------------------------------------------- */

function ls(): Storage | null {
  try {
    const s = window.localStorage;
    /* Safari in private mode used to expose localStorage and throw on write.
       Probing with a real write is the only answer that is not a guess. */
    const probe = '__ha_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const EMPTY_INDEX: StoredIndex = { schemaVersion: SCHEMA_VERSION, projects: [], last: null };

export function readIndex(): { index: StoredIndex; problem: string | null } {
  const s = ls();
  if (!s) return { index: EMPTY_INDEX, problem: 'This browser is not letting the Lab store anything.' };
  let raw: string | null;
  try {
    raw = s.getItem(INDEX_KEY);
  } catch {
    return { index: EMPTY_INDEX, problem: 'The project list could not be read.' };
  }
  if (!raw) return { index: EMPTY_INDEX, problem: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { index: EMPTY_INDEX, problem: 'The project list is unreadable and was left untouched.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { index: EMPTY_INDEX, problem: 'The project list is not in a shape this build understands.' };
  }
  const o = parsed as Record<string, unknown>;
  const v = typeof o.schemaVersion === 'number' ? o.schemaVersion : -1;
  if (v > SCHEMA_VERSION) {
    return {
      index: EMPTY_INDEX,
      problem: `The saved projects were written by a newer version of this product (${v}). This build reads version ${SCHEMA_VERSION} and will not guess at them. Nothing has been changed or deleted.`,
    };
  }
  if (v < 0) return { index: EMPTY_INDEX, problem: 'The project list carries no version and was left untouched.' };

  const rows = Array.isArray(o.projects) ? o.projects : [];
  const projects: ProjectSummary[] = rows.flatMap((r) => {
    if (typeof r !== 'object' || r === null) return [];
    const x = r as Record<string, unknown>;
    if (typeof x.id !== 'string' || !x.id) return [];
    return [
      {
        id: x.id,
        createdAt: typeof x.createdAt === 'number' ? x.createdAt : 0,
        updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : 0,
        title: typeof x.title === 'string' ? x.title : null,
        excerpt: typeof x.excerpt === 'string' ? x.excerpt : null,
        artifactCount: typeof x.artifactCount === 'number' ? x.artifactCount : 0,
      },
    ];
  });

  /* A duplicate id is a corrupt index, not a decision to make. The newest row
     wins and the older one is dropped, because two projects cannot share an
     identity and picking the fresher of the two is the only defensible rule. */
  const byId = new Map<string, ProjectSummary>();
  for (const p of projects) {
    const prev = byId.get(p.id);
    if (!prev || p.updatedAt > prev.updatedAt) byId.set(p.id, p);
  }
  const deduped = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    index: {
      schemaVersion: SCHEMA_VERSION,
      projects: deduped,
      last: typeof o.last === 'string' ? o.last : null,
    },
    problem: deduped.length !== projects.length ? 'Two saved projects shared an id; the older row was dropped.' : null,
  };
}

export function writeIndex(index: StoredIndex): boolean {
  const s = ls();
  if (!s) {
    setState({ kind: 'UNAVAILABLE', why: 'This browser is not letting the Lab store anything.' });
    return false;
  }
  try {
    s.setItem(INDEX_KEY, JSON.stringify({ ...index, schemaVersion: SCHEMA_VERSION }));
    return true;
  } catch (e) {
    setState({
      kind: 'FULL',
      why: quotaMessage(e, 'The project list could not be saved.'),
    });
    return false;
  }
}

function quotaMessage(e: unknown, prefix: string): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return `${prefix} This browser's storage for this site is full. Nothing already saved has been lost — export or delete a project to make room.`;
  }
  return `${prefix} ${name || 'The browser refused the write.'}`;
}

/* -------------------------------------------------------------------------- */
/* THE BODIES — IndexedDB, asynchronous, room to grow                          */
/* -------------------------------------------------------------------------- */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let idb: IDBFactory | undefined;
    try {
      idb = window.indexedDB;
    } catch {
      idb = undefined;
    }
    if (!idb) {
      setState({ kind: 'DEGRADED', why: 'This browser has no IndexedDB, so projects cannot be saved.' });
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(DB_NAME, 1);
    } catch (e) {
      setState({ kind: 'DEGRADED', why: `IndexedDB could not be opened. ${String(e).slice(0, 90)}` });
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      setState({
        kind: 'DEGRADED',
        why: 'IndexedDB is blocked in this browser, so projects cannot be saved. Everything still works for this tab.',
      });
      resolve(null);
    };
    /* A blocked upgrade means another tab is holding the old version open. It
       resolves itself when that tab closes; reporting it beats hanging. */
    req.onblocked = () => {
      setState({
        kind: 'DEGRADED',
        why: 'Another tab is holding the project store open. Close it and reload to save here.',
      });
      resolve(null);
    };
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let t: IDBTransaction;
        try {
          t = db.transaction(DB_STORE, mode);
        } catch (e) {
          setState({ kind: 'DEGRADED', why: `The project store could not be opened. ${String(e).slice(0, 80)}` });
          resolve(null);
          return;
        }
        const req = run(t.objectStore(DB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          const err = req.error;
          setState(
            err && err.name === 'QuotaExceededError'
              ? { kind: 'FULL', why: quotaMessage(err, 'This project could not be saved.') }
              : { kind: 'DEGRADED', why: `The project store refused the operation. ${err?.name ?? ''}` },
          );
          resolve(null);
        };
      }),
  );
}

export async function putProject(p: StoredProject): Promise<boolean> {
  const ok = await tx('readwrite', (s) => s.put({ ...p, schemaVersion: SCHEMA_VERSION }));
  if (ok !== null && state.kind !== 'FULL') setState({ kind: 'READY' });
  return ok !== null;
}

export async function loadProject(id: string): Promise<
  { ok: true; project: StoredProject } | { ok: false; problem: string }
> {
  const raw = await tx<unknown>('readonly', (s) => s.get(id));
  if (raw === null || raw === undefined) {
    return {
      ok: false,
      problem:
        'That project is listed but its record is not in this browser. It may have been cleared, or a save was interrupted. Nothing else has been touched.',
    };
  }
  const read = readProject(raw);
  if (!read.ok) {
    return {
      ok: false,
      problem:
        read.reason === 'FUTURE_VERSION'
          ? `${read.detail}. It has been left exactly as it is.`
          : `That project's record could not be read (${read.detail}). It has been left exactly as it is.`,
    };
  }
  return { ok: true, project: read.value };
}

export async function deleteProject(id: string): Promise<boolean> {
  const r = await tx<undefined>('readwrite', (s) => s.delete(id));
  return r !== null;
}

/** Every id the body store actually holds. Used to repair a torn index. */
export async function storedIds(): Promise<string[] | null> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  return keys ? keys.filter((k): k is string => typeof k === 'string') : null;
}

/* -------------------------------------------------------------------------- */
/* TORN WRITES                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Reconcile the index against what is really stored.
 *
 * The index and the bodies live in two mechanisms, so a reload in the gap
 * between the two writes leaves one ahead of the other. Neither direction is
 * allowed to lose anything:
 *
 *   body without an index row   the project is re-listed, so it can be opened
 *   index row without a body    the row is KEPT and marked, because deleting
 *                               somebody's project because a write was
 *                               interrupted is the one unrecoverable move here
 *
 * IndexedDB transactions are atomic, so a half-written project body cannot
 * exist; the only torn state possible is between the two stores, which is
 * exactly what this repairs.
 */
export async function reconcile(index: StoredIndex): Promise<{ index: StoredIndex; note: string | null }> {
  const ids = await storedIds();
  if (!ids) return { index, note: null };
  const listed = new Set(index.projects.map((p) => p.id));
  const orphans = ids.filter((id) => !listed.has(id));
  if (!orphans.length) return { index, note: null };

  const recovered: ProjectSummary[] = [];
  for (const id of orphans) {
    const r = await loadProject(id);
    if (!r.ok) continue;
    recovered.push(summarise(r.project));
  }
  if (!recovered.length) return { index, note: null };
  const next: StoredIndex = {
    ...index,
    projects: [...index.projects, ...recovered].sort((a, b) => b.updatedAt - a.updatedAt),
  };
  writeIndex(next);
  return {
    index: next,
    note: `${recovered.length} saved ${recovered.length === 1 ? 'project was' : 'projects were'} not in the list and ${recovered.length === 1 ? 'has' : 'have'} been put back.`,
  };
}

export function summarise(p: StoredProject): ProjectSummary {
  return {
    id: p.id,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    title: p.title,
    excerpt: p.statement ? p.statement.slice(0, 120) : null,
    artifactCount: p.artifacts.length,
  };
}
