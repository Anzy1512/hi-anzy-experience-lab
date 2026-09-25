import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Fixture } from './fixture.ts';
import type { PlaceProvider } from '../src/places/types.ts';

/*
 * LAYER 7 — WHAT REAL-WORLD OPERATION HAS TO GET RIGHT.
 *
 *   A  a sitemap is discovery by invitation, and a refusal is not an empty site
 *   B  a gazetteer narrows a box to a circle, and never invents a confidence
 *   C  a pilot is a bounded spec, and every rejected candidate is recorded
 *   D  a pilot with nothing to look at is BLOCKED, not empty
 *   E  the job gets the budget that is LEFT, not the budget that was asked for
 *   F  metrics are computed, unpriced is null, and there is no precision score
 *   G  a review is an insert that never touches the finding
 *   H  live model validation is BLOCKED without a key and never falls back
 *   I  an area narrows a question rather than asking one
 *
 * Everything is served by the local fixture or by an injected fetch. Nothing in
 * this file touches the open web, because a test suite that needs the internet
 * is a test suite that fails for reasons unrelated to the code.
 */
process.env.API_KEY ??= 'test-key-that-is-long-enough-to-pass-validation';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'true';
process.env.CRAWL_PER_HOST_RPS = '50';
process.env.EMBEDDING_PROVIDER = 'deterministic';
if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-l7-'));
}

const { getDriver, closeDriver } = await import('../src/db/client.ts');
const { migrate } = await import('../src/db/migrate.ts');
const { seedCategories } = await import('../src/entity/categories.ts');
const { Crawler } = await import('../src/crawl/fetch.ts');
const { startFixture, page, ALLOW_ALL } = await import('./fixture.ts');
const { SitemapProvider, readSitemap } = await import('../src/search/sitemap.ts');
const { NominatimProvider } = await import('../src/places/nominatim.ts');
const { NoPlaceProvider, boundingBox, haversineKm } = await import('../src/places/types.ts');
const { PilotSpecSchema, parsePilotSpec, toRequest } = await import('../src/pilot/spec.ts');
const { createPilot, discoverSubjects, executePilot } = await import('../src/pilot/run.ts');
const { Budget } = await import('../src/jobs/budget.ts');
const { metricsFor } = await import('../src/metrics/run.ts');
const { pendingReviews, reviewMetrics, submitReview, exportCorpus } = await import('../src/review/feedback.ts');
const { validateLiveModel } = await import('../src/model/validate.ts');
const { ScriptedProvider, UnavailableProvider } = await import('../src/model/local.ts');
const { classifyIntent } = await import('../src/intel/intent.ts');
const { IntelligenceRequestSchema } = await import('../src/intel/contract.ts');

type Driver = Awaited<ReturnType<typeof getDriver>>;

let d: Driver;
let fx: Fixture;
let crawler: InstanceType<typeof Crawler>;

const LEEDS = { latitude: 53.7965, longitude: -1.5478, radiusKm: 5 };

const shop = (name: string, extra = '') =>
  page({
    title: name,
    description: 'An independent shop.',
    jsonld: { '@type': 'Organization', name },
    bodyHtml: `<article><h1>${name}</h1><p>An independent shop trading in Leeds for many years. ${'Local produce, sold by the bag. '.repeat(4)}</p>${extra}</article>`,
  });

const SITEMAP_XML = (origin: string, paths: string[]): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((p) => `<url><loc>${origin}${p}</loc><lastmod>2026-02-03</lastmod></url>`),
    '</urlset>',
  ].join('');

before(async () => {
  fx = await startFixture({
    '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: '' },
    '/': { ...ALLOW_ALL, body: shop('Northgate Provisions') },
    '/about': { ...ALLOW_ALL, body: shop('Northgate Provisions', '<p>Contact hello@northgate.example</p>') },
    '/shop': { ...ALLOW_ALL, body: shop('Northgate Provisions', '<button>Add to basket</button>') },
  });
  /* The fixture's origin is only known once it is listening, so the sitemap and
     the robots pointing at it are installed here rather than above. */
  fx.routes.set('/robots.txt', {
    headers: { 'content-type': 'text/plain' },
    body: `User-agent: *\nAllow: /\nSitemap: ${fx.origin}/sitemap.xml\n`,
  });
  fx.routes.set('/sitemap.xml', {
    headers: { 'content-type': 'application/xml' },
    body: SITEMAP_XML(fx.origin, ['/', '/about', '/shop']),
  });

  d = await getDriver();
  await migrate();
  await seedCategories(d);
  crawler = new Crawler({ attempts: 1, fetchImpl: fetch });
});

after(async () => {
  await fx.close();
  await closeDriver();
});

/* ========================================================================== */
/* A — DISCOVERY BY INVITATION                                                 */
/* ========================================================================== */

describe('A — the sitemap provider', () => {
  it('reads what robots.txt advertises and returns it as ordinary discoveries', async () => {
    const p = new SitemapProvider(crawler);
    const res = await p.search(fx.origin, { limit: 10 });
    assert.equal(res.unavailable, undefined);
    assert.equal(res.results.length, 3);
    assert.ok(res.results.every((r) => r.provider === 'sitemap'));
    /* The site's own claim about freshness travels as provenance, not as fact. */
    assert.ok(res.results.every((r) => r.publishedAt instanceof Date));
    /* And no snippet is invented from the path. */
    assert.ok(res.results.every((r) => r.snippet === null));
  });

  it('falls back to /sitemap.xml only when robots.txt names none', async () => {
    fx.routes.set('/robots.txt', { headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nAllow: /\n' });
    const p = new SitemapProvider(new Crawler({ attempts: 1 }));
    const res = await p.search(fx.origin, { limit: 10 });
    assert.equal(res.unavailable, undefined);
    assert.equal(res.results.length, 3);
    fx.routes.set('/robots.txt', {
      headers: { 'content-type': 'text/plain' },
      body: `User-agent: *\nAllow: /\nSitemap: ${fx.origin}/sitemap.xml\n`,
    });
  });

  it('reports a refusal as unavailable, never as a site that publishes nothing', async () => {
    fx.routes.set('/robots.txt', { headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /\n' });
    const p = new SitemapProvider(new Crawler({ attempts: 1 }));
    const res = await p.search(fx.origin, { limit: 10 });
    assert.equal(res.results.length, 0);
    assert.ok(res.unavailable !== undefined, 'a refusal must not look like an empty result set');
    assert.equal(res.unavailable?.reason, 'rejected');
    assert.match(res.unavailable?.detail ?? '', /robots/i);
    fx.routes.set('/robots.txt', {
      headers: { 'content-type': 'text/plain' },
      body: `User-agent: *\nAllow: /\nSitemap: ${fx.origin}/sitemap.xml\n`,
    });
  });

  it('follows a sitemap index exactly one level', async () => {
    fx.routes.set('/index-sitemap.xml', {
      headers: { 'content-type': 'application/xml' },
      body: `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${fx.origin}/sitemap.xml</loc></sitemap></sitemapindex>`,
    });
    fx.routes.set('/robots.txt', {
      headers: { 'content-type': 'text/plain' },
      body: `User-agent: *\nAllow: /\nSitemap: ${fx.origin}/index-sitemap.xml\n`,
    });
    const res = await new SitemapProvider(new Crawler({ attempts: 1 })).search(fx.origin, { limit: 10 });
    assert.equal(res.results.length, 3, 'an index naming one sitemap should yield that sitemap’s urls');

    /* An index of indexes stops, and says so rather than recursing. */
    fx.routes.set('/deep.xml', {
      headers: { 'content-type': 'application/xml' },
      body: `<?xml version="1.0"?><sitemapindex><sitemap><loc>${fx.origin}/index-sitemap.xml</loc></sitemap></sitemapindex>`,
    });
    fx.routes.set('/robots.txt', {
      headers: { 'content-type': 'text/plain' },
      body: `User-agent: *\nAllow: /\nSitemap: ${fx.origin}/deep.xml\n`,
    });
    const deep = await new SitemapProvider(new Crawler({ attempts: 1 })).search(fx.origin, { limit: 10 });
    assert.equal(deep.results.length, 0);
    assert.match(deep.unavailable?.detail ?? '', /one level/);
  });

  it('will not follow a <loc> onto another origin', async () => {
    fx.routes.set('/sitemap.xml', {
      headers: { 'content-type': 'application/xml' },
      body: `<?xml version="1.0"?><urlset><url><loc>https://elsewhere.invalid/x</loc></url><url><loc>${fx.origin}/about</loc></url></urlset>`,
    });
    fx.routes.set('/robots.txt', {
      headers: { 'content-type': 'text/plain' },
      body: `User-agent: *\nAllow: /\nSitemap: ${fx.origin}/sitemap.xml\n`,
    });
    const res = await new SitemapProvider(new Crawler({ attempts: 1 })).search(fx.origin, { limit: 10 });
    assert.equal(res.results.length, 1);
    assert.ok(res.results[0]?.url.startsWith(fx.origin));
    fx.routes.set('/sitemap.xml', {
      headers: { 'content-type': 'application/xml' },
      body: SITEMAP_XML(fx.origin, ['/', '/about', '/shop']),
    });
  });

  it('reads namespaced tags, CDATA and entities, and unescapes &amp; last', () => {
    const doc = readSitemap(
      `<?xml version="1.0"?><ns:urlset><ns:url><ns:loc><![CDATA[https://x.example/a?b=1&amp;c=2]]></ns:loc><ns:lastmod>2026-01-02</ns:lastmod></ns:url></ns:urlset>`,
    );
    assert.equal(doc.kind, 'urlset');
    assert.equal(doc.entries[0]?.loc, 'https://x.example/a?b=1&c=2');
    assert.equal(doc.entries[0]?.lastmod?.getUTCFullYear(), 2026);

    /* `&amp;lt;` must survive as `&lt;` text, not become a `<`. */
    const tricky = readSitemap('<urlset><url><loc>https://x.example/?q=a&amp;lt;b</loc></url></urlset>');
    assert.equal(tricky.entries[0]?.loc, 'https://x.example/?q=a&lt;b');
  });

  it('reads a malformed file that has <loc> tags and no wrappers', () => {
    const doc = readSitemap('<loc>https://x.example/a</loc><loc>https://x.example/b</loc>');
    assert.equal(doc.entries.length, 2);
    assert.equal(doc.entries[1]?.lastmod, null);
  });
});

/* ========================================================================== */
/* B — GEOGRAPHY                                                               */
/* ========================================================================== */

/** A Nominatim response, as the service actually shapes one. */
const row = (o: {
  id: number;
  name: string;
  lat: number;
  lon: number;
  rank?: number;
  category?: string;
  type?: string;
  website?: string;
  addresstype?: string;
}) => ({
  place_id: o.id,
  osm_type: 'node',
  osm_id: o.id,
  lat: String(o.lat),
  lon: String(o.lon),
  name: o.name,
  display_name: `${o.name}, Leeds, England`,
  category: o.category ?? 'craft',
  type: o.type ?? 'brewery',
  addresstype: o.addresstype ?? 'craft',
  place_rank: o.rank ?? 30,
  importance: 0.42,
  ...(o.website !== undefined ? { extratags: { website: o.website } } : {}),
});

function jsonFetch(body: unknown, status = 200, contentType = 'application/json'): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } })) as unknown as typeof fetch;
}

describe('B — the geographic provider', () => {
  it('narrows a bounding box back to the circle that was asked for', async () => {
    const box = boundingBox(LEEDS);
    assert.ok(box.north > LEEDS.latitude && box.south < LEEDS.latitude);

    /* One inside the radius, one inside the BOX but outside the circle. */
    const far = { latitude: LEEDS.latitude + LEEDS.radiusKm / 111.32 * 0.99, longitude: box.east - 0.0001 };
    assert.ok(haversineKm(far, LEEDS) > LEEDS.radiusKm, 'the corner must be outside the circle for this test to mean anything');

    const p = new NominatimProvider({
      minGapMs: 0,
      fetchImpl: jsonFetch([
        row({ id: 1, name: 'Near Brewery', lat: LEEDS.latitude + 0.005, lon: LEEDS.longitude }),
        row({ id: 2, name: 'Corner Brewery', lat: far.latitude, lon: far.longitude }),
      ]),
    });
    const res = await p.discover('brewery', LEEDS);
    assert.equal(res.candidates.length, 1);
    assert.equal(res.candidates[0]?.name, 'Near Brewery');
  });

  it('reads the provider’s own rank as a precision and never invents a confidence', async () => {
    const p = new NominatimProvider({
      minGapMs: 0,
      fetchImpl: jsonFetch([
        row({ id: 3, name: 'Shop', lat: LEEDS.latitude, lon: LEEDS.longitude, rank: 30 }),
        row({ id: 4, name: 'Street', lat: LEEDS.latitude, lon: LEEDS.longitude, rank: 26 }),
        row({ id: 5, name: 'District', lat: LEEDS.latitude, lon: LEEDS.longitude, rank: 16 }),
        row({ id: 6, name: 'LS1', lat: LEEDS.latitude, lon: LEEDS.longitude, rank: 25, addresstype: 'postcode' }),
      ]),
    });
    const res = await p.discover('brewery', LEEDS);
    assert.deepEqual(
      res.candidates.map((c) => c.precision),
      ['POINT', 'STREET', 'AREA', 'POSTAL'],
    );
    /* `importance` is a popularity score and must never leak out as a match score. */
    assert.ok(res.candidates.every((c) => c.confidence === null));
    assert.equal(res.candidates[0]?.raw['importance'], 0.42);
  });

  it('carries a mapper’s website as a candidate and repairs a bare hostname', async () => {
    const p = new NominatimProvider({
      minGapMs: 0,
      fetchImpl: jsonFetch([
        row({ id: 7, name: 'A', lat: LEEDS.latitude, lon: LEEDS.longitude, website: 'example.test/shop' }),
        row({ id: 8, name: 'B', lat: LEEDS.latitude, lon: LEEDS.longitude }),
      ]),
    });
    const res = await p.discover('brewery', LEEDS);
    assert.equal(res.candidates[0]?.websiteCandidate, 'https://example.test/shop');
    assert.equal(res.candidates[1]?.websiteCandidate, null, 'absent must stay absent, not become a guess');
  });

  it('reports HTML, a 429 and a network fault as unavailable rather than throwing', async () => {
    const html = new NominatimProvider({ minGapMs: 0, fetchImpl: jsonFetch('<html>', 200, 'text/html') });
    assert.equal((await html.discover('x', LEEDS)).unavailable?.reason, 'rejected');

    const limited = new NominatimProvider({ minGapMs: 0, fetchImpl: jsonFetch([], 429) });
    assert.equal((await limited.discover('x', LEEDS)).unavailable?.reason, 'rejected');

    const broken = new NominatimProvider({
      minGapMs: 0,
      fetchImpl: (async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }) as unknown as typeof fetch,
    });
    const res = await broken.geocode('somewhere');
    assert.equal(res.unavailable?.reason, 'unreachable');
    assert.equal(res.geocode, null);
  });

  it('paces itself, because the public instance’s policy is part of the adapter', async () => {
    const p = new NominatimProvider({ minGapMs: 120, fetchImpl: jsonFetch([]) });
    const startedAt = Date.now();
    await Promise.all([p.discover('a', LEEDS), p.discover('b', LEEDS), p.discover('c', LEEDS)]);
    assert.ok(Date.now() - startedAt >= 240, 'three concurrent calls must still be spaced by the gap');
  });

  it('says what is missing when no provider is configured', async () => {
    const none = new NoPlaceProvider();
    const a = await none.available();
    assert.equal(a.ok, false);
    assert.match(a.problem?.detail ?? '', /PLACE_PROVIDER/);
    assert.equal((await none.discover('x', LEEDS)).candidates.length, 0);
    assert.equal((await none.geocode('x')).geocode, null);
  });
});

/* ========================================================================== */
/* C, D, E — THE PILOT                                                         */
/* ========================================================================== */

const baseSpec = (over: Record<string, unknown> = {}) =>
  parsePilotSpec({
    name: 'test pilot',
    question: 'Audit the ecommerce capability of these shops.',
    area: { label: 'Leeds', ...LEEDS },
    categories: ['brewery'],
    country: 'GB',
    budget: { maxSubjects: 2, maxSources: 6, maxCrawlDepth: 1, maxSearches: 5, maxSeconds: 120, maxModelCalls: 0 },
    ...over,
  });

/** A place provider that returns exactly what a test asks it to. */
function fakePlaces(candidates: Array<{ name: string; website: string | null; category?: string; precision?: string }>): PlaceProvider {
  return {
    id: 'nominatim',
    label: 'fake',
    available: async () => ({ ok: true, detail: 'fake' }),
    discover: async (query) => ({
      provider: 'nominatim',
      query,
      elapsedMs: 1,
      candidates: candidates.map((c, i) => ({
        provider: 'nominatim' as const,
        externalId: `osm:node/${i + 100}`,
        query,
        name: c.name,
        category: c.category ?? 'craft/brewery',
        latitude: LEEDS.latitude,
        longitude: LEEDS.longitude,
        precision: (c.precision ?? 'POINT') as 'POINT',
        websiteCandidate: c.website,
        address: `${c.name}, Leeds`,
        confidence: null,
        raw: {},
        discoveredAt: new Date(),
      })),
    }),
    geocode: async (address) => ({ provider: 'nominatim', query: address, geocode: null, elapsedMs: 1 }),
  };
}

describe('C — a pilot is a bounded specification', () => {
  it('refuses a crawl depth the pipeline cannot perform', () => {
    const bad = PilotSpecSchema.safeParse({
      name: 'x',
      question: 'Audit these shops.',
      area: LEEDS,
      categories: ['brewery'],
      budget: { maxCrawlDepth: 3 },
    });
    assert.equal(bad.success, false, 'accepting a 3 and silently treating it as a 1 would be the dishonest option');
  });

  it('records every candidate with the reason it was or was not taken', async () => {
    const spec = baseSpec();
    const pilotId = await createPilot(d, spec);
    const { subjects, report } = await discoverSubjects(
      d,
      pilotId,
      spec,
      fakePlaces([
        { name: 'One', website: `${fx.origin}/` },
        { name: 'Two', website: 'https://two.example/' },
        { name: 'Three', website: 'https://three.example/' },
        { name: 'No site', website: null },
        { name: 'Brewery Wharf', website: null, category: 'landuse/residential', precision: 'AREA' },
        { name: 'Same site again', website: 'https://two.example/other' },
      ]),
      new Budget(toRequest(spec)),
    );

    assert.equal(subjects.length, 2, 'the subject cap binds');
    assert.equal(report.candidates, 6);
    assert.equal(report.rejected['NO_WEBSITE'], 1);
    assert.equal(report.rejected['NOT_A_BUSINESS'], 1);
    assert.equal(report.rejected['DUPLICATE_SITE'], 1);
    assert.equal(report.rejected['OVER_BUDGET'], 1);

    const rows = await d.query<{ n: string }>('select count(*)::text as n from place_observation where pilot_id = $1', [
      pilotId,
    ]);
    assert.equal(Number(rows[0]?.n), 6, 'the rejects are stored, or the coverage question is unanswerable');
  });

  it('keeps the caller’s own seeds when the cap binds', async () => {
    const spec = baseSpec({ seeds: ['https://mine.example/'], budget: { maxSubjects: 1, maxSources: 4, maxSearches: 5 } });
    const pilotId = await createPilot(d, spec);
    const { subjects } = await discoverSubjects(
      d,
      pilotId,
      spec,
      fakePlaces([{ name: 'Provider suggestion', website: 'https://theirs.example/' }]),
      new Budget(toRequest(spec)),
    );
    assert.equal(subjects.length, 1);
    assert.equal(subjects[0]?.url, 'https://mine.example/');
  });
});

describe('D — a pilot with nothing to look at', () => {
  it('is BLOCKED with the reason, not an empty success', async () => {
    const spec = baseSpec({ seeds: [] });
    const pilotId = await createPilot(d, spec);
    const res = await executePilot(d, pilotId, { place: new NoPlaceProvider(), crawler });
    assert.equal(res.state, 'BLOCKED');
    assert.match(res.detail ?? '', /PLACE_PROVIDER/);
    assert.equal(res.research, null);
    assert.ok(res.limitations.some((l) => /not available/i.test(l)));

    const row = await d.query<{ state: string; detail: string | null }>('select state, detail from pilot where id = $1', [
      pilotId,
    ]);
    assert.equal(row[0]?.state, 'BLOCKED');
  });
});

describe('E — the budget that is left', () => {
  it('hands the job what discovery and acquisition did not spend', () => {
    const spec = baseSpec({ budget: { maxSearches: 10, maxSources: 20, maxSubjects: 2, maxCrawlDepth: 1 } });
    const fresh = toRequest(spec);
    assert.equal(fresh.maxSearches, 10);
    assert.equal(fresh.maxPages, 20);

    const after = toRequest(spec, { searches: 4, pages: 15 });
    assert.equal(after.maxSearches, 6);
    assert.equal(after.maxPages, 5);

    /* Overspent is zero, never negative: a job authorised for -3 pages would
       pass a `> limit` check on its first request. */
    const over = toRequest(spec, { searches: 99, pages: 99 });
    assert.equal(over.maxSearches, 0);
    assert.equal(over.maxPages, 0);
  });

  it('carries the area and the capability filters into the request', () => {
    const spec = baseSpec({ requires: { has: ['website'], lacks: ['ecommerce'], minSources: 1 } });
    const req = toRequest(spec);
    assert.equal(req.geography?.radiusKm, LEEDS.radiusKm);
    assert.equal(req.geography?.place, 'Leeds');
    assert.deepEqual(req.evidencePolicy.lacks, ['ecommerce']);
    assert.equal(req.evidencePolicy.minSources, 1);
  });
});

/* ========================================================================== */
/* F — METRICS                                                                 */
/* ========================================================================== */

describe('F — metrics', () => {
  it('distinguishes a run that cost nothing from one whose price is unknown', async () => {
    /*
     * Scoped to runs this test made, not to the whole corpus.
     *
     * This asserted `metricsFor(d).model.calls === 0` and passed only because
     * PGlite hands every suite its own directory. On a shared Postgres — which
     * is what `test:pg` runs — the earlier suites had left five `model_call`
     * rows behind and the assertion was measuring them. The rule being tested
     * is about a RUN, so the test scopes to one.
     */
    const noCalls = await d.query<{ id: string }>(
      `insert into audit_run (question, status, started_at, finished_at)
       values ('a run that called nothing','complete', now(), now()) returning id`,
    );
    const quiet = noCalls[0]?.id;
    assert.ok(quiet !== undefined);

    const m = await metricsFor(d, { runIds: [quiet] });
    assert.equal(m.model.calls, 0);
    assert.equal(m.model.costMicros, 0, 'no calls cost nothing — a measurement, not a missing value');

    await d.query(
      `insert into model_call (audit_run_id, purpose, provider, model, model_class, tokens_in, tokens_out, cost_micros, ok)
       values ($1,'metric-fixture','scripted','scripted-small','SMALL_MODEL',10,5,null,1)`,
      [quiet],
    );
    const priced = await metricsFor(d, { runIds: [quiet] });
    assert.equal(priced.model.calls, 1);
    assert.equal(priced.model.costMicros, null, 'a call with no configured price is UNKNOWN, never free');
  });

  it('offers no precision, recall or F1, because there is no labelled denominator', async () => {
    const m = await metricsFor(d);
    const keys = JSON.stringify(m).toLowerCase();
    assert.ok(!keys.includes('"precision"'), 'a precision score here would measure the system against itself');
    assert.ok(!keys.includes('recall'));
    assert.ok(!keys.includes('"f1"'));
  });

  it('counts a rejected candidate as discovery coverage, not as a source', async () => {
    const m = await metricsFor(d);
    assert.ok(m.discovery.candidatesDiscovered >= m.discovery.subjectsTaken);
    assert.ok(Object.keys(m.discovery.rejectedByReason).length > 0);
  });

  it('separates who placed a point from whether one exists', async () => {
    const m = await metricsFor(d);
    assert.equal(typeof m.entity.unplaced, 'number');
    assert.equal(typeof m.entity.geocodeProviders, 'object');
  });
});

/* ========================================================================== */
/* G — THE HUMAN VERDICT                                                       */
/* ========================================================================== */

async function aFinding(statement: string): Promise<string> {
  const run = await d.query<{ id: string }>(
    `insert into audit_run (question, status, started_at, finished_at) values ($1,'complete', now() - interval '2 seconds', now()) returning id`,
    ['Audit these shops.'],
  );
  const runId = run[0]?.id;
  const f = await d.query<{ id: string }>(
    `insert into finding (audit_run_id, statement, ord, status, finding_type, reasoning_type, rule_id, rule_version, basis, verification)
     values ($1,$2,0,'FACT','WEBSITE_PRESENT','RULE','PRESENCE_WEBSITE','l4-rules-1','sourced','VERIFIED') returning id`,
    [runId, statement],
  );
  const id = f[0]?.id;
  if (id === undefined) throw new Error('could not create a finding');
  await d.query(`insert into finding_citation (finding_id, quote, url, retrieved_at) values ($1,$2,$3, now())`, [
    id,
    'Northgate Provisions',
    'https://northgate.example/',
  ]);
  await d.query(
    `insert into evidence_selection (audit_run_id, kind, included, reason, score, token_len) values ($1,'observation',1,'kept',0.9,20),($1,'chunk',0,'over the per-url cap',0.2,30)`,
    [runId],
  );
  return id;
}

describe('G — a review is an insert', () => {
  it('never touches the finding, and two reviewers are two rows', async () => {
    const findingId = await aFinding('Northgate Provisions has a website.');
    const before = await d.query<{ statement: string; status: string }>('select statement, status from finding where id = $1', [
      findingId,
    ]);

    await submitReview(d, { findingId, verdict: 'SUPPORTED', reviewer: 'anish', citationValidity: 'VALID' });
    await submitReview(d, {
      findingId,
      verdict: 'PARTIALLY_SUPPORTED',
      reviewer: 'a second reader',
      citationValidity: 'PARTIAL',
      note: 'the quote is the business name, not the sentence',
      correction: 'Northgate Provisions publishes a website at northgate.example.',
      verifierAgreed: false,
    });

    const after = await d.query<{ statement: string; status: string }>('select statement, status from finding where id = $1', [
      findingId,
    ]);
    assert.deepEqual(after[0], before[0], 'the finding is the other half of the training example');

    const rows = await d.query<{ n: string }>('select count(*)::text as n from verification_feedback where finding_id = $1', [
      findingId,
    ]);
    assert.equal(Number(rows[0]?.n), 2, 'disagreement is data, not a conflict to resolve');
  });

  it('snapshots the versions the judgement was made against', async () => {
    const findingId = await aFinding('Another shop has a website.');
    await submitReview(d, { findingId, verdict: 'SUPPORTED', reviewer: 'anish' });
    const rows = await d.query<{ rule_set_version: string | null; engine_version: string | null; reviewed_at: string | null }>(
      'select rule_set_version, engine_version, reviewed_at from verification_feedback where finding_id = $1',
      [findingId],
    );
    assert.equal(rows[0]?.rule_set_version, 'l4-rules-1');
    assert.equal(rows[0]?.engine_version, 'l4-engine-1');
    assert.ok(rows[0]?.reviewed_at !== null);
  });

  it('leaves human_status null for a verdict layer 4’s vocabulary cannot express', async () => {
    const findingId = await aFinding('A third shop has a website.');
    await submitReview(d, { findingId, verdict: 'STALE', reviewer: 'anish' });
    const rows = await d.query<{ human_status: string | null; verdict: string }>(
      'select human_status, verdict from verification_feedback where finding_id = $1',
      [findingId],
    );
    assert.equal(rows[0]?.verdict, 'STALE');
    assert.equal(rows[0]?.human_status, null, 'rounding STALE to SOURCED would put a value there nobody chose');
  });

  it('refuses a review of a finding that does not exist', async () => {
    await assert.rejects(
      () => submitReview(d, { findingId: '00000000-0000-4000-8000-000000000000', verdict: 'SUPPORTED', reviewer: 'x' }),
      /no finding/,
    );
  });

  it('refuses a verdict outside the vocabulary', async () => {
    const findingId = await aFinding('A fourth shop has a website.');
    await assert.rejects(() => submitReview(d, { findingId, verdict: 'PROBABLY_FINE', reviewer: 'x' }));
  });

  it('hands a reviewer the quote and the URL, not only the sentence', async () => {
    const pending = await pendingReviews(d, { limit: 50 });
    const withCitations = pending.filter((p) => p.citations.length > 0);
    assert.ok(withCitations.length > 0, 'a review form showing only prose collects opinions about prose');
    assert.ok(withCitations[0]?.citations[0]?.url !== null);
  });

  it('includes what the verifier rejected, so the expensive failure is reviewable', async () => {
    const run = await d.query<{ id: string }>(
      `insert into audit_run (question, status, started_at, finished_at) values ('q','complete', now(), now()) returning id`,
    );
    await d.query(
      `insert into finding (audit_run_id, statement, ord, status, basis, verification, verification_reason)
       values ($1,'A shop sells online.',0,'UNSUPPORTED','unsupported','REJECTED','UNSUPPORTED_BY_CITATION: nothing said so')`,
      [run[0]?.id],
    );
    const pending = await pendingReviews(d, { limit: 100 });
    assert.ok(
      pending.some((p) => p.verification === 'REJECTED'),
      'a corpus of only accepted findings can never show something true being thrown away',
    );
  });

  it('counts only the reviews where somebody actually judged the verifier', async () => {
    /*
     * `reviewMetrics` reads the whole corpus, so this asserts what must be true
     * of any corpus rather than the exact totals of a fresh one. The absolute
     * version passed only where nothing else had written a review — which on
     * PGlite is every run, and on a shared Postgres is the first one.
     */
    const m = await reviewMetrics(d);
    assert.ok(m.reviews > 0);
    assert.ok(m.byVerdict['SUPPORTED'] !== undefined);
    assert.ok(m.withCorrection >= 1);

    /* One reviewer above said the verifier was wrong and nobody has said it was
       right, so the rate is a real 0 — and 0 is only meaningful because the
       denominator is not empty. */
    assert.ok(m.verifierAgreement.agreed + m.verifierAgreement.disagreed > 0);
    assert.equal(m.verifierAgreement.agreed, 0);
    assert.equal(m.verifierAgreement.rate, 0);
    /* The other branch — nothing judged, so the rate is null rather than 0 —
       needs a corpus with no reviews in it, which this suite no longer has by
       this point. `closure:l7` covers it: it runs against a fresh database and
       reads /v1/reviews/metrics before any review exists. */
  });

  it('exports an example carrying the evidence that was rejected as well as kept', async () => {
    const examples = await exportCorpus(d, { limit: 10 });
    assert.ok(examples.length > 0);
    const withBoth = examples.find((e) => e.evidence.included.length > 0 && e.evidence.rejected.length > 0);
    assert.ok(
      withBoth !== undefined,
      '"the evidence was there and passed over" and "it was never retrieved" need different fixes',
    );
    assert.equal(withBoth?.versions.engine, 'l4-engine-1');
    assert.equal(withBoth?.model.costMicros, null);
    assert.ok(typeof withBoth?.latencyMs === 'number');
  });
});

/* ========================================================================== */
/* H — LIVE MODEL VALIDATION                                                   */
/* ========================================================================== */

describe('H — live model validation', () => {
  it('is BLOCKED with no provider, and writes no call it did not make', async () => {
    const before = await d.query<{ n: string }>('select count(*)::text as n from live_model_call');
    const res = await validateLiveModel(d, { provider: new UnavailableProvider('ANTHROPIC_API_KEY is not set') });
    assert.equal(res.state, 'BLOCKED');
    assert.equal(res.probe, null);
    assert.match(res.detail, /ANTHROPIC_API_KEY/);
    const after = await d.query<{ n: string }>('select count(*)::text as n from live_model_call');
    assert.equal(after[0]?.n, before[0]?.n, 'a call that never happened must not leave a row');
  });

  it('passes when the gate rejects the claim the evidence cannot support', async () => {
    const provider = new ScriptedProvider([
      {
        parsed: {
          statements: [
            { text: 'Harrow Lane Coffee Roasters sells bags of beans through its online shop.', citations: ['E1'] },
            { text: 'Harrow Lane Coffee Roasters has 14 employees.', citations: ['E1'] },
          ],
        },
        tokensIn: 120,
        tokensOut: 40,
        costMicros: null,
      },
    ]);
    const res = await validateLiveModel(d, { provider });
    assert.equal(res.state, 'PASSED');
    assert.equal(res.grounding?.statements, 2);
    assert.equal(res.grounding?.accepted, 1);
    assert.equal(res.grounding?.rejected, 1);
    assert.equal(res.grounding?.rejectedThePlant, true);
    /* Pinned to the specific code. A fabricated "14 employees" clears the
       lexical floor because it shares the business name with the evidence, so
       UNSUPPORTED_BY_CITATION would not have caught it — the number check is
       what does, and this asserts that rather than either. */
    assert.match(res.grounding?.reasons.join(' ') ?? '', /UNGROUNDED_NUMBER/);

    const rows = await d.query<{ tokens_in: number; cost_micros: number | null; ok: number }>(
      'select tokens_in, cost_micros, ok from live_model_call order by called_at desc limit 1',
    );
    assert.equal(rows[0]?.tokens_in, 120);
    assert.equal(rows[0]?.cost_micros, null, 'unpriced is UNKNOWN, not free');
    assert.equal(rows[0]?.ok, 1);
  });

  it('fails a call that reported a cost above the ceiling', async () => {
    const provider = new ScriptedProvider([
      {
        parsed: { statements: [{ text: 'It sells beans online.', citations: ['E1'] }] },
        tokensIn: 10,
        tokensOut: 5,
        costMicros: 900_000,
      },
    ]);
    const res = await validateLiveModel(d, { provider, maxCostMicros: 1000 });
    assert.equal(res.state, 'FAILED');
    assert.equal(res.overCeiling, true);
    assert.match(res.detail, /ceiling/);
  });

  it('records a provider that refused, because that is the event worth having', async () => {
    const provider = new ScriptedProvider([{ error: 'the API returned HTTP 401' }]);
    const res = await validateLiveModel(d, { provider });
    assert.equal(res.state, 'FAILED');
    assert.equal(res.grounding, null);
    const rows = await d.query<{ ok: number; detail: string | null }>(
      'select ok, detail from live_model_call order by called_at desc limit 1',
    );
    assert.equal(rows[0]?.ok, 0);
    assert.match(rows[0]?.detail ?? '', /401/);
  });
});

/* ========================================================================== */
/* I — AN AREA NARROWS                                                         */
/* ========================================================================== */

describe('I — a geography is a filter until a verb makes it a question', () => {
  const req = (question: string, extra: Record<string, unknown> = {}) =>
    IntelligenceRequestSchema.parse({ question, geography: { place: 'Leeds', ...LEEDS }, categories: ['brewery'], ...extra });

  it('does not turn an audit into an ambiguity by mentioning a place', () => {
    const r = classifyIntent(req('Audit the digital presence of these Leeds breweries.'));
    assert.equal(r.intent, 'DIGITAL_PRESENCE_AUDIT');
    assert.deepEqual(r.alternatives, []);
  });

  it('still reads a discovery verb plus an area as a local search', () => {
    const r = classifyIntent(req('Find breweries in Leeds that have a website.'));
    assert.equal(r.intent, 'LOCAL_DISCOVERY');
  });

  it('still refuses a question whose words say nothing about what kind of answer is wanted', () => {
    const r = classifyIntent(req('For each brewery, determine whether it has a website and whether it sells online.'));
    assert.equal(r.intent, 'UNKNOWN_INTENT');
    assert.ok(r.alternatives.length >= 2);
  });
});
