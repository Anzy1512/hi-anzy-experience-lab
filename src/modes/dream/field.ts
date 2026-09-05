/**
 * DREAM'S FIELD — the Lab's own contour plate, with its causality loosened.
 *
 * The thesis, and there is only one: **the contours remember the words they
 * came from.** The scalar field is the same kind of seeded value noise the
 * specimen plate and the Compiler's terrain are drawn from, but here a word is
 * mixed into it and slowly withdrawn — so type dissolves into landscape, the
 * landscape holds its shape for a while, and another word surfaces out of the
 * same ground.
 *
 * Nothing is `Math.random()`. Every session is a seed, and the same seed always
 * dreams the same dream — which is what keeps this art-directed rather than a
 * shader playground. The visitor can reseed; they cannot fiddle with twelve
 * sliders, because there are not twelve sliders.
 */

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATTICE = 64;
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface DreamParams {
  seed: number;
  /** Contour levels. More = denser weather. */
  density: number;
  /** How fast the field drifts. */
  tempo: number;
  /** How far the lattice is pushed out of true. */
  distortion: number;
  /** How long a word survives once it has surfaced. */
  memory: number;
  /** Downward bias — the dream's gravity. */
  gravity: number;
  /** How much orange the dream is allowed. Almost none, always. */
  signal: number;
}

/** Parameters are derived from the seed. The seed is the whole interface. */
export function paramsFor(seed: number): DreamParams {
  const r = mulberry32(seed);
  return {
    seed,
    density: 7 + Math.floor(r() * 6),
    tempo: 0.28 + r() * 0.5,
    distortion: 0.35 + r() * 0.75,
    memory: 4.5 + r() * 6,
    gravity: -0.25 + r() * 0.5,
    signal: r() < 0.35 ? 1 : 0,
  };
}

export class DreamField {
  private lattice: Float32Array;
  readonly params: DreamParams;

  constructor(params: DreamParams) {
    this.params = params;
    const rnd = mulberry32(params.seed ^ 0x9e37);
    const g = new Float32Array(LATTICE * LATTICE);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    this.lattice = g;
  }

  private noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const at = (a: number, b: number) =>
      this.lattice[(((b % LATTICE) + LATTICE) % LATTICE) * LATTICE + (((a % LATTICE) + LATTICE) % LATTICE)];
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a * (1 - xf) * (1 - yf) + b * xf * (1 - yf) + c * (1 - xf) * yf + d * xf * yf;
  }

  /**
   * The field at (u, v) at time t, with `wordMask` in 0..1 mixed in by `weight`.
   *
   * The word does not sit on top of the landscape — it is *added into the same
   * scalar field*, so the contour lines bend around it and the letterform is
   * made of the same material as the weather.
   */
  at(u: number, v: number, t: number, wordMask: number, weight: number): number {
    const p = this.params;
    const drift = t * p.tempo;
    const warp =
      this.noise(u * 2.1 + drift * 0.3, v * 2.1 - drift * 0.21) * p.distortion;

    let n =
      this.noise(u * 3.2 + warp, v * 3.2 + drift * 0.5) * 0.6 +
      this.noise(u * 7.4 - drift * 0.2, v * 7.4 + warp) * 0.28 +
      this.noise(u * 15.1, v * 15.1 - drift * 0.12) * 0.12;

    // Gravity: the dream leans. Not physics, a bias.
    n += (v - 0.5) * p.gravity * 0.5;
    // The word, mixed into the same field rather than drawn over it.
    n += wordMask * weight * 0.55;
    return n;
  }
}

/* -------------------------------------------------------------------------- */
/* Marching squares — closed rings at constant height, exactly as the rest of  */
/* the Lab draws terrain. A displaced grid would read as a videogame mesh.     */
/* -------------------------------------------------------------------------- */

export interface IsoTarget {
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
}

/** Emits the isoline segments for one level into a canvas path. */
export function isoline(
  values: Float32Array,
  cols: number,
  rows: number,
  level: number,
  w: number,
  h: number,
  path: IsoTarget,
): void {
  const sx = w / (cols - 1);
  const sy = h / (rows - 1);
  const at = (c: number, r: number) => values[r * cols + c];
  const lerp = (a: number, b: number) => (Math.abs(b - a) < 1e-6 ? 0.5 : (level - a) / (b - a));

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = at(c, r);
      const tr = at(c + 1, r);
      const br = at(c + 1, r + 1);
      const bl = at(c, r + 1);
      let code = 0;
      if (tl > level) code |= 8;
      if (tr > level) code |= 4;
      if (br > level) code |= 2;
      if (bl > level) code |= 1;
      if (code === 0 || code === 15) continue;

      const x0 = c * sx;
      const y0 = r * sy;
      const top = { x: x0 + lerp(tl, tr) * sx, y: y0 };
      const right = { x: x0 + sx, y: y0 + lerp(tr, br) * sy };
      const bottom = { x: x0 + lerp(bl, br) * sx, y: y0 + sy };
      const left = { x: x0, y: y0 + lerp(tl, bl) * sy };

      const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        path.moveTo(a.x, a.y);
        path.lineTo(b.x, b.y);
      };

      switch (code) {
        case 1:
        case 14:
          seg(left, bottom);
          break;
        case 2:
        case 13:
          seg(bottom, right);
          break;
        case 3:
        case 12:
          seg(left, right);
          break;
        case 4:
        case 11:
          seg(top, right);
          break;
        case 6:
        case 9:
          seg(top, bottom);
          break;
        case 7:
        case 8:
          seg(left, top);
          break;
        case 5:
          seg(left, top);
          seg(bottom, right);
          break;
        case 10:
          seg(left, bottom);
          seg(top, right);
          break;
      }
    }
  }
}
