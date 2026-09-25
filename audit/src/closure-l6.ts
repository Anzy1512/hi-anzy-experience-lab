import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * THE LAYER 5 AND 6 CLOSURE GATE — ONE JOB, READ BACK THROUGH THE API.
 *
 * A question goes in as an HTTP request. A graph of tasks executes, three
 * agents do work inside their contracts, the layer 4 engine produces findings
 * with citations, and everything comes back out through the same API a client
 * would use — including a handoff somebody could act on without this service
 * running at all.
 *
 * ── WHY IT GOES THROUGH `inject` AND NOT A SOCKET ───────────────────────────
 *
 * `app.inject` runs the whole stack — authentication, rate limiting, CORS,
 * validation, routing — without binding a port. Every hook that would run in
 * production runs here, so a gate that passes has exercised the real request
 * path rather than calling the handlers directly and hoping the middleware
 * agrees.
 *
 *   npx tsx src/closure-l6.ts
 *   DATABASE_URL=postgres://... npx tsx src/closure-l6.ts
 *
 * It crawls two real public sites whose robots.txt permits it, at the default
 * one request per two seconds. Nothing here is a fixture.
 */

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-closure-l6-'));
}
process.env.EMBEDDING_PROVIDER ??= 'deterministic';
process.env.API_KEY ??= 'closure-key-that-is-long-enough-to-pass-validation';
process.env.CORS_ORIGINS ??= 'http://localhost:5174';
/* The gate's output IS the report; a request log interleaved with it is noise. */
process.env.LOG_LEVEL ??= 'warn';

const KEY = process.env.API_KEY;

const { getDriver, closeDriver } = await import('./db/client.ts');
const { migrate } = await import('./db/migrate.ts');
const { seedCategories } = await import('./entity/categories.ts');
const { ingestOne } = await import('./index/ingest.ts');
const { ingestEntitiesFromDocument } = await import('./entity/pipeline.ts');
const { DirectProvider } = await import('./search/providers.ts');
const { Crawler } = await import('./crawl/fetch.ts');
const { build } = await import('./server.ts');

const rule = (s: string) => console.log(`\n${'─'.repeat(4)} ${s} ${'─'.repeat(Math.max(0, 70 - s.length))}`);

const SOURCES = ['https://www.postgresql.org/about/', 'https://www.mozilla.org/en-US/about/'];

const d = await getDriver();
await migrate();
await seedCategories(d);

const app = await build();
await app.ready();

const auth = { authorization: `Bearer ${KEY}` };
const get = (url: string) => app.inject({ method: 'GET', url, headers: auth });
const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url, headers: auth, payload });

/* ========================================================================== */
rule('1. THE DEPLOYMENT SAYS WHAT IT CAN DO');

const caps = (await get('/v1/capabilities')).json() as {
  model: { available: boolean; detail: string };
  search: { configured: boolean };
  jobs: boolean;
  synthesis: boolean;
};
console.log(`jobs         ${caps.jobs}`);
console.log(`synthesis    ${caps.synthesis}`);
console.log(`model        ${caps.model.detail}`);
console.log(`discovery    ${caps.search.configured ? 'configured' : 'none — direct URLs only'}`);

const unauth = await app.inject({ method: 'GET', url: '/v1/capabilities' });
console.log(`\nwithout a key: ${unauth.statusCode} ${unauth.body}`);

const preflight = await app.inject({
  method: 'OPTIONS',
  url: '/v1/capabilities',
  headers: { origin: 'http://localhost:5174', 'access-control-request-method': 'GET' },
});
console.log(`browser preflight: ${preflight.statusCode}, allow-origin ${preflight.headers['access-control-allow-origin'] ?? 'none'}`);

/* ========================================================================== */
rule('2. A CORPUS, FROM TWO REAL PUBLIC SITES');

const crawler = new Crawler({ attempts: 2 });
const direct = new DirectProvider();
let subjectId: string | null = null;

for (const url of SOURCES) {
  const found = await direct.search(url);
  const first = found.results[0];
  if (!first) continue;
  const ing = await ingestOne(d, first, { crawler });
  if (ing.documentId === null) {
    console.log(`${url.padEnd(44)} ${ing.outcome}`);
    continue;
  }
  const res = await fetch(url, { headers: { 'user-agent': 'hi-anzy-audit/0.1 (+https://hianzy.com)' } }).catch(() => null);
  const html = res !== null && res.ok ? await res.text() : null;
  const r = await ingestEntitiesFromDocument(d, ing.documentId, { ...(html !== null ? { html } : {}) });
  console.log(`${url.padEnd(44)} ${r.observations} obs, ${r.claims} claims, ${r.decision}`);
  subjectId ??= r.entityId;
}

if (subjectId === null) {
  console.log('\nNothing resolved. The network or the sources are unavailable; the gate cannot run.');
  await app.close();
  await closeDriver();
  process.exit(1);
}

const subject = (await get(`/v1/entities/${subjectId}`)).json() as { entity: { canonicalName: string } };
const name = subject.entity.canonicalName;

/* ========================================================================== */
rule('3. A QUESTION THE SERVICE WILL NOT RESEARCH');

const refused = await post('/v1/jobs', { question: 'Who supplies craft beer near Leeds?' });
console.log(`status ${refused.statusCode}`);
for (const p of (refused.json() as { problems?: string[] }).problems ?? []) console.log(`  ${p}`);

/* ========================================================================== */
rule('4. A JOB, RUN TO COMPLETION');

const started = await post('/v1/jobs', {
  question: `Tell me about ${name}`,
  entityId: subjectId,
  background: false,
  maxPages: 0,
  maxSearches: 0,
  maxModelCalls: 0,
  projectId: 'closure',
});
const job = started.json() as { jobId: string; state: string; termination: string; ledger: Record<string, number>; limitations: string[] };
console.log(`state        ${job.state}`);
console.log(`termination  ${job.termination}`);
console.log(`spend        ${job.ledger['modelCalls']} model calls, ${job.ledger['toolCalls']} tool calls, ${job.ledger['pagesCrawled']} pages`);

/* ========================================================================== */
rule('5. PROGRESS IS THE GRAPH');

const detail = (await get(`/v1/jobs/${job.jobId}`)).json() as {
  progress: Record<string, number>;
  tasks: Array<{ key: string; agent: string; state: string; rationale: string; dependsOn: string[] }>;
};
console.log(`${detail.progress['done']} of ${detail.progress['total']} tasks done\n`);
for (const t of detail.tasks) {
  console.log(`${t.key.padEnd(22)} ${t.agent.padEnd(11)} ${t.state.padEnd(8)} ${t.dependsOn.length > 0 ? `← ${t.dependsOn.join(', ')}` : ''}`);
  console.log(`${' '.repeat(22)} ${t.rationale}`);
}

/* ========================================================================== */
rule('6. WHAT EACH AGENT DID, INSIDE ITS CONTRACT');

const trace = (await get(`/v1/jobs/${job.jobId}/trace`)).json() as {
  steps: Array<{ task: string; agent: string; turn: number; purpose: string; note: string }>;
  toolCalls: Array<{ agent: string; tool: string; outcome: number }>;
};
for (const s of trace.steps) {
  console.log(`${s.agent.padEnd(11)} #${s.turn} ${s.purpose}`);
  console.log(`${' '.repeat(14)} → ${s.note}`);
}

const { CONTRACTS } = await import('./agents/tools.ts');
const violations = trace.toolCalls.filter((c) => !(CONTRACTS[c.agent as 'RESEARCHER']?.has(c.tool) ?? false));
console.log('');
console.log(`${trace.toolCalls.length} tool call(s); ${violations.length} outside an agent's contract.`);
console.log(`refused by contract or budget: ${trace.toolCalls.filter((c) => c.outcome === -1).length}`);

/* ========================================================================== */
rule('7. EVERY RENDERED FINDING, WITH ITS QUOTATION');

const findings = (await get(`/v1/jobs/${job.jobId}/findings`)).json() as {
  findings: Array<{
    statement: string;
    status: string;
    rule_id: string | null;
    limitations: string | null;
    citations: Array<{ quote: string; url: string; retrieved_at: string }>;
  }>;
  withheldCount: number;
};

let uncited = 0;
for (const f of findings.findings.slice(0, 6)) {
  console.log(`${f.statement}`);
  console.log(`  ${f.status} · ${f.rule_id ?? 'model'}`);
  if (f.limitations !== null) console.log(`  limits: ${f.limitations.slice(0, 96)}`);
  for (const c of f.citations.slice(0, 2)) {
    console.log(`  ← "${c.quote.slice(0, 64)}"`);
    console.log(`    ${c.url}`);
  }
  if (f.citations.length === 0 && ['FACT', 'DERIVED', 'CONFLICTING'].includes(f.status)) uncited += 1;
  console.log('');
}
console.log(`sourced findings reaching the API with no citation: ${uncited}`);
console.log(`statements withheld before rendering: ${findings.withheldCount}`);

/* ========================================================================== */
rule('8. THE MAP REPORTS WHAT IT COULD NOT PLACE');

const map = (await get('/v1/map')).json() as { located: unknown[]; unlocated: number; note: string };
console.log(`placed ${map.located.length}, not placed ${map.unlocated}`);
console.log(map.note);

/* ========================================================================== */
rule('9. A HANDOFF THAT STANDS ON ITS OWN');

const handoff = (await get(`/v1/jobs/${job.jobId}/handoff`)).json() as {
  format: string;
  readThisFirst: string[];
  findings: Array<{ citations: unknown[] }>;
  artifacts: unknown[];
};
console.log(`format       ${handoff.format}`);
console.log(`findings     ${handoff.findings.length}, artifacts ${handoff.artifacts.length}`);
console.log('');
for (const line of handoff.readThisFirst) console.log(`  • ${line}`);

/* ========================================================================== */
rule('10. WHAT THIS RUN CANNOT TELL YOU');
for (const l of job.limitations) console.log(`  • ${l}`);
if (job.limitations.length === 0) console.log('  (the job stated none, which is worth looking at)');

await app.close();
await closeDriver();
console.log('');
