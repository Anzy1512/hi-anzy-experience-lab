import { z } from 'zod';

import { IntelligenceRequestSchema, type IntelligenceRequest } from '../intel/contract.ts';

/**
 * A BOUNDED COMMERCIAL PILOT, AS DATA.
 *
 * ── WHY THIS IS A SCHEMA AND NOT A SCRIPT ───────────────────────────────────
 *
 * The obvious way to run a real pilot is a file with the area in it, a list of
 * the businesses, and the question hardcoded above them. It would work once.
 * It would also mean that every answer the system produced was partly written
 * by whoever chose the list, and nothing downstream could tell which part —
 * the findings would be about real businesses, sourced from real pages, and
 * quietly conditioned on a selection nobody recorded.
 *
 * So the pilot is a value. Where to look, what kind of business, what has to be
 * true of a result, and what it may spend. It is validated once, stored
 * verbatim, and every subject in the run traces back to a rule in it rather
 * than to a decision in a file.
 *
 * ── THE BUDGETS ARE THE PRODUCT ─────────────────────────────────────────────
 *
 * `maxSubjects`, `maxSources`, `maxSeconds`, `maxCostMicros` are not
 * safety rails bolted on afterwards; they are what makes this runnable against
 * the open web at all. A research system without them is a system that will one
 * day crawl four thousand pages of somebody's shop because a sitemap was large.
 * They live in the spec, where a caller can see them, for the same reason
 * layer 4 put budgets in the request rather than in configuration.
 *
 * ── AND ONE KNOB THAT IS SMALLER THAN IT LOOKS ──────────────────────────────
 *
 * `maxCrawlDepth` stops at 1, and that is a statement about what exists rather
 * than caution. This service has no link-following crawler — deliberately, since
 * following links is how a polite crawler becomes an impolite one without anyone
 * deciding to. Depth 0 reads the page a provider pointed at. Depth 1 also reads
 * what the site itself published in its sitemap, which for the questions this
 * product asks is the better set anyway: a shop lists its product pages there.
 * Accepting a 3 and silently treating it as a 1 would be the dishonest option.
 */

export const PilotAreaSchema = z.object({
  /** A human name for the area. Recorded, never resolved into coordinates. */
  label: z.string().min(1).max(160).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().positive().max(50),
});
export type PilotArea = z.infer<typeof PilotAreaSchema>;

export const PilotBudgetSchema = z.object({
  /** How many businesses this pilot may take on. */
  maxSubjects: z.number().int().min(1).max(100).default(10),
  /** How many pages it may fetch in total, across every subject. */
  maxSources: z.number().int().min(1).max(500).default(40),
  /** 0 = the discovered page only. 1 = that, plus the site's own sitemap. */
  maxCrawlDepth: z.number().int().min(0).max(1).default(1),
  /** Provider queries — geographic discovery and web search together. */
  maxSearches: z.number().int().min(0).max(100).default(20),
  maxSeconds: z.number().int().min(10).max(3600).default(600),
  maxModelCalls: z.number().int().min(0).max(50).default(0),
  maxTokens: z.number().int().min(0).max(500_000).default(20_000),
  maxCostMicros: z.number().int().min(0).default(0),
});
export type PilotBudget = z.infer<typeof PilotBudgetSchema>;

export const PilotSpecSchema = z.object({
  name: z.string().min(1).max(120),
  /** The commercial question, in the caller's own words. Half of an example. */
  question: z.string().min(3).max(2000),
  projectId: z.string().max(80).optional(),

  area: PilotAreaSchema,

  /**
   * What kind of business, issued to the geographic provider as written.
   *
   * Not mapped through a taxonomy of ours. A provider knows its own vocabulary
   * and a translation layer here would be a second place where "brewery" is
   * defined, disagreeing with the first as soon as either changes.
   */
  categories: z.array(z.string().min(2).max(60)).min(1).max(8),
  /** A product or service term, matched against what the business publishes. */
  keywords: z.array(z.string().min(2).max(60)).max(10).default([]),
  businessType: z.string().max(60).optional(),

  /**
   * The observable characteristics a subject must show.
   *
   * `lacks` means NOT_OBSERVED — we looked and did not find it — and never
   * "does not have". The contract has refused to let a caller ask for absence
   * since layer 4 and this is the same refusal, one level up.
   */
  requires: z
    .object({
      has: z.array(z.string().max(40)).max(10).default([]),
      lacks: z.array(z.string().max(40)).max(10).default([]),
      minSources: z.number().int().min(0).max(10).default(0),
      maxAgeDays: z.number().int().positive().max(3650).optional(),
    })
    .default({ has: [], lacks: [], minSources: 0 }),

  /**
   * URLs the caller already has.
   *
   * Present so a pilot can run with no geographic provider at all — the same
   * reason `DirectProvider` exists. A pilot with seeds and no provider is a
   * narrower pilot, not a broken one, and it says so in its own report.
   */
  seeds: z.array(z.string().url()).max(100).default([]),

  /** Two letters, for phone normalisation. No default: assuming one is a bug. */
  country: z.string().length(2).optional(),

  budget: PilotBudgetSchema.default(PilotBudgetSchema.parse({})),
});
export type PilotSpec = z.infer<typeof PilotSpecSchema>;

export function parsePilotSpec(input: unknown): PilotSpec {
  return PilotSpecSchema.parse(input);
}

/**
 * The pilot, as the question layer 4 already knows how to answer.
 *
 * One conversion, in one place, so there is exactly one definition of a
 * research request in this service. A pilot adds where to look and what to
 * fetch; it does not add a second way of asking a question, because two
 * request shapes is how two planners, two verifiers and two sets of budget
 * arithmetic eventually appear.
 *
 * `maxSearches` and `maxPages` are deliberately spent BEFORE this point, by
 * discovery and acquisition, so what reaches the job is what is left. A job
 * handed the original numbers would be authorised to spend the pilot's whole
 * allowance a second time.
 */
export function toRequest(spec: PilotSpec, spent: { searches: number; pages: number } = { searches: 0, pages: 0 }): IntelligenceRequest {
  return IntelligenceRequestSchema.parse({
    question: spec.question,
    geography: {
      ...(spec.area.label !== undefined ? { place: spec.area.label } : {}),
      latitude: spec.area.latitude,
      longitude: spec.area.longitude,
      radiusKm: spec.area.radiusKm,
    },
    categories: spec.categories,
    requiredFields: spec.keywords,
    evidencePolicy: spec.requires,
    maxResults: spec.budget.maxSubjects,
    maxModelCalls: spec.budget.maxModelCalls,
    maxTokens: spec.budget.maxTokens,
    maxSearches: Math.max(0, spec.budget.maxSearches - spent.searches),
    maxPages: Math.max(0, spec.budget.maxSources - spent.pages),
    maxCostMicros: spec.budget.maxCostMicros,
    maxSeconds: spec.budget.maxSeconds,
    ...(spec.country !== undefined ? { country: spec.country } : {}),
    ...(spec.projectId !== undefined ? { projectId: spec.projectId } : {}),
  });
}
