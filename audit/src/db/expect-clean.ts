import { closeDriver, getDriver } from './client.ts';

/**
 * REFUSE TO RUN THE SERVER SUITE AGAINST A CORPUS THAT ALREADY HAS THINGS IN IT.
 *
 * The layer 3 suite asserts that the first sighting of a business resolves as
 * NEW. That is a real assertion about first-sighting behaviour and it is worth
 * keeping — but it only holds on an empty corpus, and against a served
 * Postgres the corpus survives between runs. Run twice and the second run
 * fails with an assertion that looks like a resolver bug and is not.
 *
 * The PGlite suites do not have this problem: each file gets its own temporary
 * database, which is the whole reason they are the default.
 *
 * So the precondition is checked, once, with the instruction attached — rather
 * than left to be rediscovered from a confusing diff. Resetting is deliberately
 * NOT done here: dropping a corpus is a destructive act that should stay an
 * explicit one, which is why `db:reset` asks twice.
 *
 *   npm run db:reset -- --yes --i-mean-it && npm run migrate && npm run test:pg
 */

const d = await getDriver();

const counts = await d.query<{ documents: string; entities: string; jobs: string }>(
  `select (select count(*) from document)::text as documents,
          (select count(*) from entity)::text as entities,
          (select count(*) from job)::text as jobs`,
);
const c = counts[0];
const n = Number(c?.documents ?? 0) + Number(c?.entities ?? 0) + Number(c?.jobs ?? 0);

await closeDriver();

if (n > 0) {
  console.error('');
  console.error(`This corpus is not empty: ${c?.documents ?? 0} documents, ${c?.entities ?? 0} entities, ${c?.jobs ?? 0} jobs.`);
  console.error('');
  console.error('The server suite asserts first-sighting behaviour, which only holds on an empty');
  console.error('corpus. Run it against a clean schema:');
  console.error('');
  console.error('  npm run db:reset -- --yes --i-mean-it && npm run migrate && npm run test:pg');
  console.error('');
  process.exit(1);
}

console.log(`corpus is empty on ${d.kind}; the server suite can run`);
