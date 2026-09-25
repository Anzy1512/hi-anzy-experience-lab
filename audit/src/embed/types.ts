/**
 * THE EMBEDDING BOUNDARY.
 *
 * Which model produces the vectors is the decision most likely to change in
 * this system, and the one most expensive to change late: every stored vector
 * is only comparable with vectors from the same model, so switching means
 * re-embedding the entire corpus. The boundary exists so that the *code* does
 * not also have to change, and so that `audit_run.embedding_model` can record
 * which model a result came from — without which two runs cannot be compared
 * and the accumulated dataset is a pile of incomparable rows.
 *
 * Nothing here requires Anthropic, or any hosted service at all.
 */

export interface EmbeddingProvider {
  readonly id: string;
  /** Must match the `vector(N)` column. A mismatch is caught at startup. */
  readonly dimensions: number;
  /**
   * Whether this provider produces vectors whose geometry carries MEANING.
   *
   * False for the deterministic provider, which is a hashing projection: it
   * separates different text reliably and places related text no closer than
   * unrelated text. Recorded rather than glossed, because a dense index built
   * on a non-semantic embedder looks like it works — it returns results, in an
   * order, quickly — while contributing nothing a lexical index did not
   * already have.
   */
  readonly semantic: boolean;
  available(): Promise<{ ok: boolean; detail: string }>;
  /** Batch, because per-call overhead dominates for short passages. */
  embed(texts: string[]): Promise<number[][]>;
}

/** pgvector literal form. Kept here so only one place knows the wire format. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

export function l2Normalise(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}
