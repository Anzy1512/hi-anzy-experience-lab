import { createServer } from 'node:http';

/**
 * MEASURE THE PIPELINE BEFORE BUYING ANYTHING FOR IT.
 *
 * The instruction for this layer was: do not introduce expensive embedding
 * infrastructure without measurement. This is the measurement. It runs the
 * whole deterministic path against a local fixture and reports where the time
 * actually goes, so the decision about a real model is made against numbers
 * rather than against the assumption that embedding must be the slow part.
 *
 *   npx tsx src/bench.ts
 *   DATABASE_URL=postgres://... npx tsx src/bench.ts
 *
 * Every figure below is produced on the machine it is run on. Nothing is
 * quoted from anywhere else and nothing is extrapolated.
 */

process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'true';
process.env.CRAWL_PER_HOST_RPS ??= '100';

const { getDriver, closeDriver } = await import('./db/client.ts');
const { migrate } = await import('./db/migrate.ts');
const { extractHtml } = await import('./extract/html.ts');
const { chunkBlocks } = await import('./chunk/structure.ts');
const { getEmbedder } = await import('./embed/index.ts');
const { ingestOne } = await import('./index/ingest.ts');
const { retrieve } = await import('./retrieve/hybrid.ts');
const { Crawler } = await import('./crawl/fetch.ts');
const { DirectProvider } = await import('./search/providers.ts');
const { usingPglite } = await import('./config.ts');

function ms(n: number): string {
  return `${n.toFixed(1)}ms`;
}

async function timed<T>(fn: () => Promise<T> | T): Promise<{ value: T; elapsed: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, elapsed: performance.now() - t0 };
}

/** A page of plausible size: headings, prose, a nav, a footer, some JSON-LD. */
function syntheticPage(paragraphs: number): string {
  const body: string[] = ['<article><h1>Annual Review</h1>'];
  for (let i = 0; i < paragraphs; i++) {
    if (i % 4 === 0) body.push(`<h2>Section ${Math.floor(i / 4) + 1}</h2>`);
    body.push(
      `<p>Gross margin in the ${i} division moved against a backdrop of changing fulfilment costs, ` +
        `and the operating model required repeated manual reconciliation across three separate systems. ` +
        `Reporting lagged by several weeks and no single owner was named for the discrepancy.</p>`,
    );
  }
  body.push('</article>');
  return [
    '<!doctype html><html lang="en"><head><title>Annual Review</title>',
    '<meta name="description" content="A review.">',
    '<script type="application/ld+json">{"@type":"Organization","name":"Acme Limited","email":"hello@acme.example"}</script>',
    '</head><body><nav>Home About Contact Careers</nav>',
    body.join(''),
    '<footer>© Acme Limited. All rights reserved.</footer></body></html>',
  ].join('');
}

const html = syntheticPage(40);
console.log('');
console.log(`fixture page       ${(html.length / 1024).toFixed(1)} kB of HTML, 40 paragraphs, 10 sections`);
console.log(`store              ${usingPglite ? 'pglite (in-process)' : 'postgres'}`);
console.log('');

/* ---- 1. extraction ------------------------------------------------------ */
const extractRuns = 20;
let extraction = extractHtml(html, 'https://acme.example/review');
const extractTimes: number[] = [];
for (let i = 0; i < extractRuns; i++) {
  const r = await timed(() => extractHtml(html, 'https://acme.example/review'));
  extraction = r.value;
  extractTimes.push(r.elapsed);
}
const extractAvg = extractTimes.reduce((a, b) => a + b, 0) / extractRuns;

/* ---- 2. chunking -------------------------------------------------------- */
const chunkRuns = 50;
let chunks = chunkBlocks(extraction.blocks);
const chunkTimes: number[] = [];
for (let i = 0; i < chunkRuns; i++) {
  const r = await timed(() => chunkBlocks(extraction.blocks));
  chunks = r.value;
  chunkTimes.push(r.elapsed);
}
const chunkAvg = chunkTimes.reduce((a, b) => a + b, 0) / chunkRuns;

/* ---- 3. embedding ------------------------------------------------------- */
const embedder = getEmbedder();
const texts = chunks.map((c) => c.embedText);
const warm = await embedder.embed(texts.slice(0, 2));
void warm;
const embed = await timed(() => embedder.embed(texts));
const totalChars = texts.reduce((a, t) => a + t.length, 0);

console.log('STAGE                        TIME           NOTE');
console.log(
  `extraction (x${extractRuns})            ${ms(extractAvg).padEnd(15)}${extraction.blocks.length} blocks, ${extraction.values.length} values, extractor=${extraction.extractor}`,
);
console.log(
  `chunking (x${chunkRuns})              ${ms(chunkAvg).padEnd(15)}${chunks.length} chunks, ${Math.round(
    chunks.reduce((a, c) => a + c.tokenLen, 0) / Math.max(1, chunks.length),
  )} tokens each on average`,
);
console.log(
  `embedding ${chunks.length} chunks         ${ms(embed.elapsed).padEnd(15)}${embedder.id}, semantic=${embedder.semantic}, ${(
    totalChars / 1000
  ).toFixed(1)}k chars`,
);
console.log(`  per chunk                  ${ms(embed.elapsed / Math.max(1, chunks.length))}`);

/* ---- 4. the whole path, through a real server and a real store ---------- */
const server = createServer((req, res) => {
  if ((req.url ?? '').startsWith('/robots.txt')) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('User-agent: *\nDisallow:\n');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const addr = server.address();
if (addr === null || typeof addr === 'string') throw new Error('no port');
const origin = `http://127.0.0.1:${addr.port}`;

const d = await getDriver();
await migrate();
const crawler = new Crawler({ attempts: 1 });
const direct = new DirectProvider();

const found = await direct.search(`${origin}/bench-page`);
const first = found.results[0];
if (first === undefined) throw new Error('no discovery');

const firstIngest = await timed(() => ingestOne(d, first, { crawler }));
const secondIngest = await timed(() => ingestOne(d, first, { crawler }));

console.log('');
console.log(
  `ingest, first time           ${ms(firstIngest.elapsed).padEnd(15)}${firstIngest.value.chunks} chunks, ${firstIngest.value.embedded} embedded, ${firstIngest.value.extractedFields} values`,
);
console.log(
  `ingest, unchanged recrawl    ${ms(secondIngest.elapsed).padEnd(15)}outcome=${secondIngest.value.outcome}, embedded=${secondIngest.value.embedded}`,
);
console.log(
  `  saving                     ${(100 - (secondIngest.elapsed / firstIngest.elapsed) * 100).toFixed(0)}% faster, and zero embedding work`,
);

/* ---- 5. retrieval ------------------------------------------------------- */
const queries = ['gross margin fulfilment cost', 'manual reconciliation across systems', 'who owns the discrepancy'];
console.log('');
for (const q of queries) {
  const r = await timed(() => retrieve(d, q, { limit: 8, tokenBudget: 2000 }));
  console.log(
    `retrieve "${q.slice(0, 32)}"`.padEnd(46) +
      `${ms(r.elapsed).padEnd(12)}dense=${r.value.denseCount} lexical=${r.value.lexicalCount} overlap=${r.value.overlap} returned=${r.value.returned.length} tokens=${r.value.tokensUsed}`,
  );
}

/* ---- tidy up ------------------------------------------------------------ */
await d.query("delete from discovery where url like $1", [`${origin}%`]);
await d.query("delete from source where origin = '127.0.0.1'");
await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
await closeDriver();
console.log('');
