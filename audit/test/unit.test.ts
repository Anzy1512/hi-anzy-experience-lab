import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

/*
 * The environment is set BEFORE the first import that reaches `config.ts`,
 * because config parses `process.env` once at module load. These tests prove
 * the guard REFUSES private addresses, so the flag must be off here — and the
 * crawl behaviour tests, which need a loopback fixture, live in their own file
 * with their own process and the flag on.
 */
process.env.API_KEY ??= 'test-key-that-is-long-enough-to-pass-validation';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'false';
process.env.EMBEDDING_PROVIDER = 'deterministic';

const { normaliseForIdentity, urlHash, registrableDomain, urlFacts } = await import('../src/crawl/url.ts');
const { addressRefusalReason, guardUrl } = await import('../src/crawl/guard.ts');
const { parseRobots, isAllowed } = await import('../src/crawl/robots.ts');
const { extractHtml } = await import('../src/extract/html.ts');
const { chunkBlocks, estimateTokens } = await import('../src/chunk/structure.ts');
const { DeterministicEmbedder } = await import('../src/embed/deterministic.ts');
const { classify, partition, supportRatio } = await import('../src/provenance/claim.ts');
const { SearxngProvider } = await import('../src/search/searxng.ts');
const { DirectProvider, BraveProvider, ProviderRegistry } = await import('../src/search/providers.ts');
const { page } = await import('./fixture.ts');

/* -------------------------------------------------------------------------- */
describe('URL identity', () => {
  it('collapses campaign parameters, case and trailing slash into one identity', () => {
    const a = normaliseForIdentity('https://Example.COM/a/b/?utm_source=x&gclid=y&id=7');
    const b = normaliseForIdentity('https://example.com:443/a/b?id=7#section');
    assert.equal(a, b, 'the same document reached two ways must have one identity');
    assert.equal(urlHash('https://example.com/a/b'), urlHash('https://example.com/a/b/'));
  });

  it('keeps parameters that select content', () => {
    const withId = normaliseForIdentity('https://example.com/p?id=7');
    const without = normaliseForIdentity('https://example.com/p');
    assert.notEqual(withId, without, 'an id parameter is the document, not a campaign tag');
  });

  it('refuses schemes it will not fetch', () => {
    assert.equal(normaliseForIdentity('file:///etc/passwd'), null);
    assert.equal(normaliseForIdentity('javascript:alert(1)'), null);
    assert.equal(urlFacts('ftp://example.com/x'), null);
  });

  it('groups by registrable domain, including multi-part suffixes', () => {
    assert.equal(registrableDomain('https://news.bbc.co.uk/x'), 'bbc.co.uk');
    assert.equal(registrableDomain('https://a.b.example.com/'), 'example.com');
  });
});

/* -------------------------------------------------------------------------- */
describe('SSRF guard', () => {
  it('refuses every private and reserved IPv4 range', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
      assert.notEqual(addressRefusalReason(ip), null, `${ip} must be refused`);
    }
  });

  it('names the cloud metadata address specifically', () => {
    assert.match(addressRefusalReason('169.254.169.254') ?? '', /metadata/i);
  });

  it('refuses IPv6 loopback, ULA, link-local and IPv4-mapped forms', () => {
    for (const ip of ['::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::']) {
      assert.notEqual(addressRefusalReason(ip), null, `${ip} must be refused`);
    }
  });

  it('allows ordinary public addresses', () => {
    assert.equal(addressRefusalReason('93.184.216.34'), null);
    assert.equal(addressRefusalReason('2606:2800:220:1:248:1893:25c8:1946'), null);
  });

  it('refuses hostnames that mean this machine, without a lookup', async () => {
    for (const host of ['http://localhost/', 'http://foo.localhost/', 'http://db.internal/', 'http://printer.local/']) {
      const r = await guardUrl(host);
      assert.equal(r.ok, false, `${host} must be refused`);
      if (!r.ok) assert.equal(r.refusal.kind, 'blocked_private');
    }
  });

  it('refuses a literal loopback URL', async () => {
    const r = await guardUrl('http://127.0.0.1:5432/');
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.refusal.detail, /loopback/);
  });

  it('refuses a redirect that lands on a private address', async () => {
    /*
     * The bypass this closes: a public URL that 302s somewhere internal. A
     * check performed only on the input passes it. Driven with a fake fetch
     * and a literal public IP as the entry point, so no DNS is needed and the
     * guard flag can stay OFF — which is the whole point of the test.
     */
    const { Crawler } = await import('../src/crawl/fetch.ts');
    const fake: typeof fetch = async (input) => {
      const url = String(input);
      /* robots.txt must answer as robots.txt. The first version of this fake
         returned HTML for every path, and the crawler correctly refused the
         whole origin with `blocked_robots` before the redirect was ever
         reached — a right answer to a different question. */
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nDisallow:\n', { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      if (url.includes('93.184.216.34')) {
        return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
      }
      return new Response('secrets', { status: 200, headers: { 'content-type': 'text/html' } });
    };
    const c = new Crawler({ attempts: 1, fetchImpl: fake });
    const r = await c.fetch({ url: 'http://93.184.216.34/start' });
    assert.equal(r.outcome, 'blocked_private', 'every hop is re-judged, not just the first');
    assert.match(r.detail, /redirect refused/);
    assert.equal(r.body, null, 'nothing is read from a refused target');
  });

  it('refuses non-http schemes before resolving anything', async () => {
    const r = await guardUrl('file:///etc/passwd');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.refusal.kind, 'blocked_scheme');
  });
});

/* -------------------------------------------------------------------------- */
describe('robots.txt', () => {
  it('applies longest-match with Allow winning ties', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /\nAllow: /public/\n', 'hi-anzy-audit/0.1');
    assert.equal(isAllowed(rules, '/public/page').allowed, true);
    assert.equal(isAllowed(rules, '/private/page').allowed, false);
  });

  it('treats an empty Disallow as permitting everything', () => {
    const rules = parseRobots('User-agent: *\nDisallow:\n', 'hi-anzy-audit/0.1');
    assert.equal(isAllowed(rules, '/anything').allowed, true);
  });

  it('prefers a group naming our agent over the wildcard group', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: hi-anzy-audit\nDisallow: /admin\n',
      'hi-anzy-audit/0.1',
    );
    assert.equal(isAllowed(rules, '/reports').allowed, true, 'our own group should apply');
    assert.equal(isAllowed(rules, '/admin/x').allowed, false);
  });

  it('reads wildcards, anchors, crawl-delay and sitemaps', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /*.pdf$\nCrawl-delay: 3\nSitemap: https://e.com/s.xml\n',
      'hi-anzy-audit/0.1',
    );
    assert.equal(isAllowed(rules, '/a/b.pdf').allowed, false);
    assert.equal(isAllowed(rules, '/a/b.pdf?x=1').allowed, true, '$ anchors to the end');
    assert.equal(rules.crawlDelay, 3);
    assert.deepEqual(rules.sitemaps, ['https://e.com/s.xml']);
  });
});

/* -------------------------------------------------------------------------- */
describe('extraction', () => {
  const html = page({
    title: 'Margin Review — Acme',
    description: 'How Acme looked at its margins.',
    canonical: 'https://acme.example/margin-review',
    jsonld: {
      '@type': 'Organization',
      name: 'Acme Limited',
      email: 'hello@acme.example',
      telephone: '+44 20 7946 0000',
      address: { '@type': 'PostalAddress', streetAddress: '1 High St', addressLocality: 'London', postalCode: 'E1 6AN' },
      sameAs: ['https://www.linkedin.com/company/acme'],
    },
    bodyHtml: `
      <article>
        <h1>Margin Review</h1>
        <p>${'Gross margin declined across the retail division during the period under review. '.repeat(4)}</p>
        <h2>Operations</h2>
        <p>${'Fulfilment was handled manually and the workflow required repeated data entry. '.repeat(4)}</p>
        <p>Contact <a href="mailto:press@acme.example">press@acme.example</a> or call <a href="tel:+442079460001">+44 20 7946 0001</a>.</p>
        <address>1 High St, London E1 6AN</address>
      </article>`,
  });

  const e = extractHtml(html, 'https://acme.example/margin-review?utm_source=x');

  it('reads declared metadata', () => {
    assert.equal(e.title, 'Margin Review — Acme');
    assert.equal(e.canonicalUrl, 'https://acme.example/margin-review');
    assert.equal(e.lang, 'en');
    assert.ok(e.jsonld.length >= 1);
  });

  it('removes furniture from the main text', () => {
    assert.ok(e.text.includes('Gross margin declined'));
    assert.ok(!e.text.includes('© Example'), 'the footer is furniture');
    assert.ok(!e.text.includes('Home About Contact'), 'the nav is furniture');
  });

  it('keeps the heading trail on every block', () => {
    const ops = e.blocks.find((b) => b.text.startsWith('Fulfilment'));
    assert.ok(ops, 'the operations paragraph should be a block');
    assert.match(ops.headingPath, /Operations/);
  });

  it('separates a declared value from a pattern-matched one', () => {
    const jsonldEmail = e.values.find((v) => v.value === 'hello@acme.example');
    const linkEmail = e.values.find((v) => v.value === 'press@acme.example');
    assert.equal(jsonldEmail?.method, 'jsonld', 'the publisher stated this as data');
    assert.equal(linkEmail?.method, 'link', 'this was declared by a mailto: href');
  });

  it('records a phone from a tel: href as stronger than one from prose', () => {
    const phones = e.values.filter((v) => v.field === 'phone');
    assert.ok(phones.length > 0);
    assert.ok(phones.every((p) => p.method === 'jsonld' || p.method === 'link'),
      'a declared number must outrank the same number found by regex');
  });

  it('classifies external links', () => {
    const linkedin = e.links.find((l) => l.href.includes('linkedin'));
    if (linkedin) assert.equal(linkedin.external, true);
  });
});

/* -------------------------------------------------------------------------- */
describe('chunking', () => {
  const blocks = [
    { kind: 'section' as const, text: 'Pricing', level: 2, headingPath: 'Pricing', charStart: 0, charEnd: 7 },
    { kind: 'paragraph' as const, text: 'A '.repeat(400).trim(), level: null, headingPath: 'Pricing', charStart: 9, charEnd: 808 },
    { kind: 'section' as const, text: 'Support', level: 2, headingPath: 'Support', charStart: 810, charEnd: 817 },
    { kind: 'paragraph' as const, text: 'B '.repeat(200).trim(), level: null, headingPath: 'Support', charStart: 819, charEnd: 1218 },
    { kind: 'paragraph' as const, text: 'tiny', level: null, headingPath: 'Support', charStart: 1220, charEnd: 1224 },
  ];

  it('never emits a heading as a chunk of its own', () => {
    const chunks = chunkBlocks(blocks);
    assert.ok(chunks.every((c) => c.text !== 'Pricing' && c.text !== 'Support'));
  });

  it('never mixes two heading trails in one chunk', () => {
    for (const c of chunkBlocks(blocks)) {
      assert.ok(!(c.text.includes('A A') && c.text.includes('B B')), 'a section boundary must end a chunk');
    }
  });

  it('prepends the heading trail to what is embedded but not to what is quoted', () => {
    const c = chunkBlocks(blocks).find((x) => x.headingPath === 'Support');
    assert.ok(c);
    assert.ok(c.embedText.startsWith('Support'), 'context travels with the vector');
    assert.ok(!c.text.startsWith('Support'), 'a citation quotes the passage, not the heading');
  });

  it('merges a runt into its neighbour rather than storing it alone', () => {
    const chunks = chunkBlocks(blocks, { minTokens: 24 });
    assert.ok(chunks.every((c) => c.tokenLen >= 24 || chunks.length === 1));
  });

  it('respects the hard maximum by splitting on sentences', () => {
    const long = [
      {
        kind: 'paragraph' as const,
        text: 'This is a sentence about margins. '.repeat(120),
        level: null,
        headingPath: '',
        charStart: 0,
        charEnd: 4080,
      },
    ];
    const chunks = chunkBlocks(long, { maxTokens: 256 });
    assert.ok(chunks.length > 1, 'an oversized paragraph must be split');
    assert.ok(chunks.every((c) => c.tokenLen <= 300), 'and each piece must respect the ceiling');
    assert.ok(chunks.every((c) => /\.$|\.\s*$/.test(c.text.trim())), 'splits land on sentence ends');
  });

  it('gives identical text an identical hash, so it is never re-embedded', () => {
    const a = chunkBlocks(blocks);
    const b = chunkBlocks(blocks);
    assert.deepEqual(a.map((c) => c.hash), b.map((c) => c.hash));
  });

  it('estimates tokens monotonically', () => {
    assert.ok(estimateTokens('a'.repeat(400)) > estimateTokens('a'.repeat(100)));
  });
});

/* -------------------------------------------------------------------------- */
describe('embedding', () => {
  const embedder = new DeterministicEmbedder(384);

  it('is deterministic across calls', async () => {
    const [a] = await embedder.embed(['gross margin declined in retail']);
    const [b] = await embedder.embed(['gross margin declined in retail']);
    assert.deepEqual(a, b);
  });

  it('produces the declared width, normalised', async () => {
    const [v] = await embedder.embed(['anything at all']);
    assert.equal(v?.length, 384);
    const norm = Math.sqrt((v ?? []).reduce((s, x) => s + x * x, 0));
    assert.ok(Math.abs(norm - 1) < 1e-6, `expected a unit vector, got ${norm}`);
  });

  it('places shared vocabulary closer than unrelated text', async () => {
    const [a, b, c] = await embedder.embed([
      'gross margin declined across the retail division',
      'the retail division reported a decline in gross margin',
      'a recipe for lemon drizzle cake with almonds',
    ]);
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * (y[i] ?? 0), 0);
    assert.ok(dot(a ?? [], b ?? []) > dot(a ?? [], c ?? []), 'shared tokens must dominate');
  });

  it('declares that it is not semantic', () => {
    assert.equal(embedder.semantic, false, 'this flag stops a hashing projection being mistaken for meaning');
  });

  it('handles empty text without producing NaN', async () => {
    const [v] = await embedder.embed(['']);
    assert.ok((v ?? []).every((x) => Number.isFinite(x)));
  });
});

/* -------------------------------------------------------------------------- */
describe('search providers', () => {
  it('direct ingestion needs no network and dedupes', async () => {
    const p = new DirectProvider();
    const r = await p.search('https://a.example/x  https://a.example/x/?utm_source=q https://b.example/y');
    assert.equal(r.unavailable, undefined);
    assert.equal(r.results.length, 2, 'the same document twice is one discovery');
    assert.ok(r.results.every((d) => d.provider === 'direct' && d.snippet === null));
  });

  it('reports not_configured rather than throwing', async () => {
    const searx = new SearxngProvider(undefined);
    const r = await searx.search('acme');
    assert.equal(r.results.length, 0);
    assert.equal(r.unavailable?.reason, 'not_configured');
    const brave = new BraveProvider(undefined);
    assert.equal((await brave.search('acme')).unavailable?.reason, 'not_configured');
  });

  it('detects a SearXNG instance with JSON disabled and says how to fix it', async () => {
    const fake: typeof fetch = async () =>
      new Response('<html><body>results</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const r = await new SearxngProvider('https://searx.example', fake).search('acme');
    assert.equal(r.results.length, 0, 'an HTML answer must never be read as zero results');
    assert.equal(r.unavailable?.reason, 'rejected');
    assert.match(r.unavailable?.detail ?? '', /settings\.yml/);
  });

  it('maps a SearXNG answer into the neutral shape', async () => {
    const fake: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          results: [
            { url: 'https://acme.example/a', title: 'A', content: 'snippet a', engine: 'duckduckgo' },
            { url: 'https://acme.example/a/?utm_source=z', title: 'dupe', content: 'x' },
            { url: 'https://acme.example/b', title: 'B', content: 'snippet b', publishedDate: '2026-01-02' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const r = await new SearxngProvider('https://searx.example', fake).search('acme', { limit: 10 });
    assert.equal(r.results.length, 2, 'tracking-tagged duplicates collapse');
    assert.equal(r.results[0]?.rank, 1);
    assert.equal(r.results[0]?.publishedAt, null, 'absent is null, never a default date');
    assert.ok(r.results[1]?.publishedAt instanceof Date);
    assert.equal(r.results[0]?.provider, 'searxng');
  });

  it('falls back to direct when the configured provider is missing', () => {
    const registry = new ProviderRegistry([new DirectProvider()]);
    assert.equal(registry.default().id, 'direct');
  });

  it('exposes providers only through the neutral interface', async () => {
    const registry = new ProviderRegistry([new DirectProvider(), new SearxngProvider(undefined), new BraveProvider(undefined)]);
    for (const id of registry.ids()) {
      const p = registry.get(id);
      assert.ok(p);
      assert.equal(typeof p.search, 'function');
      assert.equal(typeof p.available, 'function');
    }
    const report = await registry.report();
    assert.equal(report.find((r) => r.id === 'direct')?.ok, true);
    assert.equal(report.find((r) => r.id === 'searxng')?.ok, false);
  });
});

/* -------------------------------------------------------------------------- */
describe('provenance', () => {
  const now = new Date();
  const cite = (quote: string) => ({ chunkId: null, quote, url: 'https://acme.example/a', retrievedAt: now });

  it('refuses to mark a statement SOURCED with no citation', () => {
    const c = classify({ statement: 'Acme lost 40% of its customers.', kind: 'SOURCED', citations: [] });
    assert.equal(c.renderable, false);
    assert.equal(c.basis, 'unsupported');
    assert.match(c.reason, /no citation/);
  });

  it('refuses a statement its own citations do not contain', () => {
    const c = classify({
      statement: 'Acme acquired a logistics company in Germany last year.',
      kind: 'SOURCED',
      citations: [cite('Gross margin declined across the retail division during the period.')],
    });
    assert.equal(c.renderable, false, 'fluent and unrelated is the failure this exists to stop');
    assert.equal(c.basis, 'unsupported');
  });

  it('accepts a statement its citations do support', () => {
    const c = classify({
      statement: 'Gross margin declined across the retail division.',
      kind: 'SOURCED',
      citations: [cite('Gross margin declined across the retail division during the period under review.')],
    });
    assert.equal(c.renderable, true);
    assert.equal(c.basis, 'sourced');
    assert.ok(c.support >= 0.35);
  });

  it('requires a derivation to name its inference', () => {
    const without = classify({
      statement: 'Margin pressure is structural.',
      kind: 'DERIVED',
      citations: [cite('Gross margin declined in each of the last four periods.')],
    });
    assert.equal(without.renderable, false, 'an unexplained leap is not a derivation');

    const with_ = classify({
      statement: 'Margin pressure is structural.',
      kind: 'DERIVED',
      citations: [cite('Gross margin declined in each of the last four periods.')],
      inference: 'four consecutive declines is a trend rather than an event',
    });
    assert.equal(with_.renderable, true);
    assert.equal(with_.basis, 'derived');
  });

  it('keeps UNKNOWN as a usable result', () => {
    const c = classify({ statement: 'No source describes their pricing.', kind: 'UNKNOWN', citations: [] });
    assert.equal(c.renderable, true);
    assert.equal(c.basis, 'unsupported');
  });

  it('never stores a recommendation as though a source said it', () => {
    const c = classify({ statement: 'They should consolidate their tooling.', kind: 'RECOMMENDATION', citations: [] });
    assert.equal(c.kind, 'RECOMMENDATION');
    assert.notEqual(c.basis, 'sourced');
  });

  it('partitions a mixed set and keeps the refusals visible', () => {
    const { shown, withheld } = partition([
      { statement: 'Gross margin declined across retail.', kind: 'SOURCED', citations: [cite('Gross margin declined across retail divisions.')] },
      { statement: 'Revenue tripled after a Berlin acquisition.', kind: 'SOURCED', citations: [cite('Gross margin declined across retail divisions.')] },
    ]);
    assert.equal(shown.length, 1);
    assert.equal(withheld.length, 1, 'withheld claims are output, not silence');
  });

  it('scores support by content words, ignoring filler', () => {
    assert.ok(supportRatio('the margin declined', [cite('margin declined')]) > 0.9);
    assert.equal(supportRatio('', [cite('anything')]), 0);
  });
});
