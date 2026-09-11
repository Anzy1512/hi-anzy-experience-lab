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
/*                                                                            */
/* Draws to an offscreen canvas and samples opaque pixels, so the matter forms */
/* the actual typeface the Lab is set in rather than a shape resembling it.    */
/* Phase 8.5 generalised the string: the wordmark is the default, not the only */
/* thing this can set.                                                         */
/* -------------------------------------------------------------------------- */

/** The longest phrase the instrument will set, and how it may be broken. */
export const TEXT_MAX = 24;
const MAX_LINES = 2;

/**
 * What the instrument is willing to set.
 *
 * Control characters are removed rather than escaped, the string is capped, and
 * the result is upper-cased because the display face is. Nothing here is ever
 * inserted into the document — it is drawn to an offscreen canvas and read back
 * as pixels — so there is no markup path to sanitise against. The cap exists for
 * legibility, not safety: past two dozen characters at this spread the matter is
 * setting type too small for a hundred and sixty thousand particles to resolve.
 */
export function sanitiseText(raw: string): string {
  return Array.from(raw)
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c >= 0x20 && c !== 0x7f;
    })
    .join('')
    .slice(0, TEXT_MAX)
    .toUpperCase();
}

/** Break a phrase into at most two lines, on a space, near the middle. */
function layoutLines(text: string): string[] {
  const t = text.trim();
  if (t.length <= 9 || !t.includes(' ')) return [t];
  const mid = Math.floor(t.length / 2);
  let split = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== ' ') continue;
    if (split === -1 || Math.abs(i - mid) < Math.abs(split - mid)) split = i;
  }
  if (split <= 0) return [t];
  return [t.slice(0, split), t.slice(split + 1)].filter(Boolean).slice(0, MAX_LINES);
}

/**
 * Rasterise text and sample its opaque pixels.
 *
 * This is the whole of TYPE MATTER, and it is the same function that has always
 * drawn the wordmark — the state that proved matter could resolve into real
 * letterforms was already doing this, for one fixed string. Generalising it is
 * what turns a demonstration into an instrument: the visitor's own phrase goes
 * through the identical path, so their words are made of the Lab's typeface at
 * the Lab's density, not pasted over it.
 *
 * No network, no model, no API. A canvas, an alpha channel, and a deterministic
 * pick per particle — which is also why the same phrase always forms the same
 * way, and why it costs a single rasterisation rather than a per-frame anything.
 */
function sampleText(text: string, count: number, spread: number): Float32Array {
  const out = new Float32Array(count * 3);
  const W = 512;
  const H = 160;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let points: Array<[number, number]> = [];
  if (ctx) {
    const lines = layoutLines(text);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    /*
     * Fit rather than assume. The wordmark was set at a fixed 118px because it
     * is always seven characters; a phrase the visitor chose is not, and a
     * fixed size either overflows the canvas — clipping the ends of their
     * words, which reads as a bug in their typing — or wastes most of it.
     */
    const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), '');
    let size = 128;
    ctx.font = `700 ${size}px Rajdhani, Oswald, sans-serif`;
    const measured = ctx.measureText(longest).width || 1;
    size = Math.max(28, Math.min(size, (size * (W * 0.9)) / measured, (H * 0.86) / lines.length));
    ctx.font = `700 ${Math.round(size)}px Rajdhani, Oswald, sans-serif`;

    const lead = size * 0.96;
    const top = H / 2 - ((lines.length - 1) * lead) / 2;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, top + i * lead));

    const data = ctx.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        if (data[(y * W + x) * 4 + 3] > 128) points.push([x / W - 0.5, 0.5 - y / H]);
      }
    }
  }
  /*
   * Nothing resolved: the font never loaded, or the phrase was entirely glyphs
   * this face has no outline for. Falling back to a plane keeps the matter
   * somewhere legible instead of emitting a pile at the origin — and the mode
   * says so in its readout rather than pretending the formation worked.
   */
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

/** Whether a phrase would actually rasterise to anything this face can draw. */
export function textResolves(text: string): boolean {
  const t = sanitiseText(text).trim();
  if (!t) return false;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.fillStyle = '#fff';
  ctx.font = '700 64px Rajdhani, Oswald, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, 128, 48);
  const data = ctx.getImageData(0, 0, 256, 96).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) return true;
  return false;
}

/**
 * The phrase the `type` formation is currently setting.
 *
 * Module-level rather than React state because `buildTargets` is called from
 * the render loop's own code path and must not take a prop through four
 * components to learn one string. Reset to the wordmark on mode entry, so the
 * reality always opens on what it has always opened on.
 */
let typedText = 'HI ANZY';

export function setTypedText(text: string): void {
  const clean = sanitiseText(text).trim();
  typedText = clean || 'HI ANZY';
}

export function getTypedText(): string {
  return typedText;
}

export function resetTypedText(): void {
  typedText = 'HI ANZY';
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
      return sampleText(typedText, count, spread);

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
