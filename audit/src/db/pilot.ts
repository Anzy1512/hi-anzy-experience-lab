import { index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { entity, placePrecision, placeProviderId } from './entities.ts';
import { job } from './jobs.ts';

/**
 * LAYER 7: A BOUNDED PILOT, WHERE ITS SUBJECTS CAME FROM, AND WHAT A HUMAN SAID.
 *
 * ── THREE THINGS THAT HAD NO HOME ───────────────────────────────────────────
 *
 * A pilot's CONFIGURATION. Layers 4 to 6 could answer a question and run a job,
 * but the question arrived as an object in a request body and vanished with the
 * response. A commercial pilot is defined by its bounds — this area, this
 * category, at most this many subjects, at most this much money — and a bound
 * that is not stored cannot be audited afterwards, reproduced, or resumed.
 *
 * A place provider's OBSERVATIONS. Geography arrives from a third party that
 * says where things are and guesses which website belongs to them. Both are
 * claims by a stranger, and mixing them into `claim` — the table for what a
 * business says about itself — would make a mapper's typo indistinguishable
 * from a company's own statement, with a perfectly good citation attached.
 *
 * A LIVE model call. `model_call` records every call the engine attempts,
 * including the scripted ones a test makes, so it cannot answer "has a paid
 * model ever actually answered in this deployment" — which is the one thing
 * layer 6 closed unable to say.
 *
 * ── AND THE ONE PATTERN ALL THREE FOLLOW ────────────────────────────────────
 *
 * Record what was rejected, and why. `evidence_selection` already does this for
 * evidence, and it is the single most useful table in the corpus when something
 * looks wrong — because the interesting question is never "what did it use", it
 * is "what did it throw away and was that right". So `place_observation` keeps
 * every candidate a provider returned including the ones that became nothing,
 * with the reason in a column rather than in a log.
 */

/* -------------------------------------------------------------------------- */
/* VOCABULARY                                                                  */
/* -------------------------------------------------------------------------- */

export const pilotState = pgEnum('pilot_state', [
  'DRAFT',
  'DISCOVERING',
  'RESEARCHING',
  'COMPLETE',
  'PARTIAL',
  /**
   * The pilot could not start because something it needs is not configured or
   * not answering. Distinct from FAILED: nothing went wrong, something was
   * absent, and the difference decides whether a person fixes code or sets a
   * variable.
   */
  'BLOCKED',
  'FAILED',
]);

/**
 * Why a discovered place did or did not become a subject.
 *
 * `OUT_OF_RADIUS` exists because a bounding box is not a circle and something
 * has to say so. `NO_WEBSITE` is not a judgement about the business — plenty of
 * real shops have no site — it is a statement that this pilot had nothing to
 * crawl, which is a limitation of the pilot and is reported as one.
 */
export const placeUse = pgEnum('place_use', [
  'SUBJECT',
  'OUT_OF_RADIUS',
  'NO_WEBSITE',
  /** A different provider record pointing at a site already taken as a subject. */
  'DUPLICATE_SITE',
  /** A land-use polygon or an administrative area, not a trading business. */
  'NOT_A_BUSINESS',
  /** Real, relevant, and beyond the subject cap the caller set. */
  'OVER_BUDGET',
]);

/* -------------------------------------------------------------------------- */
/* THE PILOT                                                                   */
/* -------------------------------------------------------------------------- */

export const pilot = pgTable(
  'pilot',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    /**
     * The whole bounded specification, verbatim, as the caller sent it.
     *
     * Stored rather than decomposed into columns because it is validated by one
     * zod schema at one entry point, and splitting it across eighteen columns
     * would create a second definition of what a pilot is that could disagree
     * with the first. Anything queried is projected out below.
     */
    spec: jsonb('spec').notNull(),
    state: pilotState('state').notNull().default('DRAFT'),
    /** Why, when the state is BLOCKED or FAILED. Words, not a code. */
    detail: text('detail'),
    projectId: text('project_id'),
    /** The research job this pilot's subjects were handed to. */
    jobId: uuid('job_id').references(() => job.id, { onDelete: 'set null' }),
    /** Which provider found the subjects, recorded even when it was none. */
    placeProvider: placeProviderId('place_provider'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('pilot_project_idx').on(t.projectId), index('pilot_job_idx').on(t.jobId)],
);

/**
 * One place a provider reported, kept whether or not it was used.
 *
 * `website_candidate` is the field to be careful with. It is what somebody
 * typed into a map database, it is the only reason most of these rows are
 * actionable, and it has no standing whatsoever until the crawler has fetched
 * it and the entity pipeline has decided — on the page's own evidence — which
 * business is on the other end. `entity_id` is null until that happens, and
 * staying null is a normal outcome.
 */
export const placeObservation = pgTable(
  'place_observation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pilotId: uuid('pilot_id').references(() => pilot.id, { onDelete: 'cascade' }),
    provider: placeProviderId('provider').notNull(),
    /** The provider's own id, so a re-run can be compared with this one. */
    externalId: text('external_id').notNull(),
    /** The term as issued to the provider, which is not always the caller's. */
    query: text('query').notNull(),
    name: text('name'),
    /** The provider's classification, in the provider's own words. */
    category: text('category'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    precision: placePrecision('precision').notNull().default('UNKNOWN'),
    /** Kilometres from the centre the caller asked about. Measured, not claimed. */
    distanceKm: real('distance_km'),
    websiteCandidate: text('website_candidate'),
    address: text('address'),
    /** Only ever a number the provider itself called a confidence. */
    confidence: real('confidence'),
    use: placeUse('use').notNull(),
    /** Set only once the ordinary pipeline resolved a business from the page. */
    entityId: uuid('entity_id').references(() => entity.id, { onDelete: 'set null' }),
    raw: jsonb('raw'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('place_observation_pilot_idx').on(t.pilotId),
    index('place_observation_entity_idx').on(t.entityId),
    index('place_observation_external_idx').on(t.provider, t.externalId),
  ],
);

/**
 * A model call this deployment actually made against a live provider.
 *
 * `model_call` already records every call the engine attempts, including the
 * scripted and echo ones the tests make. This table records only the ones that
 * left the process and cost money, because the question "has a live model ever
 * answered here" is a different question from "how many calls were made", and
 * layer 6 closed unable to answer the first.
 */
export const liveModelCall = pgTable(
  'live_model_call',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    purpose: text('purpose').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    /** Null when no price table is configured. Never zero to mean unknown. */
    costMicros: integer('cost_micros'),
    latencyMs: integer('latency_ms'),
    ok: integer('ok').notNull(),
    detail: text('detail'),
    calledAt: timestamp('called_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('live_model_call_at_idx').on(t.calledAt)],
);

export const pilotSchema = { pilot, placeObservation, liveModelCall };
