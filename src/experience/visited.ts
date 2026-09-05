/**
 * WHERE THIS VISITOR HAS BEEN.
 *
 * The Reality Index is meant to read as a map of ways Hi Anzy can think, not a
 * menu — and a map is more useful once it records where you have walked. This
 * holds that record.
 *
 * **In memory, for this page session only.** Nothing is written to
 * `localStorage`, `sessionStorage`, IndexedDB or a cookie. That is a deliberate
 * constraint rather than an oversight: PERFORMANCE reports `STORAGE — NONE`, and
 * that has to keep being true. A trace that survives a reload would make the
 * Lab's own instrument a liar.
 */

const visited = new Set<string>();
const order: string[] = [];
const listeners = new Set<() => void>();

export function markVisited(id: string): void {
  if (visited.has(id)) {
    // Re-entering moves it to the front of the trail without duplicating it.
    const at = order.indexOf(id);
    if (at >= 0) order.splice(at, 1);
    order.push(id);
  } else {
    visited.add(id);
    order.push(id);
  }
  listeners.forEach((l) => l());
}

export function hasVisited(id: string): boolean {
  return visited.has(id);
}

/** Most recent last. Used to draw the trail through the index. */
export function visitTrail(): readonly string[] {
  return order;
}

export function visitedCount(): number {
  return visited.size;
}

export function subscribeVisited(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Only for tests and emergency reset. */
export function clearVisited(): void {
  visited.clear();
  order.length = 0;
  listeners.forEach((l) => l());
}
