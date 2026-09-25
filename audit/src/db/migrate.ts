import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDriver, closeDriver, vectorReady, type Driver } from './client.ts';

/**
 * NUMBERED SQL FILES, APPLIED ONCE, IN ORDER, RECORDED BY HASH.
 *
 * Hand-rolled rather than delegated, for one reason: half of what this schema
 * needs cannot be expressed in a TypeScript schema builder. An HNSW index
 * wants its own operator class and build parameters, the full-text column
 * wants a trigger, and `CREATE EXTENSION` has to happen before any of it. A
 * generator that silently omits those produces a database that works and is
 * slow in a way nobody attributes to the migration.
 *
 * The hash is checked on every run. Editing a migration that has already been
 * applied is the quiet way two environments stop being the same database, so
 * it is refused out loud instead.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, '../../migrations');

interface Applied {
  name: string;
  hash: string;
}

/**
 * Extensions are a PRECONDITION, not a migration.
 *
 * They have to exist before the generated DDL can create a `vector(384)`
 * column, and the generator owns the lowest file numbers, so there is nowhere
 * to put a migration that runs first. Both statements are idempotent and
 * cheap, so running them on every startup costs nothing and removes an
 * ordering problem that would otherwise be solved by filename tricks.
 */
async function ensureExtensions(d: Driver): Promise<void> {
  await d.exec(`
    create extension if not exists vector;
    create extension if not exists pg_trgm;
  `);
}

async function ensureLedger(d: Driver): Promise<void> {
  await d.exec(`
    create table if not exists _migration (
      name       text primary key,
      hash       text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  const d = await getDriver();
  await ensureExtensions(d);
  await ensureLedger(d);

  const already = new Map(
    (await d.query<Applied>('select name, hash from _migration')).map((r) => [r.name, r.hash]),
  );

  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const name of files) {
    const body = readFileSync(join(DIR, name), 'utf8');
    const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
    const seen = already.get(name);

    if (seen !== undefined) {
      if (seen !== hash) {
        throw new Error(
          `Migration ${name} has changed since it was applied (was ${seen}, now ${hash}). ` +
            'Applied migrations are immutable — add a new one rather than editing this.',
        );
      }
      skipped.push(name);
      continue;
    }

    /* PGlite and node-postgres both run a multi-statement string in one
       implicit transaction, so a file either lands whole or not at all. */
    await d.exec(body);
    await d.query('insert into _migration (name, hash) values ($1, $2)', [name, hash]);
    applied.push(name);
  }

  return { applied, skipped };
}

/* Run directly: `npm run migrate` */
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.ts')) {
  const d = await getDriver();
  console.log(`driver             ${d.kind}`);
  const { applied, skipped } = await migrate();
  for (const n of skipped) console.log(`already applied    ${n}`);
  for (const n of applied) console.log(`APPLIED            ${n}`);
  if (applied.length === 0) console.log('nothing to do      schema is current');

  const v = await vectorReady(d);
  console.log(`pgvector           ${v.ok ? 'OK' : 'MISSING'} — ${v.detail}`);
  await closeDriver();
  if (!v.ok) process.exit(1);
}
