import { PATH, indexOfStop } from '../content/journey';
import { emit } from '../analytics/events';

/**
 * WHETHER THIS VISITOR IS ON THE CURATED PATH, AND HOW FAR.
 *
 * Held the same way `visited.ts` holds its trail: a module-level record and a
 * listener set, read through `useSyncExternalStore`. **In memory, for this page
 * session only** — nothing is written to storage, because PERFORMANCE reports
 * `STORAGE — NONE` and that has to keep being true. A journey that survived a
 * reload would make the Lab's own instrument a liar.
 *
 * It is deliberately not part of `ExperienceValue`. The engine's job is stage,
 * phase and scope; the journey is a reading of where the visitor is, layered on
 * top. Keeping it out means the mode host, the index and the launcher can all
 * read it without the engine growing a second responsibility.
 *
 * ── THE PATH IS A SUGGESTION, NOT A RAIL ────────────────────────────────────
 *
 * Stepping off it is not an error and does not end it. A visitor who opens the
 * Index halfway through, wanders into Chaos, and comes back still has their
 * place. `reached` only ever moves forward, and only when the visitor actually
 * arrives at the next stop in order — so the path cannot claim credit for a
 * reality they reached some other way.
 */

interface State {
  /** Whether the visitor chose the curated door. */
  active: boolean;
  /** Highest stop index actually arrived at, in order. -1 before the first. */
  reached: number;
  /** Set once the last stop has been entered, so the return can be offered. */
  complete: boolean;
}

const state: State = { active: false, reached: -1, complete: false };
const listeners = new Set<() => void>();

/** A stable snapshot — `useSyncExternalStore` compares by reference. */
let snapshot: Readonly<State> = { ...state };

function commit(): void {
  snapshot = { ...state };
  listeners.forEach((l) => l());
}

export function startPath(): void {
  state.active = true;
  state.reached = -1;
  state.complete = false;
  commit();
}

/** Leave the path without ending the session — the Index door, taken late. */
export function leavePath(): void {
  if (!state.active) return;
  state.active = false;
  commit();
}

/**
 * Told on every mode entry. Advances only for the next stop, in order.
 *
 * Re-entering a stop already passed does nothing, and arriving at a later stop
 * out of order does nothing either: the path describes a sequence, so it can
 * only be walked as one.
 */
export function arrivedAt(id: string): void {
  if (!state.active) return;
  const at = indexOfStop(id);
  if (at !== state.reached + 1) return;
  state.reached = at;
  if (at === PATH.length - 1 && !state.complete) {
    state.complete = true;
    /*
     * Reported here rather than from the return panel, which is what
     * `commercial_return` already means. Completing the route and being shown
     * the way out are two different facts: a visitor can finish the last stop
     * and close the tab from inside it, and that is still a completed route.
     * Phase 7 declared this event in the vocabulary and then never emitted it —
     * a name in the type with no call site, which reads as coverage that is not
     * there. Found by tracing the live stream, not by reading the file.
     */
    emit('curated_path_complete');
  }
  commit();
}

export function journeyState(): Readonly<State> {
  return snapshot;
}

export function subscribeJourney(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The stop the path would like the visitor to take next, if any remain. */
export function nextStopId(): string | null {
  if (!state.active || state.complete) return null;
  return PATH[state.reached + 1]?.id ?? null;
}

/** Only for tests and emergency reset. */
export function clearJourney(): void {
  state.active = false;
  state.reached = -1;
  state.complete = false;
  commit();
}
