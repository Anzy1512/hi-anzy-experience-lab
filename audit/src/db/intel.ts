import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { auditRun, finding } from './schema.ts';
import { entity, observation, claim } from './entities.ts';

/**
 * LAYER 4 — WHAT WAS ASKED, HOW IT WAS ANSWERED, AND WHETHER THAT WAS ALLOWED.
 *
 * ── THIS ADDS NO SECOND JOB TABLE AND NO SECOND PROVENANCE SYSTEM ───────────
 *
 * `audit_run` already records a question, a pipeline version, a strategy, a
 * budget and a token count; it is extended here rather than replaced. `finding`
 * and `finding_citation` already exist from layer 1 and are extended for the
 * same reason. A second `query` table beside `audit_run`, or a second citation
 * table beside `finding_citation`, would mean two half-populated provenance
 * chains and a permanent question about which one is authoritative.
 *
 * ── AND THE ONE GENUINELY NEW IDEA ──────────────────────────────────────────
 *
 * `model_call`. Every model invocation records WHY it happened. Not as
 * telemetry — as a constraint: a call with no stated purpose is a call nobody
 * decided to make, and the rule this layer is built on is that the cheapest
 * correct method wins. Being able to ask "which questions actually needed a
 * model" is how that stays true after the first week.
 */

/* -------------------------------------------------------------------------- */
/* ENUMS                                                                       */
/* -------------------------------------------------------------------------- */

/** What a request is asking for. `UNKNOWN_INTENT` is a real answer. */
export const intentKind = pgEnum('intent_kind', [
  'ENTITY_LOOKUP',
  'ENTITY_DISCOVERY',
  'LOCAL_DISCOVERY',
  'CATEGORY_DISCOVERY',
  'SUPPLIER_DISCOVERY',
  'RETAILER_DISCOVERY',
  'COMPETITOR_DISCOVERY',
  'DIGITAL_PRESENCE_AUDIT',
  'ECOMMERCE_AUDIT',
  'BUSINESS_AUDIT',
  'MARKET_MAPPING',
  'GAP_ANALYSIS',
  'COMPARISON',
  'EVIDENCE_CHECK',
  'DATA_ENRICHMENT',
  'RELATIONSHIP_DISCOVERY',
  'GENERAL_RESEARCH',
  'UNKNOWN_INTENT',
]);

/**
 * What a finding IS, kept separate from how confident anyone is about it.
 *
 * A confidence number cannot distinguish "a source states this" from "we
 * inferred it" from "nothing supports it", and those need different handling
 * rather than different weights. `UNSUPPORTED` exists so the pipeline can
 * produce one, store it, and refuse to render it.
 */
export const findingStatus = pgEnum('finding_status', [
  'FACT',
  'DERIVED',
  'UNKNOWN',
  'UNSUPPORTED',
  'CONFLICTING',
  'RECOMMENDATION',
]);

/** What produced it. A model-authored finding is never indistinguishable from a rule. */
export const reasoningType = pgEnum('reasoning_type', ['RULE', 'RETRIEVAL', 'MODEL', 'HUMAN']);

export const verificationStatus = pgEnum('verification_status', [
  'UNVERIFIED',
  'VERIFIED',
  'REJECTED',
]);

/** Which tier of compute a task was routed to, recorded per call. */
export const modelClass = pgEnum('model_class', ['NO_MODEL', 'SMALL_MODEL', 'REASONING_MODEL']);

/* -------------------------------------------------------------------------- */
/* MODEL CALLS                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every model invocation, with the reason it was made.
 *
 * `purpose` is not a label for a dashboard. The architecture rule is that a
 * database query beats a model query wherever the answer already exists
 * structurally, and the only way to keep that rule after the first week is to
 * be able to ask which calls happened and why. A run that answers a geographic
 * filter with a reasoning model shows up here as a row nobody can justify.
 */
export const modelCall = pgTable(
  'model_call',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id').references(() => auditRun.id, { onDelete: 'cascade' }),
    /** Why this call was made, in words. Required. */
    purpose: text('purpose').notNull(),
    modelClass: modelClass('model_class').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    /** Millionths of a unit of currency, where the provider reports a price. */
    costMicros: integer('cost_micros'),
    durationMs: integer('duration_ms'),
    ok: integer('ok').notNull().default(1),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('model_call_run_idx').on(t.auditRunId), index('model_call_purpose_idx').on(t.purpose)],
);

/* -------------------------------------------------------------------------- */
/* EVIDENCE SELECTION                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What was put in front of a model, and what was left out.
 *
 * The omissions matter as much as the inclusions. A finding that looks
 * unsupported is a different problem depending on whether the supporting
 * evidence was never retrieved or was retrieved and dropped by the budgeter,
 * and without this row those two are indistinguishable afterwards.
 */
export const evidenceSelection = pgTable(
  'evidence_selection',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRun.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').references(() => entity.id, { onDelete: 'cascade' }),
    /** 'claim' | 'observation' | 'relationship' | 'chunk' */
    kind: text('kind').notNull(),
    refId: uuid('ref_id'),
    included: integer('included').notNull(),
    /** Why it was kept or dropped: rank, duplication, budget, irrelevance. */
    reason: text('reason').notNull(),
    score: real('score'),
    tokenLen: integer('token_len'),
  },
  (t) => [
    index('evidence_selection_run_idx').on(t.auditRunId),
    index('evidence_selection_entity_idx').on(t.entityId),
  ],
);

/* -------------------------------------------------------------------------- */
/* LEARNING CORPUS                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What a human concluded about one finding.
 *
 * Six values, because four would collapse the two distinctions that matter
 * most. `UNSUPPORTED` and `INCORRECT` are different failures: the first is a
 * citation problem, the second is a world problem, and a finding can be either
 * without being the other — a true statement citing the wrong page is a bug
 * this system must be able to see. `STALE` is a third kind entirely: it was
 * right, the page has moved on, and nothing in the pipeline is broken.
 */
export const reviewVerdict = pgEnum('review_verdict', [
  'SUPPORTED',
  'PARTIALLY_SUPPORTED',
  'UNSUPPORTED',
  'INCORRECT',
  'STALE',
  'AMBIGUOUS',
]);

/** A reviewer's grade. NULL means not assessed, which is not the same as POOR. */
export const reviewGrade = pgEnum('review_grade', ['GOOD', 'PARTIAL', 'POOR']);

export const citationValidity = pgEnum('citation_validity', ['VALID', 'PARTIAL', 'INVALID', 'NO_CITATION']);

/**
 * Whether the resolver got the identity right.
 *
 * `CORRECTLY_AMBIGUOUS` is the value this system needs and most schemas would
 * not have. Refusing to merge two records that genuinely cannot be told apart
 * is the resolver working exactly as layer 3 designed it to, and scoring that
 * as a miss would train away the single behaviour the whole resolution layer
 * exists to produce.
 */
export const resolutionReview = pgEnum('resolution_review', [
  'CORRECT',
  'FALSE_MERGE',
  'MISSED_MERGE',
  'CORRECTLY_AMBIGUOUS',
  'NOT_APPLICABLE',
]);

export const recommendationReview = pgEnum('recommendation_review', [
  'ACTIONABLE',
  'GENERIC',
  'WRONG',
  'NOT_APPLICABLE',
]);

/**
 * The supervision record: what a person said about a finding.
 *
 * Separate from layer 1's `feedback`, which is keyed to a finding's TEXT being
 * right or wrong. This records the pipeline decision around it — whether the
 * verifier was correct to accept or reject — which is the signal a future
 * evaluation needs and the one nothing else captures.
 *
 * ── APPEND-ONLY, AND THAT IS THE WHOLE DESIGN ───────────────────────────────
 *
 * A review is a NEW OBSERVATION, never a correction applied to the finding.
 * The finding stays exactly as the system produced it, because the pair — what
 * it said, and what a person said about what it said — is the training
 * example. Editing the first to record the second destroys the only thing
 * worth keeping, and destroys it invisibly: the row still looks complete.
 *
 * So nothing here is unique on `finding_id`. Two reviewers may disagree, one
 * reviewer may change their mind later, and both are simply rows.
 *
 * ── AND WHY THE VERSIONS ARE COPIED IN ──────────────────────────────────────
 *
 * A label refers to a judgement made by a particular rule set, a particular
 * orchestrator and possibly a particular model. Without a snapshot of those,
 * the label silently migrates onto whatever the code does next month, and a
 * corpus whose labels describe software that no longer exists is worse than no
 * corpus — it is a corpus that will be trained on.
 */
export const verificationFeedback = pgTable(
  'verification_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => finding.id, { onDelete: 'cascade' }),
    /** Did the automated verifier reach the right conclusion? */
    verifierWasRight: integer('verifier_was_right'),
    humanStatus: findingStatus('human_status'),
    note: text('note'),
    author: text('author'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /* ---- layer 7: the vocabulary that makes this a dataset ------------- */

    verdict: reviewVerdict('verdict'),
    retrievalQuality: reviewGrade('retrieval_quality'),
    citationValidity: citationValidity('citation_validity'),
    entityResolution: resolutionReview('entity_resolution'),
    recommendationQuality: recommendationReview('recommendation_quality'),
    /** Specifically about what was NOT looked at. Kept apart from `note`. */
    sourceCoverageNote: text('source_coverage_note'),
    /** What it should have said. The supervision signal, not merely the label. */
    correction: text('correction'),
    /** When the person judged, which is not when the row happened to be written. */
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ruleSetVersion: text('rule_set_version'),
    orchestratorVersion: text('orchestrator_version'),
    engineVersion: text('engine_version'),
    modelUsed: text('model_used'),
  },
  (t) => [
    index('verification_feedback_finding_idx').on(t.findingId),
    index('verification_feedback_verdict_idx').on(t.verdict),
  ],
);

/**
 * A reusable result: the artifact a research run hands back.
 *
 * Stored rather than only returned, because the closure condition is that a
 * project can be reopened after a restart and the evidence chain still holds.
 * A result that exists only in an HTTP response cannot satisfy that.
 */
export const researchArtifact = pgTable(
  'research_artifact',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRun.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    /** The structured result. Markdown is rendered from this, never the reverse. */
    body: jsonb('body').notNull().default(sql`'{}'::jsonb`),
    /** What this artifact cannot tell you. Never empty in practice. */
    limitations: jsonb('limitations').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('research_artifact_key').on(t.auditRunId, t.kind), index('research_artifact_run_idx').on(t.auditRunId)],
);

/* -------------------------------------------------------------------------- */
/* EXTENSIONS TO EXISTING TABLES                                               */
/* -------------------------------------------------------------------------- */

/*
 * `audit_run` gains `intent`, `request` and `plan`; `finding` gains
 * `entity_id`, `status`, `reasoning_type`, the rule that produced it, the
 * model that produced it, its limitations and its verification state; and
 * `finding_citation` gains `observation_id` and `claim_id` so one citation
 * table can anchor to a chunk, an observation or a claim.
 *
 * Those are declared in `schema.ts` and `entities.ts` beside the tables they
 * belong to, so a reader looking at `finding` sees all of its columns in one
 * place rather than half of them here. This file holds only what is new.
 */

export const intelSchema = {
  modelCall,
  evidenceSelection,
  verificationFeedback,
  researchArtifact,
};

/** Re-exported so `findings.ts` does not reach past this module. */
export { observation, claim, entity };
