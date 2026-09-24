import { PGlite } from '@electric-sql/pglite';
import { vector as pgliteVector } from '@electric-sql/pglite/vector';
import { pg_trgm as pglitePgTrgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { config, usingPglite } from '../config.ts';
import { schema as corpusSchema } from './schema.ts';
import { entitySchema } from './entities.ts';
import { intelSchema } from './intel.ts';
import { jobSchema } from './jobs.ts';

/* One schema object for drizzle, assembled from the two files that declare it. */
const schema = { ...corpusSchema, ...entitySchema, ...intelSchema, ...jobSchema };

/**
 * ONE DATABASE, TWO PLACES IT CAN LIVE.
 *
 * ── WHY BOTH ───────────────────────────────────────────────────────────────
 *
 * The obvious build order is "install Postgres first". That order means layer
 * one cannot be run or verified until a daemon someone else controls is up —
 * and on this machine, at the moment this was written, Docker was installed
 * and not running. A foundation you cannot execute is a design document.
 *
 * PGlite is real Postgres compiled to WebAssembly, in this process, with
 * `vector` available. Not a mock and not SQLite wearing a hat: the same SQL,
 * the same types, the same extension, the same `<=>` operator. So the schema
 * below is written once, against Postgres, and the difference between running
 * it here and running it on a server is a connection string.
 *
 * It is single-connection and in-process, which is right for building a layer
 * and wrong for a crawler that never stops. Production sets `DATABASE_URL`.
 * The abstraction is deliberately four methods wide — anything richer would
 * start hiding the differences that eventually matter.
 */

export type DriverKind = 'pglite' | 'postgres';

export interface Driver {
  kind: DriverKind;
  /** A parameterised query. The only way user input reaches SQL in this service. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Multiple statements, no parameters. Migrations and extension setup only. */
  exec(text: string): Promise<void>;
  close(): Promise<void>;
  /**
   * Drizzle, for everything the application does.
   *
   * Typed as the node-postgres flavour and cast for PGlite. Both implement the
   * same `PgDatabase` query surface; what differs is the session underneath,
   * which nothing above this file touches.
   */
  db: NodePgDatabase<typeof schema>;
}

let singleton: Driver | undefined;

async function openPglite(): Promise<Driver> {
  const dir = resolve(config.PGLITE_DIR);
  mkdirSync(dir, { recursive: true });

  /*
   * PGlite ships extensions as separate modules that have to be handed in
   * here; `create extension` alone finds nothing, and the error it produces
   * points at a control file rather than at this line. Both of these are
   * required by the schema: `vector` for the embedding column and its
   * operators, `pg_trgm` for candidate matching on subject names.
   */
  const pglite = await PGlite.create({
    dataDir: dir,
    extensions: { vector: pgliteVector, pg_trgm: pglitePgTrgm },
  });

  const db = drizzlePglite(pglite, { schema }) as unknown as NodePgDatabase<typeof schema>;

  return {
    kind: 'pglite',
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      const r = await pglite.query<T>(text, params);
      return r.rows;
    },
    async exec(text: string) {
      await pglite.exec(text);
    },
    async close() {
      await pglite.close();
    },
    db,
  };
}

async function openPostgres(url: string): Promise<Driver> {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    /* A crawl worker that cannot get a connection should say so rather than
       queue forever behind one that is already stuck. */
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: 'hi-anzy-audit',
  });

  /* Fail here, at startup, rather than on the first request. */
  const probe = await pool.connect();
  probe.release();

  const db = drizzlePg(pool, { schema });

  return {
    kind: 'postgres',
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      const r = await pool.query(text, params);
      return r.rows as T[];
    },
    async exec(text: string) {
      await pool.query(text);
    },
    async close() {
      await pool.end();
    },
    db,
  };
}

export async function getDriver(): Promise<Driver> {
  if (singleton) return singleton;
  singleton = usingPglite ? await openPglite() : await openPostgres(config.DATABASE_URL!);
  return singleton;
}

export async function closeDriver(): Promise<void> {
  if (!singleton) return;
  await singleton.close();
  singleton = undefined;
}

/**
 * Is `vector` actually present and usable?
 *
 * Asked by running an operator rather than by reading `pg_extension`, because
 * the failure this catches is a Postgres image without pgvector compiled in,
 * where the extension row can exist and the operator still not resolve.
 */
export async function vectorReady(d: Driver): Promise<{ ok: boolean; detail: string }> {
  try {
    const rows = await d.query<{ distance: number }>(
      "select ('[1,0,0]'::vector <=> '[0,1,0]'::vector) as distance",
    );
    const distance = rows[0]?.distance;
    if (typeof distance !== 'number') return { ok: false, detail: 'operator returned no value' };
    return { ok: true, detail: `cosine distance operator live (got ${distance})` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
