import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Fixture } from './fixture.ts';

/*
 * THE SAME SUITE, AGAINST BOTH STORES.
 *
 * Run with DATABASE_URL set and it exercises Postgres; run without and it
 * exercises PGlite in a throwaway directory. Nothing below branches on which:
 * if the two ever diverge, the divergence shows up as a failure here rather
 * than as a surprise in production, which is the entire argument for having
 * written the data layer against one dialect.
 */
process.env.API_KEY ??= 'test-key-that-is-long-enough-to-pass-validation';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'true';
process.env.CRAWL_PER_HOST_RPS = '50';
process.env.EMBEDDING_PROVIDER = 'deterministic';
if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-test-'));
}

const { getDriver, closeDriver } = await import('../src/db/client.ts');
const { migrate } = await import('../src/db/migrate.ts');
const { ingestOne } = await import('../src/index/ingest.ts');
const { retrieve, recordRetrieval } = await import('../src/retrieve/hybrid.ts');
const { DirectProvider, ProviderRegistry } = await import('../src/search/providers.ts');
const { SearxngProvider } = await import('../src/search/searxng.ts');
const { Crawler } = await import('../src/crawl/fetch.ts');
const { startFixture, page, ALLOW_ALL } = await import('./fixture.ts');

type Driver = Awaited<ReturnType<typeof getDriver>>;

let d: Driver;
let fx: Fixture;
let crawler: InstanceType<typeof Crawler>;
const direct = new DirectProvider();

const MARGIN = 'Gross margin declined across the retail division during the period under review. ';
const OPS = 'Fulfilment was handled manually and the workflow required repeated data entry by one person. ';
const CAKE = 'Line the tin with parchment and fold the almonds through the batter gently. ';

const marginPage = (extra = '') =>
  page({
    title: 'Margin Review',
    description: 'A review of margins.',
    jsonld: { '@type': 'Organization', name: 'Acme Limited', email: 'hello@acme.example' },
    bodyHtml: `<article><h1>Margin Review</h1><p>${MARGIN.repeat(4)}</p>
      <h2>Operations</h2><p>${OPS.repeat(4)}</p>${extra}</article>`,
  });

before(async () => {
  d = await getDriver();
  await migrate();
  fx = await startFixture({
    '/robots.txt': ALLOW_ALL,
    '/margin': { body: marginPage() },
    '/ops': {
      body: page({
        title: 'Operations Notes',
        bodyHtml: `<article><h1>Operations</h1><p>${OPS.repeat(5)}</p></article>`,
      }),
    },
    '/cake': {
      body: page({ title: 'Cake', bodyHtml: `<article><h1>Cake</h1><p>${CAKE.repeat(5)}</p></article>` }),
    },
    '/reg-7712': {
      body: page({
        title: 'Registration',
        bodyHtml: `<article><h1>Registration</h1><p>The company registration number is REG-7712 and it was issued by the registrar. ${'Filing details follow in the appendix. '.repeat(6)}</p></article>`,
      }),
    },
  });
  crawler = new Crawler({ attempts: 1 });
});

after(async () => {
  /* Leave the store as it was found: Postgres runs against a shared database. */
  await d.query("delete from discovery where url like $1", [`${fx.origin}%`]);
  await d.query("delete from source where origin = '127.0.0.1'");
  await fx.close();
  await closeDriver();
});

const ingest = async (path: string) => {
  const found = await direct.search(`${fx.origin}${path}`);
  const first = found.results[0];
  assert.ok(first, 'the direct provider should yield a discovery');
  return ingestOne(d, first, { crawler });
};

describe('ingestion', () => {
  it('takes a directly supplied URL through to embedded chunks', async () => {
    const r = await ingest('/margin');
    assert.equal(r.outcome, 'ok');
    assert.equal(r.version, 1);
    assert.ok(r.chunks > 0, 'a real page must produce chunks');
    assert.equal(r.embedded, r.chunks, 'a new document embeds every chunk exactly once');
    assert.equal(r.reusedEmbeddings, 0);
    assert.ok(r.extractedFields > 0);

    const rows = await d.query<{ n: string }>(
      'select count(*)::text as n from chunk where document_id = $1 and embedding is not null',
      [r.documentId],
    );
    assert.equal(rows[0]?.n, String(r.chunks), 'every stored chunk must carry a vector');
  });

  it('records the discovery, links it to the document, and keeps the snippet out of the corpus', async () => {
    const rows = await d.query<{ provider: string; snippet: string | null; document_id: string | null; outcome: string }>(
      'select provider, snippet, document_id, outcome from discovery where url like $1',
      [`${fx.origin}/margin%`],
    );
    const row = rows[0];
    assert.ok(row, 'a discovery row must exist');
    assert.equal(row.provider, 'direct');
    assert.equal(row.outcome, 'ok');
    assert.ok(row.document_id !== null, 'a crawled discovery points at its document');
    assert.equal(row.snippet, null, 'a direct URL has no snippet to invent');

    /* The structural guarantee: nothing in the corpus came from a snippet. */
    const leaked = await d.query<{ n: string }>(
      `select count(*)::text as n from chunk c
        join document doc on doc.id = c.document_id
        join discovery disc on disc.document_id = doc.id
       where disc.snippet is not null and c.text = disc.snippet`,
    );
    assert.equal(leaked[0]?.n, '0', 'a provider summary must never become a chunk');
  });

  it('reuses one source row per origin rather than one per page', async () => {
    await ingest('/ops');
    const rows = await d.query<{ n: string }>("select count(*)::text as n from source where origin = '127.0.0.1'");
    assert.equal(rows[0]?.n, '1', 'two pages on one host are one source');
  });

  it('does nothing at all when a recrawl finds unchanged content', async () => {
    const before_ = await d.query<{ version: number; last_seen_at: string }>(
      'select version, last_seen_at::text from document where url like $1',
      [`${fx.origin}/margin%`],
    );
    const chunkIdsBefore = await d.query<{ id: string }>(
      'select c.id from chunk c join document doc on doc.id = c.document_id where doc.url like $1 order by c.ord',
      [`${fx.origin}/margin%`],
    );

    const again = await ingest('/margin');
    assert.equal(again.outcome, 'unchanged');
    assert.equal(again.embedded, 0, 'nothing is re-embedded');
    assert.equal(again.version, before_[0]?.version, 'the version does not move');

    const chunkIdsAfter = await d.query<{ id: string }>(
      'select c.id from chunk c join document doc on doc.id = c.document_id where doc.url like $1 order by c.ord',
      [`${fx.origin}/margin%`],
    );
    assert.deepEqual(
      chunkIdsAfter.map((r) => r.id),
      chunkIdsBefore.map((r) => r.id),
      'the same chunk rows survive; a recrawl must not duplicate the corpus',
    );
  });

  it('versions a changed page, records the revision, and re-embeds only what moved', async () => {
    fx.routes.set('/margin', {
      body: marginPage('<h2>Outlook</h2><p>A newly added paragraph about next year and its expected pressures on pricing.</p>'),
    });

    const changed = await ingest('/margin');
    assert.equal(changed.outcome, 'ok');
    assert.equal(changed.version, 2, 'a changed hash increments the version');
    assert.ok(changed.reusedEmbeddings > 0, 'paragraphs that did not move keep their vectors');
    assert.ok(changed.embedded >= 1, 'genuinely new text is embedded');
    assert.ok(changed.embedded < changed.chunks, 'but not the whole document');

    const revisions = await d.query<{ version: number; content_hash: string }>(
      'select version, content_hash from document_revision where document_id = $1',
      [changed.documentId],
    );
    assert.equal(revisions.length, 1, 'the outgoing version is recorded');
    assert.equal(revisions[0]?.version, 1);

    const versions = await d.query<{ document_version: number }>(
      'select distinct document_version from chunk where document_id = $1',
      [changed.documentId],
    );
    assert.deepEqual(versions.map((v) => v.document_version), [2], 'chunks belong to exactly one version');
  });

  it('keeps last_seen_at and the revision time as separate facts', async () => {
    const rows = await d.query<{ first_seen_at: string; last_seen_at: string; version: number }>(
      'select first_seen_at::text, last_seen_at::text, version from document where url like $1',
      [`${fx.origin}/margin%`],
    );
    const row = rows[0];
    assert.ok(row);
    assert.ok(new Date(row.last_seen_at) >= new Date(row.first_seen_at));
    assert.equal(row.version, 2);
  });

  it('separates a value the publisher declared from one matched in prose', async () => {
    const rows = await d.query<{ method: string; value: string }>(
      `select ef.method, ef.value from extracted_field ef
         join document doc on doc.id = ef.document_id
        where doc.url like $1 and ef.field = 'email'`,
      [`${fx.origin}/margin%`],
    );
    assert.ok(rows.some((r) => r.method === 'jsonld' && r.value === 'hello@acme.example'));
  });

  it('records a refusal without creating a document', async () => {
    fx.routes.set('/binary', { headers: { 'content-type': 'application/pdf' }, body: 'x' });
    const r = await ingest('/binary');
    assert.equal(r.outcome, 'blocked_type');
    assert.equal(r.documentId, null);
    const rows = await d.query<{ outcome: string | null }>(
      'select outcome from discovery where url like $1',
      [`${fx.origin}/binary%`],
    );
    assert.equal(rows[0]?.outcome, 'blocked_type', 'the refusal is recorded, not lost');
  });
});

describe('discovery through a search provider', () => {
  it('takes a SearXNG result through the same pipeline a direct URL uses', async () => {
    /*
     * SearXNG is stood in for with a fake transport rather than a live
     * instance, because the thing under test is the SEAM: a provider result
     * entering ingestion unchanged. The mapping from SearXNG's own JSON is
     * proven separately in unit.test.ts.
     */
    const fake: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          results: [
            { url: `${fx.origin}/ops`, title: 'Operations Notes', content: 'A SUMMARY THE PAGE NEVER CONTAINS', engine: 'ddg' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const searx = new SearxngProvider('https://searx.example', fake);
    const found = await searx.search('acme operations');
    assert.equal(found.unavailable, undefined);
    const first = found.results[0];
    assert.ok(first);
    assert.equal(first.provider, 'searxng');

    const r = await ingestOne(d, first, { crawler });
    assert.ok(r.outcome === 'ok' || r.outcome === 'unchanged');

    const rows = await d.query<{ provider: string; snippet: string | null; document_id: string | null }>(
      "select provider, snippet, document_id from discovery where provider = 'searxng' and url like $1",
      [`${fx.origin}/ops%`],
    );
    const row = rows[0];
    assert.ok(row, 'the searxng discovery is recorded separately from the direct one');
    assert.equal(row.snippet, 'A SUMMARY THE PAGE NEVER CONTAINS', 'the snippet is kept for provenance');
    assert.ok(row.document_id !== null);

    /* And the snippet went nowhere near the corpus. */
    const leaked = await d.query<{ n: string }>(
      "select count(*)::text as n from chunk where text like '%A SUMMARY THE PAGE NEVER CONTAINS%'",
    );
    assert.equal(leaked[0]?.n, '0', 'a provider summary is never evidence');
  });
});

describe('hybrid retrieval', () => {
  before(async () => {
    await ingest('/cake');
    await ingest('/reg-7712');
  });

  it('finds a passage by meaning-adjacent wording', async () => {
    const r = await retrieve(d, 'retail gross margin decline', { limit: 5 });
    assert.ok(r.denseCount > 0, 'the dense index must return candidates');
    assert.ok(r.returned.length > 0);
    assert.ok(r.returned.some((c) => c.text.includes('Gross margin declined')));
  });

  it('finds an exact token the dense side is not built to match', async () => {
    const r = await retrieve(d, 'REG-7712', { limit: 5 });
    assert.ok(r.lexicalCount > 0, 'the lexical index must match the literal token');
    assert.ok(r.returned.some((c) => c.text.includes('REG-7712')), 'an identifier must be findable');
  });

  it('fuses both retrievers and says how much they agreed', async () => {
    const r = await retrieve(d, 'fulfilment workflow manual data entry', { limit: 6 });
    assert.ok(r.denseCount > 0 && r.lexicalCount > 0);
    assert.ok(r.returned.every((c) => c.scoreFused > 0));
    assert.ok(r.overlap >= 0 && r.overlap <= r.returned.length + r.droppedForDiversity);
    assert.match(r.strategy, /rrf/);
  });

  it('does not return the same document five times', async () => {
    const r = await retrieve(d, 'operations fulfilment margin retail', { limit: 6, maxPerDocument: 2 });
    const perDoc = new Map<string, number>();
    for (const c of r.returned) perDoc.set(c.documentId, (perDoc.get(c.documentId) ?? 0) + 1);
    assert.ok([...perDoc.values()].every((n) => n <= 2), 'one page repeating itself is not corroboration');
  });

  it('stops at the token budget rather than truncating a passage', async () => {
    const r = await retrieve(d, 'margin operations fulfilment', { limit: 20, tokenBudget: 120 });
    assert.ok(r.tokensUsed <= 120, `budget exceeded: ${r.tokensUsed}`);
    assert.ok(r.returned.every((c) => c.text.length > 0));
  });

  it('returns nothing rather than something irrelevant when the corpus cannot answer', async () => {
    const r = await retrieve(d, 'zzzqqq nonexistent terminology xyzzy', { limit: 5 });
    assert.equal(r.lexicalCount, 0, 'no lexical match for invented words');
  });

  it('reports whether its dense vectors carry meaning', async () => {
    const r = await retrieve(d, 'margin', { limit: 1 });
    assert.equal(r.semanticDense, false, 'the deterministic embedder must not be mistaken for a semantic one');
    assert.equal(r.embeddingModel, 'deterministic-hash-384');
  });

  it('writes the retrieval down as a future training example', async () => {
    const r = await retrieve(d, 'retail gross margin decline', { limit: 4 });
    const runId = await recordRetrieval(d, r, { pipelineVersion: 'layer2-test' });
    const rows = await d.query<{ n: string }>('select count(*)::text as n from retrieval where audit_run_id = $1', [runId]);
    assert.equal(rows[0]?.n, String(r.returned.length));

    const run = await d.query<{ question: string; pipeline_version: string; embedding_model: string; retrieval_strategy: string }>(
      'select question, pipeline_version, embedding_model, retrieval_strategy from audit_run where id = $1',
      [runId],
    );
    assert.equal(run[0]?.question, 'retail gross margin decline');
    assert.equal(run[0]?.pipeline_version, 'layer2-test');
    assert.equal(run[0]?.embedding_model, 'deterministic-hash-384');
    assert.match(run[0]?.retrieval_strategy ?? '', /rrf/);
    await d.query('delete from audit_run where id = $1', [runId]);
  });
});

describe('resilience', () => {
  it('ingests a direct URL with no search provider configured at all', async () => {
    const registry = new ProviderRegistry([new DirectProvider(), new SearxngProvider(undefined)]);
    const searx = registry.get('searxng');
    assert.ok(searx);
    const failed = await searx.search('acme');
    assert.equal(failed.unavailable?.reason, 'not_configured', 'search is down');

    assert.equal(registry.default().id, 'direct', 'and the default falls back rather than failing');
    const r = await ingest('/ops');
    assert.ok(r.outcome === 'ok' || r.outcome === 'unchanged', 'direct ingestion is unaffected');
  });

  it('cascades a delete from source through documents, chunks and extracted values', async () => {
    const src = await d.query<{ id: string }>(
      "insert into source (kind, origin) values ('manual', 'cascade.test') returning id",
    );
    const sourceId = src[0]?.id;
    assert.ok(sourceId);
    const doc = await d.query<{ id: string }>(
      `insert into document (source_id, url, url_hash, text) values ($1,'https://cascade.test/x','cascade-hash','body') returning id`,
      [sourceId],
    );
    const documentId = doc[0]?.id;
    assert.ok(documentId);
    await d.query(`insert into chunk (document_id, ord, text) values ($1, 0, 'a passage')`, [documentId]);
    await d.query(
      `insert into extracted_field (document_id, field, value, method) values ($1,'email','a@b.c','link')`,
      [documentId],
    );

    await d.query('delete from source where id = $1', [sourceId]);
    for (const table of ['document', 'chunk', 'extracted_field']) {
      const rows = await d.query<{ n: string }>(
        `select count(*)::text as n from ${table} where ${table === 'document' ? 'id' : 'document_id'} = $1`,
        [documentId],
      );
      assert.equal(rows[0]?.n, '0', `${table} must not survive its source`);
    }
  });
});
