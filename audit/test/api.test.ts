import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Fixture } from './fixture.ts';
import type { FastifyInstance } from 'fastify';

/*
 * LAYER 6 — THE PRODUCT API, END TO END.
 *
 *   A  it says what this deployment can and cannot do
 *   B  nothing answers without a key
 *   C  one question, answered, with its evidence and its limits
 *   D  a question it will not research, refused with the reason
 *   E  a job runs to completion and its progress is readable
 *   F  the trace shows what each agent did, inside its contract
 *   G  every rendered finding carries citations; the withheld are counted
 *   H  the prospect list is worded as what was observed, not as absence
 *   I  the map reports what it could not place
 *   J  a handoff is self-contained enough to act on without this service
 *
 * Driven through `app.inject`, so the whole stack runs — auth, rate limiting,
 * validation, routes, engine, orchestrator — with no socket and no ports.
 */
process.env.API_KEY ??= 'test-key-that-is-long-enough-to-pass-validation';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'true';
process.env.CRAWL_PER_HOST_RPS = '50';
process.env.EMBEDDING_PROVIDER = 'deterministic';
process.env.RATE_LIMIT_MAX = '500';
process.env.CORS_ORIGINS = 'http://localhost:5173';
if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-api-'));
}

const { getDriver, closeDriver } = await import('../src/db/client.ts');
const { migrate } = await import('../src/db/migrate.ts');
const { seedCategories } = await import('../src/entity/categories.ts');
const { ingestOne } = await import('../src/index/ingest.ts');
const { ingestEntitiesFromDocument } = await import('../src/entity/pipeline.ts');
const { DirectProvider } = await import('../src/search/providers.ts');
const { Crawler } = await import('../src/crawl/fetch.ts');
const { startFixture, page, ALLOW_ALL } = await import('./fixture.ts');
const { build } = await import('../src/server.ts');

type Driver = Awaited<ReturnType<typeof getDriver>>;

let d: Driver;
let fx: Fixture;
let app: FastifyInstance;
let subjectId: string | null = null;

const KEY = process.env.API_KEY as string;
const auth = { authorization: `Bearer ${KEY}` };

const site = (o: { title: string; org: string; email?: string; extraHtml?: string }) => ({
  body: page({
    title: o.title,
    description: 'An independent shop.',
    jsonld: { '@type': 'Organization', name: o.org, ...(o.email ? { email: o.email } : {}) },
    bodyHtml:
      `<article><h1>${o.title}</h1>` +
      `<p>${'An independent shop selling household goods to the neighbourhood. '.repeat(4)}</p>${o.extraHtml ?? ''}</article>`,
  }),
});

before(async () => {
  d = await getDriver();
  await migrate();
  await seedCategories(d);
  fx = await startFixture({
    '/robots.txt': ALLOW_ALL,
    '/delta': site({ title: 'Delta Provisions', org: 'Delta Provisions', email: 'hello@delta.example' }),
    '/epsilon': site({
      title: 'Epsilon Stores',
      org: 'Epsilon Stores',
      email: 'hello@epsilon.example',
      extraHtml: '<a href="/cart">Cart</a><a href="/checkout">Checkout</a>',
    }),
  });

  /* A corpus, built through the real pipeline. The API is tested against
     something that was actually crawled, not against inserted rows. */
  const crawler = new Crawler({ attempts: 1 });
  const direct = new DirectProvider();
  for (const path of ['/delta', '/epsilon']) {
    const found = await direct.search(`${fx.origin}${path}`);
    const first = found.results[0];
    assert.ok(first);
    const ing = await ingestOne(d, first, { crawler });
    assert.ok(ing.documentId, `${path} did not ingest: ${ing.outcome}`);
    const route = fx.routes.get(path);
    const html = typeof route?.body === 'string' ? route.body : undefined;
    const r = await ingestEntitiesFromDocument(d, ing.documentId, { ...(html !== undefined ? { html } : {}) });
    if (path === '/delta' && r.entityId !== null) subjectId = r.entityId;
  }

  app = await build();
  await app.ready();
});

after(async () => {
  await app?.close();
  await fx?.close();
  await closeDriver();
});

const get = (url: string) => app.inject({ method: 'GET', url, headers: auth });
const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, headers: auth, payload });

/* ========================================================================== */
describe('A — what this deployment can do', () => {
  it('states its capabilities rather than leaving them to be discovered by 404', async () => {
    const res = await get('/v1/capabilities');
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.synthesis, true);
    assert.equal(body.jobs, true);
    assert.equal(body.directIngestion, true);
    assert.equal(typeof body.model.available, 'boolean');
    assert.ok(typeof body.model.detail === 'string' && body.model.detail.length > 0);
    if (!body.model.available) assert.match(body.model.detail, /UNAVAILABLE/);
    assert.ok(Array.isArray(body.search.providers));
  });
});

describe('B — nothing answers without a key', () => {
  it('refuses an unauthenticated request', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/capabilities' });
    assert.equal(res.statusCode, 401);
    assert.doesNotMatch(res.body, /test-key/, 'a refusal must not echo the expected key');
  });

  it('refuses a wrong key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/entities',
      headers: { authorization: 'Bearer wrong-key-of-exactly-the-same-length-x' },
    });
    assert.equal(res.statusCode, 401);
  });

  it('answers a preflight before asking for a key', async () => {
    /*
     * The failure this catches is the one that actually happened: with the CORS
     * hook registered after authentication, the browser's OPTIONS preflight —
     * which never carries credentials — was refused 401 with no CORS headers,
     * and every request from the page failed with "Failed to fetch" for a
     * reason that had nothing to do with the key.
     */
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/capabilities',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.match(String(res.headers['access-control-allow-headers']), /authorization/);
  });

  it('gives CORS headers only to an origin that was named', async () => {
    const allowed = await app.inject({ method: 'GET', url: '/v1/capabilities', headers: { ...auth, origin: 'http://localhost:5173' } });
    assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');

    const other = await app.inject({ method: 'GET', url: '/v1/capabilities', headers: { ...auth, origin: 'https://evil.example' } });
    assert.equal(other.headers['access-control-allow-origin'], undefined, 'no wildcard, no echo');
  });
});

describe('C — one question, answered now', () => {
  it('returns plain conclusions with the evidence beside them', async () => {
    assert.ok(subjectId);
    const res = await post('/v1/answer', { question: 'Tell me about Delta Provisions', entityId: subjectId });
    assert.equal(res.statusCode, 200);
    const body = res.json();

    assert.equal(body.intent, 'ENTITY_LOOKUP');
    assert.ok(typeof body.summary === 'string' && body.summary.length > 0);
    assert.equal(body.summarySource, 'RULES');
    assert.ok(body.findings.established.length > 0);
    assert.ok(Array.isArray(body.evidence) && body.evidence.length > 0);
    assert.ok(Array.isArray(body.limitations));
    assert.equal(body.cost.modelCalls, 0);

    for (const f of body.findings.established) {
      assert.ok(f.citations.length > 0, `"${f.statement}" was returned with no citation`);
      assert.ok(typeof f.limitations === 'string');
      const ids = new Set(body.evidence.map((e: { id: string }) => e.id));
      for (const c of f.citations) assert.ok(ids.has(c), `citation ${c} is not in the evidence returned`);
    }
    assert.equal(typeof body.findings.withheldCount, 'number');
  });

  it('rejects a malformed request with the reason, not a 500', async () => {
    const res = await post('/v1/answer', { question: 'x' });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().detail, /question/);
  });
});

describe('D — a question it will not research', () => {
  it('refuses an ambiguous one with both readings named', async () => {
    const res = await post('/v1/jobs', { question: 'Who supplies craft beer near Leeds?' });
    assert.equal(res.statusCode, 422);
    const body = res.json();
    assert.ok(Array.isArray(body.problems) && body.problems.length > 0);
    assert.match(body.problems.join(' '), /SUPPLIER_DISCOVERY|LOCAL_DISCOVERY/);
  });
});

describe('E — a job, run and read', () => {
  let jobId: string;

  it('runs to completion', async () => {
    const res = await post('/v1/jobs', {
      question: 'Tell me about Delta Provisions',
      entityId: subjectId,
      background: false,
      maxPages: 0,
      maxSearches: 0,
      projectId: 'api-test',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    jobId = body.jobId;
    assert.ok(jobId);
    assert.ok(['COMPLETE', 'PARTIAL'].includes(body.state), `job state ${body.state}`);
    assert.equal(body.ledger.modelCalls, 0);
    assert.ok(Array.isArray(body.limitations));
  });

  it('reports progress as counts and as the graph', async () => {
    const res = await get(`/v1/jobs/${jobId}`);
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.job.id, jobId);
    assert.equal(body.job.project_id, 'api-test');
    assert.ok(body.progress.total > 0);
    assert.equal(body.progress.total, body.progress.done + body.progress.failed + body.progress.skipped + body.progress.pending);
    for (const t of body.tasks) {
      assert.ok(typeof t.rationale === 'string' && t.rationale.length > 0, `${t.key} has no stated reason to exist`);
    }
  });

  it('lists jobs by project', async () => {
    const res = await get('/v1/jobs?projectId=api-test');
    assert.equal(res.statusCode, 200);
    const jobs = res.json().jobs;
    assert.ok(jobs.length > 0);
    assert.ok(jobs.every((j: { project_id: string }) => j.project_id === 'api-test'));
  });

  it('is idempotent: running a finished job does not redo it', async () => {
    const before = await get(`/v1/jobs/${jobId}`);
    const again = await post(`/v1/jobs/${jobId}/run`, {});
    assert.equal(again.statusCode, 200);
    const after = await get(`/v1/jobs/${jobId}`);
    assert.deepEqual(
      after.json().tasks.map((t: { key: string; attempts: number }) => [t.key, t.attempts]),
      before.json().tasks.map((t: { key: string; attempts: number }) => [t.key, t.attempts]),
    );
  });

  it('F — the trace shows what each agent did, inside its contract', async () => {
    const res = await get(`/v1/jobs/${jobId}/trace`);
    assert.equal(res.statusCode, 200);
    const { steps, toolCalls } = res.json();
    assert.ok(steps.length > 0, 'a job with no recorded steps cannot be audited');
    for (const s of steps) assert.ok(typeof s.purpose === 'string' && s.purpose.length > 0);

    const { CONTRACTS } = await import('../src/agents/tools.ts');
    for (const c of toolCalls) {
      const allowed = CONTRACTS[c.agent as 'RESEARCHER'];
      assert.ok(allowed !== undefined, `unknown agent ${c.agent}`);
      assert.ok(allowed.has(c.tool), `${c.agent} called ${c.tool}, which is outside its contract`);
      assert.ok([-1, 0, 1].includes(c.outcome));
    }
  });

  it('G — every rendered finding carries citations, and the withheld are counted', async () => {
    const res = await get(`/v1/jobs/${jobId}/findings`);
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(typeof body.withheldCount, 'number');

    const sourced = body.findings.filter((f: { status: string }) => ['FACT', 'DERIVED', 'CONFLICTING'].includes(f.status));
    assert.ok(sourced.length > 0, 'the job produced no sourced findings');
    for (const f of sourced) {
      assert.ok(f.citations.length > 0, `"${f.statement}" reached the API with no citation`);
      for (const c of f.citations) {
        assert.ok(typeof c.quote === 'string' && c.quote.length > 0);
        assert.ok(typeof c.url === 'string' && c.url.length > 0);
        assert.ok(c.retrieved_at !== null);
      }
    }
    for (const f of body.findings) {
      assert.notEqual(f.verification, 'REJECTED', 'a rejected statement reached the API');
      assert.notEqual(f.status, 'UNSUPPORTED');
    }
  });

  it('J — the handoff stands on its own', async () => {
    const res = await get(`/v1/jobs/${jobId}/handoff`);
    assert.equal(res.statusCode, 200);
    const h = res.json();

    assert.equal(h.format, 'hi-anzy-audit/handoff@1');
    assert.ok(h.job.question);
    assert.ok(Array.isArray(h.readThisFirst) && h.readThisFirst.length >= 3);
    assert.match(h.readThisFirst.join(' '), /NOT_OBSERVED/);
    assert.ok(Array.isArray(h.findings));
    for (const f of h.findings) {
      if (!['FACT', 'DERIVED', 'CONFLICTING'].includes(f.status)) continue;
      assert.ok(f.citations.length > 0, 'a handoff finding without its quote is the artefact this avoids');
      assert.ok(f.citations.every((c: { quote: string; url: string }) => c.quote && c.url));
    }
    assert.ok(Array.isArray(h.artifacts));
  });
});

describe('H — the prospect list, worded as what was observed', () => {
  it('returns businesses with a website where no storefront was found, and says what that means', async () => {
    const res = await get('/v1/entities?has=website&lacks=ecommerce&type=ORGANIZATION');
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.entities));
    assert.ok(typeof body.note === 'string');
    assert.match(body.note, /not the same as the business not having it/);
    for (const e of body.entities) {
      assert.equal(e.capabilities.ecommerce, 'NOT_OBSERVED');
      assert.ok(['CONFIRMED', 'PROBABLE'].includes(e.capabilities.website));
    }
  });

  it('serves a profile with its capabilities, relationships and coverage', async () => {
    assert.ok(subjectId);
    const res = await get(`/v1/entities/${subjectId}`);
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.entity.id, subjectId);
    assert.ok(body.capabilities.website);
    assert.ok(['NONE', 'PARTIAL', 'CORROBORATED'].includes(body.coverage.verdict));
    assert.equal(typeof body.coverage.sourcesChecked, 'number');
  });

  it('serves the evidence chain for a business', async () => {
    assert.ok(subjectId);
    const res = await get(`/v1/entities/${subjectId}/evidence`);
    assert.equal(res.statusCode, 200);
    const claims = res.json().claims;
    assert.ok(claims.length > 0);
    for (const c of claims) {
      if (c.value === 'UNKNOWN') continue;
      assert.ok(c.evidence.length > 0, `${c.field} has a value and no evidence`);
      assert.ok(c.evidence.every((e: { url: string }) => typeof e.url === 'string'));
    }
  });

  it('404s an entity that does not exist rather than inventing one', async () => {
    const res = await get('/v1/entities/00000000-0000-4000-8000-000000000000');
    assert.equal(res.statusCode, 404);
  });
});

describe('I — the map', () => {
  it('reports what it could not place instead of showing only what it could', async () => {
    const res = await get('/v1/map');
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.located));
    assert.equal(typeof body.unlocated, 'number');
    assert.match(body.note, /nothing here is geocoded speculatively/i);
    for (const l of body.located) {
      assert.ok(l.latitude !== null && l.longitude !== null, 'an unplaced business must not appear on the map');
    }
  });
});
