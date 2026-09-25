import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { auditRun } from './schema.ts';
import { entity } from './entities.ts';

/**
 * LAYER 5 — WORK THAT OUTLIVES A REQUEST.
 *
 * ── A JOB IS NOT A BIGGER RUN ───────────────────────────────────────────────
 *
 * `audit_run` is one question answered once: a plan, a packet, some findings,
 * a cost. A job is a piece of research that may take minutes, spawn work it
 * could not have predicted, be stopped halfway and picked up again. Those are
 * different lifetimes, so they are different tables — and a job that produced
 * three runs points at all three rather than overwriting one.
 *
 * ── THE STATE IS IN THE DATABASE, NOT IN THE PROCESS ────────────────────────
 *
 * Every task's state, input, output and attempt count is a row. That is what
 * makes resume real rather than aspirational: a process that dies mid-job
 * leaves the completed tasks marked DONE with their outputs stored, and the
 * next process picks up from the first task that is not. An orchestrator that
 * holds the DAG in memory can only restart.
 *
 * ── AND EVERY TOOL CALL IS RECORDED ─────────────────────────────────────────
 *
 * Not for telemetry. An agent is a loop that can spend money and fetch pages,
 * and the only honest way to answer "what did it actually do" afterwards is a
 * row per action with its arguments. `tool_call` is that row, and it is
 * separate from `model_call` because a crawl is not a completion and averaging
 * them would hide both.
 */

/* -------------------------------------------------------------------------- */
/* ENUMS                                                                       */
/* -------------------------------------------------------------------------- */

export const jobState = pgEnum('job_state', [
  'QUEUED',
  'RUNNING',
  'COMPLETE',
  /** Finished with real results and something left undone. Not a failure. */
  'PARTIAL',
  'FAILED',
  'CANCELLED',
]);

/**
 * READY is deliberately absent.
 *
 * Whether a task can run is a function of its dependencies' states, and storing
 * it as well would create two sources of truth that drift the moment a process
 * dies between updating one and the other. It is computed, every time.
 */
export const taskState = pgEnum('task_state', ['PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED']);

/**
 * Who does the work.
 *
 * Three, with different powers, because the interesting failures come from one
 * actor that can both gather evidence and decide whether it is good. `SYSTEM`
 * is for deterministic tasks that need no agent at all, which is most of them.
 */
export const agentRole = pgEnum('agent_role', ['SYSTEM', 'RESEARCHER', 'VERIFIER', 'ANALYST']);

/* -------------------------------------------------------------------------- */
/* TABLES                                                                      */
/* -------------------------------------------------------------------------- */

export const job = pgTable(
  'job',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** The question, verbatim. The same one `audit_run` keeps, for the same reason. */
    question: text('question').notNull(),
    /** The validated IntelligenceRequest, including the caller's budgets. */
    request: jsonb('request').notNull(),
    intent: text('intent'),
    state: jobState('state').notNull().default('QUEUED'),
    /** Why it stopped, from the shared Termination vocabulary. */
    termination: text('termination'),
    /** Grouping for the product surface. Never used for access control. */
    projectId: text('project_id'),
    subjectEntityId: uuid('subject_entity_id').references(() => entity.id, { onDelete: 'set null' }),

    /* ---- spend, measured as it happens ---------------------------------- */
    modelCalls: integer('model_calls').notNull().default(0),
    toolCalls: integer('tool_calls').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /** Null where any model used had no configured price. Never a guess. */
    costMicros: integer('cost_micros'),
    searches: integer('searches').notNull().default(0),
    pagesCrawled: integer('pages_crawled').notNull().default(0),
    /** How many times the orchestrator went round. Loop control, recorded. */
    iterations: integer('iterations').notNull().default(0),

    /** What this job could not establish. Written at the end, never empty. */
    limitations: jsonb('limitations').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** Bumped on every write, so a second worker can detect it lost the race. */
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  },
  (t) => [index('job_state_idx').on(t.state), index('job_project_idx').on(t.projectId)],
);

export const task = pgTable(
  'task',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'cascade' }),
    /** Stable within a job. Dependencies are expressed with these, not with ids. */
    key: text('key').notNull(),
    /** Which tool contract this task runs under. */
    kind: text('kind').notNull(),
    agent: agentRole('agent').notNull().default('SYSTEM'),
    state: taskState('state').notNull().default('PENDING'),
    /** Keys, not ids: a task can be created before the thing it waits on exists. */
    dependsOn: jsonb('depends_on').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    input: jsonb('input').notNull().default(sql`'{}'::jsonb`),
    output: jsonb('output'),
    /** Why this task exists, in words. Carried from the plan step. */
    rationale: text('rationale'),
    /** Which layer-4 run it produced, where it produced one. */
    auditRunId: uuid('audit_run_id').references(() => auditRun.id, { onDelete: 'set null' }),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    /** Execution order within a job, for reading the history back. */
    ord: integer('ord').notNull().default(0),
    /** Set when a task was created by another task rather than by the plan. */
    createdByTask: text('created_by_task'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('task_job_key').on(t.jobId, t.key),
    index('task_job_state_idx').on(t.jobId, t.state),
  ],
);

/**
 * One turn of one agent.
 *
 * Separate from the task because a task can take several turns — a researcher
 * may search, read what came back, and search again. The turns are what makes
 * loop control meaningful: "it ran for six turns and learned nothing after the
 * second" is a sentence this table can support and a task row cannot.
 */
export const agentStep = pgTable(
  'agent_step',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    agent: agentRole('agent').notNull(),
    turn: integer('turn').notNull(),
    /** What the agent was trying to do on this turn. */
    purpose: text('purpose').notNull(),
    /** What changed because of it — the saturation signal, measured per turn. */
    newObservations: integer('new_observations').notNull().default(0),
    newEntities: integer('new_entities').notNull().default(0),
    newFindings: integer('new_findings').notNull().default(0),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_step_task_idx').on(t.taskId)],
);

/**
 * Every tool invocation, with its arguments.
 *
 * `args` is stored as given, after validation and before execution. An agent
 * that fetched something it should not have is only findable if the request is
 * on the record — and a refusal is recorded too, because an agent repeatedly
 * reaching for a tool it does not have is worth seeing.
 */
export const toolCall = pgTable(
  'tool_call',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    agent: agentRole('agent').notNull(),
    tool: text('tool').notNull(),
    args: jsonb('args').notNull().default(sql`'{}'::jsonb`),
    /** 1 ok, 0 failed, -1 refused by the contract. */
    outcome: integer('outcome').notNull(),
    /** A short description of what came back. Never the whole payload. */
    result: text('result'),
    error: text('error'),
    durationMs: integer('duration_ms'),
    /* What it cost, in the units that matter for each kind of tool. */
    pagesCrawled: integer('pages_crawled').notNull().default(0),
    searches: integer('searches').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tool_call_task_idx').on(t.taskId), index('tool_call_tool_idx').on(t.tool)],
);

export const jobSchema = { job, task, agentStep, toolCall };
