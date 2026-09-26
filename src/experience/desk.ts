/**
 * WHICH DESK TO OPEN — a handover from the index to the INTELLIGENCE reality.
 *
 * The index prints the reality's desks as rows of their own. Entering the
 * reality is still one entry (`#/intelligence`); which desk it opens on is
 * handed over here, once, the same way the index is handed the reality a
 * visitor just left (`visited.ts`). A deep link names the desk in the hash
 * instead — `#/intelligence/brands` — and the reality reads it itself.
 *
 * The desks a visitor has opened are remembered the same way the realities
 * are, so the index can mark the rows they have been to: in memory, for the
 * session only. Nothing is stored.
 */

let requested: string | null = null;
let last: string | null = null;
const opened = new Set<string>();

export function requestDesk(id: string): void {
  requested = id;
}

/** The desk asked for, if any — and forgotten as it is read. */
export function takeRequestedDesk(): string | null {
  const id = requested;
  requested = null;
  return id;
}

export function markDeskVisited(id: string): void {
  opened.add(id);
  last = id;
}

export function deskVisited(id: string): boolean {
  return opened.has(id);
}

/** The desk open when the visitor last left the reality — where the keyboard goes back to. */
export function lastDesk(): string | null {
  return last;
}
