/**
 * NOISE_ORDER — the primitive, as runtime.
 *
 * SOURCE
 * Two canonical components saying the same thing at different scales.
 * `three/LensField.js` scatters a hundred and fifty points and resolves them
 * into an exact grid as two lenses cross, because /insights argues that a note
 * is worth writing when something stops being noise. `motion/OrderingGrid.js`
 * does it in the DOM on /who-we-work-with — tiles arrive misaligned and settle,
 * and its own note is the important half: "offsets are seeded, never random",
 * because `Math.random` would rearrange the page on every reload and read as
 * noise instead of as a system being ordered.
 *
 * WHAT IT IS
 * One function and its exact inverse. `disorder(index, amount)` returns the
 * displacement of item `index` at a given amount of disorder, and `amount` of
 * zero returns exactly zero on every axis — not approximately, not a small
 * epsilon. That is the whole contract, and it is what lets Chaos claim its
 * reconstruction is exact rather than convincing: the ordered state is not
 * restored by animating back toward it, it is what the function already
 * returns when the disorder is gone.
 *
 * WHY IT IS A MODULE AND NOT A FEW LINES IN A MODE
 * Because two realities need to agree about it. Chaos takes the system apart
 * and Dream lets contours settle around a word; if each wrote its own seeded
 * scatter they would drift, and "seeded, never random" would be a claim in two
 * comments rather than a property of one function.
 */

/**
 * A small integer hash. Deterministic, cheap, and — unlike a seeded PRNG
 * sequence — indexable: item 7's displacement does not depend on whether
 * anybody asked about item 6 first. That matters when a list is filtered,
 * reordered or partially rendered, which is exactly what Chaos does to it.
 */
function hash(index: number, salt: number): number {
  let h = (index * 374761393 + salt * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A signed value in [-1, 1] for this item on this axis. */
function signed(index: number, salt: number): number {
  return hash(index, salt) * 2 - 1;
}

export interface Displacement {
  /** Fractions of the item's own size, not pixels — so it scales with layout. */
  x: number;
  y: number;
  /** Degrees. */
  rotate: number;
  /** 0..1, how far this item has lost its assigned place in an ordered set. */
  drift: number;
}

/** Nothing has moved. Returned by identity, never computed. */
const ORDERED: Displacement = { x: 0, y: 0, rotate: 0, drift: 0 };

/**
 * How far item `index` has strayed at this `amount` of disorder.
 *
 * `amount` is 0..1. At 0 this returns the shared ORDERED object, so a caller
 * comparing against exact zero gets exact zero and a caller writing transforms
 * writes none at all.
 */
export function disorder(index: number, amount: number): Displacement {
  if (amount <= 0) return ORDERED;
  const a = amount > 1 ? 1 : amount;
  // Eased so the first tenth of the disorder is barely perceptible: a system
  // coming apart should be deniable before it is obvious.
  const e = a * a;
  return {
    x: signed(index, 1) * e,
    y: signed(index, 2) * e,
    rotate: signed(index, 3) * e * 14,
    drift: hash(index, 4) * a,
  };
}

/**
 * Whether item `index` should be shown in the wrong place at this amount.
 *
 * Distinct from displacement, and the distinction is the point of the stage it
 * serves: a misplaced item has not moved a little, it is somewhere it does not
 * belong. The *data* is still correct — this only ever governs presentation.
 */
export function misplaced(index: number, amount: number, count: number): number {
  if (amount <= 0 || count <= 1) return index;
  if (hash(index, 5) > amount) return index;
  return Math.floor(hash(index, 6) * count) % count;
}

/** True only when every item is exactly where it belongs. */
export function isOrdered(amount: number): boolean {
  return amount <= 0;
}
