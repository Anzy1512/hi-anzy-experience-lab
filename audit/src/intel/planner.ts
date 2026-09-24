import type { EvidenceSource, IntelligenceRequest, ModelClass, PlanStep, ResearchPlan } from './contract.ts';
import { classifyIntent, type IntentKind, type IntentResult } from './intent.ts';

/**
 * DECIDING HOW TO ANSWER, BEFORE SPENDING ANYTHING ON ANSWERING.
 *
 * ── THE RULE THE WHOLE LAYER EXISTS TO ENFORCE ──────────────────────────────
 *
 * A database query beats a search beats a crawl beats a model. Not as a style
 * preference: a SELECT over resolved entities is exact, instant, free and
 * already carries its own provenance, and a model call is none of those. The
 * planner's job is to reach the last one only when the first four cannot
 * produce the answer, and to say in writing why.
 *
 * Every `MODEL` step therefore carries a `rationale`, and the plan is stored on
 * the run. "Which questions actually needed a model" is answerable afterwards
 * by reading rows rather than by trusting that this was done properly.
 *
 * ── AND WHY THE PLAN IS DATA ────────────────────────────────────────────────
 *
 * It is a list of steps with dependencies — a DAG that layer 5 will execute
 * across agents, and that layer 4 walks in order. Building it as prose the
 * engine then "follows" would mean the plan and the execution could disagree
 * with nobody noticing. Here they cannot: the executor consumes this object.
 */

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(counter = (counter + 1) % 100000).toString(36)}`;

interface Draft {
  description: string;
  source: EvidenceSource;
  modelClass?: ModelClass;
  dependsOn?: string[];
  rationale: string;
}

/** What each intent needs, cheapest first. `MODEL` appears only where stated. */
const RECIPES: Record<IntentKind, (r: IntelligenceRequest) => Draft[]> = {
  ENTITY_LOOKUP: () => [
    { description: 'Resolve the subject against known entities', source: 'RELATIONAL', rationale: 'Identity is already resolved in the store; re-deriving it would risk a different answer.' },
    { description: 'Read stored claims, identifiers and capability states', source: 'RELATIONAL', rationale: 'Every field asked for is a column or a claim row.' },
    { description: 'Attach the evidence chain for each claim', source: 'RELATIONAL', rationale: 'Provenance is stored with the claim; no retrieval needed.' },
  ],
  ENTITY_DISCOVERY: () => [
    { description: 'Look for matching entities already known', source: 'RELATIONAL', rationale: 'Anything already resolved is free to return and carries evidence.' },
    { description: 'Search the indexed passages for unresolved mentions', source: 'LEXICAL', rationale: 'Businesses named on crawled pages may not have been promoted to entities yet.' },
    { description: 'Discover new candidates through a search provider', source: 'FRESH_SEARCH', rationale: 'Only if the store cannot satisfy the requested count.' },
  ],
  LOCAL_DISCOVERY: () => [
    { description: 'Resolve the place to a coordinate or a stored location', source: 'RELATIONAL', rationale: 'Geocoding is never guessed; an unresolvable place is reported as such.' },
    { description: 'Select entities within the radius by geo cell', source: 'RELATIONAL', rationale: 'Blocked by cell then filtered by haversine — an index scan, not a model.' },
    { description: 'Apply the capability and category filters', source: 'RELATIONAL', rationale: 'Capability state is a stored column with a probe behind it.' },
  ],
  CATEGORY_DISCOVERY: () => [
    { description: 'Resolve the requested categories and their aliases', source: 'RELATIONAL', rationale: 'The category system exists precisely so this is a join.' },
    { description: 'Select entities in those categories', source: 'RELATIONAL', rationale: 'A filter over entity_category.' },
    { description: 'Find unresolved candidates in indexed text', source: 'LEXICAL', rationale: 'Coverage beyond what has been promoted to entities.' },
  ],
  SUPPLIER_DISCOVERY: () => [
    { description: 'Follow SUPPLIES / SUPPLIED_BY edges from the subject', source: 'GRAPH', rationale: 'Supplier relationships are stored edges with evidence attached.' },
    { description: 'Search indexed passages for supplier language about the subject', source: 'LEXICAL', rationale: 'Stockist and supplier pages state the relationship in text before it becomes an edge.' },
    { description: 'Discover supplier pages through a search provider', source: 'FRESH_SEARCH', rationale: 'Only when the graph and the index are both thin.' },
  ],
  RETAILER_DISCOVERY: () => [
    { description: 'Follow SELLS / STOCKED_BY edges from the subject', source: 'GRAPH', rationale: 'Retail relationships are stored edges.' },
    { description: 'Search indexed passages for stockist lists naming the subject', source: 'LEXICAL', rationale: 'A stockist list is the canonical source for this question.' },
    { description: 'Discover stockist pages through a search provider', source: 'FRESH_SEARCH', rationale: 'Only when nothing is indexed.' },
  ],
  COMPETITOR_DISCOVERY: () => [
    { description: "Read the subject's categories and location", source: 'RELATIONAL', rationale: 'A competitor set is defined by category and geography, both stored.' },
    { description: 'Select entities sharing category and proximity', source: 'RELATIONAL', rationale: 'The same filter as local discovery, anchored on the subject.' },
    {
      description: 'Judge which of those are genuinely comparable',
      source: 'MODEL',
      modelClass: 'SMALL_MODEL',
      rationale:
        'Category overlap is necessary but not sufficient — a hotel and a hostel share a category ' +
        'and are not always competitors. The model ranks candidates the store has already produced; ' +
        'it never introduces a business the store did not.',
    },
  ],
  DIGITAL_PRESENCE_AUDIT: () => [
    { description: 'Read capability probes and their outcomes', source: 'RELATIONAL', rationale: 'CONFIRMED / PROBABLE / NOT_OBSERVED / UNKNOWN is stored per capability.' },
    { description: 'Run the presence rules over those states', source: 'RULES', rationale: 'The findings are deterministic given the probe results.' },
  ],
  ECOMMERCE_AUDIT: () => [
    { description: 'Read ecommerce capability signals and probes', source: 'RELATIONAL', rationale: 'Platform markers, cart paths and product markup are recorded at crawl time.' },
    { description: 'Run the ecommerce rules', source: 'RULES', rationale: 'Deterministic given the signals.' },
  ],
  BUSINESS_AUDIT: () => [
    { description: 'Read every stored claim, capability and relationship for the subject', source: 'RELATIONAL', rationale: 'The audit is over what is known, and what is known is stored.' },
    { description: 'Run the full rule set', source: 'RULES', rationale: 'Every mechanical finding comes from here, with a rule id and version.' },
    { description: 'Re-read the crawled pages behind weak areas', source: 'CRAWLED', rationale: 'Only where a rule fired UNKNOWN and a stored page may settle it.' },
    {
      description: 'Write the narrative over the rule output',
      source: 'MODEL',
      modelClass: 'REASONING_MODEL',
      rationale:
        'The findings themselves are produced by rules and already carry citations. The model is ' +
        'asked only to order them and say what they amount to — it is given the findings, not the ' +
        'evidence, so it has nothing to add facts from.',
    },
  ],
  MARKET_MAPPING: () => [
    { description: 'Select the entity set by category and geography', source: 'RELATIONAL', rationale: 'The map is a query result before it is a narrative.' },
    { description: 'Read capability distribution across the set', source: 'RELATIONAL', rationale: 'Counting states is arithmetic.' },
    { description: 'Run the coverage and concentration rules', source: 'RULES', rationale: 'Deterministic over the set.' },
    {
      description: 'Describe the shape of the market',
      source: 'MODEL',
      modelClass: 'SMALL_MODEL',
      rationale: 'Turning counts into readable structure. Every number it may use is supplied; it computes none.',
    },
  ],
  GAP_ANALYSIS: () => [
    { description: 'Select entities matching the has/lacks capability policy', source: 'RELATIONAL', rationale: 'NOT_OBSERVED is a stored state — this is the query the capability model was built for.' },
    { description: 'Run the gap rules, including the probe-coverage check', source: 'RULES', rationale: 'A gap is only reportable where something actually looked.' },
  ],
  COMPARISON: () => [
    { description: 'Read both subjects in full', source: 'RELATIONAL', rationale: 'Both sides of a comparison are stored entities.' },
    { description: 'Compute the field-by-field differences', source: 'RULES', rationale: 'Differences are mechanical; only their significance is not.' },
    {
      description: 'Say what the differences mean',
      source: 'MODEL',
      modelClass: 'SMALL_MODEL',
      rationale: 'The table is computed. The model is given the table and asked to read it, not to fill it in.',
    },
  ],
  EVIDENCE_CHECK: () => [
    { description: 'Locate the claim and its supporting observations', source: 'RELATIONAL', rationale: 'The question is about the record, so the record answers it.' },
    { description: 'Retrieve the passages the observations came from', source: 'CRAWLED', rationale: 'A check that cannot show the passage is not a check.' },
    { description: 'Apply the contradiction and staleness rules', source: 'RULES', rationale: 'CONFLICTING and HISTORICAL are computed states, not judgements.' },
  ],
  DATA_ENRICHMENT: (r) => [
    { description: 'Read the fields already held', source: 'RELATIONAL', rationale: 'Never re-fetch what is already stored and current.' },
    { description: `Identify which of ${r.requiredFields.length || 'the requested'} field(s) are still UNKNOWN`, source: 'RELATIONAL', rationale: 'Absence is explicit in the store; it does not need discovering.' },
    { description: 'Crawl the entity’s own pages for the missing fields', source: 'FRESH_SEARCH', rationale: 'The only way to learn something nobody has looked for yet.' },
  ],
  RELATIONSHIP_DISCOVERY: () => [
    { description: 'Read stored relationships in both directions', source: 'GRAPH', rationale: 'Edges carry their own evidence rows.' },
    { description: 'Search indexed passages for ownership language', source: 'LEXICAL', rationale: 'Ownership is usually stated once, in text, on an about page.' },
  ],
  GENERAL_RESEARCH: () => [
    { description: 'Retrieve relevant passages from the index', source: 'VECTOR', rationale: 'An open question has no structural shape to exploit; hybrid retrieval is the right first move.' },
    { description: 'Discover and crawl new sources', source: 'FRESH_SEARCH', rationale: 'Only if retrieval returns too little to support an answer.' },
    {
      description: 'Answer from the retrieved passages',
      source: 'MODEL',
      modelClass: 'REASONING_MODEL',
      rationale:
        'This is the one intent with no structural answer available. Every sentence the model writes ' +
        'is checked against the passages it was given, and unsupported sentences are dropped.',
    },
  ],
  UNKNOWN_INTENT: () => [],
};

export interface PlanResult {
  plan: ResearchPlan;
  intent: IntentResult;
}

export function planResearch(request: IntelligenceRequest): PlanResult {
  const intent = classifyIntent(request);

  if (intent.intent === 'UNKNOWN_INTENT') {
    return {
      intent,
      plan: {
        intent: 'UNKNOWN_INTENT',
        steps: [],
        deterministicOnly: true,
        openQuestions: [
          intent.reason,
          ...(intent.alternatives.length > 0
            ? [`Candidate readings: ${intent.alternatives.join(', ')}. Pass one as \`intent\` to proceed.`]
            : []),
        ],
      },
    };
  }

  const drafts = RECIPES[intent.intent](request);
  const steps: PlanStep[] = [];
  const openQuestions: string[] = [];
  let previous: string | null = null;

  for (const d of drafts) {
    const modelClass: ModelClass = d.modelClass ?? 'NO_MODEL';
    const id = nextId(d.source.toLowerCase().slice(0, 3));

    /*
     * The budget is the caller's, and it is enforced here rather than at the
     * point of spending. A step removed by a budget stays in the plan with the
     * reason attached — the alternative is a plan that silently describes work
     * that never happened.
     */
    let skipped: { reason: string } | undefined;
    if (modelClass !== 'NO_MODEL' && request.maxModelCalls === 0) {
      skipped = { reason: 'maxModelCalls is 0 — the run is deterministic by request.' };
    } else if (d.source === 'FRESH_SEARCH' && request.maxSearches === 0 && request.maxPages === 0) {
      skipped = { reason: 'maxSearches and maxPages are both 0 — nothing new may be fetched.' };
    }

    steps.push({
      id,
      description: d.description,
      source: d.source,
      modelClass,
      dependsOn: previous === null ? [] : [previous],
      rationale: d.rationale,
      ...(skipped !== undefined ? { skipped } : {}),
    });
    previous = id;
  }

  /* An intent whose only synthesis step was budgeted away still answers — with
     findings and no narrative. Saying so is the honest version of "complete". */
  const droppedModel = steps.filter((s) => s.modelClass !== 'NO_MODEL' && s.skipped !== undefined);
  if (droppedModel.length > 0) {
    openQuestions.push(
      `${droppedModel.length} synthesis step(s) were not run: ${droppedModel[0]?.skipped?.reason ?? ''} ` +
        'Findings and evidence are unaffected; the prose summary is.',
    );
  }
  if (intent.confidence === 'UNCERTAIN') {
    openQuestions.push(`Intent was read as ${intent.intent} without confidence. ${intent.reason}`);
  }

  const live = steps.filter((s) => s.skipped === undefined);
  return {
    intent,
    plan: {
      intent: intent.intent,
      steps,
      deterministicOnly: live.every((s) => s.modelClass === 'NO_MODEL'),
      openQuestions,
    },
  };
}

/** Steps the executor should actually run, in dependency order. */
export function runnableSteps(plan: ResearchPlan): PlanStep[] {
  return plan.steps.filter((s) => s.skipped === undefined);
}

/** True when nothing in this plan can spend money. Used by the budget gate. */
export function isFree(plan: ResearchPlan): boolean {
  return runnableSteps(plan).every((s) => s.modelClass === 'NO_MODEL' && s.source !== 'FRESH_SEARCH');
}
