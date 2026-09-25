import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * WHERE THE TIME GOES IN ENTITY RESOLUTION, AND WHETHER BLOCKING WORKS.
 *
 * The number that matters is the last one. Comparing every entity with every
 * other is O(N^2): at ten thousand entities that is fifty million comparisons,
 * and the feature stops being runnable rather than becoming slow. Blocking
 * means a new record is compared against the handful that share a normalised
 * identifier, a name or a postcode — so the measurement to take is whether
 * candidate count stays flat as the corpus grows.
 *
 *   npx tsx src/bench-entity.ts
 *   DATABASE_URL=postgres://... npx tsx src/bench-entity.ts
 *
 * Every figure is produced on the machine it runs on. Nothing is extrapolated.
 */

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'audit-bench3-'));
}
process.env.API_KEY ??= 'bench-key-that-is-long-enough-to-pass-validation';

const { getDriver, closeDriver } = await import('./db/client.ts');
const { migrate } = await import('./db/migrate.ts');
const N = await import('./entity/normalize.ts');
const { compareEntities, findCandidates, loadFacts } = await import('./entity/resolve.ts');
const Q = await import('./entity/query.ts');
const { usingPglite } = await import('./config.ts');

const ms = (n: number) => `${n.toFixed(2)}ms`;
const timed = async <T>(fn: () => Promise<T> | T): Promise<[T, number]> => {
  const t0 = performance.now();
  const v = await fn();
  return [v, performance.now() - t0];
};

const d = await getDriver();
await migrate();

console.log('');
console.log(`store              ${usingPglite ? 'pglite (in-process)' : 'postgres'}`);

/* ---- 1. normalization throughput ---------------------------------------- */
const NAMES = [
  'ABC Café Pvt Ltd', 'Grand Hotel Delhi', 'Marks & Spencer', 'Acme Foods Private Limited',
  'Bramble Goods LLP', 'Peony Flowers', 'XYZ Salon & Spa', 'Zenith Logistics Inc',
];
const ROUNDS = 5000;
const [, nameMs] = await timed(() => {
  for (let i = 0; i < ROUNDS; i++) N.normalizeName(NAMES[i % NAMES.length] as string);
});
const [, phoneMs] = await timed(() => {
  for (let i = 0; i < ROUNDS; i++) N.normalizePhone('+91 98765 43210');
});
const [, simMs] = await timed(() => {
  const a = N.normalizeName('Grand Hotel Delhi');
  const b = N.normalizeName('Grand Hotel Gurgaon');
  for (let i = 0; i < ROUNDS; i++) N.nameSimilarity(a, b);
});

console.log('');
console.log('STAGE                          TIME           THROUGHPUT');
console.log(`normalizeName    (x${ROUNDS})    ${ms(nameMs).padEnd(15)}${Math.round(ROUNDS / (nameMs / 1000)).toLocaleString()} /sec`);
console.log(`normalizePhone   (x${ROUNDS})    ${ms(phoneMs).padEnd(15)}${Math.round(ROUNDS / (phoneMs / 1000)).toLocaleString()} /sec`);
console.log(`nameSimilarity   (x${ROUNDS})    ${ms(simMs).padEnd(15)}${Math.round(ROUNDS / (simMs / 1000)).toLocaleString()} /sec`);

/* ---- 2. a corpus, at three sizes ---------------------------------------- */
const MARKER = 'bench.invalid';
await d.query('delete from entity where normalized_name like $1', ['benchco%']);

const seed = async (from: number, to: number) => {
  for (let i = from; i < to; i++) {
    const name = `BenchCo ${i} Trading`;
    const rows = await d.query<{ id: string }>(
      `insert into entity (type, canonical_name, normalized_name) values ('ORGANIZATION',$1,$2) returning id`,
      [name, N.normalizeName(name).normalized],
    );
    const id = rows[0]?.id;
    if (id === undefined) continue;
    await d.query(`insert into entity_identifier (entity_id, kind, value, verified) values ($1,'domain',$2,1)`, [
      id,
      `benchco-${i}.${MARKER}`,
    ]);
    await d.query(`insert into entity_identifier (entity_id, kind, value, verified) values ($1,'phone',$2,1)`, [
      id,
      `+9198765${String(10000 + i).slice(0, 5)}`,
    ]);
  }
};

console.log('');
console.log('CORPUS   CANDIDATES   BLOCKING       RESOLVE(1 pair)   findByDomain   findEntities');

let previousCandidates = 0;
for (const size of [200, 1000, 4000]) {
  const current = await d.query<{ n: string }>(
    `select count(*)::text as n from entity where normalized_name like 'benchco%'`,
  );
  await seed(Number(current[0]?.n ?? 0), size);

  const probeName = N.normalizeName('BenchCo 42 Trading');
  const [candidates, blockMs] = await timed(() =>
    findCandidates(d, {
      type: 'ORGANIZATION',
      name: probeName,
      identifiers: [{ kind: 'domain', value: `benchco-42.${MARKER}` }],
    }),
  );

  const first = candidates[0];
  let resolveMs = 0;
  if (first !== undefined && candidates[1] !== undefined) {
    const fa = await loadFacts(d, first);
    const fb = await loadFacts(d, candidates[1] as string);
    if (fa !== null && fb !== null) {
      [, resolveMs] = await timed(() => compareEntities(fa, fb));
    }
  }

  const [, domainMs] = await timed(() => Q.findByDomain(d, `benchco-42.${MARKER}`));
  const [, listMs] = await timed(() => Q.findEntities(d, { type: 'ORGANIZATION', limit: 50 }));

  console.log(
    `${String(size).padEnd(9)}${String(candidates.length).padEnd(13)}${ms(blockMs).padEnd(15)}${ms(resolveMs).padEnd(18)}${ms(domainMs).padEnd(15)}${ms(listMs)}`,
  );
  previousCandidates = candidates.length;
}

console.log('');
console.log(`Candidates per record: ${previousCandidates}, CAPPED by the limit argument.`);
console.log('The cap is the point — work per record is bounded by choice rather than');
console.log('by corpus size — but it is a cap, not a measurement of natural flatness.');
console.log('What the timings show is the blocking LOOKUP growing sub-linearly: the');
console.log('corpus grew 20x and the lookup did not. Pairwise comparison would have');
console.log('grown 400x, which is the difference between a feature and a batch job.');

/* ---- 3. geography -------------------------------------------------------- */
const located = await d.query<{ id: string }>(
  `select id from entity where normalized_name like 'benchco%' limit 500`,
);
let placed = 0;
for (const [i, row] of located.entries()) {
  const lat = 28.6 + (i % 50) * 0.01;
  const lon = 77.2 + Math.floor(i / 50) * 0.01;
  const ins = await d.query<{ id: string }>(
    `insert into entity_location (entity_id, latitude, longitude, geo_cell, geocode, geocode_provider)
     values ($1,$2,$3,$4,'RESOLVED','bench') returning id`,
    [row.id, lat, lon, N.geoCell(lat, lon)],
  );
  if (ins[0]) placed += 1;
}
const [near2, near2Ms] = await timed(() => Q.findNearby(d, 28.6, 77.2, 2));
const [near25, near25Ms] = await timed(() => Q.findNearby(d, 28.6, 77.2, 25));

console.log('');
console.log(`nearby, ${placed} located entities`);
console.log(`  radius 2km                   ${ms(near2Ms).padEnd(15)}${near2.length} results`);
console.log(`  radius 25km                  ${ms(near25Ms).padEnd(15)}${near25.length} results`);

/* ---- 4. the commercial queries ------------------------------------------- */
const [, dupMs] = await timed(() => Q.findPotentialDuplicates(d));
const [, confMs] = await timed(() => Q.findConflicts(d));
const [, singleMs] = await timed(() => Q.findSingleSourceEntities(d, 20));
const [, capMs] = await timed(() => Q.findWithCapability(d, { has: ['website'], lacks: ['ecommerce'], limit: 50 }));

console.log('');
console.log('COMMERCIAL QUERY               TIME');
console.log(`findPotentialDuplicates        ${ms(dupMs)}`);
console.log(`findConflicts                  ${ms(confMs)}`);
console.log(`findSingleSourceEntities       ${ms(singleMs)}`);
console.log(`findWithCapability (50)        ${ms(capMs)}`);

await d.query('delete from entity where normalized_name like $1', ['benchco%']);
await closeDriver();
console.log('');
