import { getDriver, closeDriver } from './client.ts';
import { usingPglite, config } from '../config.ts';

/**
 * Drop everything and start over.
 *
 * Guarded rather than convenient. This deletes a corpus that cost crawl time,
 * embedding time and possibly money to build, so it refuses to run against a
 * server unless told twice, and never runs against NODE_ENV=production.
 *
 *   npm run db:reset -- --yes
 */
const confirmed = process.argv.includes('--yes');

if (config.NODE_ENV === 'production') {
  console.error('refusing: NODE_ENV is production');
  process.exit(1);
}
if (!confirmed) {
  console.error('refusing: pass --yes. This drops every table in the public schema.');
  process.exit(1);
}
if (!usingPglite && !process.argv.includes('--i-mean-it')) {
  console.error(
    `refusing: DATABASE_URL points at a server, not PGlite.\n` +
      'Dropping a served corpus needs --yes --i-mean-it as well.',
  );
  process.exit(1);
}

const d = await getDriver();
await d.exec('drop schema public cascade; create schema public;');
console.log(`dropped and recreated the public schema on ${d.kind}. Run: npm run migrate`);
await closeDriver();
