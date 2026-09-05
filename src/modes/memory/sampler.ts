import { RECORDS } from '../../content/memory';

/**
 * THE SAMPLER — photogrammetry of the archive.
 *
 * Every point in Memory is a **sample of printed matter**, not a decorative
 * particle. A record's title is drawn into an offscreen canvas in the Lab's own
 * display face, the raster is read back, and each surviving ink pixel becomes a
 * point. The cloud's silhouette is therefore literally the typography — which
 * is the whole argument of the mode: what you are walking through is residue of
 * a document, reconstructed.
 *
 * A record with low `integrity` keeps fewer of its own pixels. The gaps are not
 * random noise added on top; they are parts of the record that are simply not
 * there, and no amount of approaching will invent them.
 */

export interface StationGeometry {
  /** x, y, z — where each point belongs once fully reconstructed. */
  target: Float32Array;
  /** x, y, z — where the residue sits before it resolves. */
  scatter: Float32Array;
  /** Per-point randomness, stable across frames. */
  seed: Float32Array;
  count: number;
}

/** Deterministic per-record noise. The same archive reconstructs the same way. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CANVAS_W = 340;
const CANVAS_H = 96;

/** Draws one title and returns its ink pixels as normalised -0.5..0.5 coords. */
function inkPixels(title: string): { x: number; y: number; a: number }[] {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#fff';
  // The Lab's display face. If it has not loaded, the fallback stack still
  // produces a condensed silhouette rather than nothing.
  ctx.font = `700 78px 'Rajdhani', 'Oswald', 'Arial Narrow', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, CANVAS_W / 2, CANVAS_H / 2 + 2);

  const data = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
  const out: { x: number; y: number; a: number }[] = [];
  for (let y = 0; y < CANVAS_H; y++) {
    for (let x = 0; x < CANVAS_W; x++) {
      const v = data[(y * CANVAS_W + x) * 4];
      if (v < 40) continue;
      out.push({
        x: x / CANVAS_W - 0.5,
        y: 0.5 - y / CANVAS_H,
        a: v / 255,
      });
    }
  }
  return out;
}

/**
 * Builds the whole archive as one interleaved buffer set — one geometry, one
 * draw call, ten records. `stationZ` is baked into `target.z`, so the shader can
 * derive each point's confidence from its own depth without a uniform array.
 */
export function buildArchive(totalPoints: number, spacing: number, scale: number) {
  const perRecord = Math.max(400, Math.floor(totalPoints / RECORDS.length));
  const target: number[] = [];
  const scatter: number[] = [];
  const seed: number[] = [];

  RECORDS.forEach((record, i) => {
    const rand = rng(0x51ed + i * 7919);
    const pixels = inkPixels(record.title);
    if (pixels.length === 0) return;

    const z = -i * spacing;
    // Integrity is enforced by how much of the record's own ink survives.
    const keep = Math.max(0.12, record.integrity);
    const want = Math.floor(perRecord * keep);

    for (let n = 0; n < want; n++) {
      const p = pixels[Math.floor(rand() * pixels.length)];
      // Sub-pixel spread so the cloud has grain rather than a pixel lattice.
      const jx = (rand() - 0.5) / CANVAS_W;
      const jy = (rand() - 0.5) / CANVAS_H;

      target.push((p.x + jx) * scale, (p.y + jy) * scale * (CANVAS_H / CANVAS_W), z + (rand() - 0.5) * 26);

      // Residue: where the point sits before the memory resolves. Lower
      // integrity scatters further, so a damaged record reads as damaged from
      // a distance, before you can read a word of it.
      const spread = (1.15 - record.integrity) * scale * 0.55;
      scatter.push(
        (rand() - 0.5) * spread * 2.1,
        (rand() - 0.5) * spread * 1.35,
        (rand() - 0.5) * spread * 1.8,
      );
      seed.push(rand());
    }
  });

  return {
    target: new Float32Array(target),
    scatter: new Float32Array(scatter),
    seed: new Float32Array(seed),
    count: seed.length,
  } satisfies StationGeometry;
}

/** Where each record sits on the z axis. Shared by the field and the DOM. */
export function stationZ(i: number, spacing: number): number {
  return -i * spacing;
}
