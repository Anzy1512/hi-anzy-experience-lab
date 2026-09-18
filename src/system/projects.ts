import { useSyncExternalStore } from 'react';
import {
  attachPersistence,
  getProject,
  installProject,
  newProject,
  note,
  type Project,
} from './project';
import { INDEX_KEY, SCHEMA_VERSION, projectStatus, projectTitle } from './schema';
import type { ProjectSummary, StoredIndex, StoredProject } from './schema';
import {
  deleteProject as dropBody,
  loadProject,
  putProject,
  readIndex,
  reconcile,
  probeStorage,
  storageState,
  summarise,
  watchStorage,
  writeIndex,
  type StorageState,
} from './storage';

/**
 * THE WORKSPACE — list, open, save, forget.
 *
 * `project.ts` holds the one project a visitor is working on and knows nothing
 * about storage. `storage.ts` knows about storage and nothing about projects.
 * This is the part that joins them, and it is the only file in the product that
 * decides WHEN something is written.
 *
 * ── NOTHING IS SAVED UNTIL THERE IS SOMETHING TO SAVE ───────────────────────
 *
 * A project that holds no statement and no artifacts is not written to disk at
 * all. That is what lets a curious visitor walk through every reality in the
 * Lab, close the tab, and leave nothing behind — which the brief requires and
 * which is also just the decent behaviour. The moment they say something or
 * make something, it starts being kept, and the shell says so.
 *
 * ── WHAT HAPPENS ON A RELOAD ────────────────────────────────────────────────
 *
 * The last project opened in this browser is resumed. Not silently: SYSTEM.app
 * names it and says when it was last touched. The alternative — starting blank
 * and offering a list — means somebody who reloaded by accident has to go and
 * find their own work, and the whole point of this phase is that they should
 * not have to.
 *
 * ── TWO TABS ────────────────────────────────────────────────────────────────
 *
 * Last write wins, and the loser is told. See `conflict` below. There is no
 * merge here and nothing pretends there is one.
 */

/* -------------------------------------------------------------------------- */
/* STATE                                                                       */
/* -------------------------------------------------------------------------- */

export interface WorkspaceState {
  /** Newest first. Empty when nothing has ever been saved. */
  projects: ProjectSummary[];
  /** Storage's own health, verbatim, so surfaces can print it. */
  storage: StorageState;
  /**
   * Something the visitor should know about their stored data: a record that
   * could not be read, a list repaired after an interrupted write, a project
   * changed in another tab. Cleared when they have seen it.
   */
  notice: string | null;
  /** True once the boot read has finished, so a list can say LOADING honestly. */
  ready: boolean;
  /** Whether the project in memory has ever been written. */
  saved: boolean;
}

let ws: WorkspaceState = {
  projects: [],
  storage: storageState(),
  notice: null,
  ready: false,
  saved: false,
};
let index: StoredIndex = { schemaVersion: SCHEMA_VERSION, projects: [], last: null };

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function set(patch: Partial<WorkspaceState>): void {
  ws = { ...ws, ...patch };
  emit();
}

export function workspace(): WorkspaceState {
  return ws;
}
export function subscribeWorkspace(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function useWorkspace(): WorkspaceState {
  return useSyncExternalStore(subscribeWorkspace, workspace, workspace);
}
export function dismissNotice(): void {
  if (ws.notice) set({ notice: null });
}

/* -------------------------------------------------------------------------- */
/* WRITING                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A project earns persistence by containing something.
 *
 * Until then it is a draft in one tab, exactly as every project was before this
 * phase, and closing the tab leaves nothing behind.
 */
function worthKeeping(p: Project): boolean {
  return p.statement !== null || p.artifacts.length > 0 || p.title !== null;
}

function toStored(p: Project): StoredProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: p.id,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    title: p.title,
    statement: p.statement,
    constraints: p.constraints,
    artifacts: p.artifacts,
    history: p.history,
    work: activeWork,
  };
}

/**
 * Which piece of work is being followed, mirrored here for persistence.
 *
 * `system/work.ts` owns this; it is copied in rather than imported to keep the
 * dependency pointing one way — the workspace may know about work, but work
 * must not have to know about storage to keep being a pure reading of the
 * project. `rememberWork` is called by `work.ts` when the visitor chooses.
 */
let activeWork: string | null = null;
export function rememberWork(id: string | null): void {
  if (activeWork === id) return;
  activeWork = id;
  schedule();
}
export function rememberedWork(): string | null {
  return activeWork;
}

/**
 * Told when a stored project has been installed, so the work module can adopt
 * the route that project was following.
 *
 * A callback rather than an import because `work.ts` reads this file and this
 * file would otherwise read it back. One direction only.
 */
let adopter: (() => void) | null = null;
export function attachWorkAdopter(fn: () => void): void {
  adopter = fn;
}

let timer: number | null = null;
let pending: Project | null = null;

/**
 * Debounced, because a single visitor gesture can touch the project more than
 * once — recording an artifact also stamps history — and two writes for one
 * action is one write too many. Short enough that a reload a second later has
 * everything; long enough to coalesce a burst.
 */
function schedule(): void {
  pending = getProject();
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    const p = pending;
    pending = null;
    if (p) void flush(p);
  }, 400);
}

async function flush(p: Project): Promise<void> {
  if (!worthKeeping(p)) return;
  const stored = toStored(p);
  const ok = await putProject(stored);
  if (!ok) {
    set({ storage: storageState(), saved: false });
    return;
  }
  const rows = [summarise(stored), ...index.projects.filter((r) => r.id !== stored.id)].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  index = { schemaVersion: SCHEMA_VERSION, projects: rows, last: stored.id };
  writeIndex(index);
  set({ projects: rows, storage: storageState(), saved: true });
}

/** Write immediately — used when the page is going away. */
export function flushNow(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  const p = pending ?? getProject();
  pending = null;
  void flush(p);
}

/* -------------------------------------------------------------------------- */
/* BOOT                                                                        */
/* -------------------------------------------------------------------------- */

let started = false;

/**
 * Read what is stored and put the visitor back where they were.
 *
 * Called once, from the app shell. Everything it does is allowed to fail: a
 * browser with no storage reaches the end of this function with an empty list,
 * a `notice` explaining why, and a perfectly working Lab.
 */
export function startWorkspace(): void {
  if (started) return;
  started = true;

  attachPersistence(schedule);
  watchStorage((s) => set({ storage: s }));

  /* Ask both mechanisms whether they work before any surface says they do. */
  void probeStorage().then((s) => set({ storage: s }));

  const first = readIndex();
  index = first.index;
  set({ projects: index.projects, notice: first.problem, storage: storageState() });

  void (async () => {
    const repaired = await reconcile(index);
    index = repaired.index;
    set({ projects: index.projects });
    if (repaired.note) set({ notice: repaired.note });

    if (index.last) {
      const r = await loadProject(index.last);
      if (r.ok) {
        installProject(r.project);
        activeWork = r.project.work;
        adopter?.();
        await rehydrate(r.project);
        set({ saved: true });
        note(
          'PROJECT_RESUMED',
          `Reopened in this browser. Last worked on ${when(r.project.updatedAt)}.`,
        );
      } else {
        /* The row stays in the list. Losing somebody's project because one read
           failed is the only move here that cannot be undone. */
        set({ notice: r.problem });
      }
    }
    set({ ready: true, storage: storageState() });
  })();

  /* Everything in flight goes down before the page does. `pagehide` rather than
     `beforeunload`: it fires on mobile task-switching, which `beforeunload`
     does not, and it does not block the browser's back/forward cache. */
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('storage', onOtherTab);
}

/**
 * Put the session's working state back in step with the project.
 *
 * The brief store is not persisted — it is a reading of the statement, and the
 * statement IS persisted. `origin` is derived from what the project actually
 * holds rather than stored: a project with a brief artifact had its frame made
 * by the Simulator; one with only a statement had it made in the Terminal.
 * That is a fact about the artifacts, so asking them is better than keeping a
 * third copy of it that can go stale.
 *
 * ---- AND IT IS IMPORTED LATE, ON PURPOSE ---------------------------------
 *
 * `brief.ts` reaches the document composer and the canonical content through
 * its own imports, which together are a 75 kB chunk. Importing it statically
 * from here put all of that on the boot path and took `index.html` from one
 * modulepreload to five, measured — a persistence layer making every visitor
 * pay to load a report composer before the Lab could paint.
 *
 * So it is loaded when a project with something in it is actually opened, which
 * is the only moment it is needed.
 */
async function rehydrate(p: StoredProject): Promise<void> {
  const { rehydrateBrief, resetBrief } = await import('./brief');
  resetBrief();
  const origin = p.artifacts.some((a) => a.kind === 'brief') ? 'simulator' : 'terminal';
  rehydrateBrief(p.statement, p.statement ? origin : null);
}

function when(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'a moment ago';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/* -------------------------------------------------------------------------- */
/* TWO TABS                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Another tab wrote the index.
 *
 * The honest behaviour is LAST WRITE WINS, and this is the part that stops that
 * being a silent data loss: if the other tab changed the project THIS tab has
 * open, the visitor is told, by name, with what to do about it. Nothing is
 * merged and nothing pretends to be.
 *
 * Collaborative editing is not solved here and is not claimed to be.
 */
function onOtherTab(e: StorageEvent): void {
  if (e.key !== INDEX_KEY) return;
  const fresh = readIndex();
  index = fresh.index;
  const here = getProject();
  const theirs = index.projects.find((p) => p.id === here.id);
  set({ projects: index.projects });

  if (!theirs) {
    if (ws.saved) {
      set({
        notice:
          'The project open here was deleted in another tab. It is still on screen and still exportable, and saving again from here will put it back.',
      });
    }
    return;
  }
  if (theirs.updatedAt > here.updatedAt + 1000) {
    set({
      notice:
        'Another tab has been working on this same project more recently. Both tabs are writing to one record and the last save wins — reload here to pick up their version, or keep going and yours will be the one kept.',
    });
  }
}

/* -------------------------------------------------------------------------- */
/* WHAT A VISITOR CAN DO                                                       */
/* -------------------------------------------------------------------------- */

/** Start a fresh project. The previous one is already saved and stays listed. */
export function beginProject(): void {
  flushNow();
  newProject();
  /* Same late import as `rehydrate`, and the same reason: a fresh project must
     clear the previous problem's frame, and that is still not worth putting a
     report composer on the boot path for. */
  void import('./brief').then((m) => m.resetBrief());
  activeWork = null;
  adopter?.();
  set({ saved: false, notice: null });
}

/** Open a saved project. Returns a problem sentence, or null on success. */
export async function openProject(id: string): Promise<string | null> {
  flushNow();
  const r = await loadProject(id);
  if (!r.ok) {
    set({ notice: r.problem });
    return r.problem;
  }
  installProject(r.project);
  activeWork = r.project.work;
  adopter?.();
  await rehydrate(r.project);
  index = { ...index, last: id };
  writeIndex(index);
  set({ saved: true, notice: null });
  return null;
}

/**
 * Forget a project permanently.
 *
 * The body goes first. If that fails the row stays, because an index entry
 * pointing at a record that is still there is recoverable and a row deleted
 * ahead of its body is a project nobody can reach.
 */
export async function forgetProject(id: string): Promise<boolean> {
  const gone = await dropBody(id);
  if (!gone) {
    set({ notice: 'That project could not be deleted. Nothing was changed.', storage: storageState() });
    return false;
  }
  const rows = index.projects.filter((p) => p.id !== id);
  index = { ...index, projects: rows, last: index.last === id ? null : index.last };
  writeIndex(index);
  set({ projects: rows });
  if (getProject().id === id) {
    newProject();
    activeWork = null;
    set({ saved: false });
  }
  return true;
}

/**
 * Remove every project this browser holds.
 *
 * Distinct from every other reset in the product, and the only one that touches
 * anything a visitor did not make in this session. See `docs` §13.
 */
export async function forgetEverything(): Promise<void> {
  for (const p of [...index.projects]) await dropBody(p.id);
  index = { schemaVersion: SCHEMA_VERSION, projects: [], last: null };
  writeIndex(index);
  newProject();
  activeWork = null;
  set({ projects: [], saved: false, notice: 'Every saved project has been removed from this browser.' });
}

/* -------------------------------------------------------------------------- */
/* READINGS                                                                    */
/* -------------------------------------------------------------------------- */

export { projectStatus, projectTitle };

/** One line a person can read about where their data is. Never a claim. */
export function storageSentence(s: StorageState = ws.storage): string {
  switch (s.kind) {
    case 'READY':
      return 'Saved in this browser only. Not uploaded, not synced to an account, and gone if you clear this site’s data.';
    case 'UNAVAILABLE':
      return `Nothing is being saved. ${s.why} The Lab works exactly as before — this tab holds your project, and closing it loses the work.`;
    case 'DEGRADED':
      return `Nothing is being saved. ${s.why}`;
    case 'FULL':
      return s.why;
  }
}
