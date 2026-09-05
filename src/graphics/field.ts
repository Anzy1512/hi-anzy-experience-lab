/**
 * THE SEEDED FIELD.
 *
 * One deterministic scalar field, shared by everything that needs terrain-like
 * data:
 *
 *   - `ContourPlate` rasterises it into the printed contour plate that X-Ray
 *     measures and processes;
 *   - Reality Compiler's `Terrain` displaces a mesh with the *same* function.
 *
 * That sharing is the point. The document's figure and the world's ground are
 * not two things that resemble each other — they are one field, read twice. It
 * is what lets the caption say "the same seeded plate" and be literally true.
 */

const SEED = 0x5a17;
const LATTICE = 64;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Built once at module load; both consumers read the same lattice. */
const lattice = (() => {
  const rnd = mulberry32(SEED);
  const g = new Float32Array(LATTICE * LATTICE);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return g;
})();

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const at = (a: number, b: number) =>
    lattice[(((b % LATTICE) + LATTICE) % LATTICE) * LATTICE + (((a % LATTICE) + LATTICE) % LATTICE)];
  const a = at(xi, yi);
  const b = at(xi + 1, yi);
  const c = at(xi, yi + 1);
  const d = at(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export const FIELD_BASE_FREQ = 3.4;
export const FIELD_OCTAVES = 3;

/**
 * Raw fbm at normalised coordinates. Roughly 0..1 but not normalised — callers
 * that need an exact range normalise across their own sample set.
 */
export function fieldAt(u: number, v: number): number {
  let amp = 1;
  let freq = FIELD_BASE_FREQ;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < FIELD_OCTAVES; o++) {
    sum += valueNoise(u * freq, v * freq * 1.28) * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.07;
  }
  // A gentle diagonal bias so the field has a direction and reads as terrain
  // rather than as generic noise.
  return sum / norm + (u * 0.16 - v * 0.1);
}

/** Sample range across a unit grid, so consumers can normalise consistently. */
export function fieldRange(samples = 64): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < samples; y++) {
    for (let x = 0; x < samples; x++) {
      const v = fieldAt(x / samples, y / samples);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, max };
}
