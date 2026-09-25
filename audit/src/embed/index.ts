import { config } from '../config.ts';
import { EMBEDDING_DIM } from '../db/schema.ts';
import { DeterministicEmbedder } from './deterministic.ts';
import { l2Normalise, type EmbeddingProvider } from './types.ts';

/**
 * WHICH EMBEDDER IS IN USE, AND WHY THE EXPENSIVE ONE IS NOT INSTALLED.
 *
 * The instruction was: keep the provider replaceable, and do not introduce
 * expensive embedding infrastructure without measurement. Both are honoured
 * literally.
 *
 * `LocalTransformerEmbedder` is written and is NOT a declared dependency. It
 * imports `@huggingface/transformers` dynamically, so the file compiles, ships
 * and reports "not installed" until somebody runs one command. That is the
 * difference between a boundary and a promise: the production path exists and
 * can be measured the moment it is wanted, and nothing was downloaded to make
 * the point.
 *
 *     npm install @huggingface/transformers
 *     EMBEDDING_PROVIDER=local npm run check
 *
 * bge-small-en-v1.5 is the model because it is 384 dimensions — matching the
 * column already built — runs on CPU, and costs nothing per token. An API
 * embedder would be a third implementation of this same interface and is
 * deliberately absent: metering the cheapest operation in the pipeline is a
 * strange place to start spending.
 */

/**
 * A real sentence-transformer, loaded only if its dependency is present.
 *
 * The model is fetched once on first use and cached on disk by the library.
 * First call therefore pays for a download; every call after that is local.
 */
export class LocalTransformerEmbedder implements EmbeddingProvider {
  readonly id = 'bge-small-en-v1.5';
  readonly dimensions: number;
  readonly semantic = true;
  private pipe: unknown = null;
  private failure: string | null = null;

  constructor(dimensions: number) {
    this.dimensions = dimensions;
  }

  private async load(): Promise<unknown> {
    if (this.pipe !== null) return this.pipe;
    if (this.failure !== null) throw new Error(this.failure);
    try {
      /* Dynamic, and behind a variable so a bundler cannot decide to resolve
         it eagerly and turn an optional dependency into a required one. */
      const moduleName = '@huggingface/transformers';
      const mod = (await import(/* @vite-ignore */ moduleName)) as {
        pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>;
      };
      this.pipe = await mod.pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', { dtype: 'fp32' });
      return this.pipe;
    } catch (e) {
      this.failure =
        `@huggingface/transformers is not installed or could not load ` +
        `(${e instanceof Error ? e.message : String(e)}). ` +
        `Run: npm install @huggingface/transformers`;
      throw new Error(this.failure);
    }
  }

  async available(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.load();
      return { ok: true, detail: 'Xenova/bge-small-en-v1.5, running locally on CPU' };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const pipe = (await this.load()) as (
      input: string[],
      opts: Record<string, unknown>,
    ) => Promise<{ tolist: () => number[][] }>;
    /* Mean pooling then normalise is what bge expects; asking the pipeline for
       both keeps this consistent with how the model was trained. */
    const output = await pipe(texts, { pooling: 'mean', normalize: true });
    const rows = output.tolist();
    return rows.map((row) => {
      if (row.length !== this.dimensions) {
        throw new Error(`embedder returned ${row.length} dimensions, column expects ${this.dimensions}`);
      }
      return l2Normalise(row);
    });
  }
}

let singleton: EmbeddingProvider | undefined;

/**
 * The embedder for this process.
 *
 * `EMBEDDING_PROVIDER=local` opts into the real model. Anything else — and the
 * default — is the deterministic one, which is honest about not being
 * semantic rather than quietly pretending.
 */
export function getEmbedder(): EmbeddingProvider {
  if (singleton !== undefined) return singleton;
  singleton =
    process.env.EMBEDDING_PROVIDER === 'local'
      ? new LocalTransformerEmbedder(EMBEDDING_DIM)
      : new DeterministicEmbedder(EMBEDDING_DIM);
  return singleton;
}

/** For tests, which must not inherit whatever the environment happens to say. */
export function setEmbedder(provider: EmbeddingProvider): void {
  singleton = provider;
}

export { DeterministicEmbedder };
export type { EmbeddingProvider };
export const configuredProviderName = (): string =>
  process.env.EMBEDDING_PROVIDER === 'local' ? 'local' : 'deterministic';

/** Re-exported so callers do not reach past this module into the driver. */
export { toVectorLiteral } from './types.ts';
export const embeddingDim = EMBEDDING_DIM;
export const searchProviderName = config.SEARCH_PROVIDER;
