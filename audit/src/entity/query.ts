import type { Driver } from '../db/client.ts';
import { capabilityState, type CapabilityState } from './capability.ts';
import {
  geoCell,
  haversineKm,
  neighbouringCells,
  normalizeCategory,
  normalizeDomain,
  normalizeName,
  normalizePhone,
} from './normalize.ts';

/**
 * THE COMMERCIAL QUESTIONS, AS DATABASE QUERIES.
 *
 * "Brands with a website and no observed ecommerce", "retailers within 5 km",
 * "businesses with Instagram and no website", "probable duplicates" — every
 * one of these is a SELECT. None of them calls a model, and that is the point
 * of the three layers underneath: an LLM asked these questions would be slower,
 * cost money per answer, be unable to cite anything, and be wrong in ways
 * nobody could reproduce.
 *
 * A model earns its place where semantic judgement genuinely helps. Counting
 * rows is not that.
 *
 * ── EVERY RESULT CAN BE WALKED BACK ─────────────────────────────────────────
 *
 *   RESULT → ENTITY → CLAIM → OBSERVATION → DOCUMENT → URL → the quoted span
 *
 * `getEntityEvidence` returns that whole chain. There is no edge in it labelled
 * "because the system decided so": each step names the row it came from.
 */

export interface EntitySummary {
  id: string;
  type: string;
  canonicalName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function getEntity(d: Driver, entityId: string): Promise<EntitySummary | null> {
  const rows = await d.query<{
    id: string; type: string; canonical_name: string; status: string;
    created_at: string; updated_at: string;
  }>('select id, type, canonical_name, status, created_at, updated_at from entity where id = $1', [entityId]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    type: r.type,
    canonicalName: r.canonical_name,
    status: r.status,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export interface FindEntitiesOptions {
  type?: string;
  nameLike?: string;
  limit?: number;
  includeMerged?: boolean;
}

export async function findEntities(d: Driver, opts: FindEntitiesOptions = {}): Promise<EntitySummary[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.includeMerged !== true) conditions.push(`status = 'ACTIVE'`);
  if (opts.type !== undefined) {
    params.push(opts.type);
    conditions.push(`type = $${params.length}`);
  }
  if (opts.nameLike !== undefined) {
    params.push(normalizeName(opts.nameLike).normalized);
    conditions.push(`normalized_name % $${params.length}`);
  }
  params.push(opts.limit ?? 50);
  const rows = await d.query<{
    id: string; type: string; canonical_name: string; status: string;
    created_at: string; updated_at: string;
  }>(
    `select id, type, canonical_name, status, created_at, updated_at from entity
      ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
      order by updated_at desc limit $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    canonicalName: r.canonical_name,
    status: r.status,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }));
}

export async function findByDomain(d: Driver, domain: string): Promise<EntitySummary[]> {
  const normalized = normalizeDomain(domain);
  if (normalized === null) return [];
  const rows = await d.query<{ entity_id: string }>(
    `select distinct entity_id from entity_identifier where kind = 'domain' and value = $1`,
    [normalized],
  );
  const out: EntitySummary[] = [];
  for (const r of rows) {
    const e = await getEntity(d, r.entity_id);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Matches on the national significant number as well as the full one.
 *
 * "+91 98xxxxxxxx" and "098xxxxxxxx" are the same number written by two
 * people; matching only the E.164 form would miss half of them, and assuming
 * a country to fill the gap would invent identity. The national key brings
 * them together and the resolution rules decide what that is worth.
 */
export async function findByPhone(d: Driver, phone: string, country?: string): Promise<EntitySummary[]> {
  const p = normalizePhone(phone, country);
  const keys = [p.e164, `nsn:${p.national}`].filter((k): k is string => k !== null);
  if (keys.length === 0) return [];
  const rows = await d.query<{ entity_id: string }>(
    `select distinct entity_id from entity_identifier where kind = 'phone' and value = any($1::text[])`,
    [keys],
  );
  const out: EntitySummary[] = [];
  for (const r of rows) {
    const e = await getEntity(d, r.entity_id);
    if (e) out.push(e);
  }
  return out;
}

export async function findByCategory(d: Driver, category: string, limit = 50): Promise<EntitySummary[]> {
  const alias = normalizeCategory(category);
  const rows = await d.query<{ entity_id: string }>(
    `select distinct ec.entity_id
       from entity_category ec
       join category c on c.id = ec.category_id
       left join category_alias ca on ca.category_id = c.id
      where c.slug = $1 or ca.alias = $1
      limit $2`,
    [alias.replace(/\s+/g, '-'), limit],
  );
  const out: EntitySummary[] = [];
  for (const r of rows) {
    const e = await getEntity(d, r.entity_id);
    if (e) out.push(e);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* CAPABILITY                                                                  */
/* -------------------------------------------------------------------------- */

export interface CapabilityAnswer {
  entityId: string;
  capability: string;
  state: CapabilityState;
  score: number;
  reason: string;
  signals: Array<{ signal: string; weight: number }>;
}

export async function getCapability(
  d: Driver,
  entityId: string,
  capability: string,
): Promise<CapabilityAnswer> {
  const signals = await d.query<{ signal: string; weight: number }>(
    'select signal, weight from capability_signal where entity_id = $1 and capability = $2',
    [entityId, capability],
  );
  const probes = await d.query<{ n: string }>(
    'select count(*)::text as n from capability_probe where entity_id = $1 and capability = $2',
    [entityId, capability],
  );
  const probed = Number(probes[0]?.n ?? 0) > 0;
  const state = capabilityState(
    signals.map((s) => ({ signal: s.signal, weight: Number(s.weight) })),
    probed,
  );
  return { entityId, capability, ...state, signals: signals.map((s) => ({ signal: s.signal, weight: Number(s.weight) })) };
}

/**
 * The commercial query this whole layer exists for.
 *
 * "Has a website, no ecommerce observed" — and the wording is exact. These are
 * businesses where a crawl looked for a cart and did not find one. That is a
 * prospect list, not a census, and calling it "businesses without ecommerce"
 * would be a claim the data cannot support.
 */
export async function findWithCapability(
  d: Driver,
  spec: { has?: string[]; lacks?: string[]; type?: string; limit?: number },
): Promise<Array<EntitySummary & { capabilities: Record<string, CapabilityState> }>> {
  const base = await findEntities(d, { ...(spec.type !== undefined ? { type: spec.type } : {}), limit: spec.limit ?? 200 });
  const out: Array<EntitySummary & { capabilities: Record<string, CapabilityState> }> = [];

  for (const e of base) {
    const capabilities: Record<string, CapabilityState> = {};
    let ok = true;
    for (const c of spec.has ?? []) {
      const a = await getCapability(d, e.id, c);
      capabilities[c] = a.state;
      if (a.state !== 'CONFIRMED' && a.state !== 'PROBABLE') ok = false;
    }
    for (const c of spec.lacks ?? []) {
      const a = await getCapability(d, e.id, c);
      capabilities[c] = a.state;
      /* NOT_OBSERVED qualifies; UNKNOWN does not. "We looked and found none"
         is a usable signal, "we never looked" is not. */
      if (a.state !== 'NOT_OBSERVED') ok = false;
    }
    if (ok) out.push({ ...e, capabilities });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* GEOGRAPHY                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Nearby, blocked by grid cell before any distance is computed.
 *
 * Without the cell filter this reads every located entity and computes a
 * great-circle distance for each — fine at a thousand rows, not at a million.
 * Neighbouring cells are included so a point near a boundary is not lost, and
 * the exact distance still decides.
 */
export async function findNearby(
  d: Driver,
  lat: number,
  lon: number,
  radiusKm: number,
  opts: { type?: string; limit?: number } = {},
): Promise<Array<EntitySummary & { distanceKm: number; address: string | null }>> {
  const cells = neighbouringCells(lat, lon, radiusKm);
  const rows = await d.query<{
    entity_id: string; latitude: number | null; longitude: number | null; address_raw: string | null;
  }>(
    `select el.entity_id, el.latitude, el.longitude, el.address_raw
       from entity_location el
       join entity e on e.id = el.entity_id
      where el.geo_cell = any($1::text[]) and e.status = 'ACTIVE'
        and el.latitude is not null and el.longitude is not null
        ${opts.type !== undefined ? 'and e.type = $3' : ''}
      limit $2`,
    opts.type !== undefined ? [cells, (opts.limit ?? 200) * 4, opts.type] : [cells, (opts.limit ?? 200) * 4],
  );

  const out: Array<EntitySummary & { distanceKm: number; address: string | null }> = [];
  for (const r of rows) {
    if (r.latitude === null || r.longitude === null) continue;
    const km = haversineKm(lat, lon, Number(r.latitude), Number(r.longitude));
    if (km > radiusKm) continue;
    const e = await getEntity(d, r.entity_id);
    if (e) out.push({ ...e, distanceKm: km, address: r.address_raw });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, opts.limit ?? 50);
}

/** Set the grid cell for a located entity. Called after coordinates arrive. */
export async function setLocationCell(d: Driver, locationId: string, lat: number, lon: number): Promise<void> {
  await d.query('update entity_location set latitude = $2, longitude = $3, geo_cell = $4 where id = $1', [
    locationId,
    lat,
    lon,
    geoCell(lat, lon),
  ]);
}

/* -------------------------------------------------------------------------- */
/* RELATIONSHIPS AND PROVENANCE                                                */
/* -------------------------------------------------------------------------- */

export interface RelationshipRow {
  id: string;
  type: string;
  direction: 'out' | 'in';
  otherId: string;
  otherName: string;
  otherType: string;
  sourceCount: number;
  evidenceCount: number;
}

export async function getRelationships(d: Driver, entityId: string): Promise<RelationshipRow[]> {
  const rows = await d.query<{
    id: string; type: string; direction: string; other_id: string;
    other_name: string; other_type: string; source_count: number; evidence_count: string;
  }>(
    `select r.id, r.type, 'out' as direction, e.id as other_id, e.canonical_name as other_name,
            e.type as other_type, r.source_count,
            (select count(*)::text from relationship_evidence re where re.relationship_id = r.id) as evidence_count
       from relationship r join entity e on e.id = r.to_entity_id
      where r.from_entity_id = $1
      union all
     select r.id, r.type, 'in' as direction, e.id, e.canonical_name, e.type, r.source_count,
            (select count(*)::text from relationship_evidence re where re.relationship_id = r.id)
       from relationship r join entity e on e.id = r.from_entity_id
      where r.to_entity_id = $1`,
    [entityId],
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    direction: r.direction === 'out' ? 'out' : 'in',
    otherId: r.other_id,
    otherName: r.other_name,
    otherType: r.other_type,
    sourceCount: r.source_count,
    evidenceCount: Number(r.evidence_count),
  }));
}

export interface EvidenceChain {
  /**
   * The claim row this chain belongs to.
   *
   * Added in layer 4: a finding that cites a claim has to be able to anchor to
   * it, and `finding_citation.claim_id` cannot be populated by a caller that
   * was never told the id. Without this the column exists and is always null,
   * which is worse than not having it.
   */
  claimId: string;
  field: string;
  value: string;
  status: string;
  temporal: string;
  sourceCount: number;
  evidence: Array<{
    observationId: string;
    method: string;
    rawValue: string;
    observedAt: Date;
    documentId: string;
    url: string;
    documentTitle: string | null;
    fetchedAt: Date | null;
    excerpt: string | null;
  }>;
}

/**
 * The whole chain, per claim. This is the answer to "how do you know that".
 *
 * Every hop names a row: the claim, the observations under it, the documents
 * those came from, the URL each was fetched from and when. Nothing in the
 * chain is produced by judgement, so there is nowhere for "the system decided"
 * to hide.
 */
export async function getEntityEvidence(d: Driver, entityId: string): Promise<EvidenceChain[]> {
  const claims = await d.query<{
    id: string; field: string; value: string; status: string; temporal: string; source_count: number;
  }>(
    `select id, field, value, status, temporal, source_count from claim
      where entity_id = $1 order by field, source_count desc`,
    [entityId],
  );

  const out: EvidenceChain[] = [];
  for (const c of claims) {
    const evidence = await d.query<{
      observation_id: string; extraction_method: string; raw_value: string; observed_at: string;
      document_id: string; url: string; title: string | null; fetched_at: string | null; evidence: string | null;
    }>(
      `select o.id as observation_id, o.extraction_method, o.raw_value, o.observed_at,
              doc.id as document_id, doc.url, doc.title, doc.fetched_at, o.evidence
         from claim_observation co
         join observation o on o.id = co.observation_id
         join document doc on doc.id = o.document_id
        where co.claim_id = $1
        order by o.observed_at desc`,
      [c.id],
    );
    out.push({
      claimId: c.id,
      field: c.field,
      value: c.value,
      status: c.status,
      temporal: c.temporal,
      sourceCount: c.source_count,
      evidence: evidence.map((e) => ({
        observationId: e.observation_id,
        method: e.extraction_method,
        rawValue: e.raw_value,
        observedAt: new Date(e.observed_at),
        documentId: e.document_id,
        url: e.url,
        documentTitle: e.title,
        fetchedAt: e.fetched_at === null ? null : new Date(e.fetched_at),
        excerpt: e.evidence,
      })),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* DATA QUALITY                                                                */
/* -------------------------------------------------------------------------- */

/** Pairs the rules could not settle. The human queue, and the training set. */
export async function findPotentialDuplicates(
  d: Driver,
  limit = 50,
): Promise<Array<{
  judgementId: string; decision: string; rule: string; reason: string;
  a: { id: string; name: string }; b: { id: string; name: string };
}>> {
  const rows = await d.query<{
    id: string; decision: string; rule: string; reason: string;
    a_id: string; a_name: string; b_id: string; b_name: string;
  }>(
    `select j.id, j.decision, j.rule, j.reason,
            a.id as a_id, a.canonical_name as a_name, b.id as b_id, b.canonical_name as b_name
       from resolution_judgement j
       join entity a on a.id = j.entity_a_id
       join entity b on b.id = j.entity_b_id
      where j.decision in ('PROBABLE_SAME','AMBIGUOUS')
        and a.status = 'ACTIVE' and b.status = 'ACTIVE'
      order by case j.decision when 'PROBABLE_SAME' then 0 else 1 end, j.decided_at desc
      limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    judgementId: r.id,
    decision: r.decision,
    rule: r.rule,
    reason: r.reason,
    a: { id: r.a_id, name: r.a_name },
    b: { id: r.b_id, name: r.b_name },
  }));
}

/** Entities where two sources disagree about a field that should have one value. */
export async function findConflicts(
  d: Driver,
  field?: string,
  limit = 50,
): Promise<Array<{ entityId: string; entityName: string; field: string; values: string[] }>> {
  const rows = await d.query<{ entity_id: string; canonical_name: string; field: string; values: string[] }>(
    `select c.entity_id, e.canonical_name, c.field, array_agg(c.value order by c.value) as values
       from claim c join entity e on e.id = c.entity_id
      where c.temporal = 'CONFLICTING' and e.status = 'ACTIVE'
        ${field !== undefined ? 'and c.field = $2' : ''}
      group by c.entity_id, e.canonical_name, c.field
      having count(*) > 1
      limit $1`,
    field !== undefined ? [limit, field] : [limit],
  );
  return rows.map((r) => ({
    entityId: r.entity_id,
    entityName: r.canonical_name,
    field: r.field,
    values: r.values,
  }));
}

/** Entities resting on one source. Not wrong — uncorroborated, which differs. */
export async function findSingleSourceEntities(d: Driver, limit = 50): Promise<Array<{ id: string; name: string; documents: number }>> {
  const rows = await d.query<{ id: string; canonical_name: string; documents: string }>(
    `select e.id, e.canonical_name, count(distinct o.document_id)::text as documents
       from entity e join observation o on o.entity_id = e.id
      where e.status = 'ACTIVE'
      group by e.id, e.canonical_name
      having count(distinct o.document_id) = 1
      limit $1`,
    [limit],
  );
  return rows.map((r) => ({ id: r.id, name: r.canonical_name, documents: Number(r.documents) }));
}

/**
 * Entities whose newest evidence is older than `days`.
 *
 * Old is not false. This returns what should be RE-CHECKED, and the wording
 * matters: a business that has not changed in two years has correct two-year-old
 * evidence, and treating age as error would discard most of what is true.
 */
export async function findStaleEntities(
  d: Driver,
  days: number,
  limit = 50,
): Promise<Array<{ id: string; name: string; lastObservedAt: Date }>> {
  const rows = await d.query<{ id: string; canonical_name: string; last_observed: string }>(
    `select e.id, e.canonical_name, max(o.observed_at)::text as last_observed
       from entity e join observation o on o.entity_id = e.id
      where e.status = 'ACTIVE'
      group by e.id, e.canonical_name
      having max(o.observed_at) < now() - ($1 || ' days')::interval
      order by max(o.observed_at) asc
      limit $2`,
    [String(days), limit],
  );
  return rows.map((r) => ({ id: r.id, name: r.canonical_name, lastObservedAt: new Date(r.last_observed) }));
}

/**
 * How much has been looked at, without pretending to know the denominator.
 *
 * There is no honest percentage here. "90% complete" requires knowing how many
 * sources exist for a business, and nobody does. What is knowable is how many
 * were tried, how many answered, and which fields are still unanswered — so
 * that is what this returns, and the verdict is a word rather than a number.
 */
export async function getCoverage(
  d: Driver,
  entityId: string,
): Promise<{
  sourcesChecked: number;
  sourcesSuccessful: number;
  unresolvedFields: string[];
  conflictingFields: string[];
  verdict: 'NONE' | 'PARTIAL' | 'CORROBORATED';
}> {
  const docs = await d.query<{ checked: string; ok: string }>(
    `select count(distinct o.document_id)::text as checked,
            count(distinct case when doc.outcome = 'ok' then doc.id end)::text as ok
       from observation o join document doc on doc.id = o.document_id
      where o.entity_id = $1`,
    [entityId],
  );
  const unresolved = await d.query<{ field: string }>(
    `select field from claim where entity_id = $1 and value = 'UNKNOWN' and status = 'UNKNOWN'`,
    [entityId],
  );
  const conflicting = await d.query<{ field: string }>(
    `select distinct field from claim where entity_id = $1 and temporal = 'CONFLICTING'`,
    [entityId],
  );

  const checked = Number(docs[0]?.checked ?? 0);
  const successful = Number(docs[0]?.ok ?? 0);
  return {
    sourcesChecked: checked,
    sourcesSuccessful: successful,
    unresolvedFields: unresolved.map((r) => r.field),
    conflictingFields: conflicting.map((r) => r.field),
    verdict: checked === 0 ? 'NONE' : successful >= 2 ? 'CORROBORATED' : 'PARTIAL',
  };
}
