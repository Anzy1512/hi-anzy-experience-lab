import { z } from 'zod';

/**
 * ONE CANONICAL SHAPE FOR "WHAT IS BEING ASKED".
 *
 * Natural language and structured filters compile to the same object. That is
 * not tidiness: it means the query builder, the API and any future agent all
 * hand the engine the same thing, and there is exactly one place where a
 * request is validated rather than one per entry point.
 *
 * ── WHAT IS DELIBERATELY IN HERE ────────────────────────────────────────────
 *
 * Budgets. `maxCost`, `maxModelCalls`, `maxSearches`, `maxPages` and
 * `maxTokens` are part of the REQUEST, not of some configuration a caller
 * cannot see. A research engine whose spend is set elsewhere is one that will
 * surprise somebody, and "it stopped because it hit the budget you set" is a
 * far better answer than a bill.
 *
 * ── AND WHAT IS NOT ─────────────────────────────────────────────────────────
 *
 * No model name, no provider, no retrieval strategy, no chunk counts. Those
 * are how the engine answers, and a caller who can set them is a caller who
 * can make the engine expensive without meaning to.
 */

/** Where a question is being asked about. No country is assumed anywhere. */
export const GeographySchema = z.object({
  /** Free text, resolved against known entity locations. Never geocoded blind. */
  place: z.string().min(1).max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().max(500).optional(),
  city: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(60).optional(),
  /** [[lat, lon], ...]. Supported by the contract; not yet by the engine. */
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
});
export type Geography = z.infer<typeof GeographySchema>;

/**
 * What must be true of a result, expressed as capability states.
 *
 * `lacks: ['ecommerce']` means NOT_OBSERVED, never "does not have". The engine
 * cannot establish absence and the contract must not let a caller ask it to.
 */
export const EvidencePolicySchema = z.object({
  /** Capabilities that must be CONFIRMED or PROBABLE. */
  has: z.array(z.string().max(40)).max(10).default([]),
  /** Capabilities that must be NOT_OBSERVED. UNKNOWN does not qualify. */
  lacks: z.array(z.string().max(40)).max(10).default([]),
  /** Refuse to report a finding resting on fewer than this many sources. */
  minSources: z.number().int().min(0).max(10).default(0),
  /** Evidence older than this is reported as stale rather than treated as false. */
  maxAgeDays: z.number().int().positive().max(3650).optional(),
});
export type EvidencePolicy = z.infer<typeof EvidencePolicySchema>;

export const IntelligenceRequestSchema = z.object({
  /** The question as a person asked it. Kept verbatim; it is half of a training example. */
  question: z.string().min(3).max(2000),
  /** Set by the caller when known; otherwise classified deterministically. */
  intent: z.string().max(40).optional(),
  /** Narrow to one already-known business. */
  entityId: z.string().uuid().optional(),
  entityName: z.string().max(200).optional(),
  domain: z.string().max(253).optional(),

  geography: GeographySchema.optional(),
  categories: z.array(z.string().max(60)).max(20).default([]),
  exclusions: z.array(z.string().max(60)).max(20).default([]),
  /** Fields the answer must carry. Absent ones come back UNKNOWN, not omitted. */
  requiredFields: z.array(z.string().max(40)).max(20).default([]),
  evidencePolicy: EvidencePolicySchema.default({ has: [], lacks: [], minSources: 0 }),

  /* ---- budgets, which belong to the caller ---------------------------- */
  maxResults: z.number().int().min(1).max(200).default(25),
  maxModelCalls: z.number().int().min(0).max(50).default(0),
  maxTokens: z.number().int().min(0).max(500_000).default(20_000),
  maxSearches: z.number().int().min(0).max(100).default(0),
  maxPages: z.number().int().min(0).max(200).default(0),
  maxCostMicros: z.number().int().min(0).default(0),
  maxSeconds: z.number().int().min(1).max(3600).default(120),

  /** A hint for phone normalisation. No default: assuming a country is a bug. */
  country: z.string().length(2).optional(),
  projectId: z.string().max(80).optional(),
});
export type IntelligenceRequest = z.infer<typeof IntelligenceRequestSchema>;

/* -------------------------------------------------------------------------- */
/* THE PLAN                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Where an answer can come from, cheapest first.
 *
 * The ordering is the architecture. `RELATIONAL` is a SELECT; `MODEL` is a
 * paid call with no citation of its own. A planner that reaches for the last
 * one when the first would do is the single most expensive mistake this system
 * can make, and it is invisible in the output — the prose reads the same.
 */
export type EvidenceSource =
  | 'RELATIONAL' /* a SQL filter over entities, claims, capabilities */
  | 'GRAPH' /* relationships between entities */
  | 'LEXICAL' /* the full-text index over crawled passages */
  | 'VECTOR' /* the dense index */
  | 'CRAWLED' /* documents already fetched, re-read */
  | 'FRESH_SEARCH' /* a provider query and new crawls. Costs time and goodwill */
  | 'RULES' /* the deterministic audit rules */
  | 'MODEL'; /* synthesis. The only one that cannot cite itself */

export type ModelClass = 'NO_MODEL' | 'SMALL_MODEL' | 'REASONING_MODEL';

export interface PlanStep {
  id: string;
  /** What this step is for, in words a person can check against the result. */
  description: string;
  source: EvidenceSource;
  modelClass: ModelClass;
  /** Step ids that must finish first. The DAG layer 5 will execute. */
  dependsOn: string[];
  /** Why this source rather than a cheaper one. Required for MODEL steps. */
  rationale: string;
  /** Set when the planner decided this step is unnecessary for this request. */
  skipped?: { reason: string };
}

export interface ResearchPlan {
  intent: string;
  /** Machine-readable, ordered, and stored. Never only narrated in prose. */
  steps: PlanStep[];
  /** True when the whole plan can run without a model. */
  deterministicOnly: boolean;
  /** What the planner could not decide, if anything. */
  openQuestions: string[];
}

/* -------------------------------------------------------------------------- */
/* THE ANSWER                                                                  */
/* -------------------------------------------------------------------------- */

export interface CostAccount {
  modelCalls: number;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  searches: number;
  pagesCrawled: number;
  /** Evidence items considered, and how many survived selection. */
  evidenceConsidered: number;
  evidenceUsed: number;
  durationMs: number;
}

/** Why a run stopped. `COMPLETE` is one of several honest endings. */
export type Termination =
  | 'COMPLETE'
  | 'BUDGET_EXHAUSTED'
  | 'SATURATED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'PROVIDER_UNAVAILABLE'
  | 'FAILED';

export interface Coverage {
  entitiesConsidered: number;
  entitiesReturned: number;
  sourcesChecked: number;
  /** Never a percentage. Nobody knows the denominator. */
  verdict: 'NONE' | 'PARTIAL' | 'CORROBORATED';
  unresolvedFields: string[];
}

export const DEFAULT_REQUEST: Partial<IntelligenceRequest> = {
  categories: [],
  exclusions: [],
  requiredFields: [],
  maxResults: 25,
  maxModelCalls: 0,
  maxTokens: 20_000,
  maxSearches: 0,
  maxPages: 0,
  maxCostMicros: 0,
  maxSeconds: 120,
};

export function parseRequest(input: unknown): IntelligenceRequest {
  return IntelligenceRequestSchema.parse(input);
}
