import { build } from './server.ts';
import { config, usingPglite } from './config.ts';
import { getDriver, closeDriver } from './db/client.ts';
import { migrate } from './db/migrate.ts';

/**
 * START, MIGRATE, SERVE, AND STOP PROPERLY.
 *
 * Migrations run at boot rather than as a deploy step somebody remembers. The
 * ledger makes that safe — an applied migration is skipped by name and hash —
 * and it removes the state where the code is new and the schema is not, which
 * on a service that writes about real companies means writing them into
 * columns that no longer mean what the writer thinks.
 *
 * Shutdown closes the database rather than letting the process exit out from
 * under it. On PGlite that is not politeness: the corpus is files on disk in
 * this process, and killing it mid-write is how a WAL gets truncated.
 */

const app = await build();

try {
  const d = await getDriver();
  const { applied, skipped } = await migrate();
  app.log.info(
    { driver: d.kind, applied: applied.length, alreadyApplied: skipped.length },
    'schema ready',
  );
  if (applied.length) app.log.info({ migrations: applied }, 'migrations applied');
} catch (err) {
  app.log.fatal({ err }, 'could not prepare the database');
  process.exit(1);
}

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(
    {
      corpus: usingPglite ? `pglite ${config.PGLITE_DIR}` : 'postgres',
      search: config.SEARCH_PROVIDER,
      model: config.ANTHROPIC_API_KEY ? 'configured' : 'not configured',
    },
    'audit service listening',
  );
} catch (err) {
  app.log.fatal({ err }, 'could not listen');
  process.exit(1);
}

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    /* A second Ctrl-C while the first shutdown is in flight should not start a
       second one on top of it. */
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    void (async () => {
      try {
        await app.close();
        await closeDriver();
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, 'unclean shutdown');
        process.exit(1);
      }
    })();
  });
}
