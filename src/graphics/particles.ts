/**
 * THE SEEDED NUMBERS EVERY PARTICLE FIELD IS BUILT FROM.
 *
 * ── WHY THESE LEFT `modes/matter` ───────────────────────────────────────────
 *
 * They were never Matter Engine's. `buildDelays` and `buildSeeds` take a count
 * and nothing else: they describe the RENDERER's per-particle attributes — when
 * a point begins its transition, and how it varies in size and force response —
 * not the formations Matter authors. They lived beside `buildTargets` because
 * that is where the file was, and that is how Presence ended up importing a
 * sibling mode to draw a field.
 *
 * `hash01` moved with them because all three share it, and a formation
 * generator that hashed differently from the delays it is drawn with would
 * stagger wrongly in a way nobody would trace back to a duplicated constant.
 *
 * ── AND WHY THE ARITHMETIC IS UNCHANGED ─────────────────────────────────────
 *
 * Every particle position in the Lab is analytic: `mix(from, to, t)` in a
 * vertex shader, where all three inputs come out of this hash. Change one
 * constant and every formation in Matter Engine moves. It is copied here
 * exactly, and a digest of all six formations plus the delays and seeds is what
 * proves it — see the note in Matter's manifest about comparing before and
 * after, which is the reason this file reads as a transcription rather than a
 * rewrite.
 */

/**
 * A deterministic number in [0, 1) from an index and a salt.
 *
 * Not `Math.random`: the field has to be identical on every machine and across
 * every reload, because two visitors comparing what they saw is a thing this
 * product invites. The salt is what lets one index produce independent streams
 * for position, delay and seed.
 */
export function hash01(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Per-particle transition delay, so a state change sweeps rather than snaps.
 *
 * Capped at 0.55 of the transition: past that a particle would still be
 * starting as the transition ended, and the formation would look unfinished at
 * the moment it is meant to have arrived.
 */
export function buildDelays(count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = hash01(i, 41) * 0.55;
  return out;
}

/** Per-particle seed, used for size variation and force response. */
export function buildSeeds(count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = hash01(i, 51);
  return out;
}
