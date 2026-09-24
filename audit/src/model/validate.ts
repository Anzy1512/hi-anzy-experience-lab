import { config } from '../config.ts';
import type { Driver } from '../db/client.ts';
import type { EvidenceItem, EvidencePacket } from '../intel/evidence.ts';
import type { Finding } from '../intel/findings.ts';
import { verifyFindings } from '../intel/verify.ts';
import { createProvider } from './route.ts';
import type { EvidenceBlock, ModelProvider } from './types.ts';

/**
 * HAS A PAID MODEL EVER ACTUALLY ANSWERED HERE?
 *
 * ── THE QUESTION LAYER 6 COULD NOT ANSWER ───────────────────────────────────
 *
 * The provider abstraction, the structured-output forcing, the routing, the
 * token accounting and the verification gate were all built and all tested —
 * against a scripted provider. Which means the entire live path was asserted
 * rather than observed, and the failure modes that only appear against a real
 * API (a refused key, a rate limit, a model that returns prose where a tool
 * call was forced) had never happened once.
 *
 * This is the harness that settles it. It is small on purpose: one bounded
 * call, one ceiling, one grounding check.
 *
 * ── BLOCKED IS A RESULT, NOT A FAILURE ──────────────────────────────────────
 *
 * With no `ANTHROPIC_API_KEY` this returns BLOCKED and says exactly what is
 * missing. It does not fall back to the echo provider and report success, which
 * would be the single most misleading thing in this repository: a green tick
 * next to "live model verified" that was produced by a function returning its
 * own input. `createProvider` was built in layer 4 never to fall back for the
 * same reason, and this honours that.
 *
 * ── AND THE CEILINGS ARE HERE, NOT IN A PROMPT ──────────────────────────────
 *
 * A validation harness pointed at a paid API is exactly where a loop bug costs
 * money. One call, a hard `maxTokens`, and a monetary ceiling checked against
 * the provider's own reported usage afterwards — so an unexpectedly expensive
 * answer is reported as over the ceiling rather than silently paid for.
 */

export type ValidationState = 'BLOCKED' | 'PASSED' | 'FAILED';

export interface LiveProbe {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Exactly as the provider reported. False means these are our estimate. */
  tokensExact: boolean;
  /** Null when no price is configured. UNKNOWN, never zero. */
  costMicros: number | null;
  latencyMs: number;
  ok: boolean;
  detail: string;
}

export interface GroundingCheck {
  /** Statements the model produced. */
  statements: number;
  accepted: number;
  rejected: number;
  /** Why each rejection happened, so the gate can be seen working. */
  reasons: string[];
  /** True when a deliberately unsupportable claim was in fact rejected. */
  rejectedThePlant: boolean;
}

export interface ValidationResult {
  state: ValidationState;
  detail: string;
  keyPresent: boolean;
  ceilings: { maxTokens: number; maxCostMicros: number };
  probe: LiveProbe | null;
  grounding: GroundingCheck | null;
  /** True when the reported cost exceeded the ceiling this harness set. */
  overCeiling: boolean;
}

/** One small, fixed piece of evidence. Written here, never crawled. */
const FIXTURE: EvidenceBlock[] = [
  {
    id: 'E1',
    label: 'https://example.invalid/about',
    text: 'Harrow Lane Coffee Roasters roasts coffee in Leeds and sells bags of beans through its online shop.',
  },
];

/**
 * The same fixture as a packet, so the REAL gate judges the output.
 *
 * Writing a second, smaller checker here would validate a checker that nothing
 * else uses. `verifyFindings` is the function that stands between a model and a
 * reader in production, and it is the one that has to be shown working against
 * text a live model actually produced.
 */
function fixturePacket(): EvidencePacket {
  const items: EvidenceItem[] = FIXTURE.map((f) => ({
    id: f.id,
    kind: 'observation',
    refId: null,
    entityId: null,
    label: f.label,
    text: f.text,
    url: f.label,
    score: 1,
    tokenLen: Math.ceil(f.text.length / 4),
    observedAt: null,
  }));
  return {
    subjectIds: [],
    items,
    dropped: [],
    tokensUsed: items.reduce((t, i) => t + i.tokenLen, 0),
    tokenBudget: 4000,
    conflicts: [],
    unresolvedFields: [],
    sourceUrls: FIXTURE.map((f) => f.label),
    empty: false,
  };
}

/**
 * A grounding check with a trap in it.
 *
 * Asking a model to summarise supported evidence proves nothing — a model that
 * copied the input would pass. So the task also asks for something the evidence
 * cannot support, and the result is judged on whether the gate REJECTED that
 * part. A live-model validation that only confirms the happy path is a
 * validation of the happy path.
 */
const TASK = [
  'Using only the evidence, state two things:',
  '1. what this business sells, citing the evidence id;',
  '2. how many employees it has, citing the evidence id.',
  'Answer both. If the evidence does not support one, say so in that statement.',
].join('\n');

const SYSTEM = [
  'You are a research assistant for a commercial audit service.',
  'Every factual statement you make must be supported by the evidence provided and must cite it.',
  'If the evidence does not establish something, say that it is not established.',
].join('\n');

export interface ValidateOptions {
  /** Injected so the harness itself can be tested without a key or a network. */
  provider?: ModelProvider;
  maxTokens?: number;
  /** Refuse to accept a call that reported a cost above this. */
  maxCostMicros?: number;
}

export async function validateLiveModel(d: Driver, opts: ValidateOptions = {}): Promise<ValidationResult> {
  const ceilings = { maxTokens: opts.maxTokens ?? 400, maxCostMicros: opts.maxCostMicros ?? 50_000 };
  const keyPresent = config.ANTHROPIC_API_KEY !== undefined;

  const provider = opts.provider ?? createProvider();
  if (!provider.available) {
    return {
      state: 'BLOCKED',
      detail:
        provider.unavailableReason ??
        'No model provider is available. Set ANTHROPIC_API_KEY to validate the live path; nothing is faked in its absence.',
      keyPresent,
      ceilings,
      probe: null,
      grounding: null,
      overCeiling: false,
    };
  }

  const startedAt = performance.now();
  const res = await provider.complete({
    purpose: 'layer7-live-validation',
    modelClass: 'SMALL_MODEL',
    system: SYSTEM,
    task: TASK,
    evidence: FIXTURE,
    maxTokens: ceilings.maxTokens,
    schema: {
      type: 'object',
      properties: {
        statements: {
          type: 'array',
          items: {
            type: 'object',
            properties: { text: { type: 'string' }, citations: { type: 'array', items: { type: 'string' } } },
            required: ['text', 'citations'],
          },
        },
      },
      required: ['statements'],
      additionalProperties: false,
    },
  });
  const latencyMs = Math.round(performance.now() - startedAt);

  const probe: LiveProbe = {
    provider: res.provider,
    model: res.model,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    tokensExact: !res.tokensEstimated,
    costMicros: res.costMicros,
    latencyMs,
    ok: res.ok,
    detail: res.ok ? 'the provider answered through the forced schema' : (res.error ?? 'the provider did not answer'),
  };

  /* Recorded whether it succeeded or not: a refused key is exactly the event
     worth having a row for. */
  await d.query(
    `insert into live_model_call (provider, model, purpose, tokens_in, tokens_out, cost_micros, latency_ms, ok, detail)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      probe.provider,
      probe.model,
      'layer7-live-validation',
      probe.tokensIn,
      probe.tokensOut,
      probe.costMicros,
      probe.latencyMs,
      probe.ok ? 1 : 0,
      probe.detail,
    ],
  );

  if (!res.ok) {
    return { state: 'FAILED', detail: probe.detail, keyPresent, ceilings, probe, grounding: null, overCeiling: false };
  }

  const overCeiling = probe.costMicros !== null && probe.costMicros > ceilings.maxCostMicros;

  /* ---- the grounding gate, on real generated text ---------------------- */

  const parsed = res.parsed as { statements?: Array<{ text?: unknown; citations?: unknown }> } | null;
  const produced = (parsed?.statements ?? [])
    .map((s) => ({
      text: typeof s.text === 'string' ? s.text : '',
      citations: Array.isArray(s.citations) ? s.citations.filter((c): c is string => typeof c === 'string') : [],
    }))
    .filter((s) => s.text !== '');

  const asFindings: Finding[] = produced.map((s, i) => ({
    key: `live-${i}`,
    entityId: null,
    findingType: 'LIVE_VALIDATION',
    statement: s.text,
    status: 'FACT',
    reasoningType: 'MODEL',
    ruleId: null,
    ruleVersion: null,
    modelUsed: res.model,
    citations: s.citations,
    inference: null,
    limitations: '',
    verification: 'UNVERIFIED',
    verificationReason: null,
    area: null,
    outcome: null,
  }));

  const outcome = verifyFindings(asFindings, fixturePacket());
  const accepted = outcome.findings.filter((f) => f.verification === 'VERIFIED');
  const rejected = outcome.findings.filter((f) => f.verification === 'REJECTED');

  /*
   * The trap is the employee count. Nothing in the evidence mentions one, so a
   * statement asserting a number must be rejected — and a model that correctly
   * said "not established" produces no rejectable claim at all, which is also
   * a pass. Both are the gate and the model agreeing; what would not be a pass
   * is a cited employee count surviving.
   */
  const plantSurvived = accepted.some((c) => /\b\d+\s*(?:employees?|staff|people)\b/i.test(c.statement));

  const grounding: GroundingCheck = {
    statements: outcome.findings.length,
    accepted: accepted.length,
    rejected: rejected.length,
    reasons: outcome.notes,
    rejectedThePlant: !plantSurvived,
  };

  const state: ValidationState = grounding.rejectedThePlant && !overCeiling ? 'PASSED' : 'FAILED';
  return {
    state,
    detail: overCeiling
      ? `the call reported ${String(probe.costMicros)} micros, above the ${ceilings.maxCostMicros} ceiling this harness set`
      : grounding.rejectedThePlant
        ? 'a live model answered through the forced schema and every unsupported statement was rejected'
        : 'a live model produced an unsupported statement that the verification gate accepted',
    keyPresent,
    ceilings,
    probe,
    grounding,
    overCeiling,
  };
}
