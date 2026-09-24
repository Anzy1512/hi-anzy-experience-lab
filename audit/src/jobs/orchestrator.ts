import type { Driver } from '../db/client.ts';
import { Crawler } from '../crawl/fetch.ts';
import { ProviderRegistry } from '../search/providers.ts';
import { createProvider } from '../model/route.ts';
import type { ModelProvider } from '../model/types.ts';
import { parseRequest, type IntelligenceRequest, type Termination } from '../intel/contract.ts';
import { planResearch } from '../intel/planner.ts';
import { AGENTS, agentContext, type AgentRun } from '../agents/agents.ts';
import type { AgentRole, Invocation, ToolContext } from '../agents/tools.ts';
import { Budget } from './budget.ts';
import { blockedTasks, planToTasks, readyTasks, validateDag, type TaskNode, type TaskSpec, type TaskState } from './dag.ts';
import { LoopControl } from './saturation.ts';

/**
 * ONE ORCHESTRATOR.
 *
 * ── WHY THERE IS EXACTLY ONE ───────────────────────────────────────────────
 *
 * Every multi-agent system that grows a second scheduler ends up with two
 * answers to "what runs next", and the interesting bugs live in the gap
 * between them. This is the only thing in the service that starts work. Agents
 * do not call agents; they return REQUESTS, and this decides.
 *
 * That is also where loop control lives. The verifier asking for more research
 * on a single-sourced business is reasonable once and a non-terminating loop
 * forever, and the difference is a decision that has to be made somewhere that
 * can see the whole job.
 *
 * ── AND WHY THE STATE IS ENTIRELY IN THE DATABASE ───────────────────────────
 *
 * The loop below holds nothing across iterations that is not a row. Tasks are
 * re-read from the store each time round, because a job that can be resumed
 * after a crash and a job whose scheduler keeps its DAG in memory are not the
 * same job. Resume here is not a feature that was added: it is what you get
 * for free once the state has only one home.
 */

export const ORCHESTRATOR_VERSION = 'l5-orchestrator-1';

/** How many times one task may be attempted before it is given up on. */
const MAX_ATTEMPTS = 2;

export interface JobOptions {
  provider?: ModelProvider;
  crawler?: Crawler;
  search?: ProviderRegistry;
  projectId?: string;
  maxTasks?: number;
  maxIterations?: number;
  /** How many times one subject may be sent back for more research. */
  maxRounds?: number;
  turnsPerTask?: number;
}

export interface JobResult {
  jobId: string;
  state: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  termination: Termination;
  tasks: TaskNode[];
  /** The analyst's answers, as produced through the layer 4 engine. */
  answers: unknown[];
  limitations: string[];
  ledger: Budget['ledger'];
  iterations: number;
}

/* -------------------------------------------------------------------------- */
/* CREATING                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Turn a request into a job and a validated graph, and run nothing.
 *
 * Splitting creation from execution is what makes a cyclic or malformed graph
 * a refusal rather than an expensive discovery: the problems come back here,
 * before a single page has been fetched.
 */
export async function createJob(
  d: Driver,
  input: unknown,
  opts: JobOptions = {},
): Promise<{ jobId: string; problems: string[]; request: IntelligenceRequest }> {
  const request = parseRequest(input);
  const { plan } = planResearch(request);
  const specs = planToTasks(plan, request);
  const problems = validateDag(specs).map((p) => `${p.kind}: ${p.detail}`);

  /*
   * A job refuses an unclassifiable question for the same reason layer 4 does,
   * and it has to refuse it HERE.
   *
   * Left to run, an unknown intent produces a plan with no steps, a graph that
   * executes, and an answer built on nothing — which costs real time and looks
   * from the outside like the research simply found little. Saying so before
   * anything starts is the difference between a refusal and a disappointment.
   */
  if (plan.intent === 'UNKNOWN_INTENT') {
    problems.push(...(plan.openQuestions.length > 0 ? plan.openQuestions : ['the question could not be classified']));
  }

  const rows = await d.query<{ id: string }>(
    `insert into job (question, request, intent, state, project_id, subject_entity_id, limitations)
     values ($1,$2::jsonb,$3,$4,$5,$6,$7::jsonb) returning id`,
    [
      request.question,
      JSON.stringify(request),
      plan.intent,
      problems.length > 0 ? 'FAILED' : 'QUEUED',
      opts.projectId ?? request.projectId ?? null,
      request.entityId ?? null,
      JSON.stringify(problems.length > 0 ? problems : plan.openQuestions),
    ],
  );
  const jobId = rows[0]?.id;
  if (jobId === undefined) throw new Error('could not create a job');

  if (problems.length > 0) {
    await d.query(`update job set termination = 'FAILED', error = $2, finished_at = now() where id = $1`, [
      jobId,
      problems.join('; '),
    ]);
    return { jobId, problems, request };
  }

  for (const [ord, s] of specs.entries()) await insertTask(d, jobId, s, ord, null);
  return { jobId, problems, request };
}

async function insertTask(
  d: Driver,
  jobId: string,
  spec: TaskSpec,
  ord: number,
  createdByTask: string | null,
): Promise<void> {
  await d.query(
    `insert into task (job_id, key, kind, agent, depends_on, input, rationale, ord, created_by_task)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
     on conflict (job_id, key) do nothing`,
    [
      jobId,
      spec.key,
      spec.kind,
      spec.agent,
      JSON.stringify(spec.dependsOn),
      JSON.stringify(spec.input),
      spec.rationale,
      ord,
      createdByTask,
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* RUNNING                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Run a job to a stopping point, and return what it managed.
 *
 * Safe to call again on the same job: completed tasks are not redone, and a
 * task left RUNNING by a process that died is returned to PENDING so it can be
 * picked up. That is the whole of resume.
 */
export async function runJob(d: Driver, jobId: string, opts: JobOptions = {}): Promise<JobResult> {
  const jobRows = await d.query<{ request: unknown; state: string; iterations: number }>(
    'select request, state, iterations from job where id = $1',
    [jobId],
  );
  const jobRow = jobRows[0];
  if (jobRow === undefined) throw new Error(`no job ${jobId}`);

  const request = parseRequest(typeof jobRow.request === 'string' ? JSON.parse(jobRow.request) : jobRow.request);
  const budget = new Budget(request, {
    ...(opts.maxTasks !== undefined ? { maxTasks: opts.maxTasks } : {}),
    ...(opts.maxIterations !== undefined ? { maxIterations: opts.maxIterations } : {}),
  });
  const loop = new LoopControl(opts.maxRounds ?? 2);
  const provider = opts.provider ?? createProvider();
  const crawler = opts.crawler ?? new Crawler();
  const search = opts.search ?? ProviderRegistry.fromConfig();

  /* A task left RUNNING belongs to a process that is no longer here. Its
     attempt counted, so a task that crashes the worker twice is given up on
     rather than crashing it forever. */
  await d.query(`update task set state = 'PENDING' where job_id = $1 and state = 'RUNNING'`, [jobId]);
  await d.query(`update job set state = 'RUNNING', started_at = coalesce(started_at, now()), heartbeat_at = now() where id = $1`, [jobId]);

  const limitations: string[] = [];
  let termination: Termination = 'COMPLETE';
  let iterations = jobRow.iterations;

  for (;;) {
    const stopped = budget.exhausted();
    if (stopped !== null) {
      termination = 'BUDGET_EXHAUSTED';
      break;
    }

    const tasks = await loadTasks(d, jobId);
    const ready = readyTasks(tasks);

    if (ready.length === 0) {
      const blocked = blockedTasks(tasks);
      for (const b of blocked) {
        await setTaskState(d, b.id, 'SKIPPED', { error: 'a task it waits on failed' });
      }
      if (blocked.length > 0) {
        termination = 'FAILED';
        limitations.push(`${blocked.length} task(s) were skipped because something they depend on failed.`);
      }
      break;
    }

    for (const t of ready) {
      if (budget.exhausted() !== null) break;
      const run = await executeTask(d, jobId, t, { budget, provider, crawler, search, request, turns: opts.turnsPerTask ?? 8 });

      if (run === null) continue;

      /* Requests, granted or refused. This is the only place either happens. */
      for (const req of run.requests) {
        const subject = String(req.input['entityId'] ?? req.key);
        if (!loop.mayRepeat(subject)) {
          limitations.push(
            `${subject.slice(0, 8)} was not researched again: it has already had ${opts.maxRounds ?? 2} round(s), ` +
              'and repeating until the evidence looks better is not research.',
          );
          continue;
        }
        if (budget.ledger.tasks >= budget.limits.tasks) break;
        loop.record(subject);
        budget.spend({ tasks: 1 });

        /*
         * A follow-up inherits the request's own restrictions.
         *
         * Without this the verifier's extra research task tries to search,
         * gets refused, and records a budget refusal for a job that was never
         * allowed to fetch anything — work done to produce a misleading line in
         * the report.
         */
        if (request.maxPages === 0 && request.maxSearches === 0) req.input['indexedOnly'] = true;

        const round = `${req.key}:r${loop.mayRepeat(subject) ? '2' : 'final'}`;
        await insertTask(d, jobId, { ...req, key: round }, 100 + budget.ledger.tasks, t.key);
        /* The analysis waits for the extra work rather than racing it. */
        await addDependency(d, jobId, 'analyse', round);
      }
    }

    /*
     * Charged after the work, not before.
     *
     * Charging first and then checking the budget per task means the final
     * permitted iteration is accounted for and then refused, so a job capped at
     * one iteration does nothing at all. An iteration is only spent once it has
     * been used for something.
     */
    iterations += 1;
    budget.spend({ iterations: 1 });
    await d.query('update job set iterations = $2, heartbeat_at = now() where id = $1', [jobId, iterations]);
  }

  const finalTasks = await loadTasks(d, jobId);
  const done = finalTasks.filter((t) => t.state === 'DONE');
  const failed = finalTasks.filter((t) => t.state === 'FAILED');
  const pending = finalTasks.filter((t) => t.state === 'PENDING');

  /*
   * A job whose graph finished but whose research was cut short by a limit did
   * not complete — it stopped. `state` and `termination` exist to say those two
   * different things: the work finished (state), and it finished early because
   * of the budget (termination).
   *
   * Checked before saturation, because saturation measured under a truncated
   * search is not saturation. "Two more attempts found nothing" means something
   * only when two more attempts were allowed.
   */
  if (termination === 'COMPLETE' && budget.curtailed.length > 0) {
    termination = 'BUDGET_EXHAUSTED';
  }

  /* Saturation is a real termination and outranks a plain COMPLETE: it says
     something about the world rather than about the graph being finished. */
  const research = done.find((t) => t.kind === 'research');
  const sat = (research?.output as { saturation?: { saturated?: unknown; reason?: unknown } } | null)?.saturation;
  if (termination === 'COMPLETE' && sat?.saturated === true) {
    termination = 'SATURATED';
    if (typeof sat.reason === 'string') limitations.push(sat.reason);
  }

  limitations.push(...budget.limitationLines());

  /*
   * Stated from the REQUEST, not from whether a tool happened to ask.
   *
   * With fetching disallowed the agents never attempt it, so no refusal is
   * recorded and the budget has nothing to report — and the job comes back with
   * an empty limitations list, reading as though it had looked everywhere. What
   * was excluded is a property of the request and belongs in the answer whether
   * or not anything bumped into it.
   */
  if (request.maxPages === 0 && request.maxSearches === 0) {
    limitations.push(
      'This run was not permitted to fetch anything. It answered from material already in the ' +
        'store, so nothing that would only be found by looking further was looked for.',
    );
  }

  if (pending.length > 0 && termination === 'COMPLETE') termination = 'BUDGET_EXHAUSTED';

  const answers = done
    .filter((t) => t.kind === 'analyse')
    .flatMap((t) => ((t.output as { answers?: unknown[] } | null)?.answers ?? []));

  if (answers.length === 0 && termination === 'COMPLETE') termination = 'INSUFFICIENT_EVIDENCE';

  /*
   * What the answers themselves could not establish.
   *
   * The layer 4 engine states its limits per answer — unresolved fields, thin
   * coverage, synthesis that did not happen. A job that dropped those on the
   * floor would present the same conclusions with the qualifications removed,
   * which is the one transformation this whole system exists to prevent.
   */
  for (const a of answers) {
    const stated = (a as { limitations?: unknown }).limitations;
    if (Array.isArray(stated)) limitations.push(...stated.filter((v): v is string => typeof v === 'string'));
  }
  if (!provider.available && request.maxModelCalls > 0) {
    limitations.push(`No narrative was written: ${provider.unavailableReason ?? 'no model provider is configured'}.`);
  }
  limitations.push(...loop.exhausted().map((s) => `${s.slice(0, 8)} reached its research limit and was left as it stands.`));

  const state = failed.length > 0 && done.length === 0 ? 'FAILED' : failed.length > 0 || pending.length > 0 ? 'PARTIAL' : 'COMPLETE';

  await d.query(
    `update job set state = $2, termination = $3, model_calls = $4, tool_calls = $5,
          tokens_in = $6, tokens_out = $7, cost_micros = $8, searches = $9, pages_crawled = $10,
          iterations = $11, limitations = $12::jsonb, finished_at = now(), heartbeat_at = now()
     where id = $1`,
    [
      jobId,
      state,
      termination,
      budget.ledger.modelCalls,
      budget.ledger.toolCalls,
      budget.ledger.tokensIn,
      budget.ledger.tokensOut,
      budget.ledger.costMicros,
      budget.ledger.searches,
      budget.ledger.pagesCrawled,
      iterations,
      JSON.stringify([...new Set(limitations)]),
    ],
  );

  return {
    jobId,
    state,
    termination,
    tasks: finalTasks,
    answers,
    limitations: [...new Set(limitations)],
    ledger: budget.ledger,
    iterations,
  };
}

/* -------------------------------------------------------------------------- */
/* ONE TASK                                                                    */
/* -------------------------------------------------------------------------- */

interface ExecContext {
  budget: Budget;
  provider: ModelProvider;
  crawler: Crawler;
  search: ProviderRegistry;
  request: IntelligenceRequest;
  turns: number;
}

async function executeTask(d: Driver, jobId: string, t: TaskNode, x: ExecContext): Promise<AgentRun | null> {
  await d.query(`update task set state = 'RUNNING', attempts = attempts + 1, started_at = now() where id = $1`, [t.id]);

  const base: ToolContext = {
    d,
    jobId,
    taskId: t.id,
    agent: t.agent,
    budget: x.budget,
    crawler: x.crawler,
    provider: x.provider,
    search: x.search,
    ...(x.request.country !== undefined ? { country: x.request.country } : {}),
  };

  const record = async (name: string, args: unknown, inv: Invocation): Promise<void> => {
    await d.query(
      `insert into tool_call (task_id, agent, tool, args, outcome, result, error, duration_ms, pages_crawled, searches)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10)`,
      [
        t.id,
        t.agent,
        name,
        JSON.stringify(args ?? {}),
        inv.outcome,
        inv.summary.slice(0, 1000),
        inv.outcome === 1 ? null : inv.summary.slice(0, 1000),
        inv.durationMs,
        inv.result?.pagesCrawled ?? 0,
        inv.result?.searches ?? 0,
      ],
    );
  };

  try {
    const input = await resolveInput(d, jobId, t, x);
    const run = t.agent === 'SYSTEM' ? await systemTask(d, jobId, t, input, x) : await AGENTS[t.agent](agentContext(base, record, x.turns), input);

    for (const [i, turn] of run.turns.entries()) {
      await d.query(
        `insert into agent_step (task_id, agent, turn, purpose, new_observations, new_entities, new_findings, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [t.id, t.agent, i + 1, turn.purpose, turn.newObservations, turn.newEntities, turn.newFindings, turn.note.slice(0, 1000)],
      );
    }

    await setTaskState(d, t.id, run.ok ? 'DONE' : 'FAILED', {
      output: run.output,
      ...(run.ok ? {} : { error: run.note }),
    });

    /*
     * Link the task to the run it produced.
     *
     * The column was declared with layer 5 and nothing wrote it, which meant a
     * finding could not be traced back to the job that caused it — the join
     * existed on paper and returned nothing. Set only when there is exactly one
     * run, because a task that answered for six businesses produced six, and
     * picking one of those to be "the" run would be a false record. All of them
     * are in the task's output either way.
     */
    const produced = runIdsIn(run.output);
    if (produced.length === 1) {
      await d.query('update task set audit_run_id = $2 where id = $1', [t.id, produced[0] ?? null]);
    }
    /* A task that failed on its first attempt goes back in the queue; one that
       has used its attempts stays FAILED and blocks what depends on it. */
    if (!run.ok && t.attempts + 1 < MAX_ATTEMPTS) await setTaskState(d, t.id, 'PENDING', { error: run.note });
    return run.ok ? run : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const giveUp = t.attempts + 1 >= MAX_ATTEMPTS;
    await setTaskState(d, t.id, giveUp ? 'FAILED' : 'PENDING', { error: message });
    return null;
  }
}

/**
 * What a task is given, assembled from what the tasks before it produced.
 *
 * Read from the store rather than passed in memory, for the same reason the
 * loop re-reads the graph: a resumed job has no memory of the turn that
 * produced its input, and only the row does.
 */
async function resolveInput(d: Driver, jobId: string, t: TaskNode, x: ExecContext): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = { ...t.input };
  if (t.kind === 'seed') return input;

  const upstream = await d.query<{ key: string; output: unknown; kind: string }>(
    `select key, output, kind from task where job_id = $1 and state = 'DONE' order by ord`,
    [jobId],
  );

  const ids = new Set<string>();
  for (const u of upstream) {
    const out = (typeof u.output === 'string' ? JSON.parse(u.output) : u.output) as { entityIds?: unknown } | null;
    for (const v of Array.isArray(out?.entityIds) ? out.entityIds : []) if (typeof v === 'string') ids.add(v);
  }
  if (typeof input['entityId'] === 'string') ids.add(input['entityId']);
  input['entityIds'] = [...ids];
  input['question'] ??= x.request.question;
  return input;
}

/**
 * The deterministic tasks, which are most of them.
 *
 * `seed` resolves the subject; `report` writes the artifact. Neither needs an
 * agent, and giving them one would mean paying a loop to do a lookup.
 */
async function systemTask(
  d: Driver,
  jobId: string,
  t: TaskNode,
  input: Record<string, unknown>,
  x: ExecContext,
): Promise<AgentRun> {
  if (t.kind === 'seed') {
    const domain = typeof input['domain'] === 'string' ? input['domain'] : null;
    const rows =
      domain !== null
        ? await d.query<{ id: string }>(
            `select e.id from entity e join entity_identifier i on i.entity_id = e.id
              where i.kind = 'domain' and i.value = $1 and e.status = 'ACTIVE' limit 5`,
            [domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')],
          )
        : [];
    const entityIds = [
      ...new Set([...(typeof input['entityId'] === 'string' ? [input['entityId']] : []), ...rows.map((r) => r.id)]),
    ];
    if (entityIds[0] !== undefined) {
      await d.query('update job set subject_entity_id = $2 where id = $1', [jobId, entityIds[0]]);
    }
    return {
      ok: true,
      output: { entityIds },
      turns: [
        {
          purpose: 'resolve the subject against what is already known',
          newObservations: 0,
          newEntities: 0,
          newFindings: 0,
          note: entityIds.length > 0 ? `${entityIds.length} known entit(y/ies)` : 'the subject is not in the store yet',
        },
      ],
      requests: [],
      note: 'seeded',
    };
  }

  /* report */
  const answers = await d.query<{ output: unknown }>(
    `select output from task where job_id = $1 and kind = 'analyse' and state = 'DONE'`,
    [jobId],
  );
  const collected = answers.flatMap((a) => {
    const out = (typeof a.output === 'string' ? JSON.parse(a.output) : a.output) as { answers?: unknown[] } | null;
    return out?.answers ?? [];
  });
  const limitations = [
    ...new Set(
      collected.flatMap((c) => {
        const l = (c as { limitations?: unknown }).limitations;
        return Array.isArray(l) ? l.filter((v): v is string => typeof v === 'string') : [];
      }),
    ),
  ];

  const run = await d.query<{ id: string }>(
    `insert into audit_run (question, status, intent, pipeline_version)
     values ($1,'complete',$2,$3) returning id`,
    [x.request.question, 'JOB_REPORT', `${ORCHESTRATOR_VERSION}`],
  );
  const runId = run[0]?.id;
  if (runId !== undefined) {
    await d.query(
      `insert into research_artifact (audit_run_id, kind, title, body, limitations)
       values ($1,'job_report',$2,$3::jsonb,$4::jsonb)
       on conflict (audit_run_id, kind) do update set body = excluded.body, limitations = excluded.limitations`,
      [runId, x.request.question.slice(0, 200), JSON.stringify({ jobId, answers: collected }), JSON.stringify(limitations)],
    );
  }

  return {
    ok: true,
    output: { artifactRunId: runId ?? null, answers: collected, limitations },
    turns: [
      {
        purpose: 'assemble the stored artifact',
        newObservations: 0,
        newEntities: 0,
        newFindings: 0,
        note: `${collected.length} answer(s), ${limitations.length} stated limitation(s)`,
      },
    ],
    requests: [],
    note: 'reported',
  };
}

/** Every layer-4 run named in a task's output, in order. */
export function runIdsIn(output: unknown): string[] {
  const answers = (output as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers)) return [];
  return answers
    .map((a) => (a as { runId?: unknown }).runId)
    .filter((v): v is string => typeof v === 'string');
}

/* -------------------------------------------------------------------------- */
/* READING AND WRITING THE GRAPH                                               */
/* -------------------------------------------------------------------------- */

export async function loadTasks(d: Driver, jobId: string): Promise<TaskNode[]> {
  const rows = await d.query<{
    id: string; key: string; kind: string; agent: string; state: string;
    depends_on: unknown; input: unknown; output: unknown; rationale: string | null;
    attempts: number; error: string | null;
  }>(
    `select id, key, kind, agent, state, depends_on, input, output, rationale, attempts, error
       from task where job_id = $1 order by ord, key`,
    [jobId],
  );
  const parse = (v: unknown): unknown => (typeof v === 'string' ? JSON.parse(v) : v);
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    kind: r.kind as TaskNode['kind'],
    agent: r.agent as AgentRole,
    state: r.state as TaskState,
    dependsOn: (parse(r.depends_on) as string[]) ?? [],
    input: (parse(r.input) as Record<string, unknown>) ?? {},
    output: r.output === null ? null : parse(r.output),
    rationale: r.rationale ?? '',
    attempts: r.attempts,
    error: r.error,
  }));
}

async function setTaskState(
  d: Driver,
  taskId: string,
  state: TaskState,
  extra: { output?: unknown; error?: string } = {},
): Promise<void> {
  await d.query(
    /* $2 is cast on both uses. Without it Postgres has to deduce one type for a
       parameter compared against an enum column in one place and against text
       literals in another, and it refuses — correctly. */
    `update task set state = $2::task_state,
            output = coalesce($3::jsonb, output),
            error = coalesce($4, error),
            finished_at = case when $2::text in ('DONE','FAILED','SKIPPED') then now() else null end
      where id = $1`,
    [taskId, state, extra.output === undefined ? null : JSON.stringify(extra.output), extra.error ?? null],
  );
}

async function addDependency(d: Driver, jobId: string, key: string, dependsOnKey: string): Promise<void> {
  const rows = await d.query<{ depends_on: unknown }>('select depends_on from task where job_id = $1 and key = $2', [jobId, key]);
  const raw = rows[0]?.depends_on;
  if (raw === undefined) return;
  const current = (typeof raw === 'string' ? JSON.parse(raw) : raw) as string[];
  if (current.includes(dependsOnKey)) return;
  await d.query('update task set depends_on = $3::jsonb where job_id = $1 and key = $2', [
    jobId,
    key,
    JSON.stringify([...current, dependsOnKey]),
  ]);
}

/** Create and run in one call, for callers that do not need the two apart. */
export async function research(d: Driver, input: unknown, opts: JobOptions = {}): Promise<JobResult> {
  const { jobId, problems } = await createJob(d, input, opts);
  if (problems.length > 0) {
    return {
      jobId,
      state: 'FAILED',
      termination: 'FAILED',
      tasks: [],
      answers: [],
      limitations: problems,
      ledger: new Budget(parseRequest(input)).ledger,
      iterations: 0,
    };
  }
  return runJob(d, jobId, opts);
}
