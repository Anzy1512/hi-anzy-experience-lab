import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';

/* A type-only import is erased, so it cannot pull `config.ts` in ahead of the
   environment being set below. Values must still come from a dynamic import. */
import type { Fixture } from './fixture.ts';

/*
 * These drive a real HTTP server on 127.0.0.1, which the guard exists to
 * refuse — so this file, and only this file, runs with the flag on. The guard
 * is proven against the flag OFF in unit.test.ts, in its own process. Splitting
 * them is the only way to have both: `config.ts` parses the environment once at
 * load, deliberately, so one process cannot hold two answers.
 */
process.env.API_KEY ??= 'test-key-that-is-long-enough-to-pass-validation';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'true';
process.env.CRAWL_PER_HOST_RPS = '50';
process.env.CRAWL_MAX_BYTES = '200000';
process.env.CRAWL_TIMEOUT_MS = '2000';

const { Crawler } = await import('../src/crawl/fetch.ts');
const { startFixture, page, ALLOW_ALL, gzipBomb } = await import('./fixture.ts');

let fx: Fixture;
let crawler: InstanceType<typeof Crawler>;

const body = page({ title: 'Ordinary', bodyHtml: '<article><h1>Ordinary</h1><p>Some real prose about a business and its operations.</p></article>' });

before(async () => {
  fx = await startFixture({
    '/robots.txt': ALLOW_ALL,
    '/ok': { body },
    '/redirect-1': { status: 302, headers: { location: '/redirect-2' } },
    '/redirect-2': { status: 302, headers: { location: '/ok' } },
    '/redirect-loop': { status: 302, headers: { location: '/redirect-loop' } },
    '/redirect-to-file': { status: 302, headers: { location: 'file:///etc/passwd' } },
    '/no-location': { status: 302, headers: {} },
    '/pdf': { headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4 not really' },
    '/image': { headers: { 'content-type': 'image/png' }, body: 'not really a png' },
    /* Chunked, with no Content-Length at all. The original version of this
       fixture declared `content-length: 10` and sent 400 kB, which proved
       nothing: Node honours the declared length and truncates the response, so
       ten bytes arrived and `ok` was the correct answer. A body with no
       declared length is the case only the streamed counter can catch. */
    '/no-length-huge': {
      handler: (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        for (let i = 0; i < 40; i++) res.write('x'.repeat(10_000));
        res.end();
      },
    },
    '/declared-huge': { headers: { 'content-type': 'text/html', 'content-length': '99999999' }, body: 'x'.repeat(100) },
    '/slow': {
      handler: (_req, res) => {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end('too late');
        }, 6000).unref();
      },
    },
    '/etag': {
      handler: (req, res) => {
        if (req.headers['if-none-match'] === '"v1"') {
          res.writeHead(304, { etag: '"v1"' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html', etag: '"v1"' });
        res.end(body);
      },
    },
    '/flaky': {
      handler: (() => {
        let calls = 0;
        return (_req: unknown, res: import('node:http').ServerResponse) => {
          calls += 1;
          if (calls < 3) {
            res.writeHead(503, { 'content-type': 'text/plain' });
            res.end('try later');
            return;
          }
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(body);
        };
      })() as never,
    },
    '/gone': { status: 404, headers: { 'content-type': 'text/plain' }, body: 'nope' },
  });
  crawler = new Crawler({ maxRedirects: 3, attempts: 3 });
});

after(async () => {
  await fx.close();
});

describe('crawler', () => {
  it('fetches an ordinary page and hashes it', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/ok` });
    assert.equal(r.outcome, 'ok');
    assert.equal(r.status, 200);
    assert.ok(r.body?.includes('Ordinary'));
    assert.match(r.contentHash ?? '', /^[0-9a-f]{64}$/);
    assert.ok(r.byteLen > 0);
  });

  it('follows redirects and records every hop', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/redirect-1` });
    assert.equal(r.outcome, 'ok');
    assert.equal(r.finalUrl, `${fx.origin}/ok`);
    assert.equal(r.redirectChain.length, 2, 'the chain is provenance, not an implementation detail');
  });

  it('stops at the redirect limit instead of looping forever', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/redirect-loop` });
    assert.equal(r.outcome, 'too_many_redirects');
  });

  it('refuses a redirect that leaves http(s)', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/redirect-to-file` });
    assert.equal(r.outcome, 'blocked_scheme');
    assert.match(r.detail, /redirect refused|non-http/i);
  });

  it('treats a redirect with no Location as an error, not a hang', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/no-location` });
    assert.equal(r.outcome, 'http_error');
  });

  it('refuses content types it cannot read', async () => {
    for (const path of ['/pdf', '/image']) {
      const r = await crawler.fetch({ url: `${fx.origin}${path}` });
      assert.equal(r.outcome, 'blocked_type', `${path} should be refused`);
      assert.ok(r.body === null, 'a refused body is never carried');
    }
  });

  it('refuses a body that declares itself too large, before reading it', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/declared-huge` });
    assert.equal(r.outcome, 'too_large');
    assert.match(r.detail, /Content-Length/);
  });

  it('refuses an oversized body that declared no length at all', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/no-length-huge` });
    assert.equal(r.outcome, 'too_large', 'with no Content-Length, only the streamed counter can stop this');
    assert.match(r.detail, /streaming/);
  });

  it('counts decompressed bytes, so a gzip bomb is refused', async () => {
    const bomb = gzipBomb(8);
    fx.routes.set('/bomb', { headers: bomb.headers, body: bomb.body });
    const r = await crawler.fetch({ url: `${fx.origin}/bomb` });
    assert.equal(r.outcome, 'too_large', 'a small compressed body can still be enormous in memory');
  });

  it('times out rather than waiting on a slow server', async () => {
    const slow = new Crawler({ attempts: 1 });
    const r = await slow.fetch({ url: `${fx.origin}/slow` });
    assert.ok(r.outcome === 'timeout' || r.outcome === 'network_error', `got ${r.outcome}`);
  });

  it('reports 304 as unchanged and reads no body', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/etag`, etag: '"v1"' });
    assert.equal(r.outcome, 'unchanged');
    assert.equal(r.status, 304);
    assert.equal(r.body, null, 'the cheapest successful crawl transfers no body at all');
  });

  it('reports unchanged when the hash matches, even without a 304', async () => {
    const first = await crawler.fetch({ url: `${fx.origin}/ok` });
    const second = await crawler.fetch({ url: `${fx.origin}/ok`, knownHash: first.contentHash });
    assert.equal(second.outcome, 'unchanged');
    assert.match(second.detail, /hash/);
  });

  it('retries a 503 and succeeds', async () => {
    const r = await crawler.fetch({ url: `${fx.origin}/flaky` });
    assert.equal(r.outcome, 'ok');
    assert.ok((fx.hits.get('/flaky') ?? 0) >= 3, 'it should have retried');
  });

  it('does not retry a 404', async () => {
    fx.hits.delete('/gone');
    const r = await crawler.fetch({ url: `${fx.origin}/gone` });
    assert.equal(r.outcome, 'http_error');
    assert.equal(fx.hits.get('/gone'), 1, 'a 404 will be a 404 again; retrying spends someone else capacity');
  });

  it('respects a Disallow rule', async () => {
    const blocked = await startFixture({
      '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /private\n' },
      '/private/secret': { body },
      '/public/fine': { body },
    });
    try {
      const c = new Crawler({ attempts: 1 });
      assert.equal((await c.fetch({ url: `${blocked.origin}/private/secret` })).outcome, 'blocked_robots');
      assert.equal((await c.fetch({ url: `${blocked.origin}/public/fine` })).outcome, 'ok');
    } finally {
      await blocked.close();
    }
  });

  it('treats a robots.txt behind authentication as a refusal, never as permission', async () => {
    const locked = await startFixture({
      '/robots.txt': { status: 403, headers: { 'content-type': 'text/plain' }, body: 'forbidden' },
      '/anything': { body },
    });
    try {
      const c = new Crawler({ attempts: 1 });
      const r = await c.fetch({ url: `${locked.origin}/anything` });
      assert.equal(r.outcome, 'blocked_robots');
      assert.match(r.detail, /403|not open/);
    } finally {
      await locked.close();
    }
  });

  it('fetches robots.txt once per origin, not once per page', async () => {
    fx.hits.delete('/robots.txt');
    const fresh = new Crawler({ attempts: 1 });
    await fresh.fetch({ url: `${fx.origin}/ok` });
    await fresh.fetch({ url: `${fx.origin}/redirect-1` });
    await fresh.fetch({ url: `${fx.origin}/gone` });
    assert.equal(fx.hits.get('/robots.txt'), 1, 'a crawl of forty pages must not fetch robots forty-one times');
  });
});
