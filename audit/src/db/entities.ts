import { sql } from 'drizzle-orm';
import {
  doublePrecision,
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
} from 'drizzle-orm/pg-core';

import { chunk, document } from './schema.ts';

/**
 * SOURCE → OBSERVATION → ENTITY → RELATIONSHIP → EVIDENCE.
 *
 * ── THE FOUR THINGS THIS FILE REFUSES TO CONFLATE ───────────────────────────
 *
 *   SOURCE        a page that was fetched. Already exists: `document`.
 *   OBSERVATION   something a source said, at a moment, by a named method.
 *   ENTITY        a thing in the world that observations are about.
 *   CLAIM         what we currently hold to be true of an entity, and why.
 *
 * Collapsing any two of those produces the same failure in different costumes:
 * an entity row with a `phone` column gets overwritten by whichever crawl ran
 * last, and the fact that two sources disagreed — which is the interesting
 * part — is gone with no trace that it ever existed. So `entity` carries
 * almost no data. It is an identity and a status. Everything else hangs off it
 * as claims, and every claim points back at the observations that support it.
 *
 * ── AND THE ONE RULE THAT SHAPES THE REST ───────────────────────────────────
 *
 * A false merge is worse than a duplicate. Two rows for one cafe is untidy and
 * fixable; one row fusing two different cafes silently attributes one
 * business's phone number, address and reviews to another, and every query
 * downstream inherits it with no way to notice. So resolution is allowed to
 * answer AMBIGUOUS, that answer is stored rather than resolved away, and a
 * merge keeps both originals so it can be undone.
 */

/* -------------------------------------------------------------------------- */
/* ENUMS                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * PERSON is deliberately absent.
 *
 * The brief's instruction was to add it only on a demonstrated product
 * requirement, and none of the commercial queries this layer exists to answer
 * needs one. Creating a named individual because a page contained a name is
 * how an OSINT tool becomes a dossier on private people, which is a different
 * product with different obligations.
 */
export const entityType = pgEnum('entity_type', [
  'ORGANIZATION',
  'BRAND',
  'BUSINESS_LOCATION',
  'PRODUCT',
  'SERVICE',
  'WEBSITE',
  'SOCIAL_PROFILE',
  'MARKETPLACE_PROFILE',
  'CONTACT_POINT',
  'CATEGORY',
  'GEOGRAPHIC_AREA',
]);

export const entityStatus = pgEnum('entity_status', [
  'ACTIVE',
  'MERGED', // superseded by another entity; kept, never deleted
  'RETIRED',
]);

/** The kinds of identifier strong enough to block and match on. */
export const identifierKind = pgEnum('identifier_kind', [
  'domain',
  'phone',
  'email',
  'social',
  'marketplace',
  'registration', // CIN, GSTIN, company number
  'coordinates',
]);

/**
 * How true we hold something to be. The Lab's own vocabulary, unchanged.
 *
 * `UNKNOWN` is a value, never an absence, and is never convertible to false.
 * "We did not observe a cart" and "there is no cart" are different statements
 * and only one of them is supported.
 */
export const claimStatus = pgEnum('claim_status', [
  'SOURCED',
  'MEASURED',
  'FACT',
  'DERIVED',
  'UNKNOWN',
  'RECOMMENDATION',
]);

/**
 * Where a value sits in time.
 *
 * Set only when evidence supports the distinction. A later timestamp does not
 * prove a value is current — a stale page can be re-crawled today and a
 * correct page can be years old — so the default is UNKNOWN and promotion to
 * CURRENT requires more than recency.
 */
export const temporalStatus = pgEnum('temporal_status', [
  'CURRENT',
  'HISTORICAL',
  'CONFLICTING',
  'UNKNOWN',
]);

/**
 * Five answers, not one number.
 *
 * `confidence = 87` cannot be argued with, acted on, or corrected. "PROBABLE
 * SAME: same domain, same phone, name similarity 0.91" can be all three.
 */
export const resolutionDecision = pgEnum('resolution_decision', [
  'SAME_ENTITY',
  'PROBABLE_SAME',
  'AMBIGUOUS',
  'PROBABLE_DIFFERENT',
  'DIFFERENT_ENTITY',
]);

export const relationshipType = pgEnum('relationship_type', [
  'BRAND_OF',
  'OPERATES',
  'LOCATED_AT',
  'HAS_WEBSITE',
  'HAS_SOCIAL_PROFILE',
  'HAS_CONTACT',
  'OFFERS_PRODUCT',
  'OFFERS_SERVICE',
  'SELLS',
  'SUPPLIES',
  'DISTRIBUTES',
  'LISTED_ON',
  'BELONGS_TO_CATEGORY',
  'SERVES_AREA',
  'SAME_AS',
]);

/** What a capability question can honestly answer. */
export const capabilityState = pgEnum('capability_state', [
  'CONFIRMED',
  'PROBABLE',
  'NOT_OBSERVED', // we looked and did not find. NOT the same as absent.
  'UNKNOWN', // we did not look, or could not
]);

export const geocodeStatus = pgEnum('geocode_status', ['NO_PROVIDER', 'UNRESOLVED', 'RESOLVED']);

/* -------------------------------------------------------------------------- */
/* ENTITY                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Identity, and almost nothing else.
 *
 * `canonical_name` is for display and `normalized_name` is for blocking;
 * neither is identity. Names change, domains change, addresses change — the
 * uuid does not, which is the only reason a merge can be undone and a
 * relationship can survive a rename.
 */
export const entity = pgTable(
  'entity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: entityType('type').notNull(),
    /** Best display name seen so far. A convenience, never a key. */
    canonicalName: text('canonical_name').notNull(),
    /** Deterministically normalised. The blocking key for candidate generation. */
    normalizedName: text('normalized_name').notNull(),
    status: entityStatus('status').notNull().default('ACTIVE'),
    /**
     * Set when this entity was merged away. The row REMAINS — following the
     * pointer is how a stale id still resolves, and keeping it is what makes
     * the merge reversible.
     */
    mergedInto: uuid('merged_into'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('entity_normalized_name_idx').on(t.normalizedName),
    index('entity_type_idx').on(t.type),
    index('entity_status_idx').on(t.status),
    index('entity_merged_into_idx').on(t.mergedInto),
  ],
);

/**
 * The strong identifiers, and the blocking index.
 *
 * This table is what makes resolution O(candidates) rather than O(N²): you
 * never compare every entity with every other entity, you look up the ones
 * that share a normalised domain, phone, email or handle and compare only
 * those. `verified` separates "a page mentioned this number" from "this
 * number is declared as the business's own", which is the difference between
 * a strong match and a coincidence.
 */
export const entityIdentifier = pgTable(
  'entity_identifier',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    kind: identifierKind('kind').notNull(),
    /** What is matched on. Deterministic, never a display value. */
    value: text('value').notNull(),
    /** Exactly as the source wrote it. Kept because normalisation loses things. */
    rawValue: text('raw_value'),
    /** Declared as the business's own, rather than merely present on a page. */
    verified: integer('verified').notNull().default(0),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('entity_identifier_key').on(t.entityId, t.kind, t.value),
    /* The blocking lookup. Not unique: two entities CAN share a phone, and
       that is a fact worth holding rather than a constraint violation. */
    index('entity_identifier_lookup_idx').on(t.kind, t.value),
  ],
);

/* -------------------------------------------------------------------------- */
/* OBSERVATION                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Something a source said, once, by a named method.
 *
 * The append-only layer. Nothing here is ever updated to reflect a newer
 * reading: a changed phone number produces a SECOND observation, and the fact
 * that there are now two is exactly the signal that something moved. Deleting
 * or overwriting would destroy the only record that a conflict existed.
 *
 * `entityId` is null until resolution runs. An observation is about the world
 * whether or not we have worked out which entity it concerns.
 */
export const observation = pgTable(
  'observation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    /** Resolved later. Null means "not yet attributed", never "no entity". */
    entityId: uuid('entity_id').references(() => entity.id, { onDelete: 'set null' }),
    field: text('field').notNull(),
    /** Exactly as written. The recoverable evidence. */
    rawValue: text('raw_value').notNull(),
    /** Deterministically normalised. What matching and blocking use. */
    normalizedValue: text('normalized_value'),
    extractionMethod: text('extraction_method').notNull(),
    /**
     * How sure we are the EXTRACTION is right — not that the value is true,
     * and not that it belongs to this entity. Those are separate numbers with
     * separate meanings, kept apart deliberately.
     */
    confidence: real('confidence').notNull().default(0.5),
    /** The passage it came from, so a claim can be walked back to a span. */
    chunkId: uuid('chunk_id').references(() => chunk.id, { onDelete: 'set null' }),
    charStart: integer('char_start'),
    charEnd: integer('char_end'),
    evidence: text('evidence'),
    documentVersion: integer('document_version'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('observation_key').on(t.documentId, t.field, t.rawValue, t.extractionMethod, t.documentVersion),
    index('observation_entity_idx').on(t.entityId),
    index('observation_field_idx').on(t.field),
    index('observation_normalized_idx').on(t.field, t.normalizedValue),
    index('observation_document_idx').on(t.documentId),
  ],
);

/* -------------------------------------------------------------------------- */
/* CLAIM                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What we hold about an entity, per field, per value.
 *
 * One row per (entity, field, VALUE) rather than per (entity, field), which is
 * the whole design. Two sources giving two phone numbers produce two rows,
 * both marked CONFLICTING, and nothing overwrites anything. A schema with one
 * row per field forces a winner at write time, and the losing value — often
 * the correct one — is gone before anybody looks.
 */
export const claim = pgTable(
  'claim',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value'),
    status: claimStatus('status').notNull(),
    temporal: temporalStatus('temporal').notNull().default('UNKNOWN'),
    /** How many distinct sources say this. Corroboration, counted. */
    sourceCount: integer('source_count').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** For DERIVED only: how it was arrived at. Never shown, always kept. */
    derivation: text('derivation'),
  },
  (t) => [
    uniqueIndex('claim_key').on(t.entityId, t.field, t.value),
    index('claim_entity_field_idx').on(t.entityId, t.field),
    index('claim_normalized_idx').on(t.field, t.normalizedValue),
  ],
);

/** Which observations support a claim. The evidence edge of the chain. */
export const claimObservation = pgTable(
  'claim_observation',
  {
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claim.id, { onDelete: 'cascade' }),
    observationId: uuid('observation_id')
      .notNull()
      .references(() => observation.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('claim_observation_key').on(t.claimId, t.observationId),
    index('claim_observation_obs_idx').on(t.observationId),
  ],
);

/* -------------------------------------------------------------------------- */
/* RELATIONSHIP                                                                */
/* -------------------------------------------------------------------------- */

/**
 * An edge, and never one without evidence.
 *
 * The brief's example is the trap: a page reading "Stockist: ABC Traders" is
 * evidence of SOMETHING, and deciding on sight whether it is SELLS, SUPPLIES
 * or DISTRIBUTES is inventing a semantic the page did not state. So the
 * extractor records the observation and proposes the weakest relation the
 * evidence supports; sharpening it is a semantic judgement and belongs to a
 * layer that is allowed to make those.
 */
export const relationship = pgTable(
  'relationship',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fromEntityId: uuid('from_entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    toEntityId: uuid('to_entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    type: relationshipType('type').notNull(),
    status: claimStatus('status').notNull().default('SOURCED'),
    temporal: temporalStatus('temporal').notNull().default('UNKNOWN'),
    sourceCount: integer('source_count').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('relationship_key').on(t.fromEntityId, t.toEntityId, t.type),
    index('relationship_from_idx').on(t.fromEntityId, t.type),
    index('relationship_to_idx').on(t.toEntityId, t.type),
  ],
);

export const relationshipEvidence = pgTable(
  'relationship_evidence',
  {
    relationshipId: uuid('relationship_id')
      .notNull()
      .references(() => relationship.id, { onDelete: 'cascade' }),
    observationId: uuid('observation_id')
      .notNull()
      .references(() => observation.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('relationship_evidence_key').on(t.relationshipId, t.observationId),
    index('relationship_evidence_obs_idx').on(t.observationId),
  ],
);

/* -------------------------------------------------------------------------- */
/* RESOLUTION                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every resolution judgement, including the refusals.
 *
 * AMBIGUOUS rows are the most valuable thing in this table: they are the cases
 * the rules could not settle, which is exactly the set a human should look at
 * and exactly the set worth learning from later. Discarding them — resolving
 * the ambiguity by picking — would throw away both.
 *
 * `features` is the input the decision was made on, stored verbatim, so a rule
 * change can be replayed against historical decisions rather than guessed at.
 */
export const resolutionJudgement = pgTable(
  'resolution_judgement',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityAId: uuid('entity_a_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    entityBId: uuid('entity_b_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    decision: resolutionDecision('decision').notNull(),
    /** Which pass and rule fired, in words a person can check. */
    rule: text('rule').notNull(),
    ruleVersion: text('rule_version').notNull(),
    /** Why, as a sentence. Never a bare number. */
    reason: text('reason').notNull(),
    /** The comparison inputs: shared identifiers, similarities, conflicts. */
    features: jsonb('features').notNull().default(sql`'{}'::jsonb`),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    /** Supervision, when a human looks. The label for a future dataset. */
    humanVerdict: resolutionDecision('human_verdict'),
    humanNote: text('human_note'),
    humanAt: timestamp('human_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('resolution_judgement_pair_key').on(t.entityAId, t.entityBId),
    index('resolution_judgement_decision_idx').on(t.decision),
    index('resolution_judgement_a_idx').on(t.entityAId),
    index('resolution_judgement_b_idx').on(t.entityBId),
  ],
);

/**
 * A merge, recorded so it can be undone.
 *
 * Nothing is deleted by a merge. The merged entity keeps its row, its status
 * becomes MERGED and `merged_into` points at the survivor; its identifiers,
 * observations and claims are re-pointed and the move is recorded here. That
 * is what makes `undoMerge` a matter of reading this table rather than
 * reconstructing something from a log that was never written.
 */
export const entityMerge = pgTable(
  'entity_merge',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    survivingId: uuid('surviving_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    mergedId: uuid('merged_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    rule: text('rule').notNull(),
    ruleVersion: text('rule_version').notNull(),
    judgementId: uuid('judgement_id').references(() => resolutionJudgement.id, { onDelete: 'set null' }),
    /** Exactly what moved, so undo puts it back where it was. */
    moved: jsonb('moved').notNull().default(sql`'{}'::jsonb`),
    mergedAt: timestamp('merged_at', { withTimezone: true }).notNull().defaultNow(),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
  },
  (t) => [
    index('entity_merge_surviving_idx').on(t.survivingId),
    index('entity_merge_merged_idx').on(t.mergedId),
  ],
);

/* -------------------------------------------------------------------------- */
/* CATEGORY                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A controlled vocabulary, with the source value preserved.
 *
 * Uncontrolled categories are the failure this prevents: "Cafe", "Café",
 * "Coffee Shop", "coffee-shop" and "Coffee shop " become five categories, and
 * "find cafes near X" then returns a fifth of the cafes. Aliases map to one
 * canonical row, and `entity_category.sourceValue` keeps what the page
 * actually said, because the mapping is our decision and not the publisher's.
 */
export const category = pgTable(
  'category',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    parentId: uuid('parent_id'),
  },
  (t) => [uniqueIndex('category_slug_key').on(t.slug)],
);

export const categoryAlias = pgTable(
  'category_alias',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
    /** Normalised form of the alias. What lookups match against. */
    alias: text('alias').notNull(),
    /** Where the mapping came from: 'seed', 'human', or a source id. */
    provenance: text('provenance').notNull(),
  },
  (t) => [uniqueIndex('category_alias_key').on(t.alias)],
);

export const entityCategory = pgTable(
  'entity_category',
  {
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
    /** Exactly what the source called it, before mapping. */
    sourceValue: text('source_value').notNull(),
    status: claimStatus('status').notNull().default('SOURCED'),
    observationId: uuid('observation_id').references(() => observation.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('entity_category_key').on(t.entityId, t.categoryId, t.sourceValue),
    index('entity_category_category_idx').on(t.categoryId),
  ],
);

/* -------------------------------------------------------------------------- */
/* LOCATION                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Where something is, with coordinates optional and never invented.
 *
 * `geocodeStatus` distinguishes three states that a nullable latitude cannot:
 * no geocoding provider is configured, a provider was asked and could not
 * resolve it, or it resolved. Nothing here guesses coordinates from a postal
 * code or a city name — an approximate point that renders on a map is
 * indistinguishable from a real one, and "near this address" becomes a
 * confident wrong answer.
 *
 * No country is assumed anywhere. `country` is a field, not a default.
 */
export const entityLocation = pgTable(
  'entity_location',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    addressRaw: text('address_raw'),
    addressNormalized: text('address_normalized'),
    locality: text('locality'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    geocode: geocodeStatus('geocode').notNull().default('NO_PROVIDER'),
    geocodeProvider: text('geocode_provider'),
    /**
     * A coarse grid cell, for blocking a nearby search before any distance is
     * computed. Without it, "find cafes within 2km" reads every located
     * entity in the table.
     */
    geoCell: text('geo_cell'),
    observationId: uuid('observation_id').references(() => observation.id, { onDelete: 'set null' }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('entity_location_entity_idx').on(t.entityId),
    index('entity_location_cell_idx').on(t.geoCell),
    index('entity_location_postal_idx').on(t.postalCode),
    index('entity_location_city_idx').on(t.city),
  ],
);

/* -------------------------------------------------------------------------- */
/* CAPABILITY                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One piece of evidence that an entity can do something.
 *
 * Capability is computed from these rows rather than stored as a boolean,
 * which is the only way `NOT_OBSERVED` can stay distinct from `false`. A
 * business with no cart evidence has not been shown to lack ecommerce — it has
 * been shown that we did not find a cart, which is a statement about the crawl
 * at least as much as about the business.
 */
export const capabilitySignal = pgTable(
  'capability_signal',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    /** 'ecommerce' | 'website' | 'social' | 'marketplace' | 'phone' | 'email' */
    capability: text('capability').notNull(),
    /** 'cart' | 'checkout' | 'shopify' | 'woocommerce' | 'offer_jsonld' | ... */
    signal: text('signal').notNull(),
    /** How much this one signal is worth. Summed, never averaged. */
    weight: real('weight').notNull().default(1),
    observationId: uuid('observation_id').references(() => observation.id, { onDelete: 'set null' }),
    documentId: uuid('document_id').references(() => document.id, { onDelete: 'cascade' }),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('capability_signal_key').on(t.entityId, t.capability, t.signal, t.documentId),
    index('capability_signal_entity_idx').on(t.entityId, t.capability),
  ],
);

/**
 * Which capabilities were LOOKED FOR on a document, whatever was found.
 *
 * This is what turns silence into `NOT_OBSERVED` rather than `UNKNOWN`. A
 * crawled page that was checked for cart markers and had none is a different
 * state from a page that was never checked, and without this row the two are
 * identical in the database.
 */
export const capabilityProbe = pgTable(
  'capability_probe',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    capability: text('capability').notNull(),
    documentId: uuid('document_id').references(() => document.id, { onDelete: 'cascade' }),
    probedAt: timestamp('probed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('capability_probe_key').on(t.entityId, t.capability, t.documentId),
    index('capability_probe_entity_idx').on(t.entityId, t.capability),
  ],
);

export const entitySchema = {
  entity,
  entityIdentifier,
  observation,
  claim,
  claimObservation,
  relationship,
  relationshipEvidence,
  resolutionJudgement,
  entityMerge,
  category,
  categoryAlias,
  entityCategory,
  entityLocation,
  capabilitySignal,
  capabilityProbe,
};
