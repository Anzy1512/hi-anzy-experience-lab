import type { AgentRole } from '../agents/tools.ts';
import type { IntelligenceRequest, ResearchPlan } from '../intel/contract.ts';

/**
 * THE SHAPE OF THE WORK, CHECKED BEFORE ANY OF IT RUNS.
 *
 * ── WHY A DAG AND NOT A LIST ────────────────────────────────────────────────
 *
 * Research fans out. One question about a category becomes twenty questions
 * about businesses, each of which can be crawled independently and none of
 * which can be analysed until its own crawl finishes. A list forces that into
 * one order and loses the parallelism; a graph says what actually depends on
 * what, and the orchestrator reads the answer off it.
 *
 * ── DEPENDENCIES ARE KEYS, NOT IDS ──────────────────────────────────────────
 *
 * A task can be created before the thing it waits on exists — that is what
 * planning ahead means. Keys are stable, human-readable and assignable in
 * advance; row ids are not, and using them would force the whole graph to be
 * inserted in dependency order, which is the constraint the graph exists to
 * remove.
 *
 * ── AND A CYCLE IS REFUSED, NOT SURVIVED ────────────────────────────────────
 *
 * An orchestrator that "handles" a cycle by capping iterations turns a
 * definite bug into an expensive one: it runs, it spends, and it produces a
 * partial answer that looks like a budget problem. Validation happens before
 * the first task starts, and a cyclic graph fails the job outright with the
 * cycle named.
 */

export type TaskKind = 'seed' | 'research' | 'verify' | 'analyse' | 'report';
export type TaskState = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface TaskSpec {
  key: string;
  kind: TaskKind;
  agent: AgentRole;
  dependsOn: string[];
  input: Record<string, unknown>;
  rationale: string;
}

export interface TaskNode extends TaskSpec {
  id: string;
  state: TaskState;
  attempts: number;
  output: unknown;
  error: string | null;
}

export interface DagProblem {
  kind: 'CYCLE' | 'MISSING_DEPENDENCY' | 'DUPLICATE_KEY';
  detail: string;
}

/**
 * Is this graph runnable at all?
 *
 * Three ways it is not, and all three are programming errors rather than
 * research outcomes — so they are reported together and before anything runs,
 * rather than discovered one at a time at execution.
 */
export function validateDag(specs: Array<Pick<TaskSpec, 'key' | 'dependsOn'>>): DagProblem[] {
  const problems: DagProblem[] = [];
  const keys = new Set<string>();

  for (const s of specs) {
    if (keys.has(s.key)) problems.push({ kind: 'DUPLICATE_KEY', detail: `two tasks share the key "${s.key}"` });
    keys.add(s.key);
  }

  for (const s of specs) {
    for (const dep of s.dependsOn) {
      if (!keys.has(dep)) {
        problems.push({ kind: 'MISSING_DEPENDENCY', detail: `"${s.key}" waits on "${dep}", which is not in the graph` });
      }
    }
  }

  /* Iterative depth-first search with an explicit stack: a research graph can
     fan out further than a comfortable recursion depth, and blowing the stack
     while validating a graph would be a poor way to learn that. */
  const edges = new Map(specs.map((s) => [s.key, s.dependsOn.filter((d) => keys.has(d))]));
  const state = new Map<string, 'open' | 'closed'>();

  for (const start of edges.keys()) {
    if (state.get(start) === 'closed') continue;
    const stack: Array<{ key: string; path: string[] }> = [{ key: start, path: [] }];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (frame === undefined) break;
      const { key, path } = frame;

      if (path.includes(key)) {
        const cycle = [...path.slice(path.indexOf(key)), key].join(' → ');
        if (!problems.some((p) => p.kind === 'CYCLE' && p.detail.includes(cycle))) {
          problems.push({ kind: 'CYCLE', detail: `these tasks wait on each other: ${cycle}` });
        }
        continue;
      }
      if (state.get(key) === 'closed') continue;

      const deps = edges.get(key) ?? [];
      if (deps.length === 0) {
        state.set(key, 'closed');
        continue;
      }
      state.set(key, 'open');
      for (const dep of deps) stack.push({ key: dep, path: [...path, key] });
    }
    state.set(start, 'closed');
  }

  return problems;
}

/**
 * Which tasks can run right now.
 *
 * A dependency that FAILED blocks; a dependency that was SKIPPED does not. That
 * distinction matters: a step the budget removed should not stop the analysis
 * that would have followed it, because the analysis can still run over whatever
 * evidence does exist and say what is missing. A step that broke is different —
 * running past it would produce an answer resting on a hole nobody mentioned.
 */
export function readyTasks(tasks: TaskNode[]): TaskNode[] {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  return tasks.filter((t) => {
    if (t.state !== 'PENDING') return false;
    return t.dependsOn.every((dep) => {
      const d = byKey.get(dep);
      if (d === undefined) return true; /* validated away already */
      return d.state === 'DONE' || d.state === 'SKIPPED';
    });
  });
}

/** Tasks that can never run because something they wait on failed. */
export function blockedTasks(tasks: TaskNode[]): TaskNode[] {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const failed = (key: string, seen = new Set<string>()): boolean => {
    if (seen.has(key)) return false;
    seen.add(key);
    const t = byKey.get(key);
    if (t === undefined) return false;
    if (t.state === 'FAILED') return true;
    return t.dependsOn.some((d) => failed(d, seen));
  };
  return tasks.filter((t) => t.state === 'PENDING' && t.dependsOn.some((d) => failed(d)));
}

/* -------------------------------------------------------------------------- */
/* FROM A PLAN TO A GRAPH                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The layer 4 plan becomes the layer 5 graph.
 *
 * This is the join between the two layers and it deliberately does not invent
 * a second planner. Layer 4 decided which sources answer this intent and which
 * steps are worth a model; this turns that decision into work with an owner.
 * A step the planner marked `skipped` becomes a SKIPPED task rather than being
 * dropped, so the graph still shows what was not done.
 *
 * The standing shape is research → verify → analyse → report, because that is
 * the order in which the three agents' powers compose: one can fetch and not
 * judge, one can judge and not fetch, one can conclude and do neither.
 */
export function planToTasks(plan: ResearchPlan, request: IntelligenceRequest): TaskSpec[] {
  const needsGathering = plan.steps.some(
    (s) => s.skipped === undefined && (s.source === 'FRESH_SEARCH' || s.source === 'CRAWLED'),
  );
  const subject = {
    ...(request.entityId !== undefined ? { entityId: request.entityId } : {}),
    ...(request.entityName !== undefined ? { entityName: request.entityName } : {}),
    ...(request.domain !== undefined ? { domain: request.domain } : {}),
  };

  const specs: TaskSpec[] = [
    {
      key: 'seed',
      kind: 'seed',
      agent: 'SYSTEM',
      dependsOn: [],
      input: { ...subject, question: request.question, intent: plan.intent },
      rationale: 'Resolve the subject and decide what, if anything, needs fetching.',
    },
  ];

  if (needsGathering && (request.maxPages > 0 || request.maxSearches > 0)) {
    specs.push({
      key: 'research',
      kind: 'research',
      agent: 'RESEARCHER',
      dependsOn: ['seed'],
      input: { ...subject, question: request.question },
      rationale: plan.steps.find((s) => s.source === 'FRESH_SEARCH')?.rationale ?? 'The store cannot answer this alone.',
    });
  } else {
    specs.push({
      key: 'research',
      kind: 'research',
      agent: 'RESEARCHER',
      dependsOn: ['seed'],
      input: { ...subject, question: request.question, indexedOnly: true },
      rationale:
        request.maxPages === 0 && request.maxSearches === 0
          ? 'No fetching is permitted by the request; work from what is already indexed.'
          : 'The plan is answerable from the store; nothing new needs fetching.',
    });
  }

  specs.push(
    {
      key: 'verify',
      kind: 'verify',
      agent: 'VERIFIER',
      dependsOn: ['research'],
      input: {},
      rationale: 'Check corroboration and contradiction before anything is concluded from it.',
    },
    {
      key: 'analyse',
      kind: 'analyse',
      agent: 'ANALYST',
      dependsOn: ['verify'],
      input: { question: request.question, maxModelCalls: request.maxModelCalls },
      rationale: 'Turn the verified evidence into findings, through the layer 4 engine.',
    },
    {
      key: 'report',
      kind: 'report',
      agent: 'SYSTEM',
      dependsOn: ['analyse'],
      input: {},
      rationale: 'Assemble the stored artifact, including what could not be established.',
    },
  );

  return specs;
}
