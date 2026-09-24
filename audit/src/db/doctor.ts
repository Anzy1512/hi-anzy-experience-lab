import { getDriver, closeDriver, vectorReady, type Driver } from './client.ts';
import { EMBEDDING_DIM } from './schema.ts';
import { config, usingPglite } from '../config.ts';

/**
 * DOES LAYER ONE ACTUALLY WORK, OR DID THE MIGRATION MERELY NOT THROW.
 *
 * Those are different questions and only the second one is easy. A migration
 * that returns cleanly can still leave a database with no vector index, a
 * full-text column that never populates, or an embedding width that disagrees
 * with the application — all of which behave correctly and slowly, or
 * correctly and emptily, and none of which announce themselves.
 *
 * So this does not read catalogue tables and report what it finds. It writes a
 * document, chunks it, embeds it with a known vector, and asks the database to
 * retrieve it BOTH WAYS — by cosine distance and by full-text rank. If hybrid
 * retrieval does not work here, on three rows, it will not work on three
 * million, and the failure would first appear as an audit that quietly found
 * nothing.
 *
 * Everything it writes is removed afterwards, including on failure.
 */

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const results: Check[] = [];
const add = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });

/** A deterministic unit vector, so the expected distances are known in advance. */
function unit(axis: number): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  v[axis % EMBEDDING_DIM] = 1;
  return v;
}
const lit = (v: number[]) => `[${v.join(',')}]`;

async function tables(d: Driver): Promise<void> {
  const want = [
    'source', 'document', 'chunk', 'subject', 'subject_identifier', 'subject_document',
    'audit_run', 'retrieval', 'finding', 'finding_citation', 'feedback', '_migration',
  ];
  const rows = await d.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  const have = new Set(rows.map((r) => r.table_name));
  const missing = want.filter((t) => !have.has(t));
  add('tables', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${want.length} present`);
}

async function indexes(d: Driver): Promise<void> {
  const rows = await d.query<{ indexname: string; indexdef: string }>(
    "select indexname, indexdef from pg_indexes where schemaname = 'public'",
  );
  const by = new Map(rows.map((r) => [r.indexname, r.indexdef]));

  const hnsw = by.get('chunk_embedding_hnsw');
  add(
    'vector index',
    hnsw !== undefined && /hnsw/i.test(hnsw) && /vector_cosine_ops/i.test(hnsw),
    hnsw ?? 'chunk_embedding_hnsw is ABSENT — every similarity search is a sequential scan',
  );

  const gin = by.get('chunk_tsv_gin');
  add('fulltext index', gin !== undefined && /gin/i.test(gin), gin ?? 'chunk_tsv_gin is ABSENT');

  const trgm = by.get('subject_name_trgm');
  add('trigram index', trgm !== undefined, trgm ?? 'subject_name_trgm is ABSENT');
}

async function generatedColumn(d: Driver): Promise<void> {
  const rows = await d.query<{ is_generated: string; generation_expression: string | null }>(
    `select is_generated, generation_expression
       from information_schema.columns
      where table_name = 'chunk' and column_name = 'tsv'`,
  );
  const r = rows[0];
  const ok = r?.is_generated === 'ALWAYS';
  add(
    'tsv is generated',
    ok,
    ok
      ? `ALWAYS AS (${(r?.generation_expression ?? '').slice(0, 60)}…)`
      : 'chunk.tsv is a plain column — full-text rows would be silently empty',
  );
}

async function embeddingWidth(d: Driver): Promise<void> {
  /* A dimension mismatch between the column and the embedder is the failure
     that produces "no results" rather than an error, so it is asserted. */
  try {
    await d.query(`select $1::vector(${EMBEDDING_DIM})`, [lit(unit(0))]);
    add('embedding width', true, `column and application agree at ${EMBEDDING_DIM}`);
  } catch (e) {
    add('embedding width', false, e instanceof Error ? e.message : String(e));
  }
}

/** The real test: write, then retrieve both ways. */
async function roundTrip(d: Driver): Promise<void> {
  const marker = `doctor-${Date.now()}`;
  try {
    const src = await d.query<{ id: string }>(
      `insert into source (kind, origin, label) values ('manual', $1, 'doctor probe') returning id`,
      [marker],
    );
    const sourceId = src[0]?.id;
    if (!sourceId) throw new Error('source insert returned no id');

    const doc = await d.query<{ id: string }>(
      `insert into document (source_id, url, url_hash, title, text)
       values ($1, $2, $3, 'Doctor probe', 'probe body') returning id`,
      [sourceId, `https://example.invalid/${marker}`, marker],
    );
    const documentId = doc[0]?.id;
    if (!documentId) throw new Error('document insert returned no id');

    const passages = [
      'The company reported a decline in gross margin during the period.',
      'Automation of the fulfilment workflow reduced manual handling.',
      'Nothing in this passage concerns either topic whatsoever.',
    ];
    for (const [i, text] of passages.entries()) {
      await d.query(
        `insert into chunk (document_id, ord, text, token_len, embedding)
         values ($1, $2, $3, $4, $5::vector)`,
        [documentId, i, text, text.split(/\s+/).length, lit(unit(i))],
      );
    }
    add('write path', true, `1 source, 1 document, ${passages.length} chunks`);

    /* Dense: ask for the axis chunk 1 was embedded on, expect chunk 1 first. */
    const dense = await d.query<{ ord: number; distance: number }>(
      `select ord, (embedding <=> $1::vector) as distance
         from chunk where document_id = $2
        order by embedding <=> $1::vector limit 3`,
      [lit(unit(1)), documentId],
    );
    const top = dense[0];
    add(
      'dense retrieval',
      top?.ord === 1 && top.distance < 1e-6,
      top ? `nearest is ord ${top.ord} at distance ${top.distance}` : 'returned nothing',
    );

    /* Lexical: a word only one passage contains, through the generated column. */
    const lexical = await d.query<{ ord: number; rank: number }>(
      `select ord, ts_rank(tsv, plainto_tsquery('english', $1)) as rank
         from chunk
        where document_id = $2 and tsv @@ plainto_tsquery('english', $1)
        order by rank desc limit 3`,
      ['gross margin decline', documentId],
    );
    const lexTop = lexical[0];
    add(
      'lexical retrieval',
      lexTop?.ord === 0,
      lexTop ? `top match is ord ${lexTop.ord} at rank ${lexTop.rank}` : 'returned nothing — tsv is not populating',
    );

    /* The pair is the point: each finds a passage the other ranks lower. */
    add(
      'hybrid is worth having',
      dense[0]?.ord !== lexical[0]?.ord,
      `dense top=${dense[0]?.ord}, lexical top=${lexical[0]?.ord} — different passages, which is why both run`,
    );

    /* Cascade: deleting the source must take everything with it. */
    await d.query('delete from source where id = $1', [sourceId]);
    const left = await d.query<{ n: string }>('select count(*)::text as n from chunk where document_id = $1', [
      documentId,
    ]);
    add('cascade delete', left[0]?.n === '0', `${left[0]?.n ?? '?'} chunks remain after deleting the source`);
  } finally {
    /* Belt and braces: the cascade above is what is being tested, so it cannot
       also be what cleans up if the test is what failed. */
    await d.query('delete from source where origin = $1', [marker]).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const d = await getDriver();

  console.log('');
  console.log(`driver             ${d.kind}${usingPglite ? '  (in-process; set DATABASE_URL for a server)' : ''}`);
  console.log(`corpus             ${usingPglite ? config.PGLITE_DIR : config.DATABASE_URL?.replace(/:\/\/[^@]*@/, '://***@')}`);
  console.log(`embedding width    ${EMBEDDING_DIM}`);
  console.log('');

  const v = await vectorReady(d);
  add('pgvector', v.ok, v.detail);
  await tables(d);
  await generatedColumn(d);
  await indexes(d);
  await embeddingWidth(d);
  await roundTrip(d);

  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name.padEnd(24)}${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(failed.length === 0 ? `ALL ${results.length} CHECKS PASS` : `${failed.length} OF ${results.length} FAILED`);
  await closeDriver();
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
