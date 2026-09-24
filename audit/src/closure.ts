import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * THE LAYER 3 CLOSURE GATE, RUN AGAINST THE REAL PUBLIC WEB.
 *
 *   two or more real public sources
 *     -> crawl / extract
 *     -> observations
 *     -> identity resolution
 *     -> entity
 *     -> relationships
 *     -> query
 *     -> a plain commercial result
 *     -> an evidence trace back to the original sources
 *
 * Plus a case the engine refuses to merge.
 *
 * ── WHY THESE SOURCES ───────────────────────────────────────────────────────
 *
 * The obvious subject was hianzy.com, and its robots.txt is `Disallow: /`. The
 * crawler therefore refuses it, which is the correct outcome and is shown
 * below rather than worked around. The sources used instead are organisations
 * whose robots.txt permits crawling, fetched a handful of pages at the
 * default one-request-per-two-seconds.
 *
 *   npx tsx src/closure.ts
 *   DATABASE_URL=postgres://... npx tsx src/closure.ts
 */

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-closure-'));
}
process.env.EMBEDDING_PROVIDER ??= 'deterministic';

const { getDriver, closeDriver } = await import('./db/client.ts');
const { migrate } = await import('./db/migrate.ts');
const { ingestOne } = await import('./index/ingest.ts');
const { ingestEntitiesFromDocument } = await import('./entity/pipeline.ts');
const { seedCategories } = await import('./entity/categories.ts');
const { compareEntities, loadFacts } = await import('./entity/resolve.ts');
const Q = await import('./entity/query.ts');
const { DirectProvider } = await import('./search/providers.ts');
const { Crawler } = await import('./crawl/fetch.ts');

const rule = (s: string) => console.log(`\n${'─'.repeat(4)} ${s} ${'─'.repeat(Math.max(0, 68 - s.length))}`);

/* Two organisations, several pages each. Two sources for one business is what
   the gate asks for; a second business is what makes a refusal meaningful. */
const SOURCES = [
  'https://www.postgresql.org/about/',
  'https://www.postgresql.org/support/security/',
  'https://www.mozilla.org/en-US/about/',
  'https://foundation.mozilla.org/en/',
];

/** Shown, not skipped: a site that says no is a result. */
const REFUSED_BY_ROBOTS = 'https://hianzy.com/';

const d = await getDriver();
await migrate();
await seedCategories(d);

const crawler = new Crawler({ attempts: 2 });
const direct = new DirectProvider();

rule('1. CRAWL, WITH ROBOTS RESPECTED');

const refusal = await (async () => {
  const found = await direct.search(REFUSED_BY_ROBOTS);
  const first = found.results[0];
  if (!first) return null;
  return ingestOne(d, first, { crawler });
})();
console.log(`${REFUSED_BY_ROBOTS.padEnd(46)} ${refusal?.outcome ?? 'n/a'} — ${refusal?.detail ?? ''}`);

const ingested: Array<{ url: string; documentId: string | null; outcome: string; html: string | null }> = [];
for (const url of SOURCES) {
  const found = await direct.search(url);
  const first = found.results[0];
  if (!first) continue;
  const r = await ingestOne(d, first, { crawler });
  console.log(
    `${url.padEnd(46)} ${r.outcome} — ${r.chunks} chunks, ${r.extractedFields} extracted values`,
  );
  /* Re-fetched once for capability markup only. Identity never needs it. */
  let html: string | null = null;
  if (r.documentId !== null && r.outcome === 'ok') {
    const res = await fetch(url, { headers: { 'user-agent': 'hi-anzy-audit/0.1 (+https://hianzy.com)' } }).catch(() => null);
    html = res !== null && res.ok ? await res.text() : null;
  }
  ingested.push({ url, documentId: r.documentId, outcome: r.outcome, html });
}

rule('2. OBSERVATIONS AND IDENTITY');

const resolved: Array<{ url: string; entityId: string; decision: string | null; reason: string | null }> = [];
for (const item of ingested) {
  if (item.documentId === null) continue;
  const r = await ingestEntitiesFromDocument(d, item.documentId, {
    ...(item.html !== null ? { html: item.html } : {}),
  });
  if (r.entityId === null) continue;
  resolved.push({ url: item.url, entityId: r.entityId, decision: r.decision, reason: r.decisionReason });
  const e = await Q.getEntity(d, r.entityId);
  console.log(
    `${item.url.slice(8, 52).padEnd(46)} ${String(r.decision).padEnd(15)} ${r.observations} obs, ${r.claims} claims, ${r.relationships} edges  -> ${e?.canonicalName ?? '?'}`,
  );
  if (r.decisionReason !== null && r.decision !== 'NEW') console.log(`${' '.repeat(46)} because: ${r.decisionReason}`);
}

rule('3. THE ENTITIES THAT EXIST');

const orgs = await Q.findEntities(d, { type: 'ORGANIZATION' });
for (const o of orgs) {
  const rels = await Q.getRelationships(d, o.id);
  const cov = await Q.getCoverage(d, o.id);
  console.log(
    `${o.canonicalName.slice(0, 40).padEnd(42)} ${String(rels.length).padStart(2)} edges  ` +
      `sources ${cov.sourcesChecked}  coverage ${cov.verdict}`,
  );
}

rule('4. A COMMERCIAL QUESTION, ANSWERED BY SQL');

const prospects = await Q.findWithCapability(d, {
  has: ['website'],
  lacks: ['ecommerce'],
  type: 'ORGANIZATION',
});
console.log('Organisations with a website where no ecommerce was observed:');
if (prospects.length === 0) console.log('  (none)');
for (const p of prospects) {
  console.log(`  • ${p.canonicalName} — ecommerce: ${p.capabilities.ecommerce}`);
}
console.log('');
console.log('Note the wording. This is not "businesses without ecommerce": it is');
console.log('businesses where a crawl looked for a storefront and did not find one.');

rule('5. EVIDENCE TRACE — HOW DO YOU KNOW THAT');

const subject = orgs[0];
if (subject !== undefined) {
  const chain = await Q.getEntityEvidence(d, subject.id);
  console.log(`${subject.canonicalName}\n`);
  for (const c of chain.filter((x) => x.value !== 'UNKNOWN').slice(0, 6)) {
    console.log(`  ${c.field} = ${c.value.slice(0, 60)}`);
    console.log(`    status ${c.status} · ${c.temporal} · ${c.sourceCount} source(s)`);
    for (const e of c.evidence.slice(0, 2)) {
      console.log(`    ← ${e.method} from ${e.url}`);
      console.log(`      observed ${e.observedAt.toISOString()}${e.excerpt ? ` · "${e.excerpt.slice(0, 60)}"` : ''}`);
    }
  }
  const unknown = chain.filter((x) => x.value === 'UNKNOWN').map((x) => x.field);
  if (unknown.length > 0) console.log(`\n  still unknown: ${unknown.join(', ')}`);
}

rule('6. A PAIR THE ENGINE REFUSES TO MERGE');

/*
 * Mozilla Corporation and the Mozilla Foundation are genuinely two
 * organisations with confusable names — exactly the case where a similarity
 * score would merge them and a rule set should not.
 */
let shown = 0;
for (let i = 0; i < orgs.length && shown < 3; i++) {
  for (let j = i + 1; j < orgs.length && shown < 3; j++) {
    const a = orgs[i];
    const b = orgs[j];
    if (a === undefined || b === undefined) continue;
    const fa = await loadFacts(d, a.id);
    const fb = await loadFacts(d, b.id);
    if (fa === null || fb === null) continue;
    const result = compareEntities(fa, fb);
    if (result.decision === 'SAME_ENTITY') continue;
    console.log(`${a.canonicalName.slice(0, 30)}  vs  ${b.canonicalName.slice(0, 30)}`);
    console.log(`  decision : ${result.decision}`);
    console.log(`  rule     : ${result.rule} (${result.ruleVersion})`);
    console.log(`  because  : ${result.reason}`);
    console.log(`  names    : score ${result.features.name.score.toFixed(2)}, differing tokens [${result.features.name.distinguishingTokens.slice(0, 6).join(', ')}]`);
    if (result.features.blockers.length > 0) console.log(`  blockers : ${result.features.blockers.join(' | ')}`);
    console.log('');
    shown += 1;
  }
}

/*
 * AMBIGUOUS did not arise above, and the reason is structural rather than a
 * gap: every crawled page carries the domain it was served from, so any two
 * entities from different hosts always have a conflicting-domain blocker and
 * land on PROBABLE_DIFFERENT. AMBIGUOUS is the shape you get for a business
 * named on SOMEONE ELSE'S page with no site of its own — a stockist list, a
 * directory row, a marketplace seller — which is a common real case for this
 * product.
 *
 * Modelled here by comparing the same two real entities with their domain
 * identifiers withheld. The names, the types and every other fact are the ones
 * actually crawled; what is removed is the identifier those records would not
 * have had.
 */
{
  const a = orgs.find((o) => /^mozilla$/i.test(o.canonicalName.trim()));
  const b = orgs.find((o) => /foundation/i.test(o.canonicalName));
  if (a !== undefined && b !== undefined) {
    const fa = await loadFacts(d, a.id);
    const fb = await loadFacts(d, b.id);
    if (fa !== null && fb !== null) {
      const strip = (f: NonNullable<typeof fa>) => ({
        ...f,
        identifiers: f.identifiers.filter((i) => i.kind !== 'domain'),
      });
      const asMentions = compareEntities(strip(fa), strip(fb));
      console.log('\nThe same pair as a stockist list would record them, with no site of their own:');
      console.log(`  decision : ${asMentions.decision}`);
      console.log(`  rule     : ${asMentions.rule}`);
      console.log(`  because  : ${asMentions.reason}`);
      console.log('  — refused, and left for a person rather than guessed at.\n');
    }
  }
}

const unresolved = await Q.findPotentialDuplicates(d);
console.log(`pairs left for a human to settle: ${unresolved.length}`);
for (const p of unresolved.slice(0, 3)) {
  console.log(`  ${p.decision}: ${p.a.name.slice(0, 26)} / ${p.b.name.slice(0, 26)} — ${p.reason.slice(0, 90)}`);
}

rule('7. DATA QUALITY');

const conflicts = await Q.findConflicts(d);
const single = await Q.findSingleSourceEntities(d);
const judgements = await d.query<{ decision: string; n: string }>(
  'select decision, count(*)::text as n from resolution_judgement group by decision order by n desc',
);
console.log(`conflicting claims        ${conflicts.length}`);
console.log(`single-source entities    ${single.length}`);
console.log(`judgements recorded       ${judgements.map((j) => `${j.decision}=${j.n}`).join('  ') || 'none'}`);

await closeDriver();
console.log('');
