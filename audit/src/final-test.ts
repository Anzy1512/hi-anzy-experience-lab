import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * THE FINAL PRODUCT TEST, IN TWO PROCESSES.
 *
 * A commercial question in a defined area, taken all the way:
 *
 *   interpret → plan → read what is known → discover → crawl → resolve →
 *   verify → derive findings → surface uncertainty → recommend → cite →
 *   store an artifact → keep the project → STOP THE PROCESS → reopen → continue
 *
 * ── WHY IT IS TWO PROCESSES AND NOT TWO FUNCTIONS ───────────────────────────
 *
 * "It can resume" is a claim about what survives a process dying, and a test
 * that never lets the process die cannot make it. Phase 1 runs until it is cut
 * off mid-graph and exits. Phase 2 is a new process with a cold cache, an empty
 * heap and nothing but the database — it finds the project by name, finds the
 * unfinished job, and carries on.
 *
 *   npm run final-test
 *
 * The corpus is a local fixture, and deliberately: this proves the PIPELINE
 * handles a geographic commercial question, and that needs businesses that
 * publish coordinates. Real pages mostly do not, which is a fact about the web
 * rather than about the system — and the same chain is proven against
 * postgresql.org and mozilla.org by `npm run closure:l4` and `closure:l6`.
 */

const DIR = process.env.FINAL_TEST_DIR ?? join(tmpdir(), 'audit-final-test');
const PHASE = process.argv.includes('--phase=2') ? 2 : 1;

mkdirSync(DIR, { recursive: true });
process.env.PGLITE_DIR ??= DIR;
process.env.EMBEDDING_PROVIDER ??= 'deterministic';
process.env.API_KEY ??= 'final-test-key-that-is-long-enough-to-pass';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'true';
process.env.CRAWL_PER_HOST_RPS ??= '50';
process.env.LOG_LEVEL ??= 'warn';

const KEY = process.env.API_KEY;
const PROJECT = 'final-test';

const { getDriver, closeDriver } = await import('./db/client.ts');
const { migrate } = await import('./db/migrate.ts');
const { seedCategories } = await import('./entity/categories.ts');
const { build } = await import('./server.ts');

const rule = (s: string) => console.log(`\n${'─'.repeat(4)} ${s} ${'─'.repeat(Math.max(0, 70 - s.length))}`);

const d = await getDriver();
await migrate();
await seedCategories(d);

const app = await build();
await app.ready();
const auth = { authorization: `Bearer ${KEY}` };
const get = (url: string) => app.inject({ method: 'GET', url, headers: auth });
const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url, headers: auth, payload });

/* The question, as a person would ask it and as the contract expresses it. */
const COMPOUND =
  'Find businesses matching a real commercial condition in a defined geographic area, verify their ' +
  'digital presence, identify relevant gaps, explain the evidence, and give me the next actions.';

const STRUCTURED = {
  question: 'Which of these businesses has a website but no way to buy online?',
  intent: 'GAP_ANALYSIS',
  geography: { city: 'Leeds', latitude: 53.796, longitude: -1.547, radiusKm: 5 },
  evidencePolicy: { has: ['website'], lacks: ['ecommerce'], minSources: 1 },
  maxPages: 0,
  maxSearches: 0,
  maxModelCalls: 0,
  projectId: PROJECT,
};

/* ========================================================================== */
if (PHASE === 1) {
  const { startFixture, page, ALLOW_ALL } = await import('../test/fixture.ts');
  const { ingestOne } = await import('./index/ingest.ts');
  const { ingestEntitiesFromDocument } = await import('./entity/pipeline.ts');
  const { DirectProvider } = await import('./search/providers.ts');
  const { Crawler } = await import('./crawl/fetch.ts');

  const shop = (o: {
    title: string;
    lat: number;
    lon: number;
    address: string;
    email: string;
    cart?: boolean;
    body?: string;
  }) => ({
    body: page({
      title: o.title,
      description: `${o.title}, an independent business in Leeds.`,
      jsonld: {
        '@type': 'LocalBusiness',
        name: o.title,
        email: o.email,
        address: o.address,
        geo: { '@type': 'GeoCoordinates', latitude: o.lat, longitude: o.lon },
      },
      bodyHtml:
        `<article><h1>${o.title}</h1><p>${'An independent business trading in Leeds for many years. '.repeat(3)}</p>` +
        (o.body ?? '') +
        (o.cart === true
          ? '<a href="/cart">Basket</a><a href="/checkout">Checkout</a>'
          : '<p>Call in or telephone to order.</p>') +
        '</article>',
    }),
  });

  const fx = await startFixture({
    '/robots.txt': ALLOW_ALL,
    '/northgate': shop({
      title: 'Northgate Provisions',
      lat: 53.796,
      lon: -1.547,
      address: '12 Northgate, Leeds LS1 4AA',
      email: 'hello@northgate.example',
      body: '<p>Our shelves are supplied by Eastfield Supply Co.</p>',
    }),
    '/eastfield': shop({
      title: 'Eastfield Supply Co',
      lat: 53.8008,
      lon: -1.5491,
      address: '4 Eastfield Road, Leeds LS2 7BB',
      email: 'trade@eastfield.example',
      cart: true,
    }),
    '/riverside': shop({
      title: 'Riverside Kitchen',
      lat: 53.79,
      lon: -1.54,
      address: '9 Riverside Walk, Leeds LS1 9CC',
      email: 'bookings@riverside.example',
    }),
    /* A business a hundred miles away, so the radius has to do something. */
    '/farfield': shop({
      title: 'Farfield Stores',
      lat: 52.4862,
      lon: -1.8904,
      address: '3 Farfield Street, Birmingham B1 1AA',
      email: 'hello@farfield.example',
    }),
  });

  rule('PHASE 1 — INTERPRET, DISCOVER, CRAWL, RESOLVE');

  const crawler = new Crawler({ attempts: 1 });
  const direct = new DirectProvider();
  for (const path of ['/northgate', '/eastfield', '/riverside', '/farfield']) {
    const found = await direct.search(`${fx.origin}${path}`);
    const first = found.results[0];
    if (!first) continue;
    const ing = await ingestOne(d, first, { crawler });
    if (ing.documentId === null) {
      console.log(`${path.padEnd(14)} ${ing.outcome}`);
      continue;
    }
    const route = fx.routes.get(path);
    const html = typeof route?.body === 'string' ? route.body : undefined;
    const r = await ingestEntitiesFromDocument(d, ing.documentId, {
      country: 'GB',
      ...(html !== undefined ? { html } : {}),
    });
    console.log(`${path.padEnd(14)} ${r.observations} obs, ${r.claims} claims, ${r.relationships} edges, ${r.decision}`);
  }

  rule('THE COMPOUND QUESTION, AS ASKED');
  const refused = await post('/v1/jobs', { question: COMPOUND });
  console.log(`status ${refused.statusCode}`);
  for (const p of (refused.json() as { problems?: string[] }).problems ?? []) console.log(`  ${p}`);
  console.log('');
  console.log('Five requests in one sentence. The service will not guess which, and says so —');
  console.log('then the same question goes in as the structured request it decomposes to.');

  rule('THE SAME QUESTION, STRUCTURED');
  const created = await post('/v1/jobs', { ...STRUCTURED, background: false, maxIterations: 2 });
  console.log(`status ${created.statusCode}`);
  const job = created.json() as { jobId: string; state: string; tasks: Array<{ key: string; state: string }> };
  console.log(`job    ${job.jobId}`);

  /* Cut it off mid-graph: a worker that was stopped, not one that finished. */
  await d.query(`update task set state = 'PENDING', output = null where job_id = $1 and key in ('analyse','report')`, [
    job.jobId,
  ]);
  await d.query(`update job set state = 'RUNNING', termination = null, finished_at = null where id = $1`, [job.jobId]);

  const mid = (await get(`/v1/jobs/${job.jobId}`)).json() as { progress: Record<string, number> };
  console.log(`state  interrupted with ${mid.progress['pending']} of ${mid.progress['total']} tasks unfinished`);

  await fx.close();
  await app.close();
  await closeDriver();
  console.log('\nProcess ending. Everything this job knows is in the database and nowhere else.\n');
  process.exit(0);
}

/* ========================================================================== */
rule('PHASE 2 — A NEW PROCESS, A COLD HEAP, THE SAME PROJECT');

const list = (await get(`/v1/jobs?projectId=${PROJECT}`)).json() as {
  jobs: Array<{ id: string; question: string; state: string }>;
};
const open = list.jobs.find((j) => j.state !== 'COMPLETE') ?? list.jobs[0];
if (open === undefined) {
  console.log('No job in this project. Run phase 1 first.');
  await app.close();
  await closeDriver();
  process.exit(1);
}
console.log(`project  ${PROJECT}`);
console.log(`reopened ${open.id}`);
console.log(`          "${open.question}" — left ${open.state}`);

const before = (await get(`/v1/jobs/${open.id}`)).json() as {
  tasks: Array<{ key: string; state: string; attempts: number }>;
};
console.log('');
for (const t of before.tasks) console.log(`  ${t.key.padEnd(22)} ${t.state.padEnd(8)} ${t.attempts} attempt(s)`);

rule('CONTINUE');

const resumed = (await post(`/v1/jobs/${open.id}/run`, {})).json() as {
  state: string;
  termination: string;
  ledger: Record<string, number>;
  limitations: string[];
};
console.log(`state       ${resumed.state}`);
console.log(`termination ${resumed.termination}`);

const after = (await get(`/v1/jobs/${open.id}`)).json() as {
  tasks: Array<{ key: string; state: string; attempts: number }>;
  progress: Record<string, number>;
};
console.log('');
const attemptsBefore = new Map(before.tasks.map((t) => [t.key, t.attempts]));
for (const t of after.tasks) {
  const was = attemptsBefore.get(t.key) ?? 0;
  console.log(`  ${t.key.padEnd(22)} ${t.state.padEnd(8)} ${t.attempts} attempt(s) ${t.attempts === was ? '(not re-run)' : '(ran now)'}`);
}

rule('THE COMMERCIAL ANSWER');

/* The actual commercial question, as one call: this gap, in this area. */
const prospects = (
  await get('/v1/entities?has=website&lacks=ecommerce&type=ORGANIZATION&lat=53.796&lon=-1.547&radiusKm=5')
).json() as {
  entities: Array<{ id: string; canonicalName: string; capabilities: Record<string, string> }>;
  note?: string;
  geography?: { note: string };
};
for (const e of prospects.entities) {
  console.log(`  • ${e.canonicalName} — website ${e.capabilities['website']}, ecommerce ${e.capabilities['ecommerce']}`);
}
console.log('');
console.log(prospects.note ?? '');
if (prospects.geography !== undefined) console.log(prospects.geography.note);

rule('IN A DEFINED AREA');

const near = (await get('/v1/map?lat=53.796&lon=-1.547&radiusKm=5')).json() as {
  located: Array<{ canonicalName?: string; name?: string; distanceKm?: number }>;
};
console.log('within 5km of 53.796, -1.547:');
for (const l of near.located) console.log(`  • ${l.canonicalName ?? l.name} ${l.distanceKm === undefined ? '' : `— ${l.distanceKm.toFixed(2)}km`}`);

const all = (await get('/v1/map')).json() as { located: unknown[]; unlocated: number; note: string };
console.log('');
console.log(`placed ${all.located.length}, not placed ${all.unlocated}`);
console.log(all.note);

rule('THE EVIDENCE, AFTER A RESTART');

const findings = (await get(`/v1/jobs/${open.id}/findings`)).json() as {
  findings: Array<{
    statement: string;
    status: string;
    rule_id: string | null;
    entity_name: string | null;
    citations: Array<{ quote: string; url: string; retrieved_at: string }>;
  }>;
  withheldCount: number;
};
let sourced = 0;
let uncited = 0;
for (const f of findings.findings.filter((x) => x.status !== 'RECOMMENDATION').slice(0, 5)) {
  console.log(`${f.statement}`);
  console.log(`  ${f.status} · ${f.rule_id ?? 'model'}`);
  for (const c of f.citations.slice(0, 1)) {
    console.log(`  ← "${c.quote.slice(0, 62)}"`);
    console.log(`    ${c.url} · read ${c.retrieved_at.slice(0, 10)}`);
  }
  if (['FACT', 'DERIVED', 'CONFLICTING'].includes(f.status)) {
    sourced += 1;
    if (f.citations.length === 0) uncited += 1;
  }
  console.log('');
}
console.log(`${sourced} sourced finding(s); ${uncited} with no citation after the restart.`);
console.log(`${findings.withheldCount} statement(s) withheld.`);

rule('AND THE NEXT ACTIONS');

const handoff = (await get(`/v1/jobs/${open.id}/handoff`)).json() as {
  format: string;
  findings: Array<{ status: string; statement: string; entity_name: string | null }>;
  artifacts: Array<{ kind: string }>;
  readThisFirst: string[];
};
for (const r of handoff.findings.filter((f) => f.status === 'RECOMMENDATION')) {
  console.log(`  • ${r.entity_name ?? 'the subject'}: ${r.statement}`);
}
console.log('');
console.log(`handoff  ${handoff.format}, ${handoff.findings.length} finding(s), ${handoff.artifacts.length} artifact(s)`);

rule('WHAT THIS CANNOT TELL YOU');
for (const l of resumed.limitations) console.log(`  • ${l}`);

await app.close();
await closeDriver();
console.log('');
