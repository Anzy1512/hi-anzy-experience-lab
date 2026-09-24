import { intentKind } from '../db/intel.ts';
import type { IntelligenceRequest } from './contract.ts';

/**
 * WHAT IS BEING ASKED, DECIDED WITHOUT A MODEL.
 *
 * ── WHY THIS IS A TABLE AND NOT A PROMPT ────────────────────────────────────
 *
 * Intent determines everything downstream: which sources are consulted, which
 * rules fire, whether a model is called at all. Classifying it WITH a model
 * means paying for a call before knowing whether the question needed one — and
 * "which questions actually needed a model" is the number this whole layer is
 * organised around.
 *
 * It also means the classifier cannot be audited. A regex table gets a wrong
 * answer in a way somebody can read, fix and add a test for. A prompt gets a
 * wrong answer in a way that can only be argued with.
 *
 * ── AND WHY IT IS ALLOWED TO FAIL ───────────────────────────────────────────
 *
 * `UNKNOWN_INTENT` is a real classification, returned whenever the top two
 * candidates are too close to separate. The alternatives come back with it, so
 * the caller can ask rather than the engine guessing. A classifier with no
 * abstention answers every question, including the ones it has no business
 * answering.
 */

export type IntentKind = (typeof intentKind.enumValues)[number];

export type Confidence = 'CERTAIN' | 'LIKELY' | 'UNCERTAIN';

export interface IntentResult {
  intent: IntentKind;
  confidence: Confidence;
  /** The phrases and fields that produced this, quoted from the input. */
  signals: string[];
  /** Other intents within reach. Non-empty whenever the margin was narrow. */
  alternatives: IntentKind[];
  reason: string;
}

interface Pattern {
  re: RegExp;
  intent: IntentKind;
  weight: number;
  /** Shown to the caller as the reason this intent scored. */
  label: string;
}

/**
 * Weights, and what they mean.
 *
 *   4  an unmistakable phrase for exactly one intent ("who supplies")
 *   3  a strong phrase that one other intent could also claim
 *   2  a supporting term that only matters alongside something else
 *   1  a weak hint
 *
 * Nothing here is tuned against a dataset, because there isn't one. They are
 * ordered by how specific the phrase is, which is a claim anybody can check by
 * reading the line.
 */
const PATTERNS: Pattern[] = [
  /* ---- discovery, by relationship to a product ------------------------- */
  { re: /\bwho (?:supplies|supply|manufactures|makes|produces)\b/i, intent: 'SUPPLIER_DISCOVERY', weight: 4, label: 'asks who supplies' },
  { re: /\b(?:suppliers?|manufacturers?|wholesalers?|distributors?|vendors?)\b/i, intent: 'SUPPLIER_DISCOVERY', weight: 3, label: 'supplier vocabulary' },
  { re: /\bwho (?:sells|stocks|carries|resells)\b/i, intent: 'RETAILER_DISCOVERY', weight: 4, label: 'asks who sells' },
  { re: /\b(?:retailers?|stockists?|resellers?|shops? (?:that|who) (?:sell|stock)|dealers?)\b/i, intent: 'RETAILER_DISCOVERY', weight: 3, label: 'retailer vocabulary' },
  { re: /\b(?:competitors?|rivals?|competing (?:businesses|firms|companies)|alternatives to)\b/i, intent: 'COMPETITOR_DISCOVERY', weight: 4, label: 'competitor vocabulary' },

  /* ---- discovery, by place or category --------------------------------- */
  { re: /\b(?:near|around|within|close to|nearby|in the area|local(?:ly)?)\b/i, intent: 'LOCAL_DISCOVERY', weight: 3, label: 'geographic phrasing' },
  { re: /\b(?:in|across|throughout) [A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,2}\b/, intent: 'LOCAL_DISCOVERY', weight: 2, label: 'a named place' },
  { re: /\b(?:\d+\s?(?:km|kilometres|kilometers|miles|mi)\b)/i, intent: 'LOCAL_DISCOVERY', weight: 3, label: 'a radius' },
  { re: /\ball (?:the )?(?:businesses|companies|firms|shops|stores|brands)\b/i, intent: 'CATEGORY_DISCOVERY', weight: 3, label: 'asks for a whole category' },
  { re: /\b(?:list|find|show me|give me) (?:all |every |me )?(?:\w+ )?(?:businesses|companies|firms|shops|stores|brands|sellers)\b/i, intent: 'CATEGORY_DISCOVERY', weight: 3, label: 'a list request' },

  /* ---- audits ----------------------------------------------------------- */
  { re: /\b(?:online presence|digital presence|web presence|discoverability|findable online)\b/i, intent: 'DIGITAL_PRESENCE_AUDIT', weight: 4, label: 'presence vocabulary' },
  { re: /\b(?:social (?:media|presence|accounts?)|instagram|facebook|linkedin)\b/i, intent: 'DIGITAL_PRESENCE_AUDIT', weight: 2, label: 'social channels' },
  { re: /\b(?:e-?commerce|online store|online shop|sell(?:ing)? online|shopping cart|checkout|storefront)\b/i, intent: 'ECOMMERCE_AUDIT', weight: 4, label: 'ecommerce vocabulary' },
  { re: /\b(?:audit|assess(?:ment)?|evaluate|review|health check|diagnos(?:e|tic))\b/i, intent: 'BUSINESS_AUDIT', weight: 3, label: 'audit vocabulary' },
  { re: /\bhow (?:good|strong|well|mature)\b/i, intent: 'BUSINESS_AUDIT', weight: 2, label: 'asks for an assessment' },

  /* ---- analysis --------------------------------------------------------- */
  { re: /\b(?:map (?:the|out)|landscape|market map|who (?:is|are) (?:in|operating in)|overview of the market)\b/i, intent: 'MARKET_MAPPING', weight: 4, label: 'mapping vocabulary' },
  { re: /\b(?:gaps?|missing|lack(?:ing|s)?|under-?served|opportunit(?:y|ies)|nobody (?:is|does)|no ?one (?:is|does))\b/i, intent: 'GAP_ANALYSIS', weight: 3, label: 'gap vocabulary' },
  { re: /\b(?:compare|comparison|versus|vs\.?|difference between|better than|which of)\b/i, intent: 'COMPARISON', weight: 4, label: 'comparison vocabulary' },

  /* ---- checks and enrichment -------------------------------------------- */
  { re: /\b(?:is it true|verify|confirm|fact ?check|really have|actually have|do they (?:have|offer|sell))\b/i, intent: 'EVIDENCE_CHECK', weight: 4, label: 'verification vocabulary' },
  { re: /\b(?:what(?:'s| is) the (?:phone|number|email|address|website)|contact details?|get me the (?:phone|email|address)|fill in|enrich)\b/i, intent: 'DATA_ENRICHMENT', weight: 4, label: 'enrichment vocabulary' },
  { re: /\b(?:who owns|owned by|parent (?:company|of)|subsidiar(?:y|ies)|related to|connected to|part of the same)\b/i, intent: 'RELATIONSHIP_DISCOVERY', weight: 4, label: 'ownership vocabulary' },

  /* ---- one known subject ------------------------------------------------- */
  { re: /\b(?:tell me about|what do (?:we|you) know about|profile of|everything about|look up)\b/i, intent: 'ENTITY_LOOKUP', weight: 4, label: 'lookup vocabulary' },
];

/** Terms that mean "go and find new ones", which separates discovery from lookup. */
const DISCOVERY_VERB = /\b(?:find|search|discover|identify|locate|list|show|who (?:else|are|is)|any other)\b/i;

const CLOSE_ENOUGH_TO_REFUSE = 1;

/**
 * The general readings each specific one absorbs.
 *
 * "Audit the digital presence of X" scores as a presence audit and as a
 * business audit, because the second contains the first. That is not ambiguity
 * and refusing it would be pedantry — the correct move is to take the narrower
 * reading, which is the one that produces the smaller, cheaper plan.
 *
 * Genuine ambiguity is between readings that do NOT contain one another:
 * "who supplies craft beer near Leeds" is a supplier question and a local one,
 * neither is a special case of the other, and answering only one silently is
 * how a visitor gets half an answer without being told.
 *
 * ENTITY_LOOKUP appears in nearly every list because naming one business is a
 * precondition for asking anything else about it, never a competing request.
 */
const ABSORBS: Partial<Record<IntentKind, IntentKind[]>> = {
  DIGITAL_PRESENCE_AUDIT: ['BUSINESS_AUDIT', 'ENTITY_LOOKUP', 'GENERAL_RESEARCH'],
  ECOMMERCE_AUDIT: ['BUSINESS_AUDIT', 'DIGITAL_PRESENCE_AUDIT', 'ENTITY_LOOKUP', 'GENERAL_RESEARCH'],
  BUSINESS_AUDIT: ['ENTITY_LOOKUP', 'GENERAL_RESEARCH'],
  GAP_ANALYSIS: ['MARKET_MAPPING', 'CATEGORY_DISCOVERY', 'GENERAL_RESEARCH'],
  COMPARISON: ['ENTITY_LOOKUP', 'GENERAL_RESEARCH'],
  EVIDENCE_CHECK: ['ENTITY_LOOKUP', 'GENERAL_RESEARCH'],
  DATA_ENRICHMENT: ['ENTITY_LOOKUP', 'GENERAL_RESEARCH'],
  RELATIONSHIP_DISCOVERY: ['ENTITY_LOOKUP', 'GENERAL_RESEARCH'],
  SUPPLIER_DISCOVERY: ['ENTITY_DISCOVERY', 'CATEGORY_DISCOVERY', 'GENERAL_RESEARCH'],
  RETAILER_DISCOVERY: ['ENTITY_DISCOVERY', 'CATEGORY_DISCOVERY', 'GENERAL_RESEARCH'],
  COMPETITOR_DISCOVERY: ['ENTITY_DISCOVERY', 'CATEGORY_DISCOVERY', 'GENERAL_RESEARCH'],
  LOCAL_DISCOVERY: ['ENTITY_DISCOVERY', 'GENERAL_RESEARCH'],
  CATEGORY_DISCOVERY: ['ENTITY_DISCOVERY', 'GENERAL_RESEARCH'],
  MARKET_MAPPING: ['CATEGORY_DISCOVERY', 'ENTITY_DISCOVERY', 'GENERAL_RESEARCH'],
  ENTITY_LOOKUP: ['GENERAL_RESEARCH'],
  ENTITY_DISCOVERY: ['GENERAL_RESEARCH'],
};

/**
 * Classify. Structured fields count as evidence alongside the words, because a
 * caller who passed `entityId` has already told us the subject is known.
 */
export function classifyIntent(request: IntelligenceRequest): IntentResult {
  if (request.intent !== undefined && isIntentKind(request.intent)) {
    return {
      intent: request.intent,
      confidence: 'CERTAIN',
      signals: ['supplied by the caller'],
      alternatives: [],
      reason: 'The caller stated the intent; nothing was inferred.',
    };
  }

  const q = request.question;
  const scores = new Map<IntentKind, number>();
  const signals: string[] = [];

  const add = (intent: IntentKind, weight: number, label: string) => {
    scores.set(intent, (scores.get(intent) ?? 0) + weight);
    signals.push(label);
  };

  for (const p of PATTERNS) {
    const m = p.re.exec(q);
    if (m === null) continue;
    add(p.intent, p.weight, `${p.label}: "${m[0].trim()}"`);
  }

  /* Structured fields are evidence too, and stronger than phrasing because the
     caller had to know something to fill them in. */
  const namesOneSubject = request.entityId !== undefined || request.domain !== undefined || request.entityName !== undefined;
  const wantsDiscovery = DISCOVERY_VERB.test(q);

  if (namesOneSubject && !wantsDiscovery) add('ENTITY_LOOKUP', 3, 'a single subject was named and nothing asks for more');
  if (namesOneSubject && wantsDiscovery) add('ENTITY_DISCOVERY', 1, 'a subject was named but the question asks to find others');
  if (!namesOneSubject && wantsDiscovery) add('ENTITY_DISCOVERY', 2, 'asks to find businesses that are not named');
  if (request.geography !== undefined) add('LOCAL_DISCOVERY', 3, 'the request carries a geography');
  if (request.categories.length > 0) add('CATEGORY_DISCOVERY', 2, `categories were given: ${request.categories.join(', ')}`);
  if (request.evidencePolicy.has.length > 0 || request.evidencePolicy.lacks.length > 0) {
    add('GAP_ANALYSIS', 2, 'the request filters on capabilities present or not observed');
  }
  if (request.requiredFields.length > 0 && namesOneSubject) {
    add('DATA_ENRICHMENT', 2, `specific fields were asked for: ${request.requiredFields.join(', ')}`);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];

  if (top === undefined) {
    return {
      intent: 'UNKNOWN_INTENT',
      confidence: 'UNCERTAIN',
      signals: [],
      alternatives: [],
      reason:
        'Nothing in the question matched a known intent. The engine will not guess at ' +
        'what to research; say what kind of answer is wanted, or pass `intent` directly.',
    };
  }

  const [topIntent, topScore] = top;
  const margin = second === undefined ? topScore : topScore - second[1];
  const absorbed = new Set(ABSORBS[topIntent] ?? []);
  const near = ranked
    .filter(([k, v]) => k !== topIntent && topScore - v <= CLOSE_ENOUGH_TO_REFUSE && !absorbed.has(k))
    .map(([k]) => k);

  /*
   * A tie is a refusal, not a coin toss. "Who supplies craft beer near Leeds"
   * is genuinely both a supplier question and a local one, and answering only
   * one of them silently is worse than saying so.
   */
  if (margin <= CLOSE_ENOUGH_TO_REFUSE && near.length > 0) {
    return {
      intent: 'UNKNOWN_INTENT',
      confidence: 'UNCERTAIN',
      signals,
      alternatives: [topIntent, ...near],
      reason:
        `The question reads as ${[topIntent, ...near].join(' and as ')} in equal measure. ` +
        'Rather than pick one, the engine is reporting the ambiguity.',
    };
  }

  const confidence: Confidence = topScore >= 6 && margin >= 3 ? 'CERTAIN' : margin >= 2 ? 'LIKELY' : 'UNCERTAIN';

  return {
    intent: topIntent,
    confidence,
    signals,
    alternatives: near,
    reason: `Classified as ${topIntent} on ${signals.length} signal(s), ahead of the next reading by ${margin}.`,
  };
}

function isIntentKind(v: string): v is IntentKind {
  return (intentKind.enumValues as readonly string[]).includes(v);
}

/** Which intents can be answered entirely from what is already stored. */
export const ANSWERABLE_FROM_STORE: ReadonlySet<IntentKind> = new Set<IntentKind>([
  'ENTITY_LOOKUP',
  'LOCAL_DISCOVERY',
  'CATEGORY_DISCOVERY',
  'GAP_ANALYSIS',
  'RELATIONSHIP_DISCOVERY',
  'EVIDENCE_CHECK',
  'DATA_ENRICHMENT',
]);

/** Which intents are asking for a judgement rather than a fact. */
export const REQUIRES_SYNTHESIS: ReadonlySet<IntentKind> = new Set<IntentKind>([
  'BUSINESS_AUDIT',
  'MARKET_MAPPING',
  'COMPARISON',
  'GENERAL_RESEARCH',
]);
