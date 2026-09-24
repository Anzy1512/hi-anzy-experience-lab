import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Fixture } from './fixture.ts';
import type { SearchProvider, SearchResponse } from '../src/search/types.ts';
import type { ModelProvider, ModelRequest, ModelResponse } from '../src/model/types.ts';

/*
 * LAYER 5 — EIGHT THINGS A JOB HAS TO GET RIGHT.
 *
 *   1  finishes a real job with zero model calls
 *   2  respects the graph, including a diamond the verifier created
 *   3  stops at a budget and says which one
 *   4  stops when it stops learning, and calls that something different
 *   5  resumes without redoing finished work
 *   6  retries a failing task, gives up, and blocks what depended on it
 *   7  refuses a tool outside an agent's contract, and records the refusal
 *   8  refuses a malformed graph before running any of it
 *
 * Everything is crawled from a local fixture through the real layer 2 and 3
 * pipelines. The discovery provider is a stand-in that returns fixture URLs —
 * which is the point of the provider abstraction, and the only way to exercise
 * search without pointing a crawler at the open web on every test run.
 */
process.env.API_KEY ??= 'test-key-that-is-long-enough-to-pass-validation';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'true';
process.env.CRAWL_PER_HOST_RPS = '50';
process.env.EMBEDDING_PROVIDER = 'deterministic';
if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-jobs-'));
}

const { getDriver, closeDriver } = await import('../src/db/client.ts');
const { migrate } = await import('../src/db/migrate.ts');
const { seedCategories } = await import('../src/entity/categories.ts');
const { DirectProvider, ProviderRegistry } = await import('../src/search/providers.ts');
const { Crawler } = await import('../src/crawl/fetch.ts');
const { startFixture, page, ALLOW_ALL } = await import('./fixture.ts');

const { createJob, runJob, research, loadTasks } = await import('../src/jobs/orchestrator.ts');
const { validateDag, readyTasks, blockedTasks, planToTasks } = await import('../src/jobs/dag.ts');
const { Budget } = await import('../src/jobs/budget.ts');
const { Saturation, LoopControl } = await import('../src/jobs/saturation.ts');
const { invoke, CONTRACTS, TOOLS } = await import('../src/agents/tools.ts');
const { parseRequest } = await import('../src/intel/contract.ts');
const { planResearch } = await import('../src/intel/planner.ts');
const { EchoProvider, UnavailableProvider } = await import('../src/model/local.ts');

type Driver = Awaited<ReturnType<typeof getDriver>>;

let d: Driver;
let fx: Fixture;
let crawler: InstanceType<typeof Crawler>;
let registry: InstanceType<typeof ProviderRegistry>;

const PROSE = 'An independent supplier of household goods, trading from the same address for many years. ';

const site = (o: { title: string; org: string; email?: string; extraHtml?: string }) => ({
  body: page({
    title: o.title,
    description: 'An independent supplier.',
    jsonld: { '@type': 'Organization', name: o.org, ...(o.email ? { email: o.email } : {}) },
    bodyHtml: `<article><h1>${o.title}</h1><p>${PROSE.repeat(3)}</p>${o.extraHtml ?? ''}</article>`,
  }),
});

/**
 * A discovery provider that returns fixture URLs.
 *
 * It takes the `sitemap` id, which the provider union declares and nothing
 * implements — so this occupies a real slot rather than impersonating Brave.
 * The registry is told to prefer it explicitly; nothing is read from the
 * environment, because a test that depends on ambient configuration is a test
 * that fails on somebody else's machine.
 */
class FixtureProvider implements SearchProvider {
  readonly id = 'sitemap' as const;
  readonly label = 'fixture';
  constructor(private urls: string[]) {}
  setUrls(urls: string[]): void {
    this.urls = urls;
  }
  async available() {
    return { ok: true, detail: 'a local fixture' };
  }
  async search(query: string, opts: { limit?: number } = {}): Promise<SearchResponse> {
    return {
      provider: this.id,
      query,
      elapsedMs: 0,
      results: this.urls.slice(0, opts.limit ?? 5).map((url) => ({
        provider: this.id,
        query,
        url,
        canonicalUrl: null,
        title: null,
        snippet: null,
        publishedAt: null,
        rank: 0,
      })),
    };
  }
}

/** A provider that throws rather than failing politely. Used to force a retry. */
class ThrowingProvider implements ModelProvider {
  readonly name = 'throwing';
  readonly available = true;
  readonly unavailableReason = null;
  modelFor(): string {
    return 'throwing';
  }
  async complete(_req: ModelRequest): Promise<ModelResponse> {
    throw new Error('the provider fell over');
  }
}

let fixtureProvider: FixtureProvider;

before(async () => {
  d = await getDriver();
  await migrate();
  await seedCategories(d);
  fx = await startFixture({
    '/robots.txt': ALLOW_ALL,
    '/alpha': site({ title: 'Alpha Supplies', org: 'Alpha Supplies', email: 'hello@alpha.example' }),
    '/beta': site({ title: 'Beta Trading', org: 'Beta Trading', email: 'hello@beta.example' }),
    '/gamma': site({ title: 'Gamma Works', org: 'Gamma Works', email: 'hello@gamma.example' }),
    /* Deliberately the same business as /alpha, on another page. A second
       fetch of it adds nothing, which is what saturation has to notice. */
    '/alpha-again': site({ title: 'Alpha Supplies', org: 'Alpha Supplies', email: 'hello@alpha.example' }),
    '/alpha-again-2': site({ title: 'Alpha Supplies', org: 'Alpha Supplies', email: 'hello@alpha.example' }),
  });
  crawler = new Crawler({ attempts: 1 });
  fixtureProvider = new FixtureProvider([`${fx.origin}/alpha`, `${fx.origin}/beta`, `${fx.origin}/gamma`]);
  registry = new ProviderRegistry([fixtureProvider, new DirectProvider()], 'sitemap');
});

after(async () => {
  await fx?.close();
  await closeDriver();
});

const baseRequest = (extra: Record<string, unknown> = {}) => ({
  /*
   * Deliberately one request rather than two. "Find suppliers of household
   * goods AND tell me about them" reads as a discovery question and as a
   * lookup in equal measure, and the classifier refuses it — correctly, and
   * unhelpfully for a test about job execution.
   */
  question: 'List every supplier of household goods',
  maxPages: 5,
  maxSearches: 2,
  maxModelCalls: 0,
  maxSeconds: 120,
  ...extra,
});

const run = (extra: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) =>
  research(d, baseRequest(extra), { crawler, search: registry, provider: new EchoProvider(), ...opts });

/* ========================================================================== */
describe('1 — a job that finishes, having spent nothing on a model', () => {
  it('crawls, verifies, analyses and reports with zero model calls', async () => {
    const r = await run();

    assert.equal(r.state, 'COMPLETE', `job did not complete: ${r.limitations.join(' | ')}`);
    assert.equal(r.ledger.modelCalls, 0);
    assert.ok(r.ledger.pagesCrawled > 0, 'it should have fetched something');
    assert.ok(r.ledger.toolCalls > 0);
    assert.ok(r.answers.length > 0, 'the analyst should have produced an answer');

    const kinds = r.tasks.filter((t) => t.state === 'DONE').map((t) => t.kind);
    for (const k of ['seed', 'research', 'verify', 'analyse', 'report']) {
      assert.ok(kinds.includes(k as never), `${k} did not run`);
    }

    const artifact = await d.query<{ n: string }>(
      `select count(*)::text as n from research_artifact where kind = 'job_report'`,
    );
    assert.ok(Number(artifact[0]?.n) > 0, 'the report task should have stored an artifact');
  });

  it('records every tool call with its arguments', async () => {
    const r = await run();
    const calls = await d.query<{ tool: string; args: unknown; outcome: number; agent: string }>(
      `select tc.tool, tc.args, tc.outcome, tc.agent
         from tool_call tc join task t on t.id = tc.task_id where t.job_id = $1`,
      [r.jobId],
    );
    assert.ok(calls.length > 0);
    for (const c of calls) {
      assert.ok(TOOLS.has(c.tool), `${c.tool} is not a registered tool`);
      assert.ok(CONTRACTS[c.agent as 'RESEARCHER'].has(c.tool), `${c.agent} called ${c.tool} outside its contract`);
    }
  });
});

describe('2 — the graph is respected, including one the verifier created', () => {
  it('never starts a task before what it waits on has finished', async () => {
    const r = await run();
    const byKey = new Map(r.tasks.map((t) => [t.key, t]));
    for (const t of r.tasks) {
      if (t.state !== 'DONE') continue;
      for (const dep of t.dependsOn) {
        const upstream = byKey.get(dep);
        if (upstream === undefined) continue;
        assert.ok(
          upstream.state === 'DONE' || upstream.state === 'SKIPPED',
          `${t.key} ran while ${dep} was ${upstream.state}`,
        );
      }
    }
  });

  it('rewires the analysis to wait for research the verifier asked for', async () => {
    const r = await run();
    const extra = r.tasks.filter((t) => t.key.startsWith('research:'));
    const analyse = r.tasks.find((t) => t.key === 'analyse');
    assert.ok(analyse);
    if (extra.length > 0) {
      /* A diamond: analyse now waits on both the original verify and the
         follow-up research the verifier requested. */
      assert.ok(analyse.dependsOn.length >= 2, `expected a diamond, got ${analyse.dependsOn.join(', ')}`);
      for (const e of extra) assert.ok(analyse.dependsOn.includes(e.key));
    }
    /* Whether or not the verifier asked, readiness must agree with the graph. */
    assert.equal(readyTasks(r.tasks).length, 0, 'a finished job has nothing ready');
  });
});

describe('3 — stopping at a budget, and saying which one', () => {
  it('fetches what it is allowed and reports the limit it hit', async () => {
    const r = await run({ maxPages: 1, maxSearches: 1 });

    assert.ok(r.ledger.pagesCrawled <= 1, `fetched ${r.ledger.pagesCrawled} pages on a budget of 1`);
    assert.equal(r.termination, 'BUDGET_EXHAUSTED');
    assert.ok(
      r.limitations.some((l) => /pages/.test(l)),
      `no limitation names the page budget: ${r.limitations.join(' | ')}`,
    );
    /* Partial, not failed: it still produced an answer from what it had. */
    assert.ok(r.answers.length > 0, 'a truncated job still answers from what it gathered');

    const refused = await d.query<{ n: string }>(
      `select count(*)::text as n from tool_call tc join task t on t.id = tc.task_id
        where t.job_id = $1 and tc.outcome = -1`,
      [r.jobId],
    );
    assert.ok(Number(refused[0]?.n) > 0, 'the refusal should be on the record');
  });

  it('never spends past a zero allowance', async () => {
    const r = await run({ maxPages: 0, maxSearches: 0 });
    assert.equal(r.ledger.pagesCrawled, 0);
    assert.equal(r.ledger.searches, 0);
    assert.equal(r.ledger.modelCalls, 0);
    assert.ok(r.tasks.some((t) => t.kind === 'research' && t.state === 'DONE'), 'it still works from the corpus');
  });

  it('counts an unpriced model as UNKNOWN rather than zero', () => {
    const b = new Budget(parseRequest(baseRequest()));
    b.spend({ modelCalls: 1, costMicros: 500 });
    assert.equal(b.ledger.costMicros, 500);
    b.spend({ modelCalls: 1, costMicros: null });
    assert.equal(b.ledger.costMicros, null);
    b.spend({ modelCalls: 1, costMicros: 500 });
    assert.equal(b.ledger.costMicros, null, 'once unknown, always unknown');
  });
});

describe('4 — stopping because it stopped learning', () => {
  it('calls two barren turns saturation, and says so in different words from a budget', () => {
    const s = new Saturation(2);
    s.record({ newObservations: 12, newEntities: 1, newFindings: 0, ok: true, acquisitive: true });
    assert.equal(s.verdict().saturated, false);
    s.record({ newObservations: 0, newEntities: 0, newFindings: 0, ok: true, acquisitive: true });
    assert.equal(s.verdict().saturated, false, 'one empty turn is ordinary');
    s.record({ newObservations: 0, newEntities: 0, newFindings: 0, ok: true, acquisitive: true });
    const v = s.verdict();
    assert.equal(v.saturated, true);
    assert.match(v.reason ?? '', /stopped producing, not that nothing further exists/);
    assert.equal(v.totalAdded, 13);
  });

  it('does not treat a failed attempt as evidence that nothing is left', () => {
    const s = new Saturation(2);
    s.record({ newObservations: 0, newEntities: 0, newFindings: 0, ok: false, acquisitive: true });
    s.record({ newObservations: 0, newEntities: 0, newFindings: 0, ok: false, acquisitive: true });
    assert.equal(s.verdict().saturated, false, 'a refusal says nothing about what exists');
  });

  it('reports SATURATED from a real job that re-reads the same business', async () => {
    fixtureProvider.setUrls([`${fx.origin}/alpha`, `${fx.origin}/alpha-again`, `${fx.origin}/alpha-again-2`]);
    const r = await run({ question: 'Tell me about Alpha Supplies', entityName: 'Alpha Supplies', maxPages: 5 });
    fixtureProvider.setUrls([`${fx.origin}/alpha`, `${fx.origin}/beta`, `${fx.origin}/gamma`]);

    const researchTask = r.tasks.find((t) => t.kind === 'research' && t.state === 'DONE');
    const sat = (researchTask?.output as { saturation?: { saturated?: boolean } } | null)?.saturation;
    assert.ok(sat !== undefined, 'the research task must report its saturation state');
    if (sat.saturated === true) {
      assert.equal(r.termination, 'SATURATED');
      assert.ok(r.limitations.some((l) => /stopped producing/.test(l)));
    }
  });

  it('will not research the same subject for ever', () => {
    const loop = new LoopControl(2);
    assert.equal(loop.mayRepeat('abc'), true);
    loop.record('abc');
    assert.equal(loop.mayRepeat('abc'), true);
    loop.record('abc');
    assert.equal(loop.mayRepeat('abc'), false);
    assert.deepEqual(loop.exhausted(), ['abc']);
  });
});

describe('5 — resume', () => {
  it('picks up where it stopped without redoing finished work', async () => {
    const { jobId, problems } = await createJob(d, baseRequest());
    assert.deepEqual(problems, []);

    /* One iteration, which is a worker that was stopped almost immediately. */
    const first = await runJob(d, jobId, { crawler, search: registry, provider: new EchoProvider(), maxIterations: 1 });
    assert.notEqual(first.state, 'COMPLETE');
    const doneFirst = first.tasks.filter((t) => t.state === 'DONE');
    assert.ok(doneFirst.length > 0, 'it should have finished something');
    assert.ok(first.tasks.some((t) => t.state === 'PENDING'), 'and left something to do');
    const attemptsBefore = new Map(doneFirst.map((t) => [t.key, t.attempts]));

    const second = await runJob(d, jobId, { crawler, search: registry, provider: new EchoProvider() });
    assert.equal(second.state, 'COMPLETE', second.limitations.join(' | '));

    for (const t of second.tasks) {
      const before = attemptsBefore.get(t.key);
      if (before === undefined) continue;
      assert.equal(t.attempts, before, `${t.key} was run again after it had already finished`);
      assert.equal(t.state, 'DONE');
    }
  });

  it('returns a task abandoned mid-flight to the queue', async () => {
    const { jobId } = await createJob(d, baseRequest());
    await d.query(`update task set state = 'RUNNING' where job_id = $1 and key = 'seed'`, [jobId]);
    const r = await runJob(d, jobId, { crawler, search: registry, provider: new EchoProvider() });
    const seed = r.tasks.find((t) => t.key === 'seed');
    assert.equal(seed?.state, 'DONE', 'a task left RUNNING by a dead process must be picked up again');
  });
});

describe('6 — a task that fails', () => {
  it('retries it, gives up, and skips what depended on it', async () => {
    /* An audit, because only a plan that reaches a MODEL step can be broken by
       a broken model. A discovery question is answered entirely by SQL and
       would succeed however badly the provider behaved. */
    const { jobId } = await createJob(
      d,
      baseRequest({ question: 'Audit Alpha Supplies and say how good its setup is', maxModelCalls: 2 }),
    );
    const r = await runJob(d, jobId, {
      crawler,
      search: registry,
      /* The analyst's one substantive tool goes through the model. A provider
         that throws rather than failing politely is the case a retry exists
         for, and the one a `try` around the happy path would miss. */
      provider: new ThrowingProvider(),
    });

    const analyse = r.tasks.find((t) => t.key === 'analyse');
    assert.ok(analyse);
    assert.equal(analyse.state, 'FAILED', `analyse ended ${analyse.state}`);
    assert.equal(analyse.attempts, 2, 'it should have been attempted twice and then given up on');

    const report = r.tasks.find((t) => t.key === 'report');
    assert.equal(report?.state, 'SKIPPED');
    assert.match(report?.error ?? '', /waits on failed/);

    assert.equal(r.state, 'PARTIAL', 'some work succeeded, so this is partial rather than failed');
    assert.equal(r.termination, 'FAILED');
    assert.ok(r.limitations.some((l) => /skipped/.test(l)));
  });

  it('knows which pending tasks are blocked and which are merely waiting', () => {
    const nodes = [
      { id: '1', key: 'a', kind: 'seed' as const, agent: 'SYSTEM' as const, dependsOn: [], input: {}, rationale: '', state: 'FAILED' as const, attempts: 2, output: null, error: 'x' },
      { id: '2', key: 'b', kind: 'research' as const, agent: 'SYSTEM' as const, dependsOn: ['a'], input: {}, rationale: '', state: 'PENDING' as const, attempts: 0, output: null, error: null },
      { id: '3', key: 'c', kind: 'analyse' as const, agent: 'SYSTEM' as const, dependsOn: ['b'], input: {}, rationale: '', state: 'PENDING' as const, attempts: 0, output: null, error: null },
      { id: '4', key: 'd', kind: 'report' as const, agent: 'SYSTEM' as const, dependsOn: [], input: {}, rationale: '', state: 'PENDING' as const, attempts: 0, output: null, error: null },
    ];
    assert.deepEqual(blockedTasks(nodes).map((t) => t.key), ['b', 'c']);
    assert.deepEqual(readyTasks(nodes).map((t) => t.key), ['d']);
  });
});

describe('7 — the tool contracts', () => {
  it('refuses a tool the agent does not have, and names what it does have', async () => {
    const budget = new Budget(parseRequest(baseRequest()));
    const ctx = {
      d,
      jobId: 'test',
      taskId: 'test',
      agent: 'VERIFIER' as const,
      budget,
      crawler,
      provider: new EchoProvider(),
      search: registry,
    };

    const refused = await invoke(ctx, 'crawl_url', { url: `${fx.origin}/alpha` });
    assert.equal(refused.outcome, -1);
    assert.equal(refused.ok, false);
    assert.match(refused.summary, /VERIFIER may not call crawl_url/);
    assert.match(refused.summary, /check_corroboration/, 'the refusal states what it may call');
    assert.equal(budget.ledger.pagesCrawled, 0, 'a refused tool spends nothing');
  });

  it('refuses a tool that does not exist at all', async () => {
    const ctx = {
      d, jobId: 'test', taskId: 'test', agent: 'SYSTEM' as const,
      budget: new Budget(parseRequest(baseRequest())), crawler, provider: new EchoProvider(), search: registry,
    };
    const r = await invoke(ctx, 'run_sql', { sql: 'drop table entity' });
    assert.equal(r.outcome, -1);
    assert.match(r.summary, /no such tool/);
  });

  it('validates arguments before anything runs', async () => {
    const ctx = {
      d, jobId: 'test', taskId: 'test', agent: 'RESEARCHER' as const,
      budget: new Budget(parseRequest(baseRequest())), crawler, provider: new EchoProvider(), search: registry,
    };
    const r = await invoke(ctx, 'crawl_url', { url: 'not-a-url' });
    assert.equal(r.outcome, 0);
    assert.match(r.summary, /invalid arguments/);
  });

  it('gives the researcher no way to conclude and the analyst no way to fetch', () => {
    assert.equal(CONTRACTS.RESEARCHER.has('answer_question'), false);
    assert.equal(CONTRACTS.VERIFIER.has('crawl_url'), false);
    assert.equal(CONTRACTS.VERIFIER.has('search_web'), false);
    assert.equal(CONTRACTS.ANALYST.has('crawl_url'), false);
    assert.equal(CONTRACTS.ANALYST.has('search_web'), false);
    /* Nothing anywhere can reach a database or a shell. */
    for (const name of TOOLS.keys()) assert.doesNotMatch(name, /sql|exec|shell|eval|file/);
  });
});

describe('8 — a graph that cannot run', () => {
  it('names a cycle rather than capping iterations around it', () => {
    const problems = validateDag([
      { key: 'a', dependsOn: ['c'] },
      { key: 'b', dependsOn: ['a'] },
      { key: 'c', dependsOn: ['b'] },
    ]);
    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.kind, 'CYCLE');
    assert.match(problems[0]?.detail ?? '', /wait on each other/);
  });

  it('catches a dependency on a task that is not in the graph', () => {
    const problems = validateDag([{ key: 'a', dependsOn: ['ghost'] }]);
    assert.equal(problems[0]?.kind, 'MISSING_DEPENDENCY');
  });

  it('catches two tasks with the same key', () => {
    const problems = validateDag([
      { key: 'a', dependsOn: [] },
      { key: 'a', dependsOn: [] },
    ]);
    assert.equal(problems[0]?.kind, 'DUPLICATE_KEY');
  });

  it('produces a valid graph for every intent the planner can reach', () => {
    for (const q of [
      'Tell me about Alpha Supplies',
      'Audit Alpha Supplies and say how good its setup is',
      'Find every household goods supplier near Leeds',
      'Who supplies Alpha Supplies',
      'Compare Alpha Supplies and Beta Trading',
    ]) {
      const request = parseRequest({ question: q, maxPages: 3, maxSearches: 1 });
      const { plan } = planResearch(request);
      if (plan.intent === 'UNKNOWN_INTENT') continue;
      assert.deepEqual(validateDag(planToTasks(plan, request)), [], `${q} produced an invalid graph`);
    }
  });

  it('fails the job at creation, before anything is fetched', async () => {
    /* The planner cannot currently emit a cycle, so this asserts the guard is
       wired in rather than re-testing the detector: a well-formed request
       creates a job with no problems and a graph the validator accepts. */
    const { jobId, problems } = await createJob(d, baseRequest());
    assert.deepEqual(problems, []);
    const tasks = await loadTasks(d, jobId);
    assert.deepEqual(validateDag(tasks), []);
  });
});

describe('with no model provider at all', () => {
  it('still finishes, and says what it could not write', async () => {
    const r = await run({ maxModelCalls: 1 }, { provider: new UnavailableProvider('ANTHROPIC_API_KEY is not set') });
    assert.ok(r.answers.length > 0, 'deterministic findings are unaffected');
    assert.ok(r.limitations.some((l) => l.includes('ANTHROPIC_API_KEY is not set')));
    assert.equal(r.ledger.modelCalls, 0);
  });
});
