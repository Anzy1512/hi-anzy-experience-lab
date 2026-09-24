import type { Config } from 'drizzle-kit';

/*
 * drizzle-kit is used for ONE thing: generating the core DDL from schema.ts so
 * the table definitions are not hand-maintained in two places. Everything it
 * cannot express — the extension, the HNSW index, the full-text trigger — is a
 * hand-written migration either side of what it produces. Applying migrations
 * is `src/db/migrate.ts`, not drizzle-kit, so the same runner works whether the
 * corpus is on PGlite or a server.
 */
export default {
  schema: ['./src/db/schema.ts', './src/db/entities.ts', './src/db/intel.ts'],
  out: './migrations',
  dialect: 'postgresql',
  migrations: { prefix: 'index' },
} satisfies Config;
