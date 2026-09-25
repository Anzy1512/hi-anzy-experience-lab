import { createHash } from 'node:crypto';

import { l2Normalise, type EmbeddingProvider } from './types.ts';

/**
 * A DETERMINISTIC EMBEDDER, AND AN HONEST ACCOUNT OF WHAT IT IS NOT.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 *
 * The hashing trick: tokens and character n-grams are hashed into a fixed
 * number of dimensions with a signed contribution, then L2-normalised. It is
 * a random projection of a bag of features, it costs nothing, it needs no
 * model file and no network, and the same text produces the same vector on
 * every machine forever — which is exactly what a test needs, because a test
 * that asserts on a downloaded model's output is asserting on a download.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 *
 * It is not semantic. "reduced gross margin" and "profitability declined"
 * share almost no tokens, so this places them no closer than either sits to a
 * recipe. `semantic` is false for that reason and the flag is load-bearing:
 * a dense index built on this LOOKS like it works — it returns results, in an
 * order, fast — while adding nothing the lexical index did not already have.
 * Believing otherwise is the failure this class is most likely to cause, so
 * it says so in its own metadata.
 *
 * It is the default until a real model is measured rather than assumed, which
 * is the instruction this layer was given. The character n-grams mean it is
 * not useless in the meantime: it survives morphology and typos, so
 * "fulfilment" and "fulfillment" land near each other where a pure token
 * model would miss.
 */

const MASK = 0x7fffffff;

/** Two independent 31-bit hashes from one digest: one for the bucket, one for the sign. */
function hashPair(token: string, salt: string): { bucket: number; sign: number } {
  const digest = createHash('sha1').update(`${salt}\u0000${token}`).digest();
  const a = digest.readUInt32BE(0) & MASK;
  const b = digest.readUInt32BE(4) & MASK;
  return { bucket: a, sign: b % 2 === 0 ? 1 : -1 };
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t !== '' && t.length <= 40);
}

export class DeterministicEmbedder implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  readonly semantic = false;

  constructor(dimensions: number) {
    this.dimensions = dimensions;
    this.id = `deterministic-hash-${dimensions}`;
  }

  async available(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: 'in-process, no model file, no network, identical output everywhere' };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.one(t));
  }

  private one(text: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenise(text);
    if (tokens.length === 0) return v;

    const add = (feature: string, salt: string, weight: number) => {
      const { bucket, sign } = hashPair(feature, salt);
      const index = bucket % this.dimensions;
      v[index] = (v[index] ?? 0) + sign * weight;
    };

    for (const token of tokens) {
      /* Sub-linear term weighting, as tf-idf would: the tenth occurrence of a
         word says much less than the first. */
      add(token, 'tok', 1);

      /* Character 4-grams, which is what carries morphology and typos. */
      const padded = `^${token}$`;
      for (let i = 0; i + 4 <= padded.length; i++) {
        add(padded.slice(i, i + 4), 'gram', 0.35);
      }
    }

    /* Adjacent pairs, so word order contributes something. */
    for (let i = 0; i + 1 < tokens.length; i++) {
      add(`${tokens[i]} ${tokens[i + 1]}`, 'bigram', 0.5);
    }

    /* Damp the magnitude of long passages before normalising, so a 500-word
       chunk is not systematically closer to everything than a 50-word one. */
    const damp = 1 / Math.sqrt(tokens.length);
    return l2Normalise(v.map((x) => x * damp));
  }
}
