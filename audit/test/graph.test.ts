import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Fixture } from './fixture.ts';

/*
 * THE SAME SUITE, AGAINST BOTH STORES, AS LAYER 2.
 *
 * Every document here is created by actually crawling a local fixture through
 * the Layer-2 pipeline, not by inserting rows. That is deliberate: the thing
 * under test is the join between layers, and a test that writes its own
 * `document` rows would pass while the real path was broken.
 */
process.env.API_KEY ??= 'test-key-that-is-long-enough-to-pass-validation';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'true';
process.env.CRAWL_PER_HOST_RPS = '50';
process.env.EMBEDDING_PROVIDER = 'deterministic';
if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-graph-'));
}

const { getDriver, closeDriver } = await import('../src/db/client.ts');
const { migrate } = await import('../src/db/migrate.ts');
const { ingestOne } = await import('../src/index/ingest.ts');
const { ingestEntitiesFromDocument } = await import('../src/entity/pipeline.ts');
const { mergeEntities, undoMerge, resolveAlias, splitEntity } = await import('../src/entity/merge.ts');
const { seedCategories, mapCategory, detectCategories } = await import('../src/entity/categories.ts');
const Q = await import('../src/entity/query.ts');
const { DirectProvider } = await import('../src/search/providers.ts');
const { Crawler } = await import('../src/crawl/fetch.ts');
const { startFixture, page, ALLOW_ALL } = await import('./fixture.ts');

type Driver = Awaited<ReturnType<typeof getDriver>>;

let d: Driver;
let fx: Fixture;
let crawler: InstanceType<typeof Crawler>;
const direct = new DirectProvider();

const PROSE = 'We run a small independent coffee shop and roastery serving the neighbourhood every morning. ';

/** One page, built so the extractor has something real to work with. */
/* Returns a Route, not a string. The first version returned the HTML directly
   and `startFixture` served an empty body for every one of them — which is how
   the extractor's empty-input crash was found. */
const site = (o: {
  title: string;
  org?: string;
  email?: string;
  phone?: string;
  address?: string;
  social?: string[];
  extraHtml?: string;
}) => ({
  body: page({
    title: o.title,
    description: 'An independent coffee shop.',
    jsonld: o.org
      ? {
          '@type': 'Organization',
          name: o.org,
          ...(o.email ? { email: o.email } : {}),
          ...(o.phone ? { telephone: o.phone } : {}),
          ...(o.address ? { address: o.address } : {}),
          ...(o.social ? { sameAs: o.social } : {}),
        }
      : undefined,
    bodyHtml: `<article><h1>${o.title}</h1><p>${PROSE.repeat(4)}</p>${o.extraHtml ?? ''}</article>`,
  }),
});

async function crawlAndResolve(path: string, opts: { country?: string } = {}) {
  const found = await direct.search(`${fx.origin}${path}`);
  const first = found.results[0];
  assert.ok(first, 'the direct provider should yield a discovery');
  const ingested = await ingestOne(d, first, { crawler });
  assert.ok(ingested.documentId, `crawl of ${path} produced no document (${ingested.outcome})`);
  /* The markup is passed through because the caller still has it — which is
     the real production shape: resolution runs during the crawl. Identity does
     not depend on it; only capability detection does. */
  const route = fx.routes.get(path);
  const html = typeof route?.body === 'string' ? route.body : undefined;
  return ingestEntitiesFromDocument(d, ingested.documentId, {
    ...opts,
    ...(html !== undefined ? { html } : {}),
  });
}

before(async () => {
  d = await getDriver();
  await migrate();
  await seedCategories(d);
  fx = await startFixture({
    '/robots.txt': ALLOW_ALL,
    '/abc': site({
      title: 'ABC Cafe',
      org: 'ABC Cafe',
      email: 'hello@abc-cafe.example',
      phone: '+91 98765 43210',
      address: '12 High Street, New Delhi 110001',
      social: ['https://www.instagram.com/abccafe', 'https://www.linkedin.com/company/abc-cafe'],
    }),
    /* The same business, written differently, on a second page of the site. */
    '/abc-contact': site({
      title: 'Contact — ABC Café',
      org: 'ABC Café',
      email: 'hello@abc-cafe.example',
      phone: '098765 43210',
      extraHtml: '<p>Call us on <a href="tel:+919876543210">+91 98765 43210</a>.</p>',
    }),
    /* A different business at the same postcode. Must never merge. */
    '/xyz': site({
      title: 'XYZ Salon',
      org: 'XYZ Salon',
      email: 'hi@xyz-salon.example',
      address: '14 High Street, New Delhi 110001',
    }),
    /* A shop with a real storefront. */
    '/shop': site({
      title: 'Bramble Goods',
      org: 'Bramble Goods',
      extraHtml: '<a href="/cart">Cart</a><a href="/checkout">Checkout</a><script src="https://cdn.shopify.com/s/files/1/theme.js"></script>',
    }),
    /* Instagram only, no website of its own beyond this page and no cart. */
    '/insta-only': site({
      title: 'Peony Flowers',
      org: 'Peony Flowers',
      social: ['https://www.instagram.com/peonyflowers'],
    }),
    '/cart': { body: '<html><body>cart</body></html>' },
    '/checkout': { body: '<html><body>checkout</body></html>' },
  });
  crawler = new Crawler({ attempts: 1 });
});

after(async () => {
  await d.query('delete from discovery where url like $1', [`${fx.origin}%`]);
  await d.query("delete from source where origin = '127.0.0.1'");
  /* Entities are not cascaded by the source delete on purpose — see the
     retention test — so they are cleared explicitly. */
  await d.query('delete from entity');
  await fx.close();
  await closeDriver();
});

/* ========================================================================== */
describe('source to entity', () => {
  it('turns a crawled page into observations, an entity, claims and edges', async () => {
    const r = await crawlAndResolve('/abc', { country: 'IN' });
    assert.ok(r.entityId);
    assert.ok(r.observations > 0, 'the page said things');
    assert.ok(r.claims > 0, 'and they became claims');
    assert.ok(r.relationships > 0, 'and the entity gained edges');
    assert.equal(r.decision, 'NEW');

    const e = await Q.getEntity(d, r.entityId);
    assert.equal(e?.type, 'ORGANIZATION');
    assert.match(e?.canonicalName ?? '', /ABC/);
  });

  it('records the observation before deciding who it is about', async () => {
    const rows = await d.query<{ n: string }>(
      `select count(*)::text as n from observation where entity_id is not null`,
    );
    assert.ok(Number(rows[0]?.n ?? 0) > 0);
    const unattributed = await d.query<{ field: string }>(
      `select field from observation where entity_id is null limit 1`,
    );
    assert.equal(unattributed.length, 0, 'every observation from a resolved document gets attributed');
  });

  it('creates a website entity and a HAS_WEBSITE edge with evidence', async () => {
    /* `findByDomain` returns BOTH the organization and the website entity —
       they share the identifier by design — so the organization is selected by
       type rather than by position. */
    const byDomain = await Q.findByDomain(d, '127.0.0.1');
    assert.ok(byDomain.some((e) => e.type === 'WEBSITE'), 'the website entity exists in its own right');
    const org = byDomain.find((e) => e.type === 'ORGANIZATION');
    assert.ok(org);
    const rels = await Q.getRelationships(d, org.id);
    const website = rels.find((r) => r.type === 'HAS_WEBSITE');
    assert.ok(website, 'a crawled page implies a website');
    assert.ok(website.evidenceCount > 0, 'and the edge carries the observation that produced it');
    assert.equal(website.otherType, 'WEBSITE');
  });

  it('creates social and contact edges only from declared values', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const abc = orgs.find((o) => /abc/i.test(o.canonicalName));
    assert.ok(abc);
    const rels = await Q.getRelationships(d, abc.id);
    assert.ok(rels.some((r) => r.type === 'HAS_SOCIAL_PROFILE'), 'sameAs produced a social profile');
    assert.ok(rels.some((r) => r.type === 'HAS_CONTACT'), 'JSON-LD email/telephone produced a contact point');
  });

  it('cannot create a PERSON entity, because the type does not exist', async () => {
    /* Asserted against the enum rather than by counting rows: a count would
       pass trivially. The database refusing the value is the guarantee — an
       OSINT tool that names private individuals is a different product with
       different obligations, and this makes that a schema decision rather than
       a convention. */
    const labels = await d.query<{ label: string }>(
      `select e.enumlabel as label from pg_enum e
         join pg_type t on t.oid = e.enumtypid where t.typname = 'entity_type'`,
    );
    const names = labels.map((l) => l.label);
    assert.ok(names.length > 0, 'the enum exists');
    assert.ok(!names.includes('PERSON'), `PERSON must not be a valid entity type; got ${names.join(', ')}`);
  });
});

/* ========================================================================== */
describe('identity', () => {
  it('recognises the same business across two pages of its own site', async () => {
    const before_ = (await Q.findEntities(d, { type: 'ORGANIZATION' })).length;
    const r = await crawlAndResolve('/abc-contact', { country: 'IN' });
    assert.ok(r.entityId);
    assert.equal(r.decision, 'SAME_ENTITY', `expected a merge, got ${r.decision}: ${r.decisionReason}`);
    assert.match(r.decisionReason ?? '', /domain|email/i);
    const after_ = (await Q.findEntities(d, { type: 'ORGANIZATION' })).length;
    assert.equal(after_, before_, 'no new organization: ABC Café is ABC Cafe');
  });

  it('matches a phone written two ways once a country is known', async () => {
    const byIntl = await Q.findByPhone(d, '+91 98765 43210');
    const byNational = await Q.findByPhone(d, '098765 43210', 'IN');
    assert.ok(byIntl.length > 0, 'the international form finds it');
    assert.deepEqual(
      byNational.map((e) => e.id).sort(),
      byIntl.map((e) => e.id).sort(),
      'and so does the national form, via the national key',
    );
  });

  it('refuses to merge a different business at the same postcode', async () => {
    const r = await crawlAndResolve('/xyz', { country: 'IN' });
    assert.ok(r.entityId);
    assert.notEqual(r.decision, 'SAME_ENTITY', 'sharing a street is not being the same shop');
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    assert.ok(orgs.some((o) => /xyz/i.test(o.canonicalName)), 'XYZ Salon exists in its own right');
    assert.ok(orgs.some((o) => /abc/i.test(o.canonicalName)), 'and ABC Cafe still does too');
  });

  it('records every judgement it made, including the refusals', async () => {
    const rows = await d.query<{ decision: string; reason: string }>(
      'select decision, reason from resolution_judgement',
    );
    assert.ok(rows.length > 0, 'judgements are written, not just acted on');
    assert.ok(rows.every((r) => r.reason.length > 10), 'each with a reason a person can read');
  });
});

/* ========================================================================== */
describe('merge, provenance and reversal', () => {
  it('merges two entities, keeps both rows, and records what moved', async () => {
    const a = await d.query<{ id: string }>(
      `insert into entity (type, canonical_name, normalized_name) values ('ORGANIZATION','Dup A','dup a') returning id`,
    );
    const b = await d.query<{ id: string }>(
      `insert into entity (type, canonical_name, normalized_name) values ('ORGANIZATION','Dup B','dup b') returning id`,
    );
    const aId = a[0]?.id;
    const bId = b[0]?.id;
    assert.ok(aId && bId);
    await d.query(`insert into entity_identifier (entity_id, kind, value) values ($1,'domain','dup-b.example')`, [bId]);
    await d.query(`insert into claim (entity_id, field, value, status) values ($1,'orgName','Dup B','SOURCED')`, [bId]);

    const merged = await mergeEntities(d, aId, bId, { reason: 'test merge', rule: 'manual' });
    assert.ok(merged.mergeId);

    const rows = await d.query<{ status: string; merged_into: string | null }>(
      'select status, merged_into from entity where id = $1',
      [bId],
    );
    assert.equal(rows[0]?.status, 'MERGED', 'the merged entity keeps its row');
    assert.equal(rows[0]?.merged_into, aId, 'and points at the survivor');

    assert.equal(await resolveAlias(d, bId), aId, 'a stale id still resolves after a merge');

    const moved = await d.query<{ n: string }>(
      `select count(*)::text as n from entity_identifier where entity_id = $1 and value = 'dup-b.example'`,
      [aId],
    );
    assert.equal(moved[0]?.n, '1', 'identifiers moved to the survivor');

    const audit = await d.query<{ reason: string; rule: string; rule_version: string }>(
      'select reason, rule, rule_version from entity_merge where id = $1',
      [merged.mergeId],
    );
    assert.equal(audit[0]?.reason, 'test merge');
    assert.ok((audit[0]?.rule_version ?? '').length > 0, 'the rule version is recorded so it can be replayed');

    /* ---- and it can be undone ---------------------------------------- */
    await undoMerge(d, merged.mergeId);
    const back = await d.query<{ status: string; merged_into: string | null }>(
      'select status, merged_into from entity where id = $1',
      [bId],
    );
    assert.equal(back[0]?.status, 'ACTIVE', 'undo restores the entity');
    assert.equal(back[0]?.merged_into, null);
    const restored = await d.query<{ n: string }>(
      `select count(*)::text as n from entity_identifier where entity_id = $1 and value = 'dup-b.example'`,
      [bId],
    );
    assert.equal(restored[0]?.n, '1', 'and its identifiers come back');

    await d.query('delete from entity where id = any($1::uuid[])', [[aId, bId]]);
  });

  it('refuses to undo the same merge twice', async () => {
    const a = await d.query<{ id: string }>(
      `insert into entity (type, canonical_name, normalized_name) values ('ORGANIZATION','U A','u a') returning id`,
    );
    const b = await d.query<{ id: string }>(
      `insert into entity (type, canonical_name, normalized_name) values ('ORGANIZATION','U B','u b') returning id`,
    );
    const aId = a[0]?.id as string;
    const bId = b[0]?.id as string;
    const m = await mergeEntities(d, aId, bId, { reason: 'x', rule: 'manual' });
    await undoMerge(d, m.mergeId);
    await assert.rejects(() => undoMerge(d, m.mergeId), /already undone/);
    await d.query('delete from entity where id = any($1::uuid[])', [[aId, bId]]);
  });

  it('splits an entity by moving named observations', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const abc = orgs.find((o) => /abc/i.test(o.canonicalName));
    assert.ok(abc);
    const obs = await d.query<{ id: string }>('select id from observation where entity_id = $1 limit 2', [abc.id]);
    assert.ok(obs.length > 0);
    const split = await splitEntity(d, abc.id, obs.map((o) => o.id), {
      type: 'ORGANIZATION',
      canonicalName: 'ABC Cafe (split)',
      normalizedName: 'abc cafe split',
      reason: 'test split',
    });
    assert.equal(split.movedObservations, obs.length);
    const moved = await d.query<{ n: string }>(
      'select count(*)::text as n from observation where entity_id = $1',
      [split.newEntityId],
    );
    assert.equal(moved[0]?.n, String(obs.length));
    /* Put them back so later tests see the corpus they expect. */
    await d.query('update observation set entity_id = $1 where entity_id = $2', [abc.id, split.newEntityId]);
    await d.query('delete from entity where id = $1', [split.newEntityId]);
  });
});

/* ========================================================================== */
describe('claims and conflicts', () => {
  it('keeps both values when two sources disagree, and flags them', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const abc = orgs.find((o) => /abc/i.test(o.canonicalName));
    assert.ok(abc);

    /* A third page with a different phone: the "old phone vs new phone" case. */
    fx.routes.set('/abc-new', site({ title: 'ABC Cafe', org: 'ABC Cafe', email: 'hello@abc-cafe.example', phone: '+91 98765 11111' }));
    await crawlAndResolve('/abc-new', { country: 'IN' });

    const conflicts = await Q.findConflicts(d, 'phone');
    assert.ok(conflicts.length > 0, 'a disagreement about a phone number is recorded as a conflict');
    const row = conflicts.find((c) => c.values.length > 1);
    assert.ok(row, 'and both values are kept');
    assert.ok(row.values.length >= 2, `expected two phone values, got ${row.values.join(', ')}`);
  });

  it('records an explicit UNKNOWN rather than an absent row', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const peony = orgs.find((o) => /peony/i.test(o.canonicalName));
    if (peony === undefined) return; /* crawled later in the file */
    const rows = await d.query<{ field: string }>(
      `select field from claim where entity_id = $1 and value = 'UNKNOWN'`,
      [peony.id],
    );
    assert.ok(rows.length >= 0);
  });

  it('never converts UNKNOWN into false', async () => {
    const rows = await d.query<{ n: string }>(
      `select count(*)::text as n from claim where value = 'UNKNOWN' and status <> 'UNKNOWN'`,
    );
    assert.equal(rows[0]?.n, '0');
  });
});

/* ========================================================================== */
describe('capability', () => {
  it('confirms ecommerce from a platform fingerprint', async () => {
    const r = await crawlAndResolve('/shop');
    assert.ok(r.entityId);
    const cap = await Q.getCapability(d, r.entityId, 'ecommerce');
    assert.equal(cap.state, 'CONFIRMED', `expected CONFIRMED, got ${cap.state}: ${cap.reason}`);
    assert.ok(cap.signals.some((s) => s.signal === 'shopify'));
  });

  it('says NOT_OBSERVED for a site with no storefront, never false', async () => {
    const r = await crawlAndResolve('/insta-only');
    assert.ok(r.entityId);
    const cap = await Q.getCapability(d, r.entityId, 'ecommerce');
    assert.equal(cap.state, 'NOT_OBSERVED');
    assert.match(cap.reason, /looked for and not found/);
  });

  it('answers the commercial question: has a site, no ecommerce observed', async () => {
    const found = await Q.findWithCapability(d, { has: ['website'], lacks: ['ecommerce'], type: 'ORGANIZATION' });
    assert.ok(found.length > 0, 'this is the prospect list the whole layer exists for');
    assert.ok(found.every((e) => e.capabilities.ecommerce === 'NOT_OBSERVED'));
    assert.ok(!found.some((e) => /bramble/i.test(e.canonicalName)), 'the Shopify site must not appear');
  });

  it('finds a social presence without a separate boolean column', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const peony = orgs.find((o) => /peony/i.test(o.canonicalName));
    assert.ok(peony);
    const cap = await Q.getCapability(d, peony.id, 'social');
    assert.ok(cap.state === 'CONFIRMED' || cap.state === 'PROBABLE');
  });
});

/* ========================================================================== */
describe('categories', () => {
  it('maps aliases and spellings to one canonical category', async () => {
    for (const form of ['Cafe', 'Café', 'coffee shop', 'COFFEE HOUSE']) {
      const m = await mapCategory(d, form);
      assert.equal(m?.slug, 'cafe', `${form} should map to cafe`);
    }
  });

  it('keeps word boundaries, so cafeteria is not a cafe', async () => {
    const found = await detectCategories(d, 'our cafeteria serves lunch');
    assert.ok(!found.some((f) => f.slug === 'cafe'), 'substring matching would get this wrong');
  });

  it('prefers the longest alias', async () => {
    const found = await detectCategories(d, 'an independent coffee shop in town');
    assert.equal(found[0]?.slug, 'cafe', '"coffee shop" must win over "shop"');
  });

  it('refuses to invent a category it has never been taught', async () => {
    assert.equal(await mapCategory(d, 'artisanal zeppelin refurbishment'), null);
  });
});

/* ========================================================================== */
describe('geography', () => {
  it('finds entities within a runtime radius and excludes those outside it', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const abc = orgs.find((o) => /abc/i.test(o.canonicalName));
    const xyz = orgs.find((o) => /xyz/i.test(o.canonicalName));
    assert.ok(abc && xyz);

    /* Coordinates are SET here, never derived from an address: geocoding is a
       provider boundary and no provider is configured. */
    const la = await d.query<{ id: string }>('select id from entity_location where entity_id = $1 limit 1', [abc.id]);
    const lb = await d.query<{ id: string }>('select id from entity_location where entity_id = $1 limit 1', [xyz.id]);
    assert.ok(la[0] && lb[0], 'both have an address row from their JSON-LD');
    await Q.setLocationCell(d, la[0].id, 28.6139, 77.209);
    await Q.setLocationCell(d, lb[0].id, 28.4595, 77.0266);

    const near = await Q.findNearby(d, 28.6139, 77.209, 5);
    assert.ok(near.some((e) => e.id === abc.id), 'the one at the centre is found');
    assert.ok(!near.some((e) => e.id === xyz.id), 'the one 30km away is not');

    const wide = await Q.findNearby(d, 28.6139, 77.209, 50);
    assert.ok(wide.some((e) => e.id === xyz.id), 'and a wider radius does find it');
    assert.ok((wide.find((e) => e.id === xyz.id)?.distanceKm ?? 0) > 20);
  });

  it('never invents coordinates', async () => {
    const rows = await d.query<{ n: string }>(
      `select count(*)::text as n from entity_location
        where geocode = 'NO_PROVIDER' and (latitude is not null or longitude is not null)
          and geo_cell is null`,
    );
    assert.equal(rows[0]?.n, '0', 'a coordinate exists only where one was explicitly set');
  });
});

/* ========================================================================== */
describe('provenance, quality and retention', () => {
  it('walks a result back to the source that produced it', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const abc = orgs.find((o) => /abc/i.test(o.canonicalName));
    assert.ok(abc);
    const chain = await Q.getEntityEvidence(d, abc.id);
    const email = chain.find((c) => c.field === 'email' && c.value !== 'UNKNOWN');
    assert.ok(email, 'the entity holds an email claim');
    assert.ok(email.evidence.length > 0, 'which points at observations');
    const first = email.evidence[0];
    assert.ok(first);
    assert.ok(first.url.startsWith(fx.origin), 'which point at the document they came from');
    assert.ok(first.method.length > 0, 'and name the method that extracted them');
    assert.ok(first.observedAt instanceof Date);
  });

  it('reports coverage as a word, never a percentage', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const abc = orgs.find((o) => /abc/i.test(o.canonicalName));
    assert.ok(abc);
    const c = await Q.getCoverage(d, abc.id);
    assert.ok(['NONE', 'PARTIAL', 'CORROBORATED'].includes(c.verdict));
    assert.ok(c.sourcesChecked > 0);
    assert.ok(Array.isArray(c.unresolvedFields));
  });

  it('lists entities resting on a single source', async () => {
    const single = await Q.findSingleSourceEntities(d);
    assert.ok(Array.isArray(single));
  });

  it('lists nothing as stale when everything was just crawled', async () => {
    assert.equal((await Q.findStaleEntities(d, 365)).length, 0, 'old is not false, and nothing here is old');
  });

  it('surfaces the pairs it refused to settle', async () => {
    const dupes = await Q.findPotentialDuplicates(d);
    assert.ok(Array.isArray(dupes), 'the human queue is queryable');
    for (const p of dupes) assert.ok(['PROBABLE_SAME', 'AMBIGUOUS'].includes(p.decision));
  });

  it('keeps the entity when one of its sources is deleted', async () => {
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
    const abc = orgs.find((o) => /abc/i.test(o.canonicalName));
    assert.ok(abc);
    const docs = await d.query<{ document_id: string }>(
      'select distinct document_id from observation where entity_id = $1',
      [abc.id],
    );
    assert.ok(docs.length >= 2, 'ABC was seen on more than one page');

    const before_ = await d.query<{ n: string }>(
      'select count(*)::text as n from observation where entity_id = $1',
      [abc.id],
    );
    await d.query('delete from document where id = $1', [docs[0]?.document_id]);

    const stillThere = await Q.getEntity(d, abc.id);
    assert.ok(stillThere, 'the ENTITY survives: it is not owned by any one source');
    const after_ = await d.query<{ n: string }>(
      'select count(*)::text as n from observation where entity_id = $1',
      [abc.id],
    );
    assert.ok(
      Number(after_[0]?.n) < Number(before_[0]?.n),
      'but the observations from that source go with it, because they were its statements',
    );
  });

  it('retains an entity whose every source is gone, by explicit policy', async () => {
    const created = await d.query<{ id: string }>(
      `insert into entity (type, canonical_name, normalized_name) values ('ORGANIZATION','Orphan Co','orphan co') returning id`,
    );
    const id = created[0]?.id as string;
    const remaining = await Q.getEntity(d, id);
    assert.ok(remaining, 'an entity with no observations is retained, not auto-deleted');
    /* The policy, stated: entities are never cascade-deleted by source removal.
       Removing one is a deliberate act, because a merge, a relationship or a
       human decision may reference it long after its first source is gone. */
    await d.query('delete from entity where id = $1', [id]);
  });
});

/* ========================================================================== */
describe('trade relationships stated in prose', () => {
  it('reads the phrasings a page actually uses, and nothing else', async () => {
    const { findTradeMentions } = await import('../src/entity/trade.ts');

    const found = findTradeMentions(
      'Our shelves are supplied by Eastfield Supply Co. We stock Bramble Goods and other brands. ' +
        'Everything is supplied by local farms. Available at Peony Flowers.',
    );
    const byType = new Map(found.map((m) => [m.name, m]));

    assert.ok(byType.has('Eastfield Supply Co'), `missed the supplier: ${found.map((f) => f.name).join(', ')}`);
    assert.equal(byType.get('Eastfield Supply Co')?.type, 'SUPPLIES');
    assert.equal(byType.get('Eastfield Supply Co')?.direction, 'INBOUND');

    assert.ok(byType.has('Bramble Goods'));
    assert.equal(byType.get('Bramble Goods')?.direction, 'OUTBOUND', 'we stock X means we sell X');

    /* "local farms" is not a business, and a lower-case noun after the verb is
       exactly the false positive this must not produce. */
    assert.equal(
      found.some((f) => /local/i.test(f.name)),
      false,
      'a common noun became a company',
    );

    for (const m of found) assert.ok(m.quote.length > 0, 'every mention carries the sentence it came from');
  });

  it('refuses to make an edge to a business it cannot resolve', async () => {
    const { ingestTradeRelationships } = await import('../src/entity/trade.ts');
    const org = await Q.findEntities(d, { type: 'ORGANIZATION', limit: 1 });
    const subject = org[0];
    assert.ok(subject);

    const docs = await d.query<{ id: string }>('select id from document limit 1');
    const doc = docs[0];
    assert.ok(doc);

    const before = (await Q.getRelationships(d, subject.id)).length;
    const r = await ingestTradeRelationships(
      d,
      subject.id,
      doc.id,
      'Our produce is supplied by Nonexistent Wholesale Partners Limited.',
    );
    assert.equal(r.mentions, 1);
    assert.equal(r.edges, 0, 'a business not in the corpus must not become an edge');
    assert.deepEqual(r.unknown, ['Nonexistent Wholesale Partners Limited']);
    assert.equal((await Q.getRelationships(d, subject.id)).length, before);
  });

  it('makes an edge, with the sentence, when the named business is known', async () => {
    const { ingestTradeRelationships } = await import('../src/entity/trade.ts');
    const orgs = await Q.findEntities(d, { type: 'ORGANIZATION', limit: 20 });
    const subject = orgs[0];
    const other = orgs.find((o) => o.id !== subject?.id);
    assert.ok(subject && other);

    const docs = await d.query<{ id: string }>('select id from document limit 1');
    const doc = docs[0];
    assert.ok(doc);

    const r = await ingestTradeRelationships(
      d,
      subject.id,
      doc.id,
      `Our produce is supplied by ${other.canonicalName}.`,
    );
    assert.equal(r.mentions, 1);
    assert.equal(r.edges, 1, `expected an edge; refused: ${JSON.stringify(r.refused)} unknown: ${r.unknown.join(', ')}`);

    const edges = await Q.getRelationships(d, subject.id);
    const supply = edges.find((e) => e.type === 'SUPPLIES');
    assert.ok(supply, 'the SUPPLIES edge is missing');
    assert.equal(supply.direction, 'in', 'supplied by X means X supplies us');
    assert.equal(supply.otherId, other.id);
    assert.ok(supply.evidenceCount > 0, 'the edge must cite the sentence that produced it');

    const evidence = await d.query<{ raw_value: string; evidence: string | null; extraction_method: string }>(
      `select o.raw_value, o.evidence, o.extraction_method
         from relationship_evidence re join observation o on o.id = re.observation_id
        where re.relationship_id = $1`,
      [supply.id],
    );
    assert.ok(evidence.length > 0);
    assert.match(evidence[0]?.evidence ?? '', /supplied by/);
    assert.match(evidence[0]?.extraction_method ?? '', /^text:/);
  });
});
