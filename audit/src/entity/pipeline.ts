import type { Driver } from '../db/client.ts';
import { extractHtml } from '../extract/html.ts';
import { detectCapabilities } from './capability.ts';
import {
  normalizeAddress,
  normalizeCategory,
  normalizeDomain,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  geoCell,
  normalizePostalCode,
  normalizeSocial,
} from './normalize.ts';
import { compareEntities, findCandidates, loadFacts, recordJudgement, RULE_VERSION } from './resolve.ts';
import { mergeEntities, resolveAlias } from './merge.ts';

/**
 * A CRAWLED DOCUMENT BECOMES OBSERVATIONS, AN ENTITY, CLAIMS AND EDGES.
 *
 * ── THE ORDER IS THE ARGUMENT ───────────────────────────────────────────────
 *
 *   1. observations   what this source said, recorded before anyone decides
 *                     who it is about. Append-only and never rewritten.
 *   2. identity       which entity these observations concern, decided by
 *                     rules that are allowed to answer "I cannot tell".
 *   3. claims         what we now hold, each pointing back at the
 *                     observations that support it.
 *   4. edges          relationships, each with evidence, never inferred from
 *                     a shape the page did not state.
 *
 * Doing identity FIRST is the tempting shortcut and it is how a corpus poisons
 * itself: attributing a page to the wrong company writes that company's claims
 * from another company's source, and nothing downstream can tell.
 *
 * ── AUTO-MERGE IS RESTRICTED TO ONE ANSWER ──────────────────────────────────
 *
 * Only `SAME_ENTITY` attaches to an existing entity. `PROBABLE_SAME` creates a
 * separate entity and records the judgement — because a duplicate is
 * recoverable and a false merge is not, and "probable" is precisely the band
 * where a human should decide. The judgements are queryable, which is what
 * makes that a workflow rather than a dead end.
 */

export const PIPELINE_VERSION = 'l3-pipeline-1';

/** Methods that mean the publisher DECLARED this, rather than it appearing. */
const DECLARED = new Set(['jsonld', 'link', 'microdata']);

/** Fields where two different values across sources is worth flagging. */
const ADJUDICABLE = new Set(['phone', 'email', 'address', 'orgName']);

/** The trailing token of an address line that looks like a postal code. */
const POSTAL_TAIL = /\b[A-Z0-9][A-Z0-9 -]{2,9}\b\s*$/i;

export interface EntityIngestResult {
  documentId: string;
  entityId: string | null;
  entityCreated: boolean;
  decision: string | null;
  decisionReason: string | null;
  observations: number;
  claims: number;
  conflicts: number;
  relationships: number;
  capabilitySignals: number;
  relatedEntities: number;
  elapsedMs: number;
}

interface Candidate {
  field: string;
  raw: string;
  normalized: string | null;
  method: string;
  charStart: number | null;
  charEnd: number | null;
  evidence: string | null;
}

/* -------------------------------------------------------------------------- */
/* OBSERVATIONS                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What a stored document says about who it is.
 *
 * ── A CORRECTION, AND THE REASON IT MATTERED ────────────────────────────────
 *
 * This first re-ran the HTML extractor over `document.text` and produced
 * nothing but the domain. `document.text` is extraction's OUTPUT — the prose,
 * boilerplate already stripped — not its input, so the title, the JSON-LD, the
 * links and every declared value had been removed by the very step that made
 * it. Every entity came out named after the host it was served from, and the
 * failure was silent: rows appeared, resolution ran, and the corpus was full
 * of businesses called `127.0.0.1`.
 *
 * So observations are read from what Layer 2 actually PERSISTED: the
 * `extracted_field` rows, which already carry the value and the method that
 * produced it, plus the document's own title, canonical URL and address. That
 * is the durable record, and it is available for every document in the corpus
 * rather than only for one being crawled right now.
 */
export interface StoredDocument {
  id: string;
  url: string;
  title: string | null;
  canonicalUrl: string | null;
  version: number;
}

export interface StoredField {
  field: string;
  value: string;
  method: string;
  charStart: number | null;
  charEnd: number | null;
  evidence: string | null;
}

export function observationsFrom(
  doc: StoredDocument,
  fields: StoredField[],
  country?: string,
): Candidate[] {
  const out: Candidate[] = [];
  const push = (c: Candidate) => out.push(c);

  const domain = normalizeDomain(doc.url);
  if (domain !== null) {
    push({
      field: 'domain',
      raw: doc.url,
      normalized: domain,
      /* `dom` rather than `link`: the page did not declare this, it was served
         from it. Strong, and a different kind of strong. */
      method: 'dom',
      charStart: null,
      charEnd: null,
      evidence: 'the URL this document was served from',
    });
  }
  if (doc.canonicalUrl !== null) {
    const canonical = normalizeDomain(doc.canonicalUrl);
    if (canonical !== null && canonical !== domain) {
      push({
        field: 'domain',
        raw: doc.canonicalUrl,
        normalized: canonical,
        method: 'link',
        charStart: null,
        charEnd: null,
        evidence: 'rel=canonical declares a different domain',
      });
    }
  }

  for (const v of fields) {
    const base = {
      raw: v.value,
      method: v.method,
      charStart: v.charStart,
      charEnd: v.charEnd,
      evidence: v.evidence,
    };
    switch (v.field) {
      case 'email':
        push({ ...base, field: 'email', normalized: normalizeEmail(v.value) });
        break;
      case 'phone': {
        const p = normalizePhone(v.value, country);
        /* The E.164 form when the country is stated, the national tail when it
           is not. Never a guessed country: see `normalizePhone`. */
        push({ ...base, field: 'phone', normalized: p.e164 ?? `nsn:${p.national}` });
        break;
      }
      case 'social': {
        const social = normalizeSocial(v.value);
        if (social !== null) push({ ...base, field: 'social', normalized: social.key });
        break;
      }
      case 'address':
        push({ ...base, field: 'address', normalized: normalizeAddress(v.value) });
        break;
      case 'orgName':
        push({ ...base, field: 'orgName', normalized: normalizeName(v.value).normalized });
        break;
      case 'url': {
        const u = normalizeDomain(v.value);
        if (u !== null) push({ ...base, field: 'domain', normalized: u });
        break;
      }
      case 'latitude':
      case 'longitude':
        /* Kept verbatim. A coordinate is already normalised by the standard
           that produced it, and rounding one here would move a business. */
        push({ ...base, field: v.field, normalized: v.value });
        break;
      case 'description':
      case 'headline':
      case 'product':
      case 'datePublished':
        push({ ...base, field: v.field, normalized: v.value.toLowerCase().slice(0, 500) });
        break;
      default:
        break;
    }
  }

  /* The title is the weakest name signal and still the only one on many
     pages. Marked `meta`, which is below `jsonld` in every comparison. */
  if (doc.title !== null && !out.some((c) => c.field === 'orgName')) {
    /*
     * "Name <separator> Section" — take the first segment.
     *
     * Colon included, because "PostgreSQL: About" is as common a shape as
     * "PostgreSQL | About" and produced an entity called exactly that. Two
     * earlier attempts at this were worse: one dropped the colon case, the
     * other consumed the leading name and produced entities called "About".
     *
     * Which side of a separator holds the name is genuinely ambiguous —
     * "Contact — ABC Cafe" puts it second — and no heuristic settles that. It
     * matters less than it looks: this runs only when no `orgName` was
     * DECLARED, and a declared name always wins. A title-derived name is
     * marked `meta`, the weakest method there is.
     */
    const cleaned = (doc.title.split(/\s*[|—–·]\s*|\s+-\s+|:\s+/)[0] ?? doc.title).trim();
    if (cleaned.length >= 2) {
      push({
        field: 'orgName',
        raw: cleaned,
        normalized: normalizeName(cleaned).normalized,
        method: 'meta',
        charStart: null,
        charEnd: null,
        evidence: `<title>${doc.title.slice(0, 100)}`,
      });
    }
  }

  return out;
}

async function writeObservations(
  d: Driver,
  documentId: string,
  documentVersion: number,
  candidates: Candidate[],
): Promise<Array<{ id: string; field: string; normalized: string | null; method: string; raw: string }>> {
  const written: Array<{ id: string; field: string; normalized: string | null; method: string; raw: string }> = [];
  for (const c of candidates) {
    const rows = await d.query<{ id: string }>(
      `insert into observation
         (document_id, field, raw_value, normalized_value, extraction_method, confidence, char_start, char_end, evidence, document_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (document_id, field, raw_value, extraction_method, document_version)
         do update set normalized_value = excluded.normalized_value
       returning id`,
      [
        documentId,
        c.field,
        c.raw.slice(0, 2000),
        c.normalized?.slice(0, 2000) ?? null,
        c.method,
        DECLARED.has(c.method) ? 0.9 : 0.5,
        c.charStart,
        c.charEnd,
        c.evidence?.slice(0, 500) ?? null,
        documentVersion,
      ],
    );
    const row = rows[0];
    if (row) written.push({ id: row.id, field: c.field, normalized: c.normalized, method: c.method, raw: c.raw });
  }
  return written;
}

/* -------------------------------------------------------------------------- */
/* ENTITIES                                                                    */
/* -------------------------------------------------------------------------- */

async function createEntity(d: Driver, type: string, name: string): Promise<string> {
  const n = normalizeName(name);
  const rows = await d.query<{ id: string }>(
    `insert into entity (type, canonical_name, normalized_name) values ($1,$2,$3) returning id`,
    [type, name.slice(0, 500), n.normalized.slice(0, 500)],
  );
  const row = rows[0];
  if (!row) throw new Error('entity insert returned no id');
  return row.id;
}

async function addIdentifier(
  d: Driver,
  entityId: string,
  kind: string,
  value: string,
  rawValue: string,
  verified: boolean,
): Promise<void> {
  await d.query(
    `insert into entity_identifier (entity_id, kind, value, raw_value, verified)
     values ($1,$2,$3,$4,$5)
     on conflict (entity_id, kind, value) do update set
       last_seen_at = now(),
       verified = greatest(entity_identifier.verified, excluded.verified),
       raw_value = coalesce(entity_identifier.raw_value, excluded.raw_value)`,
    [entityId, kind, value.slice(0, 500), rawValue.slice(0, 500), verified ? 1 : 0],
  );
}

/** Find or create an entity of `type` keyed on one strong identifier. */
async function upsertByIdentifier(
  d: Driver,
  type: string,
  kind: string,
  value: string,
  displayName: string,
): Promise<{ id: string; created: boolean }> {
  const rows = await d.query<{ entity_id: string }>(
    `select ei.entity_id from entity_identifier ei
       join entity e on e.id = ei.entity_id
      where ei.kind = $1 and ei.value = $2 and e.type = $3 and e.status = 'ACTIVE'
      limit 1`,
    [kind, value, type],
  );
  const found = rows[0];
  if (found) return { id: await resolveAlias(d, found.entity_id), created: false };
  const id = await createEntity(d, type, displayName);
  await addIdentifier(d, id, kind, value, value, true);
  return { id, created: true };
}

/* -------------------------------------------------------------------------- */
/* CLAIMS                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Observations become claims, and disagreement becomes a flag rather than a
 * winner.
 *
 * Two sources giving two phone numbers produce two claim rows, both marked
 * CONFLICTING. Neither is discarded and neither is promoted: a later timestamp
 * does not prove a value is current, because a stale page can be re-crawled
 * today and a correct page can be two years old. Adjudicating is a separate
 * act with its own evidence.
 */
async function writeClaims(
  d: Driver,
  entityId: string,
  observations: Array<{ id: string; field: string; normalized: string | null; method: string; raw: string }>,
): Promise<{ claims: number; conflicts: number }> {
  const byField = new Map<string, typeof observations>();
  for (const o of observations) {
    const list = byField.get(o.field) ?? [];
    list.push(o);
    byField.set(o.field, list);
  }

  let claims = 0;
  let conflicts = 0;

  for (const [field, list] of byField) {
    const distinct = new Set(list.map((o) => o.normalized ?? o.raw));
    const conflicting = ADJUDICABLE.has(field) && distinct.size > 1;

    for (const o of list) {
      const value = o.normalized ?? o.raw;
      const status = DECLARED.has(o.method) ? 'SOURCED' : 'SOURCED';
      const rows = await d.query<{ id: string }>(
        `insert into claim (entity_id, field, value, normalized_value, status, temporal, source_count)
         values ($1,$2,$3,$4,$5,$6,1)
         on conflict (entity_id, field, value) do update set
           last_seen_at = now(),
           temporal = excluded.temporal,
           source_count = claim.source_count + 1
         returning id`,
        [entityId, field, value.slice(0, 2000), o.normalized?.slice(0, 2000) ?? null, status, conflicting ? 'CONFLICTING' : 'UNKNOWN'],
      );
      const row = rows[0];
      if (!row) continue;
      claims += 1;
      if (conflicting) conflicts += 1;
      await d.query(
        `insert into claim_observation (claim_id, observation_id) values ($1,$2) on conflict do nothing`,
        [row.id, o.id],
      );
    }
  }

  /*
   * Conflicts are detected ACROSS sources, not within one document.
   *
   * The first version compared only the values in the document being
   * processed, so a phone number that changed between two crawls — which is
   * the whole point of the conflict model — produced one value per document
   * and never disagreed with itself. Re-reading the entity's stored claims is
   * the only place the disagreement exists.
   *
   * Both values stay. Neither is promoted: a later crawl does not prove a
   * value is current, because a stale page can be fetched today and a correct
   * one can be two years old.
   */
  for (const field of byField.keys()) {
    if (!ADJUDICABLE.has(field)) continue;
    const distinctStored = await d.query<{ n: string }>(
      `select count(distinct value)::text as n from claim
        where entity_id = $1 and field = $2 and value <> 'UNKNOWN'`,
      [entityId, field],
    );
    if (Number(distinctStored[0]?.n ?? 0) > 1) {
      const updated = await d.query<{ id: string }>(
        `update claim set temporal = 'CONFLICTING'
          where entity_id = $1 and field = $2 and value <> 'UNKNOWN'
          returning id`,
        [entityId, field],
      );
      conflicts += updated.length;
    }
  }

  /*
   * A field nobody observed gets an explicit UNKNOWN row rather than an absent
   * one. "We have no phone number for this business" is a fact worth being
   * able to query — it is literally one of the commercial questions this
   * system exists to answer — and an absent row cannot be selected.
   */
  for (const field of ['phone', 'email', 'address', 'domain']) {
    if (byField.has(field)) continue;
    await d.query(
      `insert into claim (entity_id, field, value, status, temporal)
       values ($1,$2,'UNKNOWN','UNKNOWN','UNKNOWN')
       on conflict (entity_id, field, value) do nothing`,
      [entityId, field],
    );
  }

  return { claims, conflicts };
}

/* -------------------------------------------------------------------------- */
/* RELATIONSHIPS                                                               */
/* -------------------------------------------------------------------------- */

async function relate(
  d: Driver,
  fromId: string,
  toId: string,
  type: string,
  observationId: string | null,
): Promise<void> {
  if (fromId === toId) return;
  const rows = await d.query<{ id: string }>(
    `insert into relationship (from_entity_id, to_entity_id, type, status)
     values ($1,$2,$3,'SOURCED')
     on conflict (from_entity_id, to_entity_id, type) do update set
       last_seen_at = now(), source_count = relationship.source_count + 1
     returning id`,
    [fromId, toId, type],
  );
  const row = rows[0];
  if (row && observationId !== null) {
    await d.query(
      `insert into relationship_evidence (relationship_id, observation_id) values ($1,$2) on conflict do nothing`,
      [row.id, observationId],
    );
  }
}

/* -------------------------------------------------------------------------- */
/* THE PIPELINE                                                                */
/* -------------------------------------------------------------------------- */

export interface EntityIngestOptions {
  /**
   * A country hint for phone normalisation. No default, ever. A service that
   * assumes one country produces confident wrong answers everywhere else.
   */
  country?: string;
  /** Auto-merge on SAME_ENTITY. Off makes every join a human decision. */
  autoMerge?: boolean;
  /**
   * The raw markup, when the caller still has it — which it does when this
   * runs during a crawl.
   *
   * Only capability detection needs it: cart routes, platform fingerprints and
   * marketplace links live in markup that `document.text` has already had
   * stripped. Identity does not need it and must not depend on it, because
   * resolution has to work over documents crawled last month as well as the
   * one in hand.
   *
   * Absent, capability is derived from the stored declared values alone and
   * only those capabilities are recorded as PROBED — so a page nobody checked
   * for a cart stays UNKNOWN rather than becoming NOT_OBSERVED.
   */
  html?: string;
}

export async function ingestEntitiesFromDocument(
  d: Driver,
  documentId: string,
  opts: EntityIngestOptions = {},
): Promise<EntityIngestResult> {
  const startedAt = performance.now();
  const docs = await d.query<{
    id: string; url: string; title: string | null; canonical_url: string | null; version: number;
  }>('select id, url, title, canonical_url, version from document where id = $1', [documentId]);
  const doc = docs[0];
  if (!doc) throw new Error(`no document ${documentId}`);

  const fields = await d.query<{
    field: string; value: string; method: string;
    char_start: number | null; char_end: number | null; evidence: string | null;
  }>(
    `select field, value, method, char_start, char_end, evidence
       from extracted_field where document_id = $1`,
    [doc.id],
  );

  const candidates = observationsFrom(
    {
      id: doc.id,
      url: doc.url,
      title: doc.title,
      canonicalUrl: doc.canonical_url,
      version: doc.version,
    },
    fields.map((f) => ({
      field: f.field,
      value: f.value,
      method: f.method,
      charStart: f.char_start,
      charEnd: f.char_end,
      evidence: f.evidence,
    })),
    opts.country,
  );
  const observations = await writeObservations(d, doc.id, doc.version, candidates);

  /* ---- identity: the domain is the anchor ----------------------------- */
  const domainObs = observations.find((o) => o.field === 'domain' && o.normalized !== null);
  const nameObs = observations.filter((o) => o.field === 'orgName');
  const bestName =
    nameObs.find((o) => DECLARED.has(o.method))?.raw ?? nameObs[0]?.raw ?? domainObs?.normalized ?? doc.url;

  const identifiers: Array<{ kind: string; value: string; raw: string; verified: boolean }> = [];
  for (const o of observations) {
    if (o.normalized === null) continue;
    if (o.field === 'domain') identifiers.push({ kind: 'domain', value: o.normalized, raw: o.raw, verified: true });
    if (o.field === 'email') identifiers.push({ kind: 'email', value: o.normalized, raw: o.raw, verified: DECLARED.has(o.method) });
    if (o.field === 'phone') identifiers.push({ kind: 'phone', value: o.normalized, raw: o.raw, verified: DECLARED.has(o.method) });
    if (o.field === 'social') identifiers.push({ kind: 'social', value: o.normalized, raw: o.raw, verified: DECLARED.has(o.method) });
  }

  const nameNorm = normalizeName(bestName);
  const candidateIds = await findCandidates(d, {
    type: 'ORGANIZATION',
    name: nameNorm,
    identifiers: identifiers.map((i) => ({ kind: i.kind, value: i.value })),
  });

  let entityId: string | null = null;
  let entityCreated = false;
  let decision: string | null = null;
  let decisionReason: string | null = null;

  /* Compare against every candidate; the best answer wins and every judgement
     is recorded, including the refusals. */
  if (candidateIds.length > 0) {
    const provisional = await createEntity(d, 'ORGANIZATION', bestName);
    for (const i of identifiers) await addIdentifier(d, provisional, i.kind, i.value, i.raw, i.verified);
    const mine = await loadFacts(d, provisional);

    let best: { id: string; result: ReturnType<typeof compareEntities> } | null = null;
    for (const candidateId of candidateIds) {
      if (candidateId === provisional) continue;
      const theirs = await loadFacts(d, candidateId);
      if (mine === null || theirs === null) continue;
      const result = compareEntities(mine, theirs);
      await recordJudgement(d, provisional, candidateId, result);
      const rank = ['DIFFERENT_ENTITY', 'PROBABLE_DIFFERENT', 'AMBIGUOUS', 'PROBABLE_SAME', 'SAME_ENTITY'];
      if (best === null || rank.indexOf(result.decision) > rank.indexOf(best.result.decision)) {
        best = { id: candidateId, result };
      }
    }

    decision = best?.result.decision ?? null;
    decisionReason = best?.result.reason ?? null;

    if (best !== null && best.result.decision === 'SAME_ENTITY' && opts.autoMerge !== false) {
      await mergeEntities(d, best.id, provisional, {
        reason: best.result.reason,
        rule: best.result.rule,
        ruleVersion: best.result.ruleVersion,
      });
      entityId = best.id;
    } else {
      /* PROBABLE_SAME and below keep their own entity. A duplicate is
         recoverable; a false merge is not, and the judgement is on record for
         a human to settle. */
      entityId = provisional;
      entityCreated = true;
    }
  } else {
    entityId = await createEntity(d, 'ORGANIZATION', bestName);
    entityCreated = true;
    for (const i of identifiers) await addIdentifier(d, entityId, i.kind, i.value, i.raw, i.verified);
    decision = 'NEW';
    decisionReason = 'nothing in the corpus blocked against this document';
  }

  entityId = await resolveAlias(d, entityId);
  await d.query('update observation set entity_id = $1 where document_id = $2 and entity_id is null', [
    entityId,
    doc.id,
  ]);

  const { claims, conflicts } = await writeClaims(d, entityId, observations);

  /* ---- related entities and their edges -------------------------------- */
  let relationships = 0;
  let relatedEntities = 0;

  if (domainObs?.normalized != null) {
    const site = await upsertByIdentifier(d, 'WEBSITE', 'domain', domainObs.normalized, domainObs.normalized);
    if (site.created) relatedEntities += 1;
    await relate(d, entityId, site.id, 'HAS_WEBSITE', domainObs.id);
    relationships += 1;
  }

  for (const o of observations.filter((x) => x.field === 'social' && x.normalized !== null)) {
    const key = o.normalized as string;
    const isMarketplace = /^(amazon|flipkart|etsy|ebay|myntra|nykaa|meesho|indiamart|alibaba|zomato|swiggy):/.test(key);
    const type = isMarketplace ? 'MARKETPLACE_PROFILE' : 'SOCIAL_PROFILE';
    const kind = isMarketplace ? 'marketplace' : 'social';
    const profile = await upsertByIdentifier(d, type, kind, key, key);
    if (profile.created) relatedEntities += 1;
    await relate(d, entityId, profile.id, isMarketplace ? 'LISTED_ON' : 'HAS_SOCIAL_PROFILE', o.id);
    relationships += 1;
  }

  /*
   * Contact points become entities only when DECLARED — a `tel:` href or
   * JSON-LD. A phone number matched by a regex in prose stays a claim. The
   * alternative creates a CONTACT_POINT for every number-shaped string on
   * every page, which is the "thousands of useless entities" failure applied
   * to contacts instead of products.
   */
  for (const o of observations.filter(
    (x) => (x.field === 'phone' || x.field === 'email') && x.normalized !== null && DECLARED.has(x.method),
  )) {
    const kind = o.field;
    const contact = await upsertByIdentifier(d, 'CONTACT_POINT', kind, o.normalized as string, o.raw);
    if (contact.created) relatedEntities += 1;
    await relate(d, entityId, contact.id, 'HAS_CONTACT', o.id);
    relationships += 1;
  }

  /* ---- location -------------------------------------------------------- */
  const addressObs = observations.find((o) => o.field === 'address');
  const latObs = observations.find((o) => o.field === 'latitude');
  const lonObs = observations.find((o) => o.field === 'longitude');
  /*
   * A coordinate the page PUBLISHED, and only that.
   *
   * `RESOLVED` here means the business stated where it is, with `declared` as
   * the provider — not that anything geocoded an address. Nothing in this
   * service turns a street address into a coordinate, so a business that
   * publishes only an address stays `NO_PROVIDER` and never appears on a map.
   * That is the correct outcome, and the map reports how many it is.
   */
  const lat = latObs === undefined ? NaN : Number(latObs.normalized ?? latObs.raw);
  const lon = lonObs === undefined ? NaN : Number(lonObs.normalized ?? lonObs.raw);
  const located = Number.isFinite(lat) && Number.isFinite(lon);

  if (addressObs !== undefined || located) {
    const postal =
      addressObs === undefined ? '' : (addressObs.raw.match(POSTAL_TAIL)?.[0] ?? '').trim();
    await d.query(
      `insert into entity_location
         (entity_id, address_raw, address_normalized, postal_code, latitude, longitude, geo_cell,
          geocode, geocode_provider, observation_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        entityId,
        addressObs?.raw.slice(0, 1000) ?? null,
        addressObs?.normalized ?? null,
        postal === '' ? null : normalizePostalCode(postal),
        located ? lat : null,
        located ? lon : null,
        located ? geoCell(lat, lon) : null,
        located ? 'RESOLVED' : 'NO_PROVIDER',
        located ? 'declared' : null,
        (addressObs ?? latObs)?.id ?? null,
      ],
    );
  }

  /* ---- capability ------------------------------------------------------ */
  /*
   * With markup in hand, the full detector runs. Without it, only the declared
   * values that were stored can say anything, and only those capabilities are
   * marked probed — so an unchecked page stays UNKNOWN instead of quietly
   * becoming NOT_OBSERVED, which would be a claim nobody made.
   */
  const { signals, probed } =
    opts.html !== undefined
      ? detectCapabilities(extractHtml(opts.html, doc.url), opts.html)
      : (() => {
          const fallback: Array<{ capability: string; signal: string; weight: number }> = [
            { capability: 'website', signal: 'crawled', weight: 1 },
          ];
          const seen = ['website'];
          for (const o of observations) {
            if (o.field === 'social' && o.normalized !== null) {
              const marketplace = /^(amazon|flipkart|etsy|ebay|myntra|nykaa|meesho|indiamart|alibaba|zomato|swiggy):/.test(o.normalized);
              fallback.push({
                capability: marketplace ? 'marketplace' : 'social',
                signal: o.method,
                weight: DECLARED.has(o.method) ? 1 : 0.7,
              });
              if (!seen.includes(marketplace ? 'marketplace' : 'social')) seen.push(marketplace ? 'marketplace' : 'social');
            }
            if ((o.field === 'phone' || o.field === 'email') && DECLARED.has(o.method)) {
              fallback.push({ capability: o.field, signal: o.method, weight: 1 });
              if (!seen.includes(o.field)) seen.push(o.field);
            }
          }
          return { signals: fallback, probed: seen };
        })();
  for (const s of signals) {
    await d.query(
      `insert into capability_signal (entity_id, capability, signal, weight, document_id)
       values ($1,$2,$3,$4,$5) on conflict do nothing`,
      [entityId, s.capability, s.signal, s.weight, doc.id],
    );
  }
  for (const capability of probed) {
    await d.query(
      `insert into capability_probe (entity_id, capability, document_id) values ($1,$2,$3) on conflict do nothing`,
      [entityId, capability, doc.id],
    );
  }

  /* ---- category -------------------------------------------------------- */
  for (const o of observations.filter((x) => x.field === 'description' || x.field === 'product')) {
    const alias = normalizeCategory(o.raw).slice(0, 120);
    const rows = await d.query<{ category_id: string }>(
      'select category_id from category_alias where alias = $1',
      [alias],
    );
    const hit = rows[0];
    if (hit) {
      await d.query(
        `insert into entity_category (entity_id, category_id, source_value, status, observation_id)
         values ($1,$2,$3,'SOURCED',$4) on conflict do nothing`,
        [entityId, hit.category_id, o.raw.slice(0, 500), o.id],
      );
    }
  }

  return {
    documentId: doc.id,
    entityId,
    entityCreated,
    decision,
    decisionReason,
    observations: observations.length,
    claims,
    conflicts,
    relationships,
    capabilitySignals: signals.length,
    relatedEntities,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

export { RULE_VERSION };
