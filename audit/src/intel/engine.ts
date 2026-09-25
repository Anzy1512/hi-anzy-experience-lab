import type { Driver } from '../db/client.ts';
import type { CapabilityState } from '../entity/capability.ts';
import { getCapability, findByDomain, findEntities, getCoverage, getEntity, getEntityEvidence, getRelationships } from '../entity/query.ts';
import { normalizeDomain, normalizeName } from '../entity/normalize.ts';
import { createProvider, routeFor } from '../model/route.ts';
import { estimateTokens, type ModelProvider, type ModelResponse } from '../model/types.ts';
import { packetForEntity, packetForQuestion, recordSelection, toBlocks, type EvidencePacket } from './evidence.ts';
import { partitionFindings, persistFindings, plain, renderable, type Finding } from './findings.ts';
import { RULE_SET_VERSION, runRules, type RuleContext } from './rules.ts';
import { findContradictions, verifyFindings } from './verify.ts';
import { planResearch, runnableSteps } from './planner.ts';
import { parseRequest, type CostAccount, type Coverage, type IntelligenceRequest, type ResearchPlan, type Termination } from './contract.ts';

/**
 * ONE RUN, FROM A QUESTION TO A DEFENSIBLE ANSWER.
 *
 * ── THE SHAPE OF IT ─────────────────────────────────────────────────────────
 *
 *   request → intent → plan → evidence → rules → [model] → verify → record
 *
 * The model step is in brackets because most runs do not reach it. That is the
 * design working, not the design failing: the questions this product is for —
 * who is in this category, who has a site and no storefront, what do we know
 * about this business and how do we know it — are answered by SQL over resolved
 * entities, and answering them with a model would be slower, dearer and less
 * exact.
 *
 * ── WHAT COMES OUT ──────────────────────────────────────────────────────────
 *
 * Plain conclusions, with the citations kept beside them rather than sprinkled
 * through them. Everything the run could not establish is listed rather than
 * omitted, and the cost is reported as measured — including as UNKNOWN when no
 * price is configured, because an invented number is worse than a missing one.
 */

export const ENGINE_VERSION = 'l4-engine-1';

export interface Answer {
  runId: string;
  question: string;
  intent: string;
  plan: ResearchPlan;
  /** The narrative, when one was produced. Null is a normal outcome. */
  summary: string | null;
  summarySource: 'MODEL' | 'RULES' | 'NONE';
  findings: Finding[];
  established: Finding[];
  gaps: Finding[];
  conflicts: Finding[];
  recommendations: Finding[];
  /** Produced, stored, refused rendering — and counted. */
  withheld: Finding[];
  coverage: Coverage;
  cost: CostAccount;
  termination: Termination;
  /** What this answer cannot tell you. Never empty in practice. */
  limitations: string[];
  /**
   * The packet, so a caller can show the evidence beside the conclusions.
   *
   * The quote travels with it. A surface that prints plain conclusions has to
   * be able to show what each one rests on without a second round trip, and
   * the text is already inside the token budget by the time it gets here.
   */
  evidence: Array<{ id: string; label: string; url: string | null; kind: string; text: string }>;
  notes: string[];
}

export interface EngineOptions {
  /** Override the provider. Tests pass a scripted one; production passes nothing. */
  provider?: ModelProvider;
  now?: Date;
}

export async function answer(d: Driver, input: unknown, opts: EngineOptions = {}): Promise<Answer> {
  const startedAt = performance.now();
  const now = opts.now ?? new Date();
  const request = parseRequest(input);
  const provider = opts.provider ?? createProvider();

  const { plan, intent } = planResearch(request);
  const notes: string[] = [];
  const limitations: string[] = [...plan.openQuestions];

  const runId = await openRun(d, request, plan);

  const cost: CostAccount = {
    modelCalls: 0,
    tokensIn: 0,
    tokensOut: 0,
    costMicros: 0,
    searches: 0,
    pagesCrawled: 0,
    evidenceConsidered: 0,
    evidenceUsed: 0,
    durationMs: 0,
  };
  /* Null the moment any call has an unpriced model: a partial total is a
     misleading total, and the report says UNKNOWN rather than under-reporting. */
  let costKnown = true;

  /* ---- an intent the engine will not guess at --------------------------- */
  if (intent.intent === 'UNKNOWN_INTENT') {
    cost.durationMs = Math.round(performance.now() - startedAt);
    await closeRun(d, runId, 'insufficient_evidence', cost, costKnown, intent.reason);
    return {
      runId,
      question: request.question,
      intent: 'UNKNOWN_INTENT',
      plan,
      summary: null,
      summarySource: 'NONE',
      findings: [],
      established: [],
      gaps: [],
      conflicts: [],
      recommendations: [],
      withheld: [],
      coverage: { entitiesConsidered: 0, entitiesReturned: 0, sourcesChecked: 0, verdict: 'NONE', unresolvedFields: [] },
      cost,
      termination: 'INSUFFICIENT_EVIDENCE',
      limitations: [...limitations, 'No research was performed: the question was not classified.'],
      evidence: [],
      notes: [intent.reason],
    };
  }

  /* ---- the subject, where there is one ---------------------------------- */
  const subject = await resolveSubject(d, request);
  if (subject.note !== null) notes.push(subject.note);

  const capabilitiesWanted = [
    ...new Set([...request.evidencePolicy.has, ...request.evidencePolicy.lacks, 'website', 'ecommerce']),
  ];

  /* ---- the evidence ------------------------------------------------------ */
  let packet: EvidencePacket;
  if (subject.entityId !== null) {
    packet = await packetForEntity(d, subject.entityId, capabilitiesWanted, {
      tokenBudget: Math.max(1_000, Math.floor(request.maxTokens * 0.6)),
      requiredFields: request.requiredFields,
    });
  } else {
    packet = await packetForQuestion(d, request.question, {
      tokenBudget: Math.max(1_000, Math.floor(request.maxTokens * 0.6)),
    });
  }
  cost.evidenceConsidered = packet.items.length + packet.dropped.length;
  cost.evidenceUsed = packet.items.length;
  await recordSelection(d, runId, packet);

  /* ---- the rules --------------------------------------------------------- */
  const ruleFindings: Finding[] = [];
  let coverage: Coverage = {
    entitiesConsidered: subject.considered,
    entitiesReturned: subject.entityId === null ? 0 : 1,
    sourcesChecked: packet.sourceUrls.length,
    verdict: 'NONE',
    unresolvedFields: packet.unresolvedFields,
  };

  if (subject.entityId !== null) {
    const ctx = await buildRuleContext(d, subject.entityId, subject.entityName, packet, capabilitiesWanted, now);
    ruleFindings.push(...runRules(ctx));
    const cov = await getCoverage(d, subject.entityId);
    coverage = {
      entitiesConsidered: subject.considered,
      entitiesReturned: 1,
      sourcesChecked: cov.sourcesChecked,
      verdict: cov.verdict,
      unresolvedFields: [...new Set([...cov.unresolvedFields, ...packet.unresolvedFields])],
    };
  }

  /* ---- the model, if the plan calls for one and anything allows it -------- */
  const synthesisSteps = runnableSteps(plan).filter((s) => s.modelClass !== 'NO_MODEL');
  let summary: string | null = null;
  let summarySource: Answer['summarySource'] = 'NONE';
  let modelFindings: Finding[] = [];
  let termination: Termination = 'COMPLETE';

  if (packet.empty && subject.entityId === null) {
    termination = 'INSUFFICIENT_EVIDENCE';
    limitations.push('Nothing in the corpus matched this question, so there was nothing to reason over.');
  } else if (synthesisSteps.length > 0 && !provider.available) {
    termination = 'COMPLETE';
    limitations.push(
      `No narrative was written: ${provider.unavailableReason ?? 'no model provider is configured'}. ` +
        'The findings below are unaffected — they are produced by rules, not by a model.',
    );
    notes.push('MODEL — UNAVAILABLE, deterministic findings only');
  } else if (synthesisSteps.length > 0 && packet.items.length > 0) {
    const step = synthesisSteps[0];
    if (step !== undefined) {
      const route = routeFor(step, {
        evidenceTokens: packet.tokensUsed,
        conflicts: packet.conflicts.length,
        subjects: subject.entityId === null ? 0 : 1,
      });
      if (route.changed) notes.push(`routing: ${step.modelClass} → ${route.modelClass} because ${route.reason}`);

      if (route.modelClass !== 'NO_MODEL' && cost.modelCalls < request.maxModelCalls) {
        const res = await synthesise(provider, route.modelClass, step.description, request, packet, ruleFindings);
        await recordModelCall(d, runId, `${step.description} — ${route.reason}`, route.modelClass, res);
        cost.modelCalls += 1;
        cost.tokensIn += res.tokensIn;
        cost.tokensOut += res.tokensOut;
        if (res.costMicros === null) costKnown = false;
        else cost.costMicros += res.costMicros;

        if (!res.ok) {
          notes.push(`the model call failed: ${res.error ?? 'no reason given'}`);
          limitations.push('No narrative was written because the model call failed. The findings are unaffected.');
        } else {
          const drafted = draftFindings(res, subject.entityId, provider.name, route.modelClass);
          const verified = verifyFindings(drafted, packet, ruleFindings);
          modelFindings = verified.findings;
          notes.push(...verified.notes);
          if (verified.rejected > 0) {
            limitations.push(
              `${verified.rejected} generated statement(s) were rejected before rendering because they ` +
                'were not supported by the evidence they cited.',
            );
          }
          const accepted = modelFindings.filter(renderable);
          if (accepted.length > 0) {
            summary = accepted.map(plain).join(' ');
            summarySource = 'MODEL';
          } else if (verified.rejected > 0) {
            notes.push('every generated statement was rejected; falling back to the rule findings');
          }
        }
      }
    }
  }

  const findings = [...ruleFindings, ...modelFindings];

  if (summary === null && findings.some(renderable)) {
    /* The deterministic summary. It is a sentence made of findings that were
       each produced by a named rule, so it can be printed with no model at all
       and still be walked back to evidence. */
    summary = ruleSummary(findings);
    summarySource = summary === null ? 'NONE' : 'RULES';
  }

  for (const c of findContradictions(findings)) {
    notes.push(`contradiction on "${c.key}": ${c.findingKeys.join(' vs ')}`);
    limitations.push(`Two findings disagree about ${c.key}; both are shown and neither was chosen.`);
  }

  if (findings.filter(renderable).length === 0 && termination === 'COMPLETE') {
    termination = 'INSUFFICIENT_EVIDENCE';
  }
  if (cost.modelCalls >= request.maxModelCalls && synthesisSteps.length > cost.modelCalls) {
    termination = 'BUDGET_EXHAUSTED';
  }

  const persisted = await persistFindings(d, runId, findings, packet);
  notes.push(`${persisted.findings} finding(s), ${persisted.citations} citation(s) recorded`);

  if (packet.unresolvedFields.length > 0) {
    limitations.push(`Not established: ${[...new Set(packet.unresolvedFields)].join(', ')}.`);
  }
  if (coverage.verdict !== 'CORROBORATED' && subject.entityId !== null) {
    limitations.push(
      coverage.verdict === 'NONE'
        ? 'No source has been read for this business yet.'
        : 'Nothing here is corroborated by a second independent source.',
    );
  }
  if (!costKnown) {
    limitations.push('Cost is UNKNOWN: no price is configured for the model that was used.');
  }

  cost.durationMs = Math.round(performance.now() - startedAt);
  await closeRun(d, runId, runStatusFor(termination), cost, costKnown, null);

  const parts = partitionFindings(findings);
  return {
    runId,
    question: request.question,
    intent: intent.intent,
    plan,
    summary,
    summarySource,
    findings,
    ...parts,
    coverage,
    cost: costKnown ? cost : { ...cost, costMicros: -1 },
    termination,
    limitations,
    evidence: packet.items.map((i) => ({ id: i.id, label: i.label, url: i.url, kind: i.kind, text: i.text })),
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/* PIECES                                                                      */
/* -------------------------------------------------------------------------- */

interface Subject {
  entityId: string | null;
  entityName: string;
  considered: number;
  note: string | null;
}

/**
 * Which business this is about.
 *
 * Identifier first, then domain, then name — the same precedence the resolver
 * uses, for the same reason: a domain is a near-unique handle and a name is
 * not. An ambiguous name is reported as ambiguous rather than resolved to the
 * first row, because picking one silently is how a report ends up being about
 * the wrong company.
 */
async function resolveSubject(d: Driver, request: IntelligenceRequest): Promise<Subject> {
  if (request.entityId !== undefined) {
    const e = await getEntity(d, request.entityId);
    if (e !== null) return { entityId: e.id, entityName: e.canonicalName, considered: 1, note: null };
    return { entityId: null, entityName: 'the subject', considered: 0, note: `no entity with id ${request.entityId}` };
  }

  if (request.domain !== undefined) {
    const domain = normalizeDomain(request.domain);
    const hits = domain === null ? [] : await findByDomain(d, domain);
    const first = hits[0];
    if (first !== undefined) {
      return {
        entityId: first.id,
        entityName: first.canonicalName,
        considered: hits.length,
        note: hits.length > 1 ? `${hits.length} entities share ${domain}; the first was used and the rest are listed as duplicates` : null,
      };
    }
  }

  if (request.entityName !== undefined) {
    const wanted = normalizeName(request.entityName).normalized;
    const all = await findEntities(d, { limit: 200 });
    const matches = all.filter((e) => normalizeName(e.canonicalName).normalized === wanted);
    const first = matches[0];
    if (matches.length > 1) {
      return {
        entityId: null,
        entityName: request.entityName,
        considered: matches.length,
        note: `"${request.entityName}" matches ${matches.length} known businesses; the engine will not pick one. Pass entityId or domain.`,
      };
    }
    if (first !== undefined) return { entityId: first.id, entityName: first.canonicalName, considered: 1, note: null };
    return { entityId: null, entityName: request.entityName, considered: 0, note: `"${request.entityName}" is not in the store` };
  }

  return { entityId: null, entityName: 'the subject', considered: 0, note: null };
}

async function buildRuleContext(
  d: Driver,
  entityId: string,
  entityName: string,
  packet: EvidencePacket,
  capabilities: string[],
  now: Date,
): Promise<RuleContext> {
  const chain = await getEntityEvidence(d, entityId);
  const claims: Record<string, string> = {};
  const claimItem: Record<string, string> = {};
  let newest: Date | null = null;

  for (const c of chain) {
    if (c.value === 'UNKNOWN') continue;
    claims[c.field] = c.value;
    const item = packet.items.find((i) => i.kind === 'claim' && i.text.startsWith(`${c.field}:`));
    if (item !== undefined) claimItem[c.field] = item.id;
    for (const e of c.evidence) if (newest === null || e.observedAt > newest) newest = e.observedAt;
  }

  const caps: Record<string, CapabilityState> = {};
  const capItem: Record<string, string> = {};
  for (const cap of capabilities) {
    caps[cap] = (await getCapability(d, entityId, cap)).state;
    const item = packet.items.find((i) => i.kind === 'capability' && i.text.startsWith(`capability ${cap}:`));
    if (item !== undefined) capItem[cap] = item.id;
  }

  const cov = await getCoverage(d, entityId);
  return {
    entityId,
    entityName,
    packet,
    capabilities: caps,
    capabilityItem: capItem,
    claims,
    claimItem,
    relationships: (await getRelationships(d, entityId)).length,
    sourceCount: cov.sourcesChecked,
    newestObservation: newest,
    now,
  };
}

const SYNTHESIS_SYSTEM = [
  'You are summarising findings for a commercial research report.',
  '',
  'Rules you cannot break:',
  '- Every statement must cite an evidence id in square brackets, e.g. [c1].',
  '- Never state a fact that is not in the evidence, however obvious it seems.',
  '- Never write that a business does not have something. The most that can be said is that it was',
  '  not observed in the sources checked.',
  '- Never invent a number. If a figure is not in the evidence, do not use one.',
  '- If the evidence does not answer the question, say that instead of answering it.',
].join('\n');

const SYNTHESIS_SCHEMA = {
  type: 'object' as const,
  properties: {
    statements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string', description: 'One plain sentence. No brackets, no hedging.' },
          citations: { type: 'array', items: { type: 'string' }, description: 'Evidence ids this rests on.' },
        },
        required: ['statement', 'citations'],
      },
    },
  },
  required: ['statements'],
  additionalProperties: false,
};

async function synthesise(
  provider: ModelProvider,
  modelClass: 'SMALL_MODEL' | 'REASONING_MODEL',
  purpose: string,
  request: IntelligenceRequest,
  packet: EvidencePacket,
  ruleFindings: Finding[],
): Promise<ModelResponse> {
  /*
   * The model is told what the rules already settled so it does not spend
   * tokens restating them — and so that restating them anyway is a detectable
   * mistake rather than an invisible duplication.
   */
  const settled = ruleFindings.filter(renderable).map((f) => `- ${f.statement}`).join('\n');
  const task = [
    `Question: ${request.question}`,
    '',
    settled === '' ? 'Nothing has been established mechanically yet.' : `Already established by rule, do not restate:\n${settled}`,
    '',
    'Write only what the evidence adds beyond the above. If it adds nothing, return an empty list.',
  ].join('\n');

  return provider.complete({
    purpose,
    modelClass,
    system: SYNTHESIS_SYSTEM,
    task,
    evidence: toBlocks(packet),
    schema: SYNTHESIS_SCHEMA,
    maxTokens: Math.max(256, Math.min(2_048, request.maxTokens - packet.tokensUsed)),
  });
}

interface DraftedStatement {
  statement?: unknown;
  citations?: unknown;
}

/** Turn a structured model answer into findings. Nothing is trusted yet. */
function draftFindings(res: ModelResponse, entityId: string | null, provider: string, modelClass: string): Finding[] {
  const parsed = res.parsed as { statements?: unknown } | null;
  const raw = Array.isArray(parsed?.statements) ? (parsed.statements as DraftedStatement[]) : [];
  const out: Finding[] = [];

  for (const [i, s] of raw.entries()) {
    if (typeof s?.statement !== 'string' || s.statement.trim() === '') continue;
    out.push({
      key: `model:${i}`,
      entityId,
      findingType: 'MODEL_STATEMENT',
      statement: s.statement.trim(),
      status: 'DERIVED',
      reasoningType: 'MODEL',
      ruleId: null,
      ruleVersion: null,
      modelUsed: `${provider}/${modelClass}`,
      citations: Array.isArray(s.citations) ? s.citations.filter((c): c is string => typeof c === 'string') : [],
      inference: 'Written by a model from the evidence packet, then checked against it.',
      limitations: 'Generated prose. It was verified against its citations, which is not the same as being verified as true.',
      verification: 'UNVERIFIED',
      verificationReason: null,
      area: null,
      outcome: null,
    });
  }

  /* An unstructured answer where a schema was demanded is a finding with no
     citations, which the gate will reject. Kept rather than dropped so the
     failure is counted. */
  if (out.length === 0 && res.text.trim() !== '') {
    out.push({
      key: 'model:unstructured',
      entityId,
      findingType: 'MODEL_STATEMENT',
      statement: res.text.trim(),
      status: 'DERIVED',
      reasoningType: 'MODEL',
      ruleId: null,
      ruleVersion: null,
      modelUsed: `${provider}/${modelClass}`,
      citations: [],
      inference: 'Unstructured model output.',
      limitations: 'The model did not answer through the required schema.',
      verification: 'UNVERIFIED',
      verificationReason: null,
      area: null,
      outcome: null,
    });
  }
  return out;
}

/**
 * The stored run status for a termination.
 *
 * A separate function rather than a ternary at the call site, because there the
 * type is already narrowed by control flow and the compiler cannot see that the
 * remaining cases are reachable from anywhere else. Written once, total, and it
 * stops compiling if a termination is added without deciding what it stores as.
 */
function runStatusFor(t: Termination): 'complete' | 'failed' | 'insufficient_evidence' {
  switch (t) {
    case 'INSUFFICIENT_EVIDENCE':
      return 'insufficient_evidence';
    case 'FAILED':
    case 'PROVIDER_UNAVAILABLE':
      return 'failed';
    default:
      /* COMPLETE, BUDGET_EXHAUSTED and SATURATED all produced an answer. A run
         that stopped at its budget is finished, not broken. */
      return 'complete';
  }
}

/** One sentence from the rule findings, so an answer exists with no model. */
function ruleSummary(findings: Finding[]): string | null {
  const established = findings.filter((f) => renderable(f) && (f.status === 'FACT' || f.status === 'DERIVED'));
  if (established.length === 0) return null;
  return established.slice(0, 4).map(plain).join(' ');
}

/* -------------------------------------------------------------------------- */
/* THE RECORD                                                                  */
/* -------------------------------------------------------------------------- */

async function openRun(d: Driver, request: IntelligenceRequest, plan: ResearchPlan): Promise<string> {
  const rows = await d.query<{ id: string }>(
    `insert into audit_run (question, status, intent, request, plan, pipeline_version, budget)
     values ($1,'retrieving',$2,$3::jsonb,$4::jsonb,$5,$6) returning id`,
    [
      request.question,
      plan.intent,
      JSON.stringify(request),
      JSON.stringify(plan),
      `${ENGINE_VERSION}+${RULE_SET_VERSION}`,
      request.maxTokens,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('could not open an audit run');
  return id;
}

async function closeRun(
  d: Driver,
  runId: string,
  status: string,
  cost: CostAccount,
  costKnown: boolean,
  error: string | null,
): Promise<void> {
  await d.query(
    `update audit_run
        set status = $2, model_calls = $3, tokens_in = $4, tokens_out = $5,
            cost_micros = $6, error = $7, finished_at = now()
      where id = $1`,
    [runId, status, cost.modelCalls, cost.tokensIn, cost.tokensOut, costKnown ? cost.costMicros : null, error],
  );
}

async function recordModelCall(
  d: Driver,
  runId: string,
  purpose: string,
  modelClass: string,
  res: ModelResponse,
): Promise<void> {
  await d.query(
    `insert into model_call (audit_run_id, purpose, model_class, provider, model,
                             tokens_in, tokens_out, cost_micros, duration_ms, ok, error)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      runId,
      purpose,
      modelClass,
      res.provider,
      res.model,
      res.tokensIn,
      res.tokensOut,
      res.costMicros,
      res.durationMs,
      res.ok ? 1 : 0,
      res.error,
    ],
  );
}

/** Estimated tokens for a packet, for callers deciding a budget up front. */
export function packetCost(packet: EvidencePacket): number {
  return packet.items.reduce((n, i) => n + estimateTokens(i.text), 0);
}
