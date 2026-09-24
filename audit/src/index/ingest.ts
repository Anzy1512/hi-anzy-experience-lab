import { createHash } from 'node:crypto';

import type { Driver } from '../db/client.ts';
import type { Discovery } from '../search/types.ts';
import { Crawler, type FetchOutcome } from '../crawl/fetch.ts';
import { urlFacts } from '../crawl/url.ts';
import { extractHtml } from '../extract/html.ts';
import { chunkBlocks, type Chunk } from '../chunk/structure.ts';
import { getEmbedder, toVectorLiteral } from '../embed/index.ts';

/**
 * DISCOVERY → DOCUMENT → CHUNKS → VECTORS, AND THE THREE WAYS A RECRAWL ENDS.
 *
 * ── THE VERSION POLICY, STATED RATHER THAN IMPLIED ──────────────────────────
 *
 *   NEW         no row for this url_hash. Insert at version 1, chunk, embed.
 *
 *   UNCHANGED   a 304, or a body whose sha256 matches what is stored.
 *               `last_seen_at` moves and NOTHING ELSE HAPPENS. No re-extract,
 *               no re-chunk, no re-embed, no new rows. This is the common case
 *               on any real re-crawl and it is the single largest saving in
 *               the whole pipeline.
 *
 *   CHANGED     the hash moved. The outgoing version is recorded in
 *               `document_revision`, the document's version increments, and
 *               its chunks are replaced wholesale — because a chunk's ordinal
 *               is only meaningful within one version of a document, and
 *               trying to diff them produces citations that point at text that
 *               is no longer there.
 *
 * `last_seen_at` and the revision's `observed_at` stay separate throughout, so
 * "when did we last confirm this" and "when did this last change" remain
 * different questions with different answers.
 *
 * ── AND ONE SAVING INSIDE THE EXPENSIVE CASE ────────────────────────────────
 *
 * Replacing every chunk does not mean re-embedding every chunk. A page that
 * changed one paragraph still has fifteen identical ones, and their sha256 is
 * unchanged, so their vectors are carried over from the previous version and
 * only genuinely new text is embedded. On a typical edit that is most of the
 * work avoided.
 */

export interface IngestOptions {
  crawler?: Crawler;
  /** Attach every document to this source kind. */
  sourceKind?: 'web' | 'search' | 'filing' | 'manual';
  signal?: AbortSignal;
}

export interface IngestResult {
  url: string;
  outcome: FetchOutcome;
  detail: string;
  documentId: string | null;
  version: number | null;
  chunks: number;
  /** How many chunks needed a new vector. The rest were carried over. */
  embedded: number;
  reusedEmbeddings: number;
  extractedFields: number;
  elapsedMs: number;
}

interface DocumentRow {
  id: string;
  version: number;
  content_hash: string | null;
  etag: string | null;
  last_modified: string | null;
}

async function upsertSource(d: Driver, origin: string, kind: string): Promise<string> {
  const existing = await d.query<{ id: string }>('select id from source where origin = $1', [origin]);
  const found = existing[0];
  if (found) {
    await d.query('update source set last_crawled_at = now() where id = $1', [found.id]);
    return found.id;
  }
  const inserted = await d.query<{ id: string }>(
    'insert into source (kind, origin, last_crawled_at) values ($1, $2, now()) returning id',
    [kind, origin],
  );
  const row = inserted[0];
  if (!row) throw new Error(`could not create source for ${origin}`);
  return row.id;
}

async function writeChunks(
  d: Driver,
  documentId: string,
  version: number,
  chunks: Chunk[],
  previousVectors: Map<string, string>,
): Promise<{ embedded: number; reused: number }> {
  const embedder = getEmbedder();

  const needed: Chunk[] = [];
  for (const c of chunks) if (!previousVectors.has(c.hash)) needed.push(c);

  const fresh = needed.length > 0 ? await embedder.embed(needed.map((c) => c.embedText)) : [];
  const byHash = new Map<string, string>();
  for (const [i, c] of needed.entries()) {
    const vector = fresh[i];
    if (vector) byHash.set(c.hash, toVectorLiteral(vector));
  }

  for (const c of chunks) {
    const literal = previousVectors.get(c.hash) ?? byHash.get(c.hash) ?? null;
    await d.query(
      `insert into chunk
         (document_id, ord, heading_path, kind, text, token_len, hash, char_start, char_end, document_version, embedding)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector)`,
      [
        documentId,
        c.ord,
        c.headingPath === '' ? null : c.headingPath,
        c.kind,
        c.text,
        c.tokenLen,
        c.hash,
        c.charStart,
        c.charEnd,
        version,
        literal,
      ],
    );
  }

  return { embedded: needed.length, reused: chunks.length - needed.length };
}

/** Crawl one discovered URL into the corpus, or record why it was not. */
export async function ingestOne(d: Driver, item: Discovery, opts: IngestOptions = {}): Promise<IngestResult> {
  const startedAt = performance.now();
  const crawler = opts.crawler ?? new Crawler();
  const facts = urlFacts(item.url);

  const base: IngestResult = {
    url: item.url,
    outcome: 'blocked_scheme',
    detail: 'not a fetchable URL',
    documentId: null,
    version: null,
    chunks: 0,
    embedded: 0,
    reusedEmbeddings: 0,
    extractedFields: 0,
    elapsedMs: 0,
  };
  const done = (r: Partial<IngestResult>): IngestResult => ({
    ...base,
    ...r,
    elapsedMs: Math.round(performance.now() - startedAt),
  });

  if (facts === null) return done({});

  /* The discovery row is written BEFORE the fetch, so a URL that is refused
     still leaves a record of having been proposed and why it went no further. */
  await d.query(
    `insert into discovery (provider, query, url, url_hash, canonical_url, title, snippet, rank, published_at, discovered_at, provider_metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (provider, query, url_hash) do update set rank = excluded.rank, discovered_at = excluded.discovered_at`,
    [
      item.provider,
      item.query,
      item.url,
      facts.hash,
      item.canonicalUrl,
      item.title,
      item.snippet,
      item.rank,
      item.publishedAt,
      item.discoveredAt,
      JSON.stringify(item.providerMetadata ?? {}),
    ],
  );

  const setDiscovery = async (outcome: FetchOutcome, documentId: string | null) => {
    await d.query(
      'update discovery set outcome = $1, document_id = $2 where provider = $3 and query = $4 and url_hash = $5',
      [outcome, documentId, item.provider, item.query, facts.hash],
    );
  };

  const existingRows = await d.query<DocumentRow>(
    'select id, version, content_hash, etag, last_modified from document where url_hash = $1',
    [facts.hash],
  );
  const existing = existingRows[0] ?? null;

  const fetched = await crawler.fetch({
    url: item.url,
    etag: existing?.etag ?? null,
    lastModified: existing?.last_modified ?? null,
    knownHash: existing?.content_hash ?? null,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  /* ---- refused, for any of the reasons the crawler is allowed to refuse -- */
  if (fetched.outcome !== 'ok' && fetched.outcome !== 'unchanged') {
    await setDiscovery(fetched.outcome, existing?.id ?? null);
    return done({ outcome: fetched.outcome, detail: fetched.detail, documentId: existing?.id ?? null });
  }

  /* ---- unchanged: the cheap path, and the common one -------------------- */
  if (fetched.outcome === 'unchanged' && existing !== null) {
    await d.query(
      `update document set last_seen_at = now(), etag = coalesce($2, etag), last_modified = coalesce($3, last_modified), outcome = 'unchanged'
       where id = $1`,
      [existing.id, fetched.etag, fetched.lastModified],
    );
    await setDiscovery('unchanged', existing.id);
    const counted = await d.query<{ n: string }>('select count(*)::text as n from chunk where document_id = $1', [
      existing.id,
    ]);
    return done({
      outcome: 'unchanged',
      detail: fetched.detail,
      documentId: existing.id,
      version: existing.version,
      chunks: Number(counted[0]?.n ?? 0),
    });
  }

  if (fetched.body === null || fetched.contentHash === null) {
    await setDiscovery('network_error', existing?.id ?? null);
    return done({ outcome: 'network_error', detail: 'no body returned' });
  }

  /* ---- extract, deterministically --------------------------------------- */
  const extraction = extractHtml(fetched.body, fetched.finalUrl);
  const chunks = chunkBlocks(extraction.blocks);
  const sourceId = await upsertSource(d, facts.domain, opts.sourceKind ?? 'web');

  let documentId: string;
  let version: number;
  const previousVectors = new Map<string, string>();

  if (existing === null) {
    const inserted = await d.query<{ id: string }>(
      `insert into document
         (source_id, url, url_hash, canonical_url, title, published_at, fetched_at, http_status, lang,
          content_hash, extractor, text, byte_len, content_type, etag, last_modified, version, outcome, meta)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,1,'ok',$17)
       returning id`,
      [
        sourceId,
        fetched.finalUrl,
        facts.hash,
        extraction.canonicalUrl,
        extraction.title,
        extraction.publishedAt,
        fetched.fetchedAt,
        fetched.status,
        extraction.lang,
        fetched.contentHash,
        extraction.extractor,
        extraction.text,
        fetched.byteLen,
        fetched.contentType,
        fetched.etag,
        fetched.lastModified,
        JSON.stringify({
          density: extraction.density,
          redirectChain: fetched.redirectChain,
          headings: extraction.headings.length,
          links: extraction.links.length,
          jsonld: extraction.jsonld.length,
        }),
      ],
    );
    const row = inserted[0];
    if (!row) throw new Error('document insert returned no id');
    documentId = row.id;
    version = 1;
  } else {
    documentId = existing.id;
    version = existing.version + 1;

    /* Carry over the vectors of passages whose text did not move. */
    const old = await d.query<{ hash: string | null; embedding: string | null }>(
      'select hash, embedding::text as embedding from chunk where document_id = $1',
      [documentId],
    );
    for (const row of old) {
      if (row.hash !== null && row.embedding !== null) previousVectors.set(row.hash, row.embedding);
    }

    await d.query(
      `insert into document_revision (document_id, version, content_hash, byte_len, changed_chars)
       values ($1,$2,$3,$4,$5)`,
      [documentId, existing.version, existing.content_hash, null, null],
    );
    await d.query(
      `update document set
         url = $2, canonical_url = $3, title = $4, published_at = $5, fetched_at = $6, http_status = $7,
         lang = $8, content_hash = $9, extractor = $10, text = $11, byte_len = $12, content_type = $13,
         etag = $14, last_modified = $15, version = $16, last_seen_at = now(), outcome = 'ok', meta = $17
       where id = $1`,
      [
        documentId,
        fetched.finalUrl,
        extraction.canonicalUrl,
        extraction.title,
        extraction.publishedAt,
        fetched.fetchedAt,
        fetched.status,
        extraction.lang,
        fetched.contentHash,
        extraction.extractor,
        extraction.text,
        fetched.byteLen,
        fetched.contentType,
        fetched.etag,
        fetched.lastModified,
        version,
        JSON.stringify({ density: extraction.density, redirectChain: fetched.redirectChain }),
      ],
    );
    await d.query('delete from chunk where document_id = $1', [documentId]);
    await d.query('delete from extracted_field where document_id = $1', [documentId]);
  }

  const { embedded, reused } = await writeChunks(d, documentId, version, chunks, previousVectors);

  /* ---- extracted values, each with the method that produced it ---------- */
  let fields = 0;
  for (const v of extraction.values) {
    const inserted = await d.query(
      `insert into extracted_field (document_id, field, value, method, char_start, char_end, evidence)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (document_id, field, value, method) do nothing`,
      [documentId, v.field, v.value.slice(0, 2000), v.method, v.charStart, v.charEnd, v.evidence?.slice(0, 500) ?? null],
    );
    void inserted;
    fields += 1;
  }

  await setDiscovery('ok', documentId);

  return done({
    outcome: 'ok',
    detail: existing === null ? 'new document' : `updated to version ${version}`,
    documentId,
    version,
    chunks: chunks.length,
    embedded,
    reusedEmbeddings: reused,
    extractedFields: fields,
  });
}

/** Ingest a whole discovery set. Order is preserved; failures do not stop it. */
export async function ingestAll(d: Driver, items: Discovery[], opts: IngestOptions = {}): Promise<IngestResult[]> {
  const crawler = opts.crawler ?? new Crawler();
  const out: IngestResult[] = [];
  for (const item of items) {
    out.push(await ingestOne(d, item, { ...opts, crawler }));
  }
  return out;
}

/** sha256 of a string, exported so tests can assert on the same identity. */
export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
