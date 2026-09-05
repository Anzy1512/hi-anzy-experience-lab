import { fieldAt, fieldRange } from '../../graphics/field';

/**
 * MATERIAL STATES — where every particle is supposed to be.
 *
 * This is the whole reason Matter Engine is not a particle sandbox. Each state
 * is a **target formation**: a deterministic function from particle index to a
 * position. Matter never wanders; it is always on its way from one authored
 * arrangement to another, and every arrangement is something the Lab has already
 * said elsewhere.
 *
 *   DUST       unformed material
 *   FIELD      the printed sheet, flat
 *   TYPE       HI ANZY, sampled from real glyphs
 *   STRUCTURE  the Compiler's separated planes
 *   TERRAIN    the specimen plate's own contour field
 *   FRACTURE   the same matter, thrown
 *
 * Positions are computed on the CPU once per state and handed to the GPU as
 * attributes. The shader only interpolates. That keeps the simulation authored
 * and the per-frame cost at zero.
 */

export type MatterState = 'dust' | 'field' | 'type' | 'structure' | 'terrain' | 'fracture';

export const STATE_ORDER: MatterState[] = [
  'dust',
  'field',
  'type',
  'structure',
  'terrain',
  'fracture',
];

export const STATE_LABEL: Record<MatterState, string> = {
  dust: 'DUST',
  field: 'FIELD',
  type: 'TYPE',
  structure: 'STRUCTURE',
  terrain: 'TERRAIN',
  fracture: 'FRACTURE',
};

export const STATE_NOTE: Record<MatterState, string> = {
  dust: 'Unformed. The material before anyone has decided anything.',
  field: 'The sheet, flat. Every particle on the same plane.',
  type: 'The wordmark, sampled from the real glyphs.',
  structure: 'The Compiler’s planes, separated in depth.',
  terrain: 'The specimen plate’s contour field, as height.',
  fracture: 'The same matter, thrown. Nothing is lost, only scattered.',
};

/** Deterministic per-particle pseudo-random in [0,1). */
function rnd(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface TargetOptions {
  count: number;
  /** World extent the formation should fill, in the same units as the camera. */
  spread: number;
}

/* -------------------------------------------------------------------------- */
/* TYPE — sampled from real letterforms, not an approximation of them          */
/* -------------------------------------------------------------------------- */
/**
 * Draws HI ANZY to an offscreen canvas and samples opaque pixels. The matter
 * therefore forms the actual typeface the Lab is set in, rather than a shape
 * that resembles it.
 */
function sampleGlyphs(count: number, spread: number): Float32Array {
  const out = new Float32Array(count * 3);
  const W = 512;
  const H = 160;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let points: Array<[number, number]> = [];
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.font = '700 118px Rajdhani, Oswald, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HI ANZY', W / 2, H / 2);
    const data = ctx.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        if (data[(y * W + x) * 4 + 3] > 128) points.push([x / W - 0.5, 0.5 - y / H]);
      }
    }
  }
  // If the font never resolved there is nothing to sample; fall back to a plane
  // rather than emitting a pile of particles at the origin.
  if (points.length === 0) points = [[0, 0]];

  for (let i = 0; i < count; i++) {
    const p = points[Math.floor(rnd(i, 11) * points.length)];
    const jitter = spread * 0.004;
    out[i * 3] = p[0] * spread * 1.5 + (rnd(i, 12) - 0.5) * jitter;
    out[i * 3 + 1] = p[1] * spread * 0.47 + (rnd(i, 13) - 0.5) * jitter;
    out[i * 3 + 2] = (rnd(i, 14) - 0.5) * spread * 0.02;
  }
  return out;
}

/* -------------------------------------------------------------------------- */

export function buildTargets(state: MatterState, { count, spread }: TargetOptions): Float32Array {
  const out = new Float32Array(count * 3);

  switch (state) {
    case 'dust': {
      // A loose cloud, denser toward the middle. Unformed, not uniform noise.
      for (let i = 0; i < count; i++) {
        const r = Math.pow(rnd(i, 1), 0.62) * spread * 0.62;
        const a = rnd(i, 2) * Math.PI * 2;
        const b = Math.acos(rnd(i, 3) * 2 - 1);
        out[i * 3] = r * Math.sin(b) * Math.cos(a);
        out[i * 3 + 1] = r * Math.sin(b) * Math.sin(a) * 0.6;
        out[i * 3 + 2] = r * Math.cos(b) * 0.5;
      }
      return out;
    }

    case 'field': {
      // The sheet: a flat rectangular lattice, in register.
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

    case 'type':
      return sampleGlyphs(count, spread);

    case 'structure': {
      // Six planes at increasing depth — the Compiler's corridor, in matter.
      const planes = 6;
      for (let i = 0; i < count; i++) {
        const p = i % planes;
        const t = p / (planes - 1);
        out[i * 3] = (rnd(i, 21) - 0.5) * spread * (1.15 - t * 0.45);
        out[i * 3 + 1] = (rnd(i, 22) - 0.5) * spread * 0.42;
        out[i * 3 + 2] = -t * spread * 0.85;
      }
      return out;
    }

    case 'terrain': {
      // The specimen plate, as height. Same field the other modes read.
      const { min, max } = fieldRange(64);
      const range = max - min || 1;
      const cols = Math.ceil(Math.sqrt(count));
      for (let i = 0; i < count; i++) {
        const u = (i % cols) / cols;
        const v = Math.floor(i / cols) / cols;
        const h = (fieldAt(u, v) - min) / range;
        out[i * 3] = (u - 0.5) * spread * 1.6;
        out[i * 3 + 1] = h * spread * 0.42 - spread * 0.22;
        out[i * 3 + 2] = (v - 0.5) * spread * 1.6;
      }
      return out;
    }

    case 'fracture': {
      // Thrown outward along its own axis. Nothing lost, only scattered.
      for (let i = 0; i < count; i++) {
        const a = rnd(i, 31) * Math.PI * 2;
        const b = Math.acos(rnd(i, 32) * 2 - 1);
        const r = spread * (0.55 + rnd(i, 33) * 0.85);
        out[i * 3] = r * Math.sin(b) * Math.cos(a);
        out[i * 3 + 1] = r * Math.sin(b) * Math.sin(a) * 0.7;
        out[i * 3 + 2] = r * Math.cos(b) * 0.7;
      }
      return out;
    }
  }
}

/** Per-particle transition delay, so a state change sweeps rather than snaps. */
export function buildDelays(count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = rnd(i, 41) * 0.55;
  return out;
}

/** Per-particle seed, used for size variation and force response. */
export function buildSeeds(count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = rnd(i, 51);
  return out;
}
