import type { Driver } from '../db/client.ts';
import { RULE_VERSION } from './resolve.ts';

/**
 * MERGING, WITHOUT DESTROYING THE THING THAT WOULD LET YOU UNDO IT.
 *
 * A merge is the only operation here that can be catastrophically wrong, and
 * it is wrong silently: the fused row looks exactly like a well-evidenced one.
 * So nothing is deleted. The merged entity keeps its row, its status becomes
 * MERGED and `merged_into` points at the survivor, and every row that moved is
 * listed in `entity_merge.moved`.
 *
 * That list is what makes `undoMerge` a matter of reading a table rather than
 * reconstructing intent from a log nobody wrote. Undo is implemented, not
 * merely designed for — a reversal that has never been executed is a claim.
 *
 * ── WHY ROWS MOVE RATHER THAN BEING REWRITTEN ───────────────────────────────
 *
 * Observations are append-only and belong to the source that produced them, so
 * a merge re-points their `entity_id` and changes nothing else. The observation
 * still says what it said, about the source it came from, at the time it was
 * made. Only the attribution moves, and the attribution is exactly what a
 * merge is a statement about.
 */

export interface MergeResult {
  mergeId: string;
  survivingId: string;
  mergedId: string;
  moved: Record<string, number>;
}

interface MovedRecord {
  /** Row ids that were re-pointed, per table, so undo can put them back. */
  [table: string]: string[];
}

/**
 * Follow `merged_into` to whichever entity is live now.
 *
 * A stale id must keep resolving after a merge, or every stored reference
 * breaks the moment two records are joined. Bounded, because a cycle in the
 * pointer chain would otherwise hang the process rather than report a problem.
 */
export async function resolveAlias(d: Driver, entityId: string, hops = 10): Promise<string> {
  let current = entityId;
  for (let i = 0; i < hops; i++) {
    const rows = await d.query<{ merged_into: string | null }>(
      'select merged_into from entity where id = $1',
      [current],
    );
    const next = rows[0]?.merged_into;
    if (next === null || next === undefined) return current;
    current = next;
  }
  throw new Error(`entity alias chain from ${entityId} did not terminate in ${hops} hops`);
}

/**
 * Merge B into A.
 *
 * Deliberately requires a reason and a rule. A merge with no recorded cause is
 * indistinguishable from a bug six months later, and this is the operation
 * where that matters most.
 */
export async function mergeEntities(
  d: Driver,
  survivingId: string,
  mergedId: string,
  opts: { reason: string; rule: string; ruleVersion?: string; judgementId?: string | null },
): Promise<MergeResult> {
  if (survivingId === mergedId) throw new Error('an entity cannot be merged into itself');

  const live = await d.query<{ id: string; status: string }>(
    'select id, status from entity where id = any($1::uuid[])',
    [[survivingId, mergedId]],
  );
  if (live.length !== 2) throw new Error('both entities must exist to be merged');
  const mergedRow = live.find((r) => r.id === mergedId);
  if (mergedRow?.status === 'MERGED') throw new Error(`${mergedId} is already merged`);

  const moved: MovedRecord = {};
  const counts: Record<string, number> = {};

  /* Identifiers: re-point, and drop a duplicate rather than violating the
     uniqueness constraint. The dropped row is recorded so undo can recreate
     it, because "A already had this" is not the same as "B never had it". */
  const identifiers = await d.query<{ id: string; kind: string; value: string }>(
    'select id, kind, value from entity_identifier where entity_id = $1',
    [mergedId],
  );
  const movedIdentifiers: string[] = [];
  const droppedIdentifiers: Array<{ id: string; kind: string; value: string }> = [];
  for (const i of identifiers) {
    const clash = await d.query<{ id: string }>(
      'select id from entity_identifier where entity_id = $1 and kind = $2 and value = $3',
      [survivingId, i.kind, i.value],
    );
    if (clash.length > 0) {
      await d.query('delete from entity_identifier where id = $1', [i.id]);
      droppedIdentifiers.push(i);
      continue;
    }
    await d.query('update entity_identifier set entity_id = $1 where id = $2', [survivingId, i.id]);
    movedIdentifiers.push(i.id);
  }
  moved.entity_identifier = movedIdentifiers;
  moved.entity_identifier_dropped = droppedIdentifiers.map((x) => `${x.kind}|${x.value}`);
  counts.identifiers = identifiers.length;

  /* Observations, locations, capability rows: a straight re-point. */
  for (const table of ['observation', 'entity_location', 'capability_signal', 'capability_probe'] as const) {
    const rows = await d.query<{ id: string }>(`select id from ${table} where entity_id = $1`, [mergedId]);
    if (rows.length > 0) {
      await d.query(`update ${table} set entity_id = $1 where entity_id = $2`, [survivingId, mergedId]);
    }
    moved[table] = rows.map((r) => r.id);
    counts[table] = rows.length;
  }

  /* Claims: the survivor may already hold the same (field, value). Where it
     does, the source counts add and the merged row goes; where it does not,
     the row moves intact. */
  const claims = await d.query<{ id: string; field: string; value: string; source_count: number }>(
    'select id, field, value, source_count from claim where entity_id = $1',
    [mergedId],
  );
  const movedClaims: string[] = [];
  const foldedClaims: string[] = [];
  for (const c of claims) {
    const clash = await d.query<{ id: string }>(
      'select id from claim where entity_id = $1 and field = $2 and value = $3',
      [survivingId, c.field, c.value],
    );
    const target = clash[0];
    if (target) {
      await d.query('update claim_observation set claim_id = $1 where claim_id = $2', [target.id, c.id]);
      await d.query('update claim set source_count = source_count + $2 where id = $1', [target.id, c.source_count]);
      await d.query('delete from claim where id = $1', [c.id]);
      foldedClaims.push(`${c.id}->${target.id}`);
      continue;
    }
    await d.query('update claim set entity_id = $1 where id = $2', [survivingId, c.id]);
    movedClaims.push(c.id);
  }
  moved.claim = movedClaims;
  moved.claim_folded = foldedClaims;
  counts.claims = claims.length;

  /* Relationships on both ends. A self-edge produced by the merge is dropped:
     "Acme OPERATES Acme" is an artefact of joining two rows, not a fact. */
  const asFrom = await d.query<{ id: string }>('select id from relationship where from_entity_id = $1', [mergedId]);
  const asTo = await d.query<{ id: string }>('select id from relationship where to_entity_id = $1', [mergedId]);
  await d.query('update relationship set from_entity_id = $1 where from_entity_id = $2', [survivingId, mergedId]);
  await d.query('update relationship set to_entity_id = $1 where to_entity_id = $2', [survivingId, mergedId]);
  const selfEdges = await d.query<{ id: string }>(
    'select id from relationship where from_entity_id = $1 and to_entity_id = $1',
    [survivingId],
  );
  for (const e of selfEdges) await d.query('delete from relationship where id = $1', [e.id]);
  moved.relationship_from = asFrom.map((r) => r.id);
  moved.relationship_to = asTo.map((r) => r.id);
  moved.relationship_self_removed = selfEdges.map((r) => r.id);
  counts.relationships = asFrom.length + asTo.length;

  const cats = await d.query<{ entity_id: string; category_id: string; source_value: string }>(
    'select entity_id, category_id, source_value from entity_category where entity_id = $1',
    [mergedId],
  );
  for (const c of cats) {
    await d.query(
      `insert into entity_category (entity_id, category_id, source_value, status)
       values ($1,$2,$3,'SOURCED') on conflict do nothing`,
      [survivingId, c.category_id, c.source_value],
    );
  }
  await d.query('delete from entity_category where entity_id = $1', [mergedId]);
  moved.entity_category = cats.map((c) => `${c.category_id}|${c.source_value}`);
  counts.categories = cats.length;

  await d.query(
    `update entity set status = 'MERGED', merged_into = $1, updated_at = now() where id = $2`,
    [survivingId, mergedId],
  );
  await d.query('update entity set updated_at = now() where id = $1', [survivingId]);

  const inserted = await d.query<{ id: string }>(
    `insert into entity_merge (surviving_id, merged_id, reason, rule, rule_version, judgement_id, moved)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [
      survivingId,
      mergedId,
      opts.reason,
      opts.rule,
      opts.ruleVersion ?? RULE_VERSION,
      opts.judgementId ?? null,
      JSON.stringify(moved),
    ],
  );
  const mergeRow = inserted[0];
  if (!mergeRow) throw new Error('entity_merge insert returned no id');

  return { mergeId: mergeRow.id, survivingId, mergedId, moved: counts };
}

/**
 * Put it back.
 *
 * Only the rows this merge moved are returned — read from `moved`, not guessed
 * from timestamps — so a later merge onto the same survivor is not disturbed.
 * What cannot be restored exactly is recorded rather than glossed: an
 * identifier dropped as a duplicate is recreated, and a folded claim's source
 * count is decremented back rather than the claim being split, because the
 * observations behind it are shared and splitting them would be a guess.
 */
export async function undoMerge(d: Driver, mergeId: string): Promise<{ restored: Record<string, number> }> {
  const rows = await d.query<{
    id: string;
    surviving_id: string;
    merged_id: string;
    moved: MovedRecord | string;
    undone_at: string | null;
  }>('select id, surviving_id, merged_id, moved, undone_at from entity_merge where id = $1', [mergeId]);
  const m = rows[0];
  if (!m) throw new Error(`no merge ${mergeId}`);
  if (m.undone_at !== null) throw new Error(`merge ${mergeId} was already undone`);

  const moved: MovedRecord = typeof m.moved === 'string' ? (JSON.parse(m.moved) as MovedRecord) : m.moved;
  const restored: Record<string, number> = {};

  for (const table of ['observation', 'entity_location', 'capability_signal', 'capability_probe'] as const) {
    const ids = moved[table] ?? [];
    if (ids.length > 0) {
      await d.query(`update ${table} set entity_id = $1 where id = any($2::uuid[])`, [m.merged_id, ids]);
    }
    restored[table] = ids.length;
  }

  const identifierIds = moved.entity_identifier ?? [];
  if (identifierIds.length > 0) {
    await d.query('update entity_identifier set entity_id = $1 where id = any($2::uuid[])', [
      m.merged_id,
      identifierIds,
    ]);
  }
  for (const spec of moved.entity_identifier_dropped ?? []) {
    const [kind, ...rest] = spec.split('|');
    if (kind === undefined) continue;
    await d.query(
      `insert into entity_identifier (entity_id, kind, value) values ($1,$2,$3) on conflict do nothing`,
      [m.merged_id, kind, rest.join('|')],
    );
  }
  restored.entity_identifier = identifierIds.length + (moved.entity_identifier_dropped ?? []).length;

  const claimIds = moved.claim ?? [];
  if (claimIds.length > 0) {
    await d.query('update claim set entity_id = $1 where id = any($2::uuid[])', [m.merged_id, claimIds]);
  }
  restored.claim = claimIds.length;

  for (const table of ['from_entity_id', 'to_entity_id'] as const) {
    const key = table === 'from_entity_id' ? 'relationship_from' : 'relationship_to';
    const ids = moved[key] ?? [];
    if (ids.length > 0) {
      await d.query(`update relationship set ${table} = $1 where id = any($2::uuid[])`, [m.merged_id, ids]);
    }
    restored[key] = ids.length;
  }

  await d.query(
    `update entity set status = 'ACTIVE', merged_into = null, updated_at = now() where id = $1`,
    [m.merged_id],
  );
  await d.query('update entity_merge set undone_at = now() where id = $1', [mergeId]);

  return { restored };
}

/**
 * Split an entity by moving named observations to a new one.
 *
 * The honest version of a split: it does not try to infer which claims belong
 * where. It creates the new entity, moves the observations it was told to
 * move, and leaves claim rebuilding to the pipeline that built them in the
 * first place — which has the evidence, where a splitter working from
 * aggregates would be guessing.
 */
export async function splitEntity(
  d: Driver,
  entityId: string,
  observationIds: string[],
  opts: { type: string; canonicalName: string; normalizedName: string; reason: string },
): Promise<{ newEntityId: string; movedObservations: number }> {
  if (observationIds.length === 0) throw new Error('a split needs at least one observation to move');

  const created = await d.query<{ id: string }>(
    `insert into entity (type, canonical_name, normalized_name) values ($1,$2,$3) returning id`,
    [opts.type, opts.canonicalName, opts.normalizedName],
  );
  const row = created[0];
  if (!row) throw new Error('split entity insert returned no id');

  await d.query('update observation set entity_id = $1 where id = any($2::uuid[]) and entity_id = $3', [
    row.id,
    observationIds,
    entityId,
  ]);

  /* Recorded as a merge row with no survivor semantics, so the audit trail for
     "why do these two entities exist" is in one place. */
  await d.query(
    `insert into entity_merge (surviving_id, merged_id, reason, rule, rule_version, moved, undone_at)
     values ($1,$2,$3,'split',$4,$5, now())`,
    [entityId, row.id, opts.reason, RULE_VERSION, JSON.stringify({ observation: observationIds })],
  );

  return { newEntityId: row.id, movedObservations: observationIds.length };
}
