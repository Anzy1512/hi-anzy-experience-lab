/**
 * PRESENCE'S OWN FORMATION.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Presence draws one arrangement and never changes it: a flat lattice that the
 * visitor's movement pushes around. It used to obtain that by asking Matter
 * Engine for the formation it calls `field` — which meant an instrument
 * imported a sibling product, in Matter's own state vocabulary, to stand up its
 * own subject. It was the only sibling import in the Lab and the reason
 * Presence could not be extracted without taking Matter with it.
 *
 * The arrangement is unchanged. This is Matter's `field` case transcribed, not
 * reinterpreted, because the field IS the mode and a formation that drifted by
 * a row would be a behaviour change dressed up as a refactor. Matter keeps its
 * six states and its own copy; the two are now free to diverge, which is the
 * point — Presence has no reason to follow if Matter ever reshapes its sheet.
 *
 * ── AND WHY IT IS NOT IN `graphics/` ────────────────────────────────────────
 *
 * A formation is a mode's argument about what its matter is doing. `graphics/`
 * holds the renderer, the seeded numbers and the shared field function, all of
 * which are about HOW something is drawn. Moving one product's composition into
 * the platform is exactly the mistake that produced the coupling.
 */

/**
 * How far the lattice reaches. Presence's own, and larger than Matter's.
 *
 * It was an inline `860` at the one call site; named here so the formation and
 * the bounding sphere the renderer builds from it cannot drift apart.
 */
export const PRESENCE_SPREAD = 860;

/**
 * A flat rectangular lattice, in register.
 *
 * `cols` is derived from the count rather than fixed, so the sheet keeps its
 * proportion across every quality tier instead of growing a ragged last row on
 * the ones with fewer particles.
 */
export function buildPresenceField(count: number, spread: number): Float32Array {
  const out = new Float32Array(count * 3);
  const cols = Math.ceil(Math.sqrt(count * 1.9));
  const rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) {
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    out[i * 3] = (cx / (cols - 1) - 0.5) * spread * 1.5;
    out[i * 3 + 1] = (cy / Math.max(1, rows - 1) - 0.5) * spread * 0.62;
    out[i * 3 + 2] = 0;
  }
  return out;
}
