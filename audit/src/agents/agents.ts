import type { TaskSpec } from '../jobs/dag.ts';
import { Saturation } from '../jobs/saturation.ts';
import { invoke, type AgentRole, type Invocation, type ToolContext } from './tools.ts';

/**
 * THREE AGENTS, EACH DELIBERATELY UNABLE TO DO THE OTHERS' WORK.
 *
 * ── AN AGENT HERE IS A BOUNDED LOOP, NOT A MODEL LEFT RUNNING ───────────────
 *
 * Each one is a small program with a tool contract, a turn limit and a
 * stopping rule. It decides what to do next from what the tools returned, and
 * everything it can possibly do is the list in `CONTRACTS`. That is a
 * deliberate choice rather than a limitation of ambition: a loop that a person
 * can read runs the same way twice, costs what it says it costs, and cannot
 * surprise anyone at three in the morning. The model is used where layer 4
 * uses it — inside `answer_question`, behind the citation gate — and nowhere
 * else.
 *
 * ── AND THE SEPARATION IS THE PRODUCT ───────────────────────────────────────
 *
 * The researcher fetches and never concludes. The verifier judges and cannot
 * fetch the material it judges. The analyst concludes and can do neither. A
 * single actor doing all three has no check on it: it would gather the
 * evidence that supports what it already wrote, and nothing in the output
 * would show that it had.
 *
 * When the verifier is unsatisfied it cannot go and fix the problem itself. It
 * returns a REQUEST for more research, which the orchestrator may grant or
 * refuse under loop control. That refusal is the whole point — it is the seam
 * where "keep looking until it looks good" is prevented.
 */

export interface AgentTurn {
  purpose: string;
  newObservations: number;
  newEntities: number;
  newFindings: number;
  note: string;
}

export interface AgentRun {
  ok: boolean;
  output: Record<string, unknown>;
  turns: AgentTurn[];
  /** Work this agent wants done. The orchestrator decides, not the agent. */
  requests: TaskSpec[];
  note: string;
}

/** A tool context that also records every call as it happens. */
export interface AgentContext extends ToolContext {
  call(name: string, args: unknown): Promise<Invocation>;
  /** How many turns this agent may take. Loop control, per task. */
  maxTurns: number;
}

export function agentContext(
  base: ToolContext,
  record: (name: string, args: unknown, inv: Invocation) => Promise<void>,
  maxTurns = 8,
): AgentContext {
  return {
    ...base,
    maxTurns,
    async call(name, args) {
      const inv = await invoke(base, name, args);
      await record(name, args, inv);
      return inv;
    },
  };
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/* -------------------------------------------------------------------------- */
/* RESEARCHER                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Gathers. Cannot judge what it gathered.
 *
 * It works down a ladder from cheapest to dearest, exactly as the layer 4
 * planner does: what is already held, then what is already indexed, then a
 * direct fetch of a known site, then discovery. Each rung is only climbed
 * because the one below it did not answer, and the reason is recorded per turn.
 */
export async function researcher(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentRun> {
  const turns: AgentTurn[] = [];
  const saturation = new Saturation();
  const entityIds = new Set<string>();
  const question = str(input['question']) ?? '';
  const indexedOnly = input['indexedOnly'] === true;

  /**
   * `acquisitive` is the caller's statement that this turn could have added
   * something. Only a fetch can; looking in the index or listing what is
   * already resolved cannot, however useful it is.
   */
  const turn = (purpose: string, inv: Invocation, counts: Partial<AgentTurn> & { acquisitive?: boolean } = {}) => {
    const t: AgentTurn = {
      purpose,
      newObservations: counts.newObservations ?? 0,
      newEntities: counts.newEntities ?? 0,
      newFindings: 0,
      note: inv.summary,
    };
    turns.push(t);
    saturation.record({ ...t, ok: inv.ok, acquisitive: counts.acquisitive === true });
    return t;
  };

  /* 1. What is already known about this subject. Free, and it decides the rest. */
  const known = str(input['entityId']);
  if (known !== undefined) {
    entityIds.add(known);
    const inv = await ctx.call('get_evidence', { entityId: known });
    turn('read what is already held about the subject', inv);
  } else {
    const inv = await ctx.call('find_entities', {
      ...(str(input['domain']) !== undefined ? { domain: str(input['domain']) } : {}),
      limit: 25,
    });
    turn('look for the subject among businesses already resolved', inv);
    for (const row of asArray(inv.data)) {
      const id = str((row as { id?: unknown }).id);
      if (id !== undefined) entityIds.add(id);
    }
  }

  /* 2. What is already indexed. Also free. */
  if (question !== '') {
    const inv = await ctx.call('retrieve_passages', { query: question, limit: 8 });
    turn('search the passages already indexed', inv);
  }

  if (indexedOnly) {
    return {
      ok: true,
      output: { entityIds: [...entityIds], fetched: 0, saturation: saturation.verdict() },
      turns,
      requests: [],
      note: 'worked from the existing corpus only; no fetching was permitted or needed',
    };
  }

  /* 3. The subject's own site, when one is named. One page, not a spider. */
  const domain = str(input['domain']);
  if (domain !== undefined) {
    const inv = await ctx.call('crawl_url', { url: `https://${domain.replace(/^https?:\/\//, '')}/` });
    const d = inv.data as { entityId?: unknown } | null;
    const id = str(d?.entityId);
    if (id !== undefined) entityIds.add(id);
    turn(`fetch the subject's own site`, inv, {
      acquisitive: true,
      newObservations: inv.result?.newObservations ?? 0,
      newEntities: inv.result?.newEntities ?? 0,
    });
  }

  /* 4. Discovery, last and only while it is still producing. */
  const query = str(input['entityName']) ?? question;
  let fetched = 0;
  if (query !== '' && turns.length < ctx.maxTurns) {
    const found = await ctx.call('search_web', { query, limit: 5 });
    turn('ask a discovery provider for pages about the subject', found);

    for (const row of asArray(found.data)) {
      if (turns.length >= ctx.maxTurns) break;
      if (saturation.verdict().saturated) break;
      const url = str((row as { url?: unknown }).url);
      if (url === undefined) continue;

      const inv = await ctx.call('crawl_url', { url });
      if (inv.outcome === -1) {
        /* Refused by the budget. Stop asking for more of the same thing. */
        turn('fetch a discovered page', inv);
        break;
      }
      fetched += inv.result?.pagesCrawled ?? 0;
      const id = str((inv.data as { entityId?: unknown } | null)?.entityId);
      if (id !== undefined) entityIds.add(id);
      turn('fetch a discovered page', inv, {
        acquisitive: true,
        newObservations: inv.result?.newObservations ?? 0,
        newEntities: inv.result?.newEntities ?? 0,
      });
    }
  }

  const verdict = saturation.verdict();
  return {
    ok: true,
    output: { entityIds: [...entityIds], fetched, saturation: verdict },
    turns,
    requests: [],
    note: verdict.saturated ? (verdict.reason ?? 'saturated') : `gathered from ${fetched} newly fetched page(s)`,
  };
}

/* -------------------------------------------------------------------------- */
/* VERIFIER                                                                    */
/* -------------------------------------------------------------------------- */

export interface Verdict {
  entityId: string;
  /** CORROBORATED, PARTIAL or NONE, from the store's own coverage vocabulary. */
  coverage: string;
  singleSourceFields: string[];
  conflictingFields: string[];
  /** What it would take to settle this. Never acted on by the verifier itself. */
  needs: string | null;
}

/**
 * Judges. Cannot fetch anything to judge with.
 *
 * That restriction is the design. A verifier that can go and find supporting
 * evidence will find supporting evidence — the web is large enough to
 * corroborate almost anything — and its verdict would then be about its own
 * search rather than about the record. Here it can only look at what is stored,
 * so "single-sourced" means single-sourced and not "single-sourced until I go
 * and fix that".
 */
export async function verifier(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentRun> {
  const turns: AgentTurn[] = [];
  const ids = asArray(input['entityIds']).map(str).filter((v): v is string => v !== undefined);
  const verdicts: Verdict[] = [];
  const requests: TaskSpec[] = [];

  const conflicts = await ctx.call('list_conflicts', {});
  turns.push({
    purpose: 'list every field where sources disagree',
    newObservations: 0,
    newEntities: 0,
    newFindings: 0,
    note: conflicts.summary,
  });
  const conflictByEntity = new Map<string, string[]>();
  for (const row of asArray(conflicts.data)) {
    const r = row as { entityId?: unknown; field?: unknown };
    const id = str(r.entityId);
    const field = str(r.field);
    if (id === undefined || field === undefined) continue;
    conflictByEntity.set(id, [...(conflictByEntity.get(id) ?? []), field]);
  }

  for (const id of ids.slice(0, ctx.maxTurns)) {
    const inv = await ctx.call('check_corroboration', { entityId: id });
    turns.push({
      purpose: `check what stands behind ${id.slice(0, 8)}`,
      newObservations: 0,
      newEntities: 0,
      newFindings: 0,
      note: inv.summary,
    });
    const data = inv.data as { verdict?: unknown; singleSourceFields?: unknown } | null;
    const coverage = str(data?.verdict) ?? 'NONE';
    const single = asArray(data?.singleSourceFields).map(str).filter((v): v is string => v !== undefined);
    const conflicting = conflictByEntity.get(id) ?? [];

    const needs =
      coverage === 'CORROBORATED' && conflicting.length === 0
        ? null
        : conflicting.length > 0
          ? `a person to settle ${conflicting.join(', ')}; the engine will not pick a side`
          : `a second independent source for ${single.slice(0, 4).join(', ') || 'anything at all'}`;

    verdicts.push({ entityId: id, coverage, singleSourceFields: single, conflictingFields: conflicting, needs });

    /*
     * The request, not the act. A single-sourced business is worth one more
     * look — but whether that look happens is the orchestrator's decision
     * under loop control, because "keep looking until it corroborates" is
     * exactly the loop that never terminates.
     */
    if (coverage !== 'CORROBORATED' && conflicting.length === 0) {
      requests.push({
        key: `research:${id.slice(0, 8)}`,
        kind: 'research',
        agent: 'RESEARCHER',
        dependsOn: [],
        input: { entityId: id, question: str(input['question']) ?? '' },
        rationale: `coverage is ${coverage} and ${single.length} field(s) rest on one source`,
      });
    }
  }

  const unsettled = verdicts.filter((v) => v.needs !== null).length;
  return {
    ok: true,
    output: { verdicts, entityIds: ids },
    turns,
    requests,
    note: `${verdicts.length} checked, ${unsettled} not settled`,
  };
}

/* -------------------------------------------------------------------------- */
/* ANALYST                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Concludes, and can neither fetch nor re-judge.
 *
 * Its one substantive tool is the layer 4 engine, so every finding it produces
 * has already been through the rule set, the citation check and the
 * hallucination gate before the analyst ever sees it. The analyst's own
 * contribution is selection and order — which is genuinely all that is left
 * once the evidence is fixed.
 */
export async function analyst(ctx: AgentContext, input: Record<string, unknown>): Promise<AgentRun> {
  const turns: AgentTurn[] = [];
  const ids = asArray(input['entityIds']).map(str).filter((v): v is string => v !== undefined);
  const question = str(input['question']) ?? '';
  const maxModelCalls = typeof input['maxModelCalls'] === 'number' ? (input['maxModelCalls'] as number) : 0;
  const results: unknown[] = [];

  const subjects = ids.length > 0 ? ids.slice(0, ctx.maxTurns) : [undefined];
  for (const id of subjects) {
    const inv = await ctx.call('answer_question', {
      question,
      ...(id !== undefined ? { entityId: id } : {}),
      /* The remaining allowance, divided rather than granted afresh per
         subject. An analyst with twenty subjects must not get twenty budgets. */
      maxModelCalls: Math.max(0, Math.min(maxModelCalls, ctx.budget.limits.modelCalls - ctx.budget.ledger.modelCalls)),
    });
    turns.push({
      purpose: id === undefined ? 'answer the question' : `answer for ${id.slice(0, 8)}`,
      newObservations: 0,
      newEntities: 0,
      newFindings: inv.result?.newFindings ?? 0,
      note: inv.summary,
    });
    if (inv.data !== null) results.push(inv.data);
    if (inv.outcome === -1) break;
  }

  return {
    ok: results.length > 0,
    output: { answers: results },
    turns,
    requests: [],
    note: `${results.length} answer(s) produced`,
  };
}

export const AGENTS: Record<
  Exclude<AgentRole, 'SYSTEM'>,
  (ctx: AgentContext, input: Record<string, unknown>) => Promise<AgentRun>
> = {
  RESEARCHER: researcher,
  VERIFIER: verifier,
  ANALYST: analyst,
};
