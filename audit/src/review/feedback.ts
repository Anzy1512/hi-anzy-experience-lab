import { z } from 'zod';

import type { Driver } from '../db/client.ts';
import { ENGINE_VERSION } from '../intel/engine.ts';
import { RULE_SET_VERSION } from '../intel/rules.ts';
import { ORCHESTRATOR_VERSION } from '../jobs/orchestrator.ts';

/**
 * THE HUMAN VERDICT, AND THE CORPUS IT BUILDS.
 *
 * ── WHY THIS LAYER EXISTS AT ALL ────────────────────────────────────────────
 *
 * Every gate in layers 4 to 6 measures the system against itself. The verifier
 * decides whether the analyst was supported; the rules decide what counts as
 * evidence; the tests assert that a scripted provider produced the sentence the
 * test wrote. All of that is necessary and none of it can answer the only
 * question that matters commercially: when this system says a brewery has no
 * online shop, is it right?
 *
 * Nothing in the corpus can answer that either. It needs a person to look at a
 * page and say so. So this module is the first one whose rows the system does
 * not produce.
 *
 * ── APPEND-ONLY, AND WHY THAT IS NOT MERELY TIDY ────────────────────────────
 *
 * A review never touches the finding. It cannot: the pair is the training
 * example, and correcting the finding in place leaves a row that looks correct
 * and teaches nothing. Worse, it destroys the case the evaluation most needs —
 * a confident, well-cited, wrong statement — by turning it into a right one.
 *
 * So the finding is immutable and a review is an insert. Two reviewers may
 * disagree; the same reviewer may return and change their mind; both are rows,
 * and the disagreement is data about how hard the judgement was.
 *
 * ── AND WHAT `pendingReviews` HAS TO HAND OVER ──────────────────────────────
 *
 * A reviewer cannot judge a statement from the statement. They need the quote,
 * the URL, when it was read, what the rule claimed, and what the automated
 * verifier decided — and they must be able to open the page. A review form that
 * shows only the sentence collects opinions about prose, which is the failure
 * mode that makes evaluation corpora useless.
 */

export const ReviewSchema = z.object({
  findingId: z.string().uuid(),
  verdict: z.enum(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'INCORRECT', 'STALE', 'AMBIGUOUS']),
  /**
   * Whether the automated verifier reached the same conclusion.
   *
   * Left undefined rather than guessed when the reviewer did not say. Deriving
   * it from the verdict would fabricate the one signal this table exists to
   * capture: the two judgements have to be able to disagree.
   */
  verifierAgreed: z.boolean().optional(),
  retrievalQuality: z.enum(['GOOD', 'PARTIAL', 'POOR']).optional(),
  citationValidity: z.enum(['VALID', 'PARTIAL', 'INVALID', 'NO_CITATION']).optional(),
  entityResolution: z.enum(['CORRECT', 'FALSE_MERGE', 'MISSED_MERGE', 'CORRECTLY_AMBIGUOUS', 'NOT_APPLICABLE']).optional(),
  recommendationQuality: z.enum(['ACTIONABLE', 'GENERIC', 'WRONG', 'NOT_APPLICABLE']).optional(),
  note: z.string().max(4000).optional(),
  sourceCoverageNote: z.string().max(4000).optional(),
  /** What it should have said. The supervision signal, not merely the label. */
  correction: z.string().max(4000).optional(),
  reviewer: z.string().min(1).max(120),
  /** When the person judged. Defaults to now, because that is usually true. */
  reviewedAt: z.coerce.date().optional(),
});
export type ReviewInput = z.infer<typeof ReviewSchema>;

export interface PendingFinding {
  id: string;
  statement: string;
  status: string | null;
  findingType: string | null;
  reasoningType: string | null;
  ruleId: string | null;
  ruleVersion: string | null;
  modelUsed: string | null;
  limitations: string | null;
  /** What the automated gate concluded, which the reviewer is judging too. */
  verification: string;
  verificationReason: string | null;
  entityId: string | null;
  entityName: string | null;
  question: string | null;
  createdAt: string;
  citations: Array<{ quote: string; url: string | null; retrievedAt: string | null }>;
  reviews: number;
}

/**
 * Findings a person could usefully look at, unreviewed first.
 *
 * `UNSUPPORTED` findings are included and that is deliberate: a statement the
 * verifier rejected is exactly where the pipeline might be wrong in the
 * expensive direction — throwing away something true — and a corpus of only
 * accepted findings can never show it.
 */
export async function pendingReviews(
  d: Driver,
  opts: { limit?: number; includeReviewed?: boolean; runIds?: string[]; entityId?: string } = {},
): Promise<PendingFinding[]> {
  const limit = Math.min(opts.limit ?? 25, 200);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.runIds !== undefined && opts.runIds.length > 0) {
    params.push(opts.runIds);
    clauses.push(`f.audit_run_id = any($${params.length}::uuid[])`);
  }
  if (opts.entityId !== undefined) {
    params.push(opts.entityId);
    clauses.push(`f.entity_id = $${params.length}`);
  }
  if (opts.includeReviewed !== true) {
    clauses.push('not exists (select 1 from verification_feedback v where v.finding_id = f.id)');
  }
  params.push(limit);

  const rows = await d.query<{
    id: string; statement: string; status: string | null; finding_type: string | null;
    reasoning_type: string | null; rule_id: string | null; rule_version: string | null;
    model_used: string | null; limitations: string | null; verification: string;
    verification_reason: string | null; entity_id: string | null; entity_name: string | null;
    question: string | null; created_at: string; reviews: string;
  }>(
    `select f.id, f.statement, f.status, f.finding_type, f.reasoning_type, f.rule_id, f.rule_version,
            f.model_used, f.limitations, f.verification, f.verification_reason, f.entity_id,
            e.canonical_name as entity_name, r.question, f.created_at,
            (select count(*) from verification_feedback v where v.finding_id = f.id)::text as reviews
       from finding f
       left join entity e on e.id = f.entity_id
       left join audit_run r on r.id = f.audit_run_id
      ${clauses.length > 0 ? `where ${clauses.join(' and ')}` : ''}
      order by f.created_at desc
      limit $${params.length}`,
    params,
  );
  if (rows.length === 0) return [];

  const citations = await d.query<{ finding_id: string; quote: string; url: string | null; retrieved_at: string | null }>(
    'select finding_id, quote, url, retrieved_at from finding_citation where finding_id = any($1::uuid[])',
    [rows.map((r) => r.id)],
  );
  const byFinding = new Map<string, PendingFinding['citations']>();
  for (const c of citations) {
    const list = byFinding.get(c.finding_id) ?? [];
    list.push({ quote: c.quote, url: c.url, retrievedAt: c.retrieved_at });
    byFinding.set(c.finding_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    statement: r.statement,
    status: r.status,
    findingType: r.finding_type,
    reasoningType: r.reasoning_type,
    ruleId: r.rule_id,
    ruleVersion: r.rule_version,
    modelUsed: r.model_used,
    limitations: r.limitations,
    verification: r.verification,
    verificationReason: r.verification_reason,
    entityId: r.entity_id,
    entityName: r.entity_name,
    question: r.question,
    createdAt: r.created_at,
    citations: byFinding.get(r.id) ?? [],
    reviews: Number(r.reviews),
  }));
}

/**
 * Record one review.
 *
 * The version columns are snapshotted here rather than read at export time,
 * because by export time the rules may have changed and the label would then
 * describe software that no longer exists — silently, and in a way that looks
 * fine.
 */
export async function submitReview(d: Driver, input: unknown): Promise<{ id: string }> {
  const r = ReviewSchema.parse(input);

  const exists = await d.query<{ id: string; model_used: string | null; rule_version: string | null }>(
    'select id, model_used, rule_version from finding where id = $1',
    [r.findingId],
  );
  const finding = exists[0];
  if (finding === undefined) throw new Error(`no finding ${r.findingId}`);

  const rows = await d.query<{ id: string }>(
    `insert into verification_feedback
       (finding_id, verdict, verifier_was_right, human_status, retrieval_quality, citation_validity,
        entity_resolution, recommendation_quality, note, source_coverage_note, correction,
        author, reviewed_at, rule_set_version, orchestrator_version, engine_version, model_used)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning id`,
    [
      r.findingId,
      r.verdict,
      r.verifierAgreed === undefined ? null : r.verifierAgreed ? 1 : 0,
      /*
       * `human_status` is layer 4's vocabulary and stays populated only where
       * the two vocabularies genuinely agree. A reviewer saying PARTIALLY_
       * SUPPORTED has said something layer 4's enum cannot express, and
       * rounding it to SOURCED or UNSUPPORTED would put a value in this column
       * that the reviewer did not choose.
       */
      r.verdict === 'SUPPORTED' ? 'FACT' : r.verdict === 'UNSUPPORTED' ? 'UNSUPPORTED' : null,
      r.retrievalQuality ?? null,
      r.citationValidity ?? null,
      r.entityResolution ?? null,
      r.recommendationQuality ?? null,
      r.note ?? null,
      r.sourceCoverageNote ?? null,
      r.correction ?? null,
      r.reviewer,
      r.reviewedAt ?? new Date(),
      finding.rule_version ?? RULE_SET_VERSION,
      ORCHESTRATOR_VERSION,
      ENGINE_VERSION,
      finding.model_used,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('could not record the review');
  return { id };
}

export interface ReviewMetrics {
  reviews: number;
  findingsReviewed: number;
  reviewers: number;
  byVerdict: Record<string, number>;
  byCitationValidity: Record<string, number>;
  byRetrievalQuality: Record<string, number>;
  byEntityResolution: Record<string, number>;
  byRecommendationQuality: Record<string, number>;
  /**
   * How often a person agreed with the automated verifier, out of the reviews
   * that said. Null when nobody has said — not 0, which would read as total
   * disagreement.
   */
  verifierAgreement: { agreed: number; disagreed: number; rate: number | null };
  /** Reviews carrying a correction, which is what a later evaluation trains on. */
  withCorrection: number;
  falseMerges: number;
  missedMerges: number;
  correctlyAmbiguous: number;
}

export async function reviewMetrics(d: Driver): Promise<ReviewMetrics> {
  const totals = await d.query<{
    reviews: string; findings: string; reviewers: string; agreed: string; disagreed: string; corrections: string;
  }>(
    `select count(*)::text as reviews,
            count(distinct finding_id)::text as findings,
            count(distinct author)::text as reviewers,
            count(*) filter (where verifier_was_right = 1)::text as agreed,
            count(*) filter (where verifier_was_right = 0)::text as disagreed,
            count(*) filter (where correction is not null)::text as corrections
       from verification_feedback`,
  );
  const t = totals[0];

  const group = async (column: string): Promise<Record<string, number>> => {
    const rows = await d.query<{ k: string | null; n: string }>(
      `select ${column} as k, count(*)::text as n from verification_feedback where ${column} is not null group by ${column}`,
    );
    const out: Record<string, number> = {};
    for (const row of rows) if (row.k !== null) out[row.k] = Number(row.n);
    return out;
  };

  const byEntityResolution = await group('entity_resolution');
  const agreed = Number(t?.agreed ?? 0);
  const disagreed = Number(t?.disagreed ?? 0);

  return {
    reviews: Number(t?.reviews ?? 0),
    findingsReviewed: Number(t?.findings ?? 0),
    reviewers: Number(t?.reviewers ?? 0),
    byVerdict: await group('verdict'),
    byCitationValidity: await group('citation_validity'),
    byRetrievalQuality: await group('retrieval_quality'),
    byEntityResolution,
    byRecommendationQuality: await group('recommendation_quality'),
    verifierAgreement: {
      agreed,
      disagreed,
      rate: agreed + disagreed === 0 ? null : Number((agreed / (agreed + disagreed)).toFixed(4)),
    },
    withCorrection: Number(t?.corrections ?? 0),
    falseMerges: byEntityResolution['FALSE_MERGE'] ?? 0,
    missedMerges: byEntityResolution['MISSED_MERGE'] ?? 0,
    correctlyAmbiguous: byEntityResolution['CORRECTLY_AMBIGUOUS'] ?? 0,
  };
}

/**
 * One labelled example, assembled from everything that produced it.
 *
 * This is the shape a future evaluation reads, and the reason the pipeline
 * stores what it discarded. An example that carried only the question, the
 * finding and the verdict would be unable to answer the most useful question
 * about a wrong answer — was the evidence there and passed over, or never
 * retrieved at all — and those two failures need completely different fixes.
 */
export interface CorpusExample {
  reviewId: string;
  reviewedAt: string | null;
  reviewer: string | null;
  question: string | null;
  intent: string | null;
  finding: {
    id: string;
    statement: string;
    status: string | null;
    type: string | null;
    reasoning: string | null;
    ruleId: string | null;
    limitations: string | null;
    verification: string;
    verificationReason: string | null;
  };
  citations: Array<{ quote: string; url: string | null; retrievedAt: string | null }>;
  evidence: { included: Array<{ kind: string; reason: string; score: number | null }>; rejected: Array<{ kind: string; reason: string; score: number | null }> };
  human: {
    verdict: string | null;
    verifierAgreed: number | null;
    retrievalQuality: string | null;
    citationValidity: string | null;
    entityResolution: string | null;
    recommendationQuality: string | null;
    note: string | null;
    sourceCoverageNote: string | null;
    correction: string | null;
  };
  model: { used: string | null; calls: number; tokensIn: number; tokensOut: number; costMicros: number | null };
  versions: { ruleSet: string | null; orchestrator: string | null; engine: string | null };
  latencyMs: number | null;
}

export async function exportCorpus(d: Driver, opts: { limit?: number } = {}): Promise<CorpusExample[]> {
  const limit = Math.min(opts.limit ?? 200, 1000);
  const rows = await d.query<{
    review_id: string; reviewed_at: string | null; author: string | null; verdict: string | null;
    verifier_was_right: number | null; retrieval_quality: string | null; citation_validity: string | null;
    entity_resolution: string | null; recommendation_quality: string | null; note: string | null;
    source_coverage_note: string | null; correction: string | null; rule_set_version: string | null;
    orchestrator_version: string | null; engine_version: string | null;
    finding_id: string; statement: string; status: string | null; finding_type: string | null;
    reasoning_type: string | null; rule_id: string | null; limitations: string | null;
    verification: string; verification_reason: string | null; model_used: string | null;
    run_id: string | null; question: string | null; intent: string | null; latency_ms: number | null;
  }>(
    `select v.id as review_id, v.reviewed_at, v.author, v.verdict, v.verifier_was_right,
            v.retrieval_quality, v.citation_validity, v.entity_resolution, v.recommendation_quality,
            v.note, v.source_coverage_note, v.correction,
            v.rule_set_version, v.orchestrator_version, v.engine_version,
            f.id as finding_id, f.statement, f.status, f.finding_type, f.reasoning_type, f.rule_id,
            f.limitations, f.verification, f.verification_reason, f.model_used,
            r.id as run_id, r.question, r.intent,
            extract(epoch from (r.finished_at - r.started_at)) * 1000 as latency_ms
       from verification_feedback v
       join finding f on f.id = v.finding_id
       left join audit_run r on r.id = f.audit_run_id
      order by v.reviewed_at desc nulls last, v.created_at desc
      limit $1`,
    [limit],
  );
  if (rows.length === 0) return [];

  const findingIds = rows.map((r) => r.finding_id);
  const runIds = rows.map((r) => r.run_id).filter((id): id is string => id !== null);

  const citations = await d.query<{ finding_id: string; quote: string; url: string | null; retrieved_at: string | null }>(
    'select finding_id, quote, url, retrieved_at from finding_citation where finding_id = any($1::uuid[])',
    [findingIds],
  );
  const selections =
    runIds.length === 0
      ? []
      : await d.query<{ audit_run_id: string; kind: string; included: number; reason: string; score: number | null }>(
          'select audit_run_id, kind, included, reason, score from evidence_selection where audit_run_id = any($1::uuid[])',
          [runIds],
        );
  const modelCalls =
    runIds.length === 0
      ? []
      : await d.query<{ audit_run_id: string; calls: string; tin: string; tout: string; cost: string | null; priced: string }>(
          `select audit_run_id, count(*)::text as calls, coalesce(sum(tokens_in),0)::text as tin,
                  coalesce(sum(tokens_out),0)::text as tout, sum(cost_micros)::text as cost,
                  count(*) filter (where cost_micros is not null)::text as priced
             from model_call where audit_run_id = any($1::uuid[]) group by audit_run_id`,
          [runIds],
        );

  return rows.map((r) => {
    const mine = selections.filter((s) => s.audit_run_id === r.run_id);
    const mc = modelCalls.find((m) => m.audit_run_id === r.run_id);
    return {
      reviewId: r.review_id,
      reviewedAt: r.reviewed_at,
      reviewer: r.author,
      question: r.question,
      intent: r.intent,
      finding: {
        id: r.finding_id,
        statement: r.statement,
        status: r.status,
        type: r.finding_type,
        reasoning: r.reasoning_type,
        ruleId: r.rule_id,
        limitations: r.limitations,
        verification: r.verification,
        verificationReason: r.verification_reason,
      },
      citations: citations
        .filter((c) => c.finding_id === r.finding_id)
        .map((c) => ({ quote: c.quote, url: c.url, retrievedAt: c.retrieved_at })),
      evidence: {
        included: mine.filter((s) => Number(s.included) === 1).map((s) => ({ kind: s.kind, reason: s.reason, score: s.score })),
        rejected: mine.filter((s) => Number(s.included) !== 1).map((s) => ({ kind: s.kind, reason: s.reason, score: s.score })),
      },
      human: {
        verdict: r.verdict,
        verifierAgreed: r.verifier_was_right,
        retrievalQuality: r.retrieval_quality,
        citationValidity: r.citation_validity,
        entityResolution: r.entity_resolution,
        recommendationQuality: r.recommendation_quality,
        note: r.note,
        sourceCoverageNote: r.source_coverage_note,
        correction: r.correction,
      },
      model: {
        used: r.model_used,
        calls: Number(mc?.calls ?? 0),
        tokensIn: Number(mc?.tin ?? 0),
        tokensOut: Number(mc?.tout ?? 0),
        costMicros: Number(mc?.priced ?? 0) === 0 ? null : Number(mc?.cost ?? 0),
      },
      versions: { ruleSet: r.rule_set_version, orchestrator: r.orchestrator_version, engine: r.engine_version },
      latencyMs: r.latency_ms === null ? null : Math.round(Number(r.latency_ms)),
    };
  });
}
