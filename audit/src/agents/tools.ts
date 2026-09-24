import { z } from 'zod';

import type { Driver } from '../db/client.ts';
import type { Crawler } from '../crawl/fetch.ts';
import type { ModelProvider } from '../model/types.ts';
import type { Budget, ToolCost } from '../jobs/budget.ts';
import { ingestOne } from '../index/ingest.ts';
import { ingestEntitiesFromDocument } from '../entity/pipeline.ts';
import { ProviderRegistry } from '../search/providers.ts';
import { retrieve } from '../retrieve/hybrid.ts';
import { answer } from '../intel/engine.ts';
import * as Q from '../entity/query.ts';

/**
 * EVERYTHING AN AGENT CAN DO, AND NOTHING ELSE.
 *
 * ── A FIXED TABLE, NOT A DISPATCHER ─────────────────────────────────────────
 *
 * This is the same construction as the Lab's fictional shell: a named entry in
 * a `Map`, reached by exact match, with no `eval`, no dynamic import, no
 * string-to-function lookup and no passthrough. An agent cannot run SQL,
 * cannot run a shell, cannot read the filesystem and cannot reach the network
 * except through `search_web` and `crawl_url` — which go through the layer 2
 * guard that already refuses private addresses and honours robots.
 *
 * An unknown tool name is an unknown tool name. Nothing an agent emits can
 * reach past this file.
 *
 * ── AND THE CONTRACTS ARE WHAT MAKE THREE AGENTS WORTH HAVING ───────────────
 *
 * One actor that can both gather evidence and decide whether the evidence is
 * good has no check on it at all. So the researcher can fetch and cannot judge,
 * the verifier can judge and cannot fetch new material to judge with, and the
 * analyst can read both and write findings but can do neither of the other
 * two things. The separation is enforced here rather than in a prompt, because
 * a prompt is a request and a `Set` is a rule.
 */

export type AgentRole = 'SYSTEM' | 'RESEARCHER' | 'VERIFIER' | 'ANALYST';

export interface ToolContext {
  d: Driver;
  jobId: string;
  taskId: string;
  agent: AgentRole;
  budget: Budget;
  crawler: Crawler;
  provider: ModelProvider;
  search: ProviderRegistry;
  /** For phone normalisation. No default, ever. */
  country?: string;
}

export interface ToolResult {
  ok: boolean;
  /** A sentence for the record. Never the whole payload. */
  summary: string;
  data: unknown;
  /** The saturation signal: what this call actually added. */
  newObservations?: number;
  newEntities?: number;
  newFindings?: number;
  /** What it actually spent, which may be less than it was allowed. */
  pagesCrawled?: number;
  searches?: number;
  modelCalls?: number;
  tokensIn?: number;
  tokensOut?: number;
  costMicros?: number | null;
}

export interface Tool {
  name: string;
  describe: string;
  args: z.ZodTypeAny;
  /**
   * What this call will cost at worst, declared before it runs.
   *
   * A function where the answer depends on the arguments, which is not an
   * embellishment: `answer_question` with `maxModelCalls: 0` costs no model
   * calls, and a flat declaration of 1 would have the budget refuse the
   * deterministic path — the cheapest one, and the one the whole design
   * prefers — for being too expensive.
   */
  cost: ToolCost | ((args: never) => ToolCost);
  run(ctx: ToolContext, args: never): Promise<ToolResult>;
}

const tool = <S extends z.ZodTypeAny>(t: {
  name: string;
  describe: string;
  args: S;
  cost: ToolCost | ((args: z.infer<S>) => ToolCost);
  run(ctx: ToolContext, args: z.infer<S>): Promise<ToolResult>;
}): Tool => t as unknown as Tool;

const costOf = (t: Tool, args: unknown): ToolCost =>
  typeof t.cost === 'function' ? (t.cost as (a: unknown) => ToolCost)(args) : t.cost;

/* -------------------------------------------------------------------------- */
/* GATHERING — the researcher's half                                           */
/* -------------------------------------------------------------------------- */

const searchWeb = tool({
  name: 'search_web',
  describe: 'Ask the configured discovery provider for pages matching a query.',
  args: z.object({
    query: z.string().min(2).max(300),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  cost: { searches: 1 },
  async run(ctx, args) {
    const provider = ctx.search.default();
    const res = await provider.search(args.query, { limit: args.limit });
    if (res.unavailable !== undefined) {
      /* An unavailable provider is an ordinary outcome, not an exception: the
         job carries on with whatever is already indexed and says so. */
      return {
        ok: false,
        summary: `discovery unavailable (${res.unavailable.reason}): ${res.unavailable.detail}`,
        data: [],
        searches: 1,
      };
    }
    const results = res.results.slice(0, args.limit);
    return {
      ok: true,
      summary: `${results.length} result(s) from ${provider.id} for "${args.query}"`,
      /* Snippets are RANKING_ONLY and stay that way: the agent gets URLs and
         titles, so nothing it writes can be traced back to a provider blurb. */
      data: results.map((r) => ({ url: r.url, title: r.title })),
      searches: 1,
    };
  },
});

const crawlUrl = tool({
  name: 'crawl_url',
  describe: 'Fetch one URL, extract it, index it, and resolve any business it names.',
  args: z.object({
    url: z.string().url().max(2000),
    resolveEntities: z.boolean().default(true),
  }),
  cost: { pages: 1 },
  async run(ctx, args) {
    const found = await ctx.search.get('direct')?.search(args.url);
    const first = found?.results[0];
    if (first === undefined) {
      return { ok: false, summary: `not a fetchable URL: ${args.url}`, data: null };
    }
    const ing = await ingestOne(ctx.d, first, { crawler: ctx.crawler });
    if (ing.documentId === null) {
      /* A refusal is a result. `blocked_robots` in particular is the crawler
         working, and it is reported as such rather than retried. */
      return {
        ok: false,
        summary: `${ing.outcome}${ing.detail !== null ? ` — ${ing.detail}` : ''}`,
        data: { outcome: ing.outcome },
        pagesCrawled: 1,
      };
    }
    if (!args.resolveEntities) {
      return {
        ok: true,
        summary: `read ${args.url}: ${ing.chunks} passage(s), ${ing.extractedFields} extracted value(s)`,
        data: { documentId: ing.documentId, chunks: ing.chunks },
        pagesCrawled: 1,
      };
    }
    const r = await ingestEntitiesFromDocument(ctx.d, ing.documentId, {
      ...(ctx.country !== undefined ? { country: ctx.country } : {}),
    });
    return {
      ok: true,
      summary: `read ${args.url}: ${r.observations} observation(s), ${r.claims} claim(s), resolution ${r.decision ?? 'none'}`,
      data: { documentId: ing.documentId, entityId: r.entityId, decision: r.decision },
      pagesCrawled: 1,
      newObservations: r.observations,
      newEntities: r.decision === 'NEW' ? 1 : 0,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* READING — available to everyone, because reading costs nothing              */
/* -------------------------------------------------------------------------- */

const retrievePassages = tool({
  name: 'retrieve_passages',
  describe: 'Search the already-indexed corpus. Never fetches anything new.',
  args: z.object({
    query: z.string().min(2).max(500),
    limit: z.number().int().min(1).max(20).default(8),
    subjectId: z.string().uuid().optional(),
  }),
  cost: {},
  async run(ctx, args) {
    const report = await retrieve(ctx.d, args.query, {
      limit: args.limit,
      ...(args.subjectId !== undefined ? { subjectId: args.subjectId } : {}),
    });
    return {
      ok: true,
      summary: `${report.returned.length} passage(s) from ${new Set(report.returned.map((r) => r.domain)).size} domain(s)`,
      data: report.returned.map((r) => ({ chunkId: r.chunkId, url: r.url, text: r.text.slice(0, 600) })),
    };
  },
});

const findEntities = tool({
  name: 'find_entities',
  describe: 'Select known businesses by type, domain, category or proximity.',
  args: z.object({
    type: z.string().max(40).optional(),
    domain: z.string().max(253).optional(),
    category: z.string().max(60).optional(),
    nearLat: z.number().min(-90).max(90).optional(),
    nearLon: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().positive().max(500).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  cost: {},
  async run(ctx, args) {
    let rows: Array<{ id: string; canonicalName: string; type: string }>;
    if (args.domain !== undefined) rows = await Q.findByDomain(ctx.d, args.domain);
    else if (args.category !== undefined) rows = await Q.findByCategory(ctx.d, args.category, args.limit);
    else if (args.nearLat !== undefined && args.nearLon !== undefined) {
      rows = await Q.findNearby(ctx.d, args.nearLat, args.nearLon, args.radiusKm ?? 10);
    } else rows = await Q.findEntities(ctx.d, { ...(args.type !== undefined ? { type: args.type } : {}), limit: args.limit });

    return {
      ok: true,
      summary: `${rows.length} entit${rows.length === 1 ? 'y' : 'ies'}`,
      data: rows.slice(0, args.limit).map((e) => ({ id: e.id, name: e.canonicalName, type: e.type })),
    };
  },
});

const getEvidence = tool({
  name: 'get_evidence',
  describe: 'The full claim-to-URL chain for one business. This is "how do you know that".',
  args: z.object({ entityId: z.string().uuid() }),
  cost: {},
  async run(ctx, args) {
    const chain = await Q.getEntityEvidence(ctx.d, args.entityId);
    const coverage = await Q.getCoverage(ctx.d, args.entityId);
    return {
      ok: true,
      summary: `${chain.length} claim(s), ${coverage.sourcesChecked} source(s), coverage ${coverage.verdict}`,
      data: {
        coverage,
        claims: chain.map((c) => ({
          field: c.field,
          value: c.value,
          status: c.status,
          temporal: c.temporal,
          sources: c.evidence.map((e) => ({ url: e.url, observedAt: e.observedAt, excerpt: e.excerpt })),
        })),
      },
    };
  },
});

/* -------------------------------------------------------------------------- */
/* CHECKING — the verifier's half                                              */
/* -------------------------------------------------------------------------- */

const listConflicts = tool({
  name: 'list_conflicts',
  describe: 'Fields where two sources disagree, across the corpus or for one business.',
  args: z.object({ field: z.string().max(40).optional() }),
  cost: {},
  async run(ctx, args) {
    const rows = await Q.findConflicts(ctx.d, args.field);
    return {
      ok: true,
      summary: `${rows.length} conflicting field(s)`,
      data: rows.map((r) => ({ entityId: r.entityId, entity: r.entityName, field: r.field, values: r.values.slice(0, 5) })),
    };
  },
});

const checkCorroboration = tool({
  name: 'check_corroboration',
  describe: 'How many independent sources stand behind a business, and which fields rest on one.',
  args: z.object({ entityId: z.string().uuid() }),
  cost: {},
  async run(ctx, args) {
    const chain = await Q.getEntityEvidence(ctx.d, args.entityId);
    const coverage = await Q.getCoverage(ctx.d, args.entityId);
    const single = chain.filter((c) => c.value !== 'UNKNOWN' && c.sourceCount <= 1).map((c) => c.field);
    return {
      ok: true,
      summary: `${coverage.verdict}; ${single.length} field(s) rest on a single source`,
      data: { verdict: coverage.verdict, sourcesChecked: coverage.sourcesChecked, singleSourceFields: single },
    };
  },
});

/* -------------------------------------------------------------------------- */
/* CONCLUDING — the analyst's half                                             */
/* -------------------------------------------------------------------------- */

const answerQuestion = tool({
  name: 'answer_question',
  describe: 'Run the layer 4 engine: plan, evidence, rules, verification, findings.',
  args: z.object({
    question: z.string().min(3).max(2000),
    entityId: z.string().uuid().optional(),
    maxModelCalls: z.number().int().min(0).max(4).default(0),
  }),
  /* What this particular call may spend, which is what the caller asked for.
     A run with no model allowance is the cheapest path through the engine and
     must not be refused for a cost it will not incur. */
  cost: (args: { maxModelCalls: number }) => ({ modelCalls: args.maxModelCalls }),
  async run(ctx, args) {
    const res = await answer(
      ctx.d,
      {
        question: args.question,
        ...(args.entityId !== undefined ? { entityId: args.entityId } : {}),
        maxModelCalls: args.maxModelCalls,
        /* The job's remaining allowance, not a fresh one. An agent cannot
           widen its own budget by asking for a new run. */
        maxTokens: Math.max(1_000, ctx.budget.limits.tokens - ctx.budget.ledger.tokensIn - ctx.budget.ledger.tokensOut),
      },
      { provider: ctx.provider },
    );
    return {
      ok: res.termination !== 'FAILED',
      summary: `${res.intent}: ${res.established.length} established, ${res.gaps.length} gap(s), ${res.withheld.length} withheld — ${res.termination}`,
      data: {
        runId: res.runId,
        summary: res.summary,
        established: res.established.map((f) => f.statement),
        gaps: res.gaps.map((f) => f.statement),
        conflicts: res.conflicts.map((f) => f.statement),
        recommendations: res.recommendations.map((f) => f.statement),
        limitations: res.limitations,
        termination: res.termination,
      },
      newFindings: res.established.length + res.gaps.length + res.conflicts.length,
      modelCalls: res.cost.modelCalls,
      tokensIn: res.cost.tokensIn,
      tokensOut: res.cost.tokensOut,
      costMicros: res.cost.costMicros < 0 ? null : res.cost.costMicros,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* THE REGISTRY AND THE CONTRACTS                                              */
/* -------------------------------------------------------------------------- */

export const TOOLS: ReadonlyMap<string, Tool> = new Map(
  [searchWeb, crawlUrl, retrievePassages, findEntities, getEvidence, listConflicts, checkCorroboration, answerQuestion].map(
    (t) => [t.name, t],
  ),
);

/**
 * Who may call what.
 *
 * The researcher gathers and cannot conclude. The verifier checks and cannot
 * fetch — it can only work with what is already in the store, which is what
 * makes its verdict about the evidence rather than about its own new material.
 * The analyst concludes and can do neither.
 *
 * SYSTEM is every tool, and it is not an agent: it is the orchestrator running
 * a deterministic step that a person wrote.
 */
export const CONTRACTS: Record<AgentRole, ReadonlySet<string>> = {
  SYSTEM: new Set(TOOLS.keys()),
  RESEARCHER: new Set(['search_web', 'crawl_url', 'retrieve_passages', 'find_entities', 'get_evidence']),
  VERIFIER: new Set(['retrieve_passages', 'find_entities', 'get_evidence', 'list_conflicts', 'check_corroboration']),
  ANALYST: new Set(['retrieve_passages', 'find_entities', 'get_evidence', 'list_conflicts', 'answer_question']),
};

export interface Invocation {
  ok: boolean;
  /** -1 refused by contract or budget, 0 failed, 1 succeeded. */
  outcome: -1 | 0 | 1;
  summary: string;
  data: unknown;
  result: ToolResult | null;
  durationMs: number;
}

/**
 * Call a tool, or say precisely why not.
 *
 * Four gates, in this order: the name exists, the agent is allowed it, the
 * arguments validate, the budget permits it. Each refusal is recorded as a
 * `tool_call` row with outcome -1, because an agent reaching repeatedly for
 * something it does not have is a fact worth being able to query.
 */
export async function invoke(ctx: ToolContext, name: string, rawArgs: unknown): Promise<Invocation> {
  const startedAt = performance.now();
  const done = (outcome: -1 | 0 | 1, summary: string, data: unknown, result: ToolResult | null = null): Invocation => ({
    ok: outcome === 1,
    outcome,
    summary,
    data,
    result,
    durationMs: Math.round(performance.now() - startedAt),
  });

  const t = TOOLS.get(name);
  if (t === undefined) {
    return done(-1, `no such tool: ${name}`, null);
  }

  const allowed = CONTRACTS[ctx.agent];
  if (!allowed.has(name)) {
    return done(
      -1,
      `${ctx.agent} may not call ${name}. Its contract is: ${[...allowed].join(', ')}`,
      null,
    );
  }

  const parsed = t.args.safeParse(rawArgs);
  if (!parsed.success) {
    return done(0, `invalid arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`, null);
  }

  const refusal = ctx.budget.canAfford(costOf(t, parsed.data));
  if (refusal !== null) {
    return done(-1, `${name} not run: ${refusal.reason}`, null);
  }

  try {
    const result = await t.run(ctx, parsed.data as never);
    ctx.budget.spend({
      toolCalls: 1,
      searches: result.searches ?? 0,
      pagesCrawled: result.pagesCrawled ?? 0,
      modelCalls: result.modelCalls ?? 0,
      tokensIn: result.tokensIn ?? 0,
      tokensOut: result.tokensOut ?? 0,
      ...(result.costMicros !== undefined ? { costMicros: result.costMicros } : {}),
    });
    return done(result.ok ? 1 : 0, result.summary, result.data, result);
  } catch (err) {
    /* A tool that throws still spent whatever it spent getting there; the
       ledger is corrected with what is knowable rather than left optimistic. */
    ctx.budget.spend({ toolCalls: 1 });
    return done(0, err instanceof Error ? err.message : String(err), null);
  }
}

/** The tool list an agent may be told about. Used to build its instructions. */
export function contractOf(agent: AgentRole): Array<{ name: string; describe: string }> {
  return [...CONTRACTS[agent]]
    .map((n) => TOOLS.get(n))
    .filter((t): t is Tool => t !== undefined)
    .map((t) => ({ name: t.name, describe: t.describe }));
}
