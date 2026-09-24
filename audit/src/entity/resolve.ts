import type { Driver } from '../db/client.ts';
import {
  haversineKm,
  nameSimilarity,
  normalizeName,
  type NameSimilarity,
  type NormalizedName,
} from './normalize.ts';

/**
 * WHETHER TWO RECORDS ARE THE SAME BUSINESS.
 *
 * ── THE ASYMMETRY THAT DECIDES EVERY RULE BELOW ─────────────────────────────
 *
 * A duplicate is untidy and reversible: two rows for one cafe can be merged
 * later, and until then both are correct. A FALSE MERGE is neither. It
 * attributes one business's phone number, address, categories and reviews to
 * another, every query downstream inherits it, and there is no signal that
 * anything went wrong — the fused row looks exactly like a well-evidenced one.
 *
 * So every threshold here is set to fail toward AMBIGUOUS, the engine is
 * allowed to refuse, and the refusal is stored rather than resolved away.
 *
 * ── SIMILARITY IS EVIDENCE, NOT IDENTITY ────────────────────────────────────
 *
 * "Grand Hotel Delhi" and "Grand Hotel Gurgaon" are 0.88 similar on characters
 * and share two of three tokens. They are two different hotels. The token that
 * differs is the city, and a scalar similarity score cannot express that
 * distinction — which is why `nameSimilarity` returns the distinguishing
 * tokens and why the rules read them.
 *
 * ── AND TYPE IS NOT NEGOTIABLE ──────────────────────────────────────────────
 *
 * Only entities of the same type are ever compared. A BRAND and a
 * BUSINESS_LOCATION are never candidates to be the same thing however alike
 * their names: the relationship between them is OPERATES or BRAND_OF, and
 * merging them would destroy the distinction a chain depends on.
 */

export const RULE_VERSION = 'l3-resolve-1';

export type Decision =
  | 'SAME_ENTITY'
  | 'PROBABLE_SAME'
  | 'AMBIGUOUS'
  | 'PROBABLE_DIFFERENT'
  | 'DIFFERENT_ENTITY';

export interface EntityFacts {
  id: string;
  type: string;
  canonicalName: string;
  name: NormalizedName;
  identifiers: Array<{ kind: string; value: string; verified: boolean }>;
  locations: Array<{
    postalCode: string | null;
    city: string | null;
    locality: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    addressNormalized: string | null;
  }>;
}

export interface ResolutionFeatures {
  sharedIdentifiers: Array<{ kind: string; value: string; bothVerified: boolean }>;
  conflictingIdentifiers: Array<{ kind: string; a: string; b: string }>;
  name: NameSimilarity;
  sameNormalizedName: boolean;
  /** Set when both have a location and they agree or disagree demonstrably. */
  locationAgreement: 'same' | 'different' | 'unknown';
  locationDetail: string | null;
  distanceKm: number | null;
  /**
   * Reasons a merge must not happen regardless of how alike the names are.
   * Any entry here caps the decision below SAME_ENTITY.
   */
  blockers: string[];
}

export interface ResolutionResult {
  decision: Decision;
  rule: string;
  ruleVersion: string;
  /** Why, in a sentence a person can check. Never a bare number. */
  reason: string;
  features: ResolutionFeatures;
}

/**
 * Identifiers that are unique BY CONSTRUCTION, and one that is not.
 *
 * A company number, a marketplace storefront, a social account and a mailbox
 * each belong to one party by the way they are issued. A DOMAIN does not: a
 * group site, an agency, a directory and a shared host all put several
 * businesses behind one name, and treating a shared domain as identity merges
 * every one of them into a single row.
 *
 * Found by a test fixture that served two unrelated businesses from one host,
 * which is a fair model of exactly that situation.
 */
const UNIQUE_BY_CONSTRUCTION = new Set(['registration', 'marketplace', 'email', 'social']);
const SHARED_POSSIBLE = new Set(['domain']);
const DECISIVE = new Set([...UNIQUE_BY_CONSTRUCTION, ...SHARED_POSSIBLE]);

function compareLocations(a: EntityFacts, b: EntityFacts): {
  agreement: 'same' | 'different' | 'unknown';
  detail: string | null;
  distanceKm: number | null;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (a.locations.length === 0 || b.locations.length === 0) {
    return { agreement: 'unknown', detail: null, distanceKm: null, blockers };
  }

  let best: { agreement: 'same' | 'different'; detail: string; distanceKm: number | null } | null = null;

  for (const la of a.locations) {
    for (const lb of b.locations) {
      if (la.latitude !== null && la.longitude !== null && lb.latitude !== null && lb.longitude !== null) {
        const km = haversineKm(la.latitude, la.longitude, lb.latitude, lb.longitude);
        if (km <= 0.25) return { agreement: 'same', detail: `coordinates ${km.toFixed(2)}km apart`, distanceKm: km, blockers };
        if (best === null || (best.distanceKm ?? Infinity) > km) {
          best = { agreement: 'different', detail: `coordinates ${km.toFixed(1)}km apart`, distanceKm: km };
        }
        continue;
      }
      if (la.postalCode !== null && lb.postalCode !== null) {
        if (la.postalCode === lb.postalCode) {
          return { agreement: 'same', detail: `same postal code ${la.postalCode}`, distanceKm: null, blockers };
        }
        if (best === null) best = { agreement: 'different', detail: `postal codes ${la.postalCode} and ${lb.postalCode}`, distanceKm: null };
        continue;
      }
      if (la.city !== null && lb.city !== null) {
        if (la.city === lb.city) {
          return { agreement: 'same', detail: `same city ${la.city}`, distanceKm: null, blockers };
        }
        if (best === null) best = { agreement: 'different', detail: `cities ${la.city} and ${lb.city}`, distanceKm: null };
      }
    }
  }

  if (best === null) return { agreement: 'unknown', detail: null, distanceKm: null, blockers };
  /*
   * A demonstrable difference of place is a blocker, not a penalty. Two
   * businesses at two addresses are two businesses unless something stronger
   * than a similar name says otherwise, and the chain case — where they really
   * are related — is a RELATIONSHIP between separate location entities rather
   * than one fused row.
   */
  blockers.push(`locations differ: ${best.detail}`);
  return { agreement: best.agreement, detail: best.detail, distanceKm: best.distanceKm, blockers };
}

/** Compare two entities. Pure: no database, no side effects, no model. */
export function compareEntities(a: EntityFacts, b: EntityFacts): ResolutionResult {
  const name = nameSimilarity(a.name, b.name);
  const sameNormalizedName = a.name.normalized === b.name.normalized;

  const shared: ResolutionFeatures['sharedIdentifiers'] = [];
  const conflicting: ResolutionFeatures['conflictingIdentifiers'] = [];
  const blockers: string[] = [];

  const byKind = (facts: EntityFacts, kind: string) => facts.identifiers.filter((i) => i.kind === kind);

  for (const ia of a.identifiers) {
    for (const ib of b.identifiers) {
      if (ia.kind === ib.kind && ia.value === ib.value) {
        shared.push({ kind: ia.kind, value: ia.value, bothVerified: ia.verified && ib.verified });
      }
    }
  }

  /*
   * A conflict is only a conflict when both sides declared it as their own.
   * Plenty of pages mention another company's domain; two businesses each
   * DECLARING a different website is a different matter and is a reason not to
   * merge them.
   */
  for (const kind of ['domain', 'registration', 'marketplace'] as const) {
    const va = byKind(a, kind).filter((i) => i.verified).map((i) => i.value);
    const vb = byKind(b, kind).filter((i) => i.verified).map((i) => i.value);
    if (va.length > 0 && vb.length > 0 && !va.some((x) => vb.includes(x))) {
      conflicting.push({ kind, a: va.join(','), b: vb.join(',') });
      blockers.push(`both declare a different ${kind}: ${va[0]} vs ${vb[0]}`);
    }
  }

  const loc = compareLocations(a, b);
  blockers.push(...loc.blockers);

  const features: ResolutionFeatures = {
    sharedIdentifiers: shared,
    conflictingIdentifiers: conflicting,
    name,
    sameNormalizedName,
    locationAgreement: loc.agreement,
    locationDetail: loc.detail,
    distanceKm: loc.distanceKm,
    blockers,
  };

  const out = (decision: Decision, rule: string, reason: string): ResolutionResult => ({
    decision,
    rule,
    ruleVersion: RULE_VERSION,
    reason,
    features,
  });

  /* ---- type gate ------------------------------------------------------- */
  if (a.type !== b.type) {
    return out(
      'DIFFERENT_ENTITY',
      'type-mismatch',
      `${a.type} and ${b.type} are different kinds of thing; if they are related that is a relationship, not an identity`,
    );
  }

  /* ---- PASS 1: strong identifiers -------------------------------------- */
  const decisive = shared.filter((s) => DECISIVE.has(s.kind) && s.bothVerified);
  const unique = decisive.filter((s) => UNIQUE_BY_CONSTRUCTION.has(s.kind));
  const domainOnly = decisive.length > 0 && unique.length === 0;

  if (decisive.length > 0 && blockers.length === 0) {
    /*
     * A shared domain with unrelated names is a group site, not one business.
     * It needs the names to agree, or a second identifier, before it settles
     * identity — otherwise every brand behind one host collapses into one row.
     */
    if (domainOnly && name.score < 0.5 && shared.length === decisive.length) {
      return out(
        'PROBABLE_SAME',
        'pass1-shared-domain-only',
        `the same ${decisive[0]?.kind} (${decisive[0]?.value}) but the names do not agree (${name.score.toFixed(2)}); ` +
          'one domain can carry several businesses',
      );
    }
    return out(
      'SAME_ENTITY',
      'pass1-strong-identifier',
      `both declare the same ${decisive.map((x) => x.kind).join(' and ')} (${decisive[0]?.value})`,
    );
  }
  if (decisive.length > 0) {
    return out(
      'AMBIGUOUS',
      'pass1-strong-identifier-with-blocker',
      `a shared ${decisive[0]?.kind} points to one entity, but ${blockers[0]} points to two`,
    );
  }

  const sharedPhone = shared.filter((s) => s.kind === 'phone');
  if (sharedPhone.length > 0 && blockers.length === 0) {
    if (sharedPhone.some((s) => s.bothVerified) && name.score >= 0.5) {
      return out(
        'SAME_ENTITY',
        'pass1-verified-phone-and-name',
        `both declare the phone ${sharedPhone[0]?.value} and the names agree (${name.score.toFixed(2)})`,
      );
    }
    /*
     * A shared phone alone is not identity. A shared switchboard, a shared
     * agency, a serviced office and a franchise head office all produce it,
     * and each of those is several businesses on one number.
     */
    return out(
      'PROBABLE_SAME',
      'pass1-shared-phone',
      `a shared phone number (${sharedPhone[0]?.value}), which several businesses can legitimately have`,
    );
  }

  /* ---- PASS 2: composite identifiers ----------------------------------- */
  if (sameNormalizedName && loc.agreement === 'same') {
    return out(
      'SAME_ENTITY',
      'pass2-name-and-place',
      `the same normalised name at the same place (${loc.detail})`,
    );
  }
  if (sameNormalizedName && loc.agreement === 'unknown' && shared.length > 0) {
    return out(
      'PROBABLE_SAME',
      'pass2-name-and-shared-identifier',
      `the same normalised name and a shared ${shared[0]?.kind}, with no location to confirm it`,
    );
  }

  /* ---- the false-merge guard ------------------------------------------- */
  /*
   * The threshold here started at 0.8 and was wrong, which a test caught.
   *
   * "Grand Hotel Delhi" against "Grand Hotel Gurgaon" scores 0.67: two of
   * three tokens shared, and the third is the whole difference. That is
   * exactly the pair this guard exists for, and a 0.8 gate let it fall
   * through to AMBIGUOUS — which is the wrong answer, because a blocker is
   * not an absence of evidence. It is positive evidence of difference.
   *
   * So the rule is now: if something concrete says these are two businesses,
   * and the names are alike enough to be confusable at all, the answer is
   * PROBABLE_DIFFERENT. AMBIGUOUS is reserved for having nothing either way.
   */
  if (blockers.length > 0 && (sameNormalizedName || name.score >= 0.5 || name.jaccard >= 0.4)) {
    /*
     * The Grand Hotel case, and the one this whole file exists for. The names
     * are alike, and something concrete says these are two businesses. A
     * similar name is the weakest evidence in the system and it does not get
     * to overrule a different address.
     */
    const geographic = name.distinguishingTokens.filter((t) =>
      [...a.locations, ...b.locations].some(
        (l) => l.city?.includes(t) === true || l.locality?.includes(t) === true,
      ),
    );
    return out(
      'PROBABLE_DIFFERENT',
      geographic.length > 0 ? 'guard-place-in-name' : 'guard-conflicting-evidence',
      geographic.length > 0
        ? `similar names distinguished by a place: ${geographic.join(', ')} — and ${blockers[0]}`
        : `names are alike (${name.score.toFixed(2)}) but ${blockers[0]}`,
    );
  }

  /* ---- PASS 3: fuzzy — candidates only, never a merge ------------------- */
  /* A high token overlap with a low character score is a reordering — "Hotel
     Grand" against "Grand Hotel" — and is the same kind of near-match as a
     high character score, so it takes the same branch. */
  if (name.score >= 0.85 || sameNormalizedName || name.jaccard >= 0.9) {
    return out(
      'AMBIGUOUS',
      'pass3-fuzzy-name-only',
      `names are alike (${name.score.toFixed(2)}, shared tokens ${name.jaccard.toFixed(2)}) and nothing else connects them; ` +
        (name.distinguishingTokens.length > 0
          ? `the difference is ${name.distinguishingTokens.join(', ')}`
          : 'there is no corroborating identifier or location'),
    );
  }
  if (name.score >= 0.65) {
    return out(
      'AMBIGUOUS',
      'pass3-weak-name',
      `names are somewhat alike (${name.score.toFixed(2)}) with no corroboration; too weak to act on either way`,
    );
  }

  return out(
    'DIFFERENT_ENTITY',
    'pass3-no-evidence',
    `no shared identifier, no shared place, and the names do not match (${name.score.toFixed(2)})`,
  );
}

/* -------------------------------------------------------------------------- */
/* CANDIDATE GENERATION                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Which entities are worth comparing at all.
 *
 * Comparing every entity with every other is O(N²) and becomes the reason this
 * cannot be run. Blocking makes it O(candidates): look up the handful that
 * share a normalised identifier, a name token or a postal code, and compare
 * only those. Everything else is not merely unlikely to match — it cannot,
 * because every rule that could return SAME_ENTITY requires one of these keys.
 */
export async function findCandidates(
  d: Driver,
  facts: {
    type: string;
    name: NormalizedName;
    identifiers: Array<{ kind: string; value: string }>;
    postalCodes?: string[];
    geoCells?: string[];
  },
  limit = 50,
): Promise<string[]> {
  const ids = new Set<string>();

  /* Block 1: any shared identifier. The cheapest and strongest. */
  if (facts.identifiers.length > 0) {
    /*
     * One OR clause per identifier kind, built from a fixed enum.
     *
     * The expression this started as — `(kind, value) in (select * from
     * unnest($2, $3))` — is rejected by Postgres: unnest over two arrays
     * yields records the row constructor will not compare against. Two
     * independent `= any(...)` filters would be accepted and wrong in a
     * subtler way, because they form a cross product: a domain value would
     * match against a phone kind and block the wrong candidates in.
     *
     * Grouping by kind keeps the pairing exact. The kinds come from a
     * database enum rather than from input, so the generated fragment is
     * parameterised on values only and nothing user-supplied reaches the SQL
     * text.
     */
    const byKind = new Map<string, string[]>();
    for (const i of facts.identifiers) {
      const list = byKind.get(i.kind) ?? [];
      list.push(i.value);
      byKind.set(i.kind, list);
    }
    const params: unknown[] = [facts.type];
    const clauses: string[] = [];
    for (const [kind, values] of byKind) {
      params.push(kind, values);
      clauses.push(`(ei.kind = $${params.length - 1} and ei.value = any($${params.length}::text[]))`);
    }
    params.push(limit);
    const rows = await d.query<{ entity_id: string }>(
      `select distinct ei.entity_id
         from entity_identifier ei
         join entity e on e.id = ei.entity_id
        where e.type = $1 and e.status = 'ACTIVE'
          and (${clauses.join(' or ')})
        limit $${params.length}`,
      params,
    );
    for (const r of rows) ids.add(r.entity_id);
  }

  /* Block 2: exact normalised name. */
  {
    const rows = await d.query<{ id: string }>(
      `select id from entity where type = $1 and status = 'ACTIVE' and normalized_name = $2 limit $3`,
      [facts.type, facts.name.normalized, limit],
    );
    for (const r of rows) ids.add(r.id);
  }

  /* Block 3: trigram-similar names, which is what pg_trgm was installed for.
     Similarity here produces CANDIDATES; the decision is made by the rules. */
  {
    const rows = await d.query<{ id: string }>(
      `select id from entity
        where type = $1 and status = 'ACTIVE' and normalized_name % $2
        order by similarity(normalized_name, $2) desc
        limit $3`,
      [facts.type, facts.name.normalized, limit],
    );
    for (const r of rows) ids.add(r.id);
  }

  /* Block 4: same place, for entities whose names are written differently. */
  if (facts.postalCodes?.length) {
    const rows = await d.query<{ entity_id: string }>(
      `select distinct el.entity_id from entity_location el
         join entity e on e.id = el.entity_id
        where e.type = $1 and e.status = 'ACTIVE' and el.postal_code = any($2::text[])
        limit $3`,
      [facts.type, facts.postalCodes, limit],
    );
    for (const r of rows) ids.add(r.entity_id);
  }
  if (facts.geoCells?.length) {
    const rows = await d.query<{ entity_id: string }>(
      `select distinct el.entity_id from entity_location el
         join entity e on e.id = el.entity_id
        where e.type = $1 and e.status = 'ACTIVE' and el.geo_cell = any($2::text[])
        limit $3`,
      [facts.type, facts.geoCells, limit],
    );
    for (const r of rows) ids.add(r.entity_id);
  }

  return [...ids];
}

/** Read everything the comparison needs about one entity, in two queries. */
export async function loadFacts(d: Driver, entityId: string): Promise<EntityFacts | null> {
  const rows = await d.query<{ id: string; type: string; canonical_name: string; normalized_name: string }>(
    `select id, type, canonical_name, normalized_name from entity where id = $1`,
    [entityId],
  );
  const row = rows[0];
  if (!row) return null;

  const identifiers = await d.query<{ kind: string; value: string; verified: number }>(
    `select kind, value, verified from entity_identifier where entity_id = $1`,
    [entityId],
  );
  const locations = await d.query<{
    postal_code: string | null;
    city: string | null;
    locality: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    address_normalized: string | null;
  }>(
    `select postal_code, city, locality, country, latitude, longitude, address_normalized
       from entity_location where entity_id = $1`,
    [entityId],
  );

  return {
    id: row.id,
    type: row.type,
    canonicalName: row.canonical_name,
    name: normalizeName(row.canonical_name),
    identifiers: identifiers.map((i) => ({ kind: i.kind, value: i.value, verified: i.verified === 1 })),
    locations: locations.map((l) => ({
      postalCode: l.postal_code,
      city: l.city,
      locality: l.locality,
      country: l.country,
      latitude: l.latitude === null ? null : Number(l.latitude),
      longitude: l.longitude === null ? null : Number(l.longitude),
      addressNormalized: l.address_normalized,
    })),
  };
}

/** Record a judgement, including the refusals — especially the refusals. */
export async function recordJudgement(
  d: Driver,
  aId: string,
  bId: string,
  result: ResolutionResult,
): Promise<string> {
  /* Ordered so the pair key is stable whichever way round it was compared. */
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  const rows = await d.query<{ id: string }>(
    `insert into resolution_judgement (entity_a_id, entity_b_id, decision, rule, rule_version, reason, features)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (entity_a_id, entity_b_id) do update set
       decision = excluded.decision, rule = excluded.rule, rule_version = excluded.rule_version,
       reason = excluded.reason, features = excluded.features, decided_at = now()
     returning id`,
    [x, y, result.decision, result.rule, result.ruleVersion, result.reason, JSON.stringify(result.features)],
  );
  const row = rows[0];
  if (!row) throw new Error('resolution judgement insert returned no id');
  return row.id;
}
