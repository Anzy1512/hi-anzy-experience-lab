import type { Driver } from '../db/client.ts';
import { getEmbedder, toVectorLiteral } from '../embed/index.ts';

/**
 * HYBRID RETRIEVAL, WITH A BUDGET AND A DIVERSITY FLOOR.
 *
 * ── WHY BOTH INDEXES ────────────────────────────────────────────────────────
 *
 * Dense retrieval finds what a passage MEANS and misses exact tokens — a
 * company number, a filing reference, a product name spelled one particular
 * way. Lexical retrieval finds those exactly and misses every paraphrase. Each
 * one's blind spot is the other's speciality, which is why running both and
 * fusing beats tuning either.
 *
 * ── WHY RECIPROCAL RANK FUSION RATHER THAN BLENDING SCORES ──────────────────
 *
 * A cosine distance and a `ts_rank_cd` are not comparable quantities. They
 * have different ranges, different distributions, and both shift with corpus
 * size, so any weighted sum of them is a constant somebody tuned once against
 * one corpus and that silently stops being right. RRF throws the magnitudes
 * away and keeps only the ordering — `1 / (k + rank)` — which is scale-free,
 * needs no tuning, and is why it holds up when the corpus grows.
 *
 * ── WHY DIVERSITY IS ENFORCED RATHER THAN HOPED FOR ─────────────────────────
 *
 * Unconstrained, both retrievers return the same page five times: a site that
 * repeats its pitch across five sections ranks all five. That is five slots
 * of budget spent on one claim from one source, and it is worse than a waste —
 * it reads like corroboration. Caps per document and per domain are what make
 * "three sources agree" mean three sources.
 *
 * ── AND WHY THE BUDGET IS THE POINT ─────────────────────────────────────────
 *
 * The passages that survive here are what a later layer puts in a prompt, and
 * that is the bill. The budget is a token ceiling as well as a count, because
 * eight short chunks and eight long ones cost very differently.
 */

export interface RetrieveOptions {
  /** How many candidates to pull from EACH retriever before fusion. */
  candidates?: number;
  /** Hard ceiling on returned passages. */
  limit?: number;
  /** Hard ceiling on total estimated tokens. Whichever binds first wins. */
  tokenBudget?: number;
  /** At most this many passages from one document. */
  maxPerDocument?: number;
  /** At most this many passages from one registrable domain. */
  maxPerDomain?: number;
  /** Restrict to documents linked to this subject. */
  subjectId?: string | null;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  url: string;
  canonicalUrl: string | null;
  domain: string;
  title: string | null;
  headingPath: string | null;
  text: string;
  tokenLen: number;
  charStart: number | null;
  charEnd: number | null;
  fetchedAt: Date | null;
  rankDense: number | null;
  rankLexical: number | null;
  scoreDense: number | null;
  scoreLexical: number | null;
  scoreFused: number;
}

export interface RetrievalReport {
  query: string;
  strategy: string;
  embeddingModel: string;
  /** True when the embedder in use produces meaning-bearing vectors. */
  semanticDense: boolean;
  denseCount: number;
  lexicalCount: number;
  /** Passages found by BOTH. High overlap means one retriever is redundant here. */
  overlap: number;
  returned: RetrievedChunk[];
  droppedForDiversity: number;
  tokensUsed: number;
  elapsedMs: number;
}

interface Row {
  chunk_id: string;
  document_id: string;
  url: string;
  canonical_url: string | null;
  title: string | null;
  heading_path: string | null;
  text: string;
  token_len: number | null;
  char_start: number | null;
  char_end: number | null;
  fetched_at: string | Date | null;
  score: number | null;
}

const SELECT = `
  select c.id as chunk_id, c.document_id, d.url, d.canonical_url, d.title,
         c.heading_path, c.text, c.token_len, c.char_start, c.char_end, d.fetched_at`;

/** Registrable-domain-ish grouping for the diversity cap. */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return url;
  }
}

export async function retrieve(
  d: Driver,
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievalReport> {
  const startedAt = performance.now();
  const candidates = opts.candidates ?? 40;
  const limit = opts.limit ?? 8;
  const tokenBudget = opts.tokenBudget ?? 4_000;
  const maxPerDocument = opts.maxPerDocument ?? 2;
  const maxPerDomain = opts.maxPerDomain ?? 3;

  const embedder = getEmbedder();
  const [vector] = await embedder.embed([query]);
  const subjectFilter = opts.subjectId
    ? ` and exists (select 1 from subject_document sd where sd.document_id = d.id and sd.subject_id = $3)`
    : '';
  const subjectArgs = opts.subjectId ? [opts.subjectId] : [];

  /* ---- dense ------------------------------------------------------------ */
  const denseRows =
    vector === undefined
      ? []
      : await d.query<Row>(
          `${SELECT}, (c.embedding <=> $1::vector) as score
             from chunk c join document d on d.id = c.document_id
            where c.embedding is not null${subjectFilter}
            order by c.embedding <=> $1::vector
            limit $2`,
          [toVectorLiteral(vector), candidates, ...subjectArgs],
        );

  /* ---- lexical ---------------------------------------------------------- */
  const lexicalRows = await d.query<Row>(
    `${SELECT}, ts_rank_cd(c.tsv, websearch_to_tsquery('english', $1)) as score
       from chunk c join document d on d.id = c.document_id
      where c.tsv @@ websearch_to_tsquery('english', $1)${subjectFilter}
      order by score desc
      limit $2`,
    [query, candidates, ...subjectArgs],
  );

  /* ---- fuse ------------------------------------------------------------- */
  const K = 60; /* the standard RRF constant; damps the top ranks' dominance */
  const byChunk = new Map<string, RetrievedChunk>();

  const absorb = (rows: Row[], which: 'dense' | 'lexical') => {
    rows.forEach((r, i) => {
      const rank = i + 1;
      const existing = byChunk.get(r.chunk_id);
      const contribution = 1 / (K + rank);
      if (existing === undefined) {
        byChunk.set(r.chunk_id, {
          chunkId: r.chunk_id,
          documentId: r.document_id,
          url: r.url,
          canonicalUrl: r.canonical_url,
          domain: domainOf(r.canonical_url ?? r.url),
          title: r.title,
          headingPath: r.heading_path,
          text: r.text,
          tokenLen: r.token_len ?? Math.ceil(r.text.length / 4),
          charStart: r.char_start,
          charEnd: r.char_end,
          fetchedAt: r.fetched_at === null ? null : new Date(r.fetched_at),
          rankDense: which === 'dense' ? rank : null,
          rankLexical: which === 'lexical' ? rank : null,
          scoreDense: which === 'dense' ? r.score : null,
          scoreLexical: which === 'lexical' ? r.score : null,
          scoreFused: contribution,
        });
        return;
      }
      if (which === 'dense') {
        existing.rankDense = rank;
        existing.scoreDense = r.score;
      } else {
        existing.rankLexical = rank;
        existing.scoreLexical = r.score;
      }
      existing.scoreFused += contribution;
    });
  };

  absorb(denseRows, 'dense');
  absorb(lexicalRows, 'lexical');

  const fused = [...byChunk.values()].sort((a, b) => b.scoreFused - a.scoreFused);
  const overlap = fused.filter((c) => c.rankDense !== null && c.rankLexical !== null).length;

  /* ---- diversity and budget, applied together --------------------------- */
  const perDocument = new Map<string, number>();
  const perDomain = new Map<string, number>();
  const returned: RetrievedChunk[] = [];
  let tokensUsed = 0;
  let dropped = 0;

  for (const c of fused) {
    if (returned.length >= limit) break;
    const docCount = perDocument.get(c.documentId) ?? 0;
    const domCount = perDomain.get(c.domain) ?? 0;
    if (docCount >= maxPerDocument || domCount >= maxPerDomain) {
      dropped += 1;
      continue;
    }
    if (tokensUsed + c.tokenLen > tokenBudget) {
      /* Budget is a ceiling, not a target: a passage that does not fit is
         skipped rather than truncated, because half a passage cited as a
         source is worse than one fewer source. Smaller ones after it may
         still fit, so this continues rather than breaking. */
      dropped += 1;
      continue;
    }
    perDocument.set(c.documentId, docCount + 1);
    perDomain.set(c.domain, domCount + 1);
    tokensUsed += c.tokenLen;
    returned.push(c);
  }

  return {
    query,
    strategy: `rrf(k=${K}) candidates=${candidates} limit=${limit} tokens<=${tokenBudget} doc<=${maxPerDocument} domain<=${maxPerDomain}`,
    embeddingModel: embedder.id,
    semanticDense: embedder.semantic,
    denseCount: denseRows.length,
    lexicalCount: lexicalRows.length,
    overlap,
    returned,
    droppedForDiversity: dropped,
    tokensUsed,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

/**
 * Write the retrieval down.
 *
 * Every run, whether anybody looks or not. This is the half of a future
 * training example that records what the model was GIVEN — without it a
 * finding is an output with no input, and teaches nothing. `pipeline_version`
 * and `embedding_model` are stored alongside, because retrievals produced
 * under different chunking or a different embedder are not comparable and
 * averaging them would look like more data while meaning less.
 */
export async function recordRetrieval(
  d: Driver,
  report: RetrievalReport,
  meta: { pipelineVersion: string; subjectId?: string | null; budget?: number },
): Promise<string> {
  const inserted = await d.query<{ id: string }>(
    `insert into audit_run (subject_id, question, status, retrieval_strategy, pipeline_version, embedding_model, budget)
     values ($1,$2,'retrieving',$3,$4,$5,$6) returning id`,
    [
      meta.subjectId ?? null,
      report.query,
      report.strategy,
      meta.pipelineVersion,
      report.embeddingModel,
      meta.budget ?? report.tokensUsed,
    ],
  );
  const run = inserted[0];
  if (!run) throw new Error('audit_run insert returned no id');

  for (const [i, c] of report.returned.entries()) {
    await d.query(
      `insert into retrieval (audit_run_id, chunk_id, rank, score_vector, score_lexical, score_fused, used_in_prompt)
       values ($1,$2,$3,$4,$5,$6,1)
       on conflict (audit_run_id, chunk_id) do nothing`,
      [run.id, c.chunkId, i + 1, c.scoreDense, c.scoreLexical, c.scoreFused],
    );
  }
  return run.id;
}
