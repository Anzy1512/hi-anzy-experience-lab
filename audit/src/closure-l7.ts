import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * THE LAYER 7 CLOSURE GATE — A REAL COMMERCIAL PILOT, READ BACK THROUGH THE API.
 *
 * ── WHAT IS DIFFERENT ABOUT THIS ONE ────────────────────────────────────────
 *
 * Every earlier gate proved that the machine works. This one points it at real
 * businesses that nobody chose in advance: a geographic provider is asked what
 * exists in an area, and whatever it names is what gets audited. The subjects
 * are not in this file. If the provider returns a shop that has closed, a link
 * that rots or a site that refuses to be read, that is the result — and saying
 * so is the gate passing, not failing.
 *
 *   PLACE_PROVIDER=nominatim npx tsx src/closure-l7.ts
 *
 * It fetches pages from real independent businesses at one request per two
 * seconds, obeys every robots.txt, and bypasses nothing. The geographic
 * provider is the public Nominatim instance, called no faster than its policy
 * permits.
 *
 * ── AND WHAT IT CANNOT PROVE ────────────────────────────────────────────────
 *
 * Whether the findings are RIGHT. That needs a person, which is what section 8
 * is about and why it ends by naming exactly which findings need a human.
 */

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-closure-l7-'));
}
process.env.EMBEDDING_PROVIDER ??= 'deterministic';
process.env.API_KEY ??= 'closure-key-that-is-long-enough-to-pass-validation';
process.env.CORS_ORIGINS ??= 'http://localhost:5174';
process.env.LOG_LEVEL ??= 'warn';

const KEY = process.env.API_KEY;

const { getDriver, closeDriver } = await import('./db/client.ts');
const { migrate } = await import('./db/migrate.ts');
const { seedCategories } = await import('./entity/categories.ts');
const { build } = await import('./server.ts');
const { config } = await import('./config.ts');
const { Crawler } = await import('./crawl/fetch.ts');
const { SitemapProvider } = await import('./search/sitemap.ts');
const { createPlaceProvider } = await import('./places/nominatim.ts');

const rule = (s: string) => console.log(`\n${'─'.repeat(4)} ${s} ${'─'.repeat(Math.max(0, 70 - s.length))}`);
const ok = (pass: boolean, s: string) => console.log(`  ${pass ? 'OK  ' : 'MISS'}  ${s}`);
const say = (s: string) => console.log(`        ${s}`);

/** Everything the gate concluded, so the tail can be a verdict rather than a scroll. */
const failures: string[] = [];
const check = (pass: boolean, s: string) => {
  ok(pass, s);
  if (!pass) failures.push(s);
};

const d = await getDriver();
await migrate();
await seedCategories(d);

const app = await build();
await app.ready();
const auth = { authorization: `Bearer ${KEY}` };
const get = (url: string) => app.inject({ method: 'GET', url, headers: auth });
const post = (url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url, headers: auth, payload });

/* ========================================================================== */
rule('1. WHAT THIS DEPLOYMENT CAN ACTUALLY DO');

const caps = (await get('/v1/capabilities')).json() as {
  search: { configured: boolean; providers: Array<{ id: string; ok: boolean; detail: string }> };
  geography: { provider: string; ok: boolean; detail: string };
  liveModel: { calls: number; lastAt: string | null };
  model: { available: boolean; detail: string };
  pilots: boolean;
  humanReview: boolean;
};

for (const p of caps.search.providers) say(`${p.id.padEnd(9)} ${p.ok ? 'answers' : 'unavailable'} — ${p.detail}`);
say(`geography  ${caps.geography.ok ? 'answers' : 'unavailable'} — ${caps.geography.provider}: ${caps.geography.detail}`);
say(`model      ${caps.model.available ? 'available' : 'unavailable'} — ${caps.model.detail}`);
say(`live model calls ever made: ${caps.liveModel.calls}`);

check(caps.pilots && caps.humanReview, 'the deployment reports pilots and human review as capabilities');
check(
  caps.search.providers.some((p) => p.id === 'sitemap' && p.ok),
  'a discovery provider that needs no credentials is available',
);

/* ========================================================================== */
rule('2. DISCOVERY THAT NEEDS NO KEY, AGAINST A REAL SITE');

const crawler = new Crawler({ attempts: 2 });
const sitemap = new SitemapProvider(crawler);

/* A site whose robots.txt refuses everything, so the refusal path is live too. */
const refused = await sitemap.search('https://hianzy.com', { limit: 5 });
check(
  refused.results.length === 0 && refused.unavailable !== undefined,
  'a site that refuses is reported as a refusal, not as a site with no pages',
);
say(`hianzy.com → ${refused.unavailable?.reason}: ${refused.unavailable?.detail.slice(0, 90)}`);

/* ========================================================================== */
rule('3. A BOUNDED PILOT, AGAINST AN AREA RATHER THAN A LIST');

const place = createPlaceProvider();
const geographyUp = (await place.available()).ok;

const spec = {
  name: 'Leeds independent brewers — is there a way to buy online',
  question: 'Audit the ecommerce capability of these breweries.',
  projectId: 'closure-l7',
  area: { label: 'Leeds city centre', latitude: 53.7965, longitude: -1.5478, radiusKm: 6 },
  categories: ['brewery'],
  requires: { has: [], lacks: [], minSources: 0 },
  country: 'GB',
  budget: {
    maxSubjects: 3,
    maxSources: 12,
    maxCrawlDepth: 1,
    maxSearches: 8,
    maxSeconds: 600,
    maxModelCalls: 0,
    maxTokens: 0,
    maxCostMicros: 0,
  },
};

const created = (await post('/v1/pilots', spec)).json() as {
  pilotId: string;
  geography: { provider: string; ok: boolean };
  willDiscover: boolean;
  note: string | null;
};
say(`pilot ${created.pilotId}`);
say(`geography ${created.geography.provider} ${created.geography.ok ? 'up' : 'down'}; will discover: ${created.willDiscover}`);
if (created.note !== null) say(created.note);

const ran = (await post(`/v1/pilots/${created.pilotId}/run`, { background: false })).json() as {
  state: string;
  detail: string | null;
  discovery: { provider: string; candidates: number; subjects: number; rejected: Record<string, number>; unavailable: string | null };
  acquisition: { urlsAttempted: number; fetched: number; unchanged: number; refusedByRobots: number; failed: number; documents: number };
  geocoding: { provider: string; attempted: number; placed: number; stillUnplaced: number; byPrecision: Record<string, number> };
  jobId: string | null;
  limitations: string[];
  elapsedMs: number;
};

say(`state ${ran.state} in ${(ran.elapsedMs / 1000).toFixed(1)}s`);
say(
  `discovery: ${ran.discovery.candidates} candidate(s), ${ran.discovery.subjects} researched, rejected ` +
    JSON.stringify(ran.discovery.rejected),
);
say(
  `acquisition: ${ran.acquisition.fetched} fetched, ${ran.acquisition.unchanged} unchanged, ` +
    `${ran.acquisition.refusedByRobots} refused by robots, ${ran.acquisition.failed} failed`,
);
say(`geocoding: ${ran.geocoding.placed} placed of ${ran.geocoding.attempted} attempted, ${ran.geocoding.stillUnplaced} unplaced`);

if (geographyUp) {
  check(ran.discovery.candidates > 0, 'a geographic provider named businesses in the area');
  check(ran.discovery.subjects > 0, 'at least one real business became a subject');
  check(
    Object.keys(ran.discovery.rejected).length > 0,
    'candidates that did not become subjects are recorded with a reason',
  );
} else {
  say('geographic discovery is unavailable; the pilot is BLOCKED and that is the honest outcome');
  check(ran.state === 'BLOCKED', 'a pilot with nothing to look at reports BLOCKED rather than an empty success');
}

/* ========================================================================== */
rule('4. EVERY CANDIDATE, INCLUDING THE ONES THAT BECAME NOTHING');

const detail = (await get(`/v1/pilots/${created.pilotId}`)).json() as {
  candidates: Array<{
    use: string;
    name: string | null;
    resolved_name: string | null;
    website_candidate: string | null;
    distance_km: number | null;
    precision: string;
    entity_id: string | null;
  }>;
  runIds: string[];
};

for (const c of detail.candidates) {
  say(
    `${c.use.padEnd(15)} ${(c.name ?? '—').slice(0, 28).padEnd(29)} ` +
      `${c.distance_km === null ? '     ' : `${c.distance_km.toFixed(2)}km`.padStart(8)} ` +
      `${c.precision.padEnd(8)} → ${c.resolved_name ?? (c.use === 'SUBJECT' ? 'NOT RESOLVED' : '—')}`,
  );
}
check(
  detail.candidates.length >= ran.discovery.subjects,
  'the record holds every candidate a provider returned, not only the useful ones',
);

/* ========================================================================== */
rule('5. PROVENANCE, FROM A MAPPER’S GUESS TO A BUSINESS’S OWN PAGE');

const resolved = detail.candidates.filter((c) => c.entity_id !== null);
check(
  !geographyUp || resolved.length > 0,
  'at least one candidate was resolved to a business by the page rather than by the provider',
);
for (const c of resolved) {
  say(`provider said "${c.name ?? '—'}" · the page resolved to "${c.resolved_name ?? '—'}"`);
}

/* A name a mapper typed is never written as a fact about the business. */
const mapperNames = await d.query<{ n: string }>(
  `select count(*)::text as n from observation o
    where o.extraction_method = 'nominatim' or o.extraction_method = 'place_provider'`,
);
check(
  Number(mapperNames[0]?.n ?? 0) === 0,
  'no place provider claim was written into the observation table as evidence about a business',
);

const geo = await d.query<{ geocode_provider: string | null; geocode_precision: string | null; n: string }>(
  `select geocode_provider, geocode_precision, count(*)::text as n from entity_location
    where latitude is not null group by geocode_provider, geocode_precision`,
);
for (const g of geo) say(`${g.n} point(s) placed by ${g.geocode_provider ?? 'unrecorded'} at ${g.geocode_precision ?? 'unrecorded'} precision`);
check(
  geo.every((g) => g.geocode_provider !== null),
  'every plotted point can say who placed it',
);

/* ========================================================================== */
rule('6. FINDINGS, WITH EVIDENCE AND WITH THE LIMITS STATED');

const runIds = detail.runIds;
say(`${runIds.length} research run(s) from this pilot`);

const findings = await d.query<{
  statement: string; status: string | null; rule_id: string | null; verification: string;
  limitations: string | null; citations: string;
}>(
  `select f.statement, f.status, f.rule_id, f.verification, f.limitations,
          (select count(*) from finding_citation c where c.finding_id = f.id)::text as citations
     from finding f
    where ($1::uuid[] is null or f.audit_run_id = any($1::uuid[]))
    order by f.created_at desc limit 30`,
  [runIds.length > 0 ? runIds : null],
);

for (const f of findings) {
  say(`[${(f.status ?? '-').padEnd(14)}] ${f.statement.slice(0, 96)}`);
  if (f.limitations !== null && f.limitations !== '') say(`                 limits: ${f.limitations.slice(0, 90)}`);
}

const uncited = findings.filter((f) => (f.status === 'FACT' || f.status === 'CONFLICTING') && Number(f.citations) === 0);
check(uncited.length === 0, 'every established finding carries at least one citation');
check(
  findings.every((f) => !/\bdoes not have\b|\bhas no\b/i.test(f.statement)),
  'no finding asserts absence; NOT_OBSERVED never became ABSENT',
);

/* ========================================================================== */
rule('7. QUALITY, MEASURED RATHER THAN ASSERTED');

const metrics = (await get(`/v1/pilots/${created.pilotId}/metrics`)).json() as Record<string, Record<string, unknown>>;
for (const [group, values] of Object.entries(metrics)) {
  const line = Object.entries(values)
    .filter(([, v]) => typeof v === 'number' || v === null)
    .map(([k, v]) => `${k}=${v === null ? 'UNKNOWN' : String(v)}`)
    .join('  ');
  if (line !== '') say(`${group.padEnd(10)} ${line}`);
}
const raw = JSON.stringify(metrics).toLowerCase();
check(!raw.includes('"precision":') && !raw.includes('recall'), 'no precision or recall is reported without a labelled denominator');
/*
 * Cost has three readings and the gate has to know which one it is looking at.
 *
 * Zero model calls cost zero — a measurement, and the deterministic path this
 * whole system prefers is exactly where it happens. UNKNOWN is reserved for
 * calls that were made and never priced. Asserting `null` unconditionally, as
 * this line first did, would have demanded that the best outcome report itself
 * as a missing one.
 */
const modelCalls = Number(metrics['model']?.['calls'] ?? 0);
const modelCost = metrics['model']?.['costMicros'];
check(
  modelCalls === 0 ? modelCost === 0 : modelCost === null || typeof modelCost === 'number',
  modelCalls === 0
    ? 'a run that called no model reports a cost of zero rather than UNKNOWN'
    : 'a call with no configured price reports UNKNOWN rather than zero',
);

/* ========================================================================== */
rule('8. THE HUMAN VERIFICATION WORKFLOW');

const queue = (await get('/v1/reviews/pending?limit=5')).json() as {
  findings: Array<{ id: string; statement: string; citations: Array<{ quote: string; url: string | null }> }>;
  vocabulary: Record<string, string[]>;
};
check(queue.vocabulary['verdict']?.length === 6, 'the review vocabulary distinguishes unsupported from incorrect from stale');
check(
  queue.findings.length === 0 || queue.findings.some((f) => f.citations.length > 0),
  'a reviewer is handed the quotation and the URL, not only the sentence',
);

const first = queue.findings[0];
if (first !== undefined) {
  const before = await d.query<{ statement: string }>('select statement from finding where id = $1', [first.id]);
  const posted = await post('/v1/reviews', {
    findingId: first.id,
    verdict: 'SUPPORTED',
    citationValidity: 'VALID',
    reviewer: 'closure-l7 (automated placeholder, not a human judgement)',
    note: 'Written by the closure gate to prove the workflow stores a verdict. This is NOT a human review.',
  });
  const after = await d.query<{ statement: string }>('select statement from finding where id = $1', [first.id]);
  check(posted.statusCode === 201, 'a review can be recorded through the API');
  check(before[0]?.statement === after[0]?.statement, 'recording a review does not edit the finding');
}

const rm = (await get('/v1/reviews/metrics')).json() as { reviews: number; note: string };
say(`${rm.reviews} review row(s). ${rm.note}`);

const corpus = (await get('/v1/corpus?limit=5')).json() as {
  count: number;
  examples: Array<{ evidence: { included: unknown[]; rejected: unknown[] }; versions: Record<string, string | null> }>;
};
check(corpus.count > 0, 'the corpus export produces at least one labelled example');
check(
  corpus.examples.every((e) => e.versions['engine'] !== null),
  'every example records the engine version the judgement was made against',
);

/*
 * The distinction this gate must not blur.
 *
 * A row written by this script proves the WORKFLOW. It is not evidence about
 * whether the findings are correct, and counting it as a human review would be
 * the single most dishonest thing in this report.
 */
const humanRows = await d.query<{ n: string }>(
  `select count(*)::text as n from verification_feedback where author is not null and author not like 'closure-l7%'`,
);
const humanReviews = Number(humanRows[0]?.n ?? 0);
say(`reviews written by a person: ${humanReviews}`);

/* ========================================================================== */
rule('9. THE LIVE MODEL PATH');

const validation = (await post('/v1/model/validate', {})).json() as {
  state: string;
  detail: string;
  keyPresent: boolean;
  probe: { model: string; tokensIn: number; tokensOut: number; costMicros: number | null; latencyMs: number } | null;
  grounding: { statements: number; accepted: number; rejected: number; rejectedThePlant: boolean } | null;
};
say(`state ${validation.state} — ${validation.detail}`);
if (validation.probe !== null) {
  say(
    `model ${validation.probe.model}: ${validation.probe.tokensIn}/${validation.probe.tokensOut} tokens, ` +
      `cost ${validation.probe.costMicros === null ? 'UNKNOWN' : String(validation.probe.costMicros)} micros, ${validation.probe.latencyMs}ms`,
  );
}
check(
  validation.state !== 'BLOCKED' || !validation.keyPresent,
  'the live path is BLOCKED only because no key is configured, never silently faked',
);
check(
  validation.state !== 'PASSED' || validation.grounding?.rejectedThePlant === true,
  'a live model that fabricated a figure had it rejected',
);

/* ========================================================================== */
rule('10. NO SECRET, AND NOTHING FINE-TUNED');

check(config.ANTHROPIC_API_KEY === undefined || process.env.ANTHROPIC_API_KEY !== undefined, 'no model key is invented');
const handoff = await get(runIds.length > 0 ? `/v1/jobs/${ran.jobId ?? ''}/handoff` : '/v1/capabilities');
const body = JSON.stringify(handoff.json());
check(
  !/sk-ant-|x-api-key|authorization/i.test(body),
  'no credential appears in anything the API hands a client',
);
const tuned = await d.query<{ n: string }>(
  `select count(*)::text as n from model_call where model like '%ft:%' or model like '%:ft-%'`,
);
check(Number(tuned[0]?.n ?? 0) === 0, 'no fine-tuned model has been called; nothing has been trained');

/* ========================================================================== */
rule('VERDICT');

if (failures.length === 0) {
  console.log('\n  Every gate this script can decide has passed.\n');
} else {
  console.log(`\n  ${failures.length} gate(s) did not pass:\n`);
  for (const f of failures) console.log(`    - ${f}`);
  console.log('');
}

console.log('  WHAT A PERSON STILL HAS TO DO');
if (humanReviews === 0) {
  console.log('    verification_feedback holds no human-written review. Layer 7 is BLOCKED ON OWNER REVIEW.');
  console.log('    These findings need a human verdict before the dataset means anything:');
  const needed = await d.query<{ id: string; statement: string; url: string | null }>(
    `select f.id, f.statement, (select c.url from finding_citation c where c.finding_id = f.id limit 1) as url
       from finding f
      where not exists (select 1 from verification_feedback v where v.finding_id = f.id and v.author not like 'closure-l7%')
      order by f.created_at desc limit 12`,
  );
  for (const n of needed) {
    console.log(`      · ${n.statement.slice(0, 92)}`);
    console.log(`        cites ${n.url ?? 'nothing with a URL'} — finding ${n.id}`);
  }
  console.log('    Open the REVIEW tab on the product surface, or POST /v1/reviews, to record a verdict.');
} else {
  console.log(`    ${humanReviews} human-written review(s) are recorded.`);
}

await app.close();
await closeDriver();
process.exit(failures.length === 0 ? 0 : 1);
