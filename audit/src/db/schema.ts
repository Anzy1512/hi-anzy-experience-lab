import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

/**
 * THE CORPUS, THE SUBJECT, THE AUDIT, AND THE RECORD OF WHETHER IT WAS RIGHT.
 *
 * ── THE ONE DESIGN DECISION THAT MATTERS HERE ───────────────────────────────
 *
 * Fine-tuning was chosen as the second step, after retrieval. The obstacle
 * named at the time was that the labelled dataset does not exist — and a
 * dataset that does not exist is not created later by deciding to want one. It
 * is created by a system that has been writing it down all along.
 *
 * So `retrieval`, `finding` and `feedback` are not instrumentation bolted to
 * the side. They are the training set, recorded as the service runs:
 *
 *     retrieval   what the question was, and which chunks were ranked where
 *     finding     what the model concluded from them
 *     feedback    whether a human agreed
 *
 * One row per triple is one training example. Nothing else has to happen for
 * the corpus to accumulate, which is the only version of "collect data for
 * later" that has ever worked.
 *
 * ── AND THE VOCABULARY IS ALREADY DECIDED ───────────────────────────────────
 *
 * `finding.area` is not a free string. It is the canonical DIAGNOSTIC_AREAS
 * list the Agency already publishes and `src/content/canonical.ts` already
 * mirrors — Business, Brand, Customer, Sales, Marketing, Technology, Data,
 * Operations, Automation, Security, Growth. `finding.outcome` is the canonical
 * DIAGNOSTIC_OUTCOMES sequence. That is deliberate: the deterministic Agency
 * Simulator and this service then speak one vocabulary, a real audit drops
 * into the surface the Lab already built for it, and neither side gets to
 * invent a category to make an answer fit.
 */

/* -------------------------------------------------------------------------- */
/* TYPES POSTGRES HAS AND DRIZZLE DOES NOT                                     */
/* -------------------------------------------------------------------------- */

/**
 * Postgres full-text search, kept alongside the vector.
 *
 * Retrieval here is hybrid on purpose and the reason is cost rather than
 * taste. Dense vectors find what a passage MEANS and reliably miss exact
 * tokens — a company number, a filing code, a product name. Lexical search
 * finds those and misses paraphrase. Running both and fusing the ranks returns
 * the right passage in the top few rather than the top forty, and the number
 * of passages you put in front of a model is the bill.
 */
const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

/**
 * The embedding width this database is BUILT for, not a preference.
 *
 * A pgvector column has a fixed dimension. Changing this is a migration plus a
 * re-embed of every stored chunk, so it is read once here rather than threaded
 * through the application as a setting. 384 is bge-small-en-v1.5, which runs
 * in-process at no marginal cost per token — the cheapest part of this system
 * should not be a metered API call.
 */
export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 384);

/* -------------------------------------------------------------------------- */
/* ENUMS                                                                       */
/* -------------------------------------------------------------------------- */

export const sourceKind = pgEnum('source_kind', [
  'web', // an ordinary page someone published
  'search', // arrived via a search engine result
  'filing', // a registry, regulator or statutory disclosure
  'manual', // a human pasted it in
]);

/** Why a document is attached to a subject, so a weak link stays visibly weak. */
export const linkBasis = pgEnum('link_basis', [
  'domain_match', // the URL is on the subject's own domain
  'identifier_match', // a registration number or handle matched exactly
  'name_match', // the subject's name appeared. The weakest, and marked so.
  'human',
]);

export const runStatus = pgEnum('run_status', [
  'queued',
  'retrieving',
  'synthesising',
  'complete',
  'failed',
  'insufficient_evidence', // a real outcome, not an error
]);

/**
 * The eleven canonical diagnostic areas, verbatim.
 *
 * Source: `frontend/src/data/content.js`, export `DIAGNOSTIC_AREAS`, mirrored
 * in the Lab at `src/content/canonical.ts` and re-read from
 * `hi-anzy-website-2.0 @ 0208378` in Phase 8.12C.
 */
export const diagnosticArea = pgEnum('diagnostic_area', [
  'Business',
  'Brand',
  'Customer',
  'Sales',
  'Marketing',
  'Technology',
  'Data',
  'Operations',
  'Automation',
  'Security',
  'Growth',
]);

/** The canonical DIAGNOSTIC_OUTCOMES sequence — what an audit produces, in order. */
export const diagnosticOutcome = pgEnum('diagnostic_outcome', [
  'What is happening',
  'Why it matters',
  'What it is costing you',
  'What should change',
  'What happens first',
  'Who should own it',
  'How success gets measured',
]);

/**
 * How a finding stands relative to its evidence.
 *
 * The surface renders plain prose. This column is what makes that safe: the
 * distinction is kept in the record even when it is not printed, so "the model
 * read this" and "the model inferred this" never become the same row.
 * `unsupported` exists so the pipeline can produce one and refuse to render it.
 */
export const findingBasis = pgEnum('finding_basis', [
  'sourced', // at least one citation states it
  'derived', // inferred across citations; the inference is recorded
  'unsupported', // the model asserted it with nothing behind it. Never rendered.
]);

export const feedbackVerdict = pgEnum('feedback_verdict', [
  'correct',
  'wrong',
  'unsupported', // true or not, the cited passage does not say it
  'unclear',
]);

/* -------------------------------------------------------------------------- */
/* THE CORPUS                                                                  */
/* -------------------------------------------------------------------------- */

export const source = pgTable(
  'source',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: sourceKind('kind').notNull(),
    /** Host, feed URL, or registry name. One row per origin, not per page. */
    origin: text('origin').notNull(),
    label: text('label'),
    /**
     * How much weight this origin's claims carry. A statutory filing and a
     * press release are not the same evidence and must not average together.
     */
    trust: real('trust').notNull().default(0.5),
    robotsAllowed: integer('robots_allowed'),
    robotsCheckedAt: timestamp('robots_checked_at', { withTimezone: true }),
    lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('source_origin_key').on(t.origin)],
);

export const document = pgTable(
  'document',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    /** sha256 of the normalised URL. The uniqueness the URL itself cannot give. */
    urlHash: text('url_hash').notNull(),
    title: text('title'),
    author: text('author'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    httpStatus: integer('http_status'),
    lang: text('lang'),
    /**
     * sha256 of the extracted text. A re-crawl that produces the same hash
     * costs nothing: no re-chunk, no re-embed, no tokens. Most re-crawls do.
     */
    contentHash: text('content_hash'),
    /** Which extractor produced `text`, because they disagree and it matters. */
    extractor: text('extractor'),
    text: text('text'),
    byteLen: integer('byte_len'),
    meta: jsonb('meta'),
  },
  (t) => [
    uniqueIndex('document_url_hash_key').on(t.urlHash),
    index('document_source_idx').on(t.sourceId),
    index('document_fetched_idx').on(t.fetchedAt),
  ],
);

export const chunk = pgTable(
  'chunk',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    /** Position in the document. A citation needs to point somewhere stable. */
    ord: integer('ord').notNull(),
    /** The heading trail above this passage, which is most of what gives it meaning. */
    headingPath: text('heading_path'),
    text: text('text').notNull(),
    tokenLen: integer('token_len'),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    tsv: tsvector('tsv'),
  },
  (t) => [
    uniqueIndex('chunk_doc_ord_key').on(t.documentId, t.ord),
    index('chunk_document_idx').on(t.documentId),
  ],
);

/* -------------------------------------------------------------------------- */
/* THE SUBJECT                                                                 */
/* -------------------------------------------------------------------------- */

export const subject = pgTable(
  'subject',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    /** The primary domain. The strongest disambiguator a business has. */
    domain: text('domain'),
    country: text('country'),
    aliases: jsonb('aliases').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('subject_domain_idx').on(t.domain), index('subject_name_idx').on(t.name)],
);

/**
 * Registration numbers, handles, tickers.
 *
 * Two companies share a name far more often than anyone designing this expects,
 * and an audit attached to the wrong one is worse than no audit. An exact
 * identifier match is the only link this system treats as strong.
 */
export const subjectIdentifier = pgTable(
  'subject_identifier',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subject.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
  },
  (t) => [uniqueIndex('subject_identifier_key').on(t.kind, t.value)],
);

export const subjectDocument = pgTable(
  'subject_document',
  {
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subject.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    basis: linkBasis('basis').notNull(),
    confidence: real('confidence').notNull().default(0.5),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subject_document_key').on(t.subjectId, t.documentId),
    index('subject_document_subject_idx').on(t.subjectId),
  ],
);

/* -------------------------------------------------------------------------- */
/* THE AUDIT                                                                   */
/* -------------------------------------------------------------------------- */

export const auditRun = pgTable(
  'audit_run',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subject.id, { onDelete: 'cascade' }),
    /** What was actually asked, verbatim. Half of every training example. */
    question: text('question').notNull(),
    areas: jsonb('areas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: runStatus('status').notNull().default('queued'),
    model: text('model'),
    retrievalStrategy: text('retrieval_strategy'),
    /** Spend, per run, recorded rather than estimated afterwards. */
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costMicros: integer('cost_micros'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('audit_run_subject_idx').on(t.subjectId), index('audit_run_status_idx').on(t.status)],
);

/**
 * What the retriever chose, and how it scored it.
 *
 * Written on every run whether anyone looks or not. It is the half of a
 * training example that says what the model was given — without it, a finding
 * is an output with no input and teaches nothing.
 */
export const retrieval = pgTable(
  'retrieval',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRun.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id')
      .notNull()
      .references(() => chunk.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    scoreVector: real('score_vector'),
    scoreLexical: real('score_lexical'),
    scoreFused: real('score_fused'),
    /** Did this chunk survive into the prompt, or was it retrieved and dropped. */
    usedInPrompt: integer('used_in_prompt').notNull().default(0),
  },
  (t) => [
    uniqueIndex('retrieval_run_chunk_key').on(t.auditRunId, t.chunkId),
    index('retrieval_run_idx').on(t.auditRunId),
  ],
);

export const finding = pgTable(
  'finding',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: uuid('audit_run_id')
      .notNull()
      .references(() => auditRun.id, { onDelete: 'cascade' }),
    area: diagnosticArea('area').notNull(),
    outcome: diagnosticOutcome('outcome').notNull(),
    /** The conclusion, in plain prose. This is what a reader sees. */
    statement: text('statement').notNull(),
    basis: findingBasis('basis').notNull(),
    /** For a `derived` finding: the inference, named. Never shown, always kept. */
    inference: text('inference'),
    confidence: real('confidence'),
    ord: integer('ord').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('finding_run_idx').on(t.auditRunId), index('finding_area_idx').on(t.area)],
);

/**
 * The passage a finding rests on.
 *
 * The surface prints plain conclusions; this is why that is defensible rather
 * than merely confident. Every rendered sentence can be walked back to a quote,
 * a URL and the moment it was retrieved — and a finding that reaches this table
 * with no row is `unsupported` by definition and does not render.
 */
export const findingCitation = pgTable(
  'finding_citation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => finding.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id').references(() => chunk.id, { onDelete: 'set null' }),
    /** Copied, not referenced: the page changes, the evidence should not. */
    quote: text('quote').notNull(),
    url: text('url').notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('finding_citation_finding_idx').on(t.findingId)],
);

/**
 * Whether it was right. The label.
 *
 * Everything above is produced automatically; this row is the one a person has
 * to make, and it is the only thing that turns an archive of outputs into
 * training data. `unsupported` is separate from `wrong` on purpose — a finding
 * can be true and still not be what the cited passage said, and those two
 * failures need different fixes.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => finding.id, { onDelete: 'cascade' }),
    verdict: feedbackVerdict('verdict').notNull(),
    note: text('note'),
    author: text('author'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('feedback_finding_idx').on(t.findingId)],
);

export const schema = {
  source,
  document,
  chunk,
  subject,
  subjectIdentifier,
  subjectDocument,
  auditRun,
  retrieval,
  finding,
  findingCitation,
  feedback,
};
