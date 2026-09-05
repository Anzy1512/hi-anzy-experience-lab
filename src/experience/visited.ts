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

/* -------------------------------------------------------------------------- */
/* Where to put the keyboard back                                              */
/* -------------------------------------------------------------------------- */

/**
 * The reality the visitor has just come back from, held exactly once.
 *
 * `useFocusTrap` restores focus to whatever was focused when the trap turned
 * on — but by then the index has already unmounted, so the thing it captured
 * was `<body>`, and pressing Escape dropped a keyboard visitor at the top of a
 * sixteen-row list with no focus and no place. That is the whole reason this
 * exists: the index reads it on mount and puts the caret back on the row the
 * visitor left from.
 *
 * One-shot on purpose. A deep link straight to `#index`, a reload, or a second
 * render must not move anybody's focus; only an actual return does.
 */
let returningFrom: string | null = null;

export function markReturningFrom(id: string | null): void {
  returningFrom = id;
}

/** Reads and clears. Calling it twice gives you `null` the second time. */
export function takeReturningFrom(): string | null {
  const id = returningFrom;
  returningFrom = null;
  return id;
}

/** Only for tests and emergency reset. */
export function clearVisited(): void {
  visited.clear();
  order.length = 0;
  returningFrom = null;
  listeners.forEach((l) => l());
}
