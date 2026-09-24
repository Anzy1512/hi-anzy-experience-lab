import type { Driver } from '../db/client.ts';
import { Crawler } from '../crawl/fetch.ts';
import { urlFacts } from '../crawl/url.ts';
import { ingestOne } from '../index/ingest.ts';
import { ingestEntitiesFromDocument } from '../entity/pipeline.ts';
import { Budget, type Refusal } from '../jobs/budget.ts';
import { createJob, runJob, type JobResult } from '../jobs/orchestrator.ts';
import { SitemapProvider } from '../search/sitemap.ts';
import type { Discovery } from '../search/types.ts';
import { createPlaceProvider } from '../places/nominatim.ts';
import { haversineKm, type PlaceCandidate, type PlaceProvider } from '../places/types.ts';
import { geoCell } from '../entity/normalize.ts';
import { parsePilotSpec, toRequest, type PilotSpec } from './spec.ts';

/**
 * A REAL COMMERCIAL PILOT, FROM AN AREA TO AN ANSWER.
 *
 * ── THE SHAPE, AND WHY IT SPLITS WHERE IT DOES ──────────────────────────────
 *
 *   DISCOVER    a geographic provider names businesses in the area
 *   SELECT      each candidate becomes a subject, or a recorded reason it did not
 *   ACQUIRE     robots, fetch, extract, chunk, embed, resolve, claim
 *   PLACE       whatever is still unplaced is offered to the geocoder
 *   RESEARCH    the ordinary layer 5 job, over the corpus that now exists
 *
 * The seam is between ACQUIRE and RESEARCH, and it is the same seam layer 5
 * already had. Everything before it is about getting real pages into the
 * corpus; everything after it is the existing engine doing what it does to a
 * corpus, with no idea a pilot was involved. That is deliberate — a pilot that
 * reached into planning or verification would be a second research system with
 * its own rules about evidence, and there would be no way to tell from a
 * finding which of the two produced it.
 *
 * ── WHAT DISCOVERY IS ALLOWED TO ESTABLISH ──────────────────────────────────
 *
 * Nothing. A provider says "there is a brewery here and I think its website is
 * this". Both halves are a stranger's claim. The name is not written to the
 * corpus as a fact about a business, the coordinates are written only with the
 * provider's name against them, and the website is used for exactly one thing:
 * as a URL to hand the crawler. Which business is on the other end is decided
 * by the entity pipeline on the page's own evidence, and it is allowed to
 * decide it is somebody else entirely — a mapper's five-year-old link to a shop
 * that has since changed hands is a real and ordinary case.
 *
 * ── AND WHY THE REJECTS ARE STORED ──────────────────────────────────────────
 *
 * Nineteen bakeries, one website. If the pilot only records the one it could
 * use, its report reads "one bakery found in this area", which is false about
 * the area and true only about the data. Every candidate is written down with
 * the reason it was or was not taken, so the coverage question — what could
 * this pilot never have seen — is answerable from the corpus rather than from
 * somebody's memory of the run.
 */

export interface PilotOptions {
  crawler?: Crawler;
  place?: PlaceProvider;
  /** Injected by tests. Live runs let the orchestrator build its own. */
  job?: Parameters<typeof runJob>[2];
}

export interface PilotSubject {
  /** The place row this subject came from. */
  observationId: string;
  name: string | null;
  url: string;
  latitude: number | null;
  longitude: number | null;
  /** How precisely the provider resolved the point, in the provider's own terms. */
  precision: string;
  /** Which provider named it, so a recorded point can say who placed it. */
  provider: string;
  externalId: string;
}

export interface PilotResult {
  pilotId: string;
  state: 'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'FAILED';
  detail: string | null;
  jobId: string | null;
  discovery: {
    provider: string;
    queriesIssued: number;
    candidates: number;
    subjects: number;
    /** Candidate counts by the reason they were not taken. */
    rejected: Record<string, number>;
    unavailable: string | null;
  };
  acquisition: {
    urlsAttempted: number;
    fetched: number;
    unchanged: number;
    refusedByRobots: number;
    failed: number;
    documents: number;
    entities: number;
    outcomes: Record<string, number>;
    /** Businesses placed on the map from the geographic provider's own record. */
    pointsFromProvider: number;
  };
  geocoding: {
    provider: string;
    attempted: number;
    placed: number;
    stillUnplaced: number;
    byPrecision: Record<string, number>;
  };
  research: JobResult | null;
  /** Every budget refusal, in the words a report can use. */
  refusals: Refusal[];
  limitations: string[];
  elapsedMs: number;
}

/* -------------------------------------------------------------------------- */
/* CREATE                                                                      */
/* -------------------------------------------------------------------------- */

export async function createPilot(d: Driver, spec: PilotSpec): Promise<string> {
  const rows = await d.query<{ id: string }>(
    `insert into pilot (name, spec, state, project_id) values ($1,$2::jsonb,'DRAFT',$3) returning id`,
    [spec.name, JSON.stringify(spec), spec.projectId ?? null],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('could not create a pilot');
  return id;
}

/* -------------------------------------------------------------------------- */
/* DISCOVER AND SELECT                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A land-use polygon is not a trading business.
 *
 * "Brewery Wharf" is a residential development named after what used to be
 * there, and a gazetteer will return it for `brewery` because that is what it
 * is called. The provider's own classification says `landuse/*` and its own
 * precision says AREA, so this is reading what the provider reported rather
 * than guessing from the name — which would throw away a genuine business
 * called "The Old Brewery".
 */
function looksLikePlace(c: PlaceCandidate): boolean {
  const category = c.category ?? '';
  if (category.startsWith('landuse/') || category.startsWith('boundary/') || category.startsWith('place/')) return false;
  return c.precision !== 'AREA';
}

export async function discoverSubjects(
  d: Driver,
  pilotId: string,
  spec: PilotSpec,
  place: PlaceProvider,
  budget: Budget,
): Promise<{ subjects: PilotSubject[]; report: PilotResult['discovery'] }> {
  const rejected: Record<string, number> = {};
  const subjects: PilotSubject[] = [];
  const takenOrigins = new Set<string>();
  let candidates = 0;
  let queriesIssued = 0;
  let unavailable: string | null = null;

  const record = async (
    c: Omit<PlaceCandidate, 'raw'> & { raw: Record<string, unknown> },
    use: string,
    distanceKm: number | null,
  ): Promise<string> => {
    if (use !== 'SUBJECT') rejected[use] = (rejected[use] ?? 0) + 1;
    const rows = await d.query<{ id: string }>(
      `insert into place_observation
         (pilot_id, provider, external_id, query, name, category, latitude, longitude, precision,
          distance_km, website_candidate, address, confidence, use, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb) returning id`,
      [
        pilotId,
        c.provider,
        c.externalId,
        c.query,
        c.name,
        c.category,
        c.latitude,
        c.longitude,
        c.precision,
        distanceKm,
        c.websiteCandidate,
        c.address,
        c.confidence,
        use,
        JSON.stringify(c.raw),
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('could not record a place observation');
    return id;
  };

  /*
   * Seeds first, and on purpose.
   *
   * A caller who supplied a URL has named a subject; a provider only suggested
   * one. If the subject cap binds, the caller's own list should not be the part
   * that gets cut.
   */
  for (const seed of spec.seeds) {
    const facts = urlFacts(seed);
    if (facts === null) continue;
    if (takenOrigins.has(facts.url.origin)) continue;
    const over = subjects.length >= spec.budget.maxSubjects;
    const id = await record(
      {
        provider: 'none',
        externalId: `seed:${facts.url.origin}`,
        query: 'supplied by the caller',
        name: null,
        category: null,
        latitude: null as unknown as number,
        longitude: null as unknown as number,
        precision: 'UNKNOWN',
        websiteCandidate: facts.url.toString(),
        address: null,
        confidence: null,
        discoveredAt: new Date(),
        raw: { seed: true },
      },
      over ? 'OVER_BUDGET' : 'SUBJECT',
      null,
    );
    if (over) continue;
    takenOrigins.add(facts.url.origin);
    subjects.push({
      observationId: id,
      name: null,
      url: facts.url.toString(),
      latitude: null,
      longitude: null,
      precision: 'UNKNOWN',
      provider: 'none',
      externalId: `seed:${facts.url.origin}`,
    });
  }

  const availability = await place.available();
  if (!availability.ok) {
    unavailable = availability.problem?.detail ?? availability.detail;
  } else {
    for (const category of spec.categories) {
      const refusal = budget.canAfford({ searches: 1 });
      if (refusal !== null) {
        unavailable = unavailable ?? refusal.reason;
        break;
      }
      const res = await place.discover(category, spec.area, { limit: 50 });
      budget.spend({ searches: 1 });
      queriesIssued += 1;
      if (res.unavailable !== undefined) {
        unavailable = res.unavailable.detail;
        continue;
      }

      for (const c of res.candidates) {
        candidates += 1;
        const distanceKm = haversineKm(c, spec.area);
        const use = ((): string => {
          if (distanceKm > spec.area.radiusKm) return 'OUT_OF_RADIUS';
          if (!looksLikePlace(c)) return 'NOT_A_BUSINESS';
          if (c.websiteCandidate === null) return 'NO_WEBSITE';
          const facts = urlFacts(c.websiteCandidate);
          if (facts === null) return 'NO_WEBSITE';
          if (takenOrigins.has(facts.url.origin)) return 'DUPLICATE_SITE';
          if (subjects.length >= spec.budget.maxSubjects) return 'OVER_BUDGET';
          return 'SUBJECT';
        })();

        const id = await record({ ...c, raw: c.raw }, use, distanceKm);
        if (use !== 'SUBJECT' || c.websiteCandidate === null) continue;
        const facts = urlFacts(c.websiteCandidate);
        if (facts === null) continue;
        takenOrigins.add(facts.url.origin);
        subjects.push({
          observationId: id,
          name: c.name,
          url: facts.url.toString(),
          latitude: c.latitude,
          longitude: c.longitude,
          precision: c.precision,
          provider: c.provider,
          externalId: c.externalId,
        });
      }
    }
  }

  return {
    subjects,
    report: { provider: place.id, queriesIssued, candidates, subjects: subjects.length, rejected, unavailable },
  };
}

/* -------------------------------------------------------------------------- */
/* ACQUIRE                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Put a provider's point against a business, without overwriting its own.
 *
 * A gazetteer knows roughly where a shop is; the shop's own page, when it
 * publishes coordinates, knows better — and `declared` beating a provider is
 * the whole precedence rule. So this only ever fills a gap, and it writes the
 * provider, the precision and the provider's own id beside the numbers, because
 * a point that cannot answer "who put this here" is the point layer 6 refused
 * to draw.
 *
 * An AREA or UNKNOWN precision is never promoted to a coordinate. A town centre
 * wearing a business's name is worse than an empty map, because it looks like an
 * address.
 */
async function recordProviderPoint(d: Driver, entityId: string, s: PilotSubject): Promise<boolean> {
  if (s.latitude === null || s.longitude === null) return false;
  if (s.precision === 'AREA' || s.precision === 'UNKNOWN') return false;

  const rows = await d.query<{ id: string; latitude: number | null; geocode_provider: string | null }>(
    'select id, latitude, geocode_provider from entity_location where entity_id = $1 order by first_seen_at limit 1',
    [entityId],
  );
  const existing = rows[0];
  if (existing !== undefined && existing.latitude !== null && existing.geocode_provider === 'declared') return false;

  const values = [
    s.latitude,
    s.longitude,
    geoCell(s.latitude, s.longitude),
    s.provider,
    s.precision,
    (s.name ?? s.url).slice(0, 500),
    s.name,
    s.externalId,
  ];

  if (existing === undefined) {
    await d.query(
      `insert into entity_location
         (entity_id, latitude, longitude, geo_cell, geocode, geocode_provider, geocode_precision,
          geocode_query, geocode_matched, geocode_external_id, geocoded_at)
       values ($1,$2,$3,$4,'RESOLVED',$5,$6,$7,$8,$9, now())`,
      [entityId, ...values],
    );
    return true;
  }

  await d.query(
    `update entity_location
        set latitude = $2, longitude = $3, geo_cell = $4, geocode = 'RESOLVED', geocode_provider = $5,
            geocode_precision = $6, geocode_query = $7, geocode_matched = $8,
            geocode_external_id = $9, geocoded_at = now()
      where id = $1`,
    [existing.id, ...values],
  );
  return true;
}

/**
 * Fetch, extract and resolve, within the page budget.
 *
 * Depth 1 asks the site what else it publishes. That is the politest possible
 * expansion — the URLs come from a file the site wrote to be read — and for a
 * commercial question it is also the most useful, because a shop's sitemap is
 * where its product pages are and a product page is where the evidence of
 * selling online lives.
 *
 * The homepage is always fetched first and the sitemap pages are spread evenly
 * across subjects rather than taken depth-first. Otherwise a brewery with four
 * hundred product URLs would consume the entire page budget and the other nine
 * businesses would be reported as having no website.
 */
export async function acquire(
  d: Driver,
  pilotId: string,
  spec: PilotSpec,
  subjects: PilotSubject[],
  crawler: Crawler,
  budget: Budget,
): Promise<{ report: PilotResult['acquisition']; documentIds: string[] }> {
  const outcomes: Record<string, number> = {};
  const documentIds: string[] = [];
  let urlsAttempted = 0;
  let entities = 0;

  const perSubject = Math.max(1, Math.floor(spec.budget.maxSources / Math.max(1, subjects.length)));
  const sitemap = new SitemapProvider(crawler);

  let pointsFromProvider = 0;

  const ingest = async (url: string, subject: PilotSubject | null): Promise<boolean> => {
    const observationId = subject?.observationId ?? null;
    if (budget.canAfford({ pages: 1 }) !== null) return false;
    urlsAttempted += 1;
    const item: Discovery = {
      provider: 'sitemap',
      query: url,
      url,
      canonicalUrl: null,
      title: null,
      snippet: null,
      rank: 1,
      publishedAt: null,
      discoveredAt: new Date(),
      providerMetadata: { pilotId },
    };
    const res = await ingestOne(d, item, { crawler, sourceKind: 'web' });
    budget.spend({ pagesCrawled: 1 });
    outcomes[res.outcome] = (outcomes[res.outcome] ?? 0) + 1;
    if (res.documentId === null) return false;
    documentIds.push(res.documentId);

    const ent = await ingestEntitiesFromDocument(d, res.documentId, {
      ...(spec.country !== undefined ? { country: spec.country } : {}),
      /* The markup, so the capability probe runs. A commercial pilot whose
         question is "does it sell online" cannot answer it from extracted
         text: a cart button is markup. */
      ...(res.html !== null ? { html: res.html } : {}),
    });
    if (ent.entityCreated) entities += 1;
    /*
     * Tie the business back to the record that suggested it, once the page has
     * decided who it is. This is the only moment a place observation gains an
     * entity, and it stays null when the crawl produced no business — which is
     * exactly what a dead link in a map database should look like.
     */
    if (observationId !== null && ent.entityId !== null) {
      await d.query('update place_observation set entity_id = $2 where id = $1 and entity_id is null', [
        observationId,
        ent.entityId,
      ]);
      if (subject !== null && (await recordProviderPoint(d, ent.entityId, subject))) pointsFromProvider += 1;
    }
    return true;
  };

  for (const s of subjects) await ingest(s.url, s);

  if (spec.budget.maxCrawlDepth >= 1) {
    for (const s of subjects) {
      if (budget.canAfford({ pages: 1 }) !== null) break;
      if (budget.canAfford({ searches: 1 }) !== null) break;
      const found = await sitemap.search(s.url, { limit: perSubject * 3 });
      budget.spend({ searches: 1 });
      if (found.unavailable !== undefined) continue;

      let taken = 0;
      for (const r of found.results) {
        if (taken >= perSubject) break;
        if (r.url === s.url) continue;
        if (!(await ingest(r.url, null))) break;
        taken += 1;
      }
    }
  }

  const counted = (...keys: string[]): number => keys.reduce((n, k) => n + (outcomes[k] ?? 0), 0);
  return {
    report: {
      urlsAttempted,
      fetched: counted('ok'),
      unchanged: counted('unchanged'),
      refusedByRobots: counted('blocked_robots'),
      failed: urlsAttempted - counted('ok', 'unchanged', 'blocked_robots'),
      documents: documentIds.length,
      entities,
      outcomes,
      pointsFromProvider,
    },
    documentIds,
  };
}

/* -------------------------------------------------------------------------- */
/* PLACE                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Offer a point to every business that has an address and no coordinates.
 *
 * A page that publishes its own `GeoCoordinates` already won: `declared` beats
 * a gazetteer, because the business saying where it is outranks a third party
 * saying where it thinks the business is. So this only ever fills a gap, and it
 * writes the provider, the query, what was matched and how precisely — because
 * a point on a map with no answer to "who put this here" is the thing layer 6
 * refused to draw.
 */
export async function placeUnlocated(
  d: Driver,
  spec: PilotSpec,
  place: PlaceProvider,
  budget: Budget,
): Promise<PilotResult['geocoding']> {
  const byPrecision: Record<string, number> = {};
  let attempted = 0;
  let placed = 0;

  const availability = await place.available();
  const unplacedRows = await d.query<{ id: string; entity_id: string; address_raw: string | null }>(
    `select l.id, l.entity_id, l.address_raw
       from entity_location l
       join entity e on e.id = l.entity_id
      where l.latitude is null and l.address_raw is not null and e.type = 'ORGANIZATION'
      order by l.first_seen_at
      limit $1`,
    [spec.budget.maxSubjects],
  );

  if (availability.ok) {
    for (const row of unplacedRows) {
      if (row.address_raw === null) continue;
      if (budget.canAfford({ searches: 1 }) !== null) break;
      attempted += 1;
      const res = await place.geocode(row.address_raw);
      budget.spend({ searches: 1 });
      if (res.geocode === null) continue;
      const g = res.geocode;
      /*
       * An AREA match is a town centre wearing a shop's address. It is recorded
       * — the attempt and its precision are facts — and it is NOT promoted to a
       * coordinate, because plotting it would put a pin on a business that is
       * merely somewhere in that town.
       */
      byPrecision[g.precision] = (byPrecision[g.precision] ?? 0) + 1;
      if (g.precision === 'AREA' || g.precision === 'UNKNOWN') {
        await d.query(
          `update entity_location
              set geocode = 'UNRESOLVED', geocode_provider = $2, geocode_precision = $3,
                  geocode_query = $4, geocode_matched = $5, geocode_external_id = $6, geocoded_at = now()
            where id = $1`,
          [row.id, g.provider, g.precision, g.query.slice(0, 500), g.matchedAddress, g.externalId],
        );
        continue;
      }
      await d.query(
        `update entity_location
            set latitude = $2, longitude = $3, geocode = 'RESOLVED', geocode_provider = $4,
                geocode_precision = $5, geocode_query = $6, geocode_matched = $7,
                geocode_external_id = $8, geocoded_at = now()
          where id = $1`,
        [row.id, g.latitude, g.longitude, g.provider, g.precision, g.query.slice(0, 500), g.matchedAddress, g.externalId],
      );
      placed += 1;
    }
  }

  const remaining = await d.query<{ n: string }>(
    `select count(*) as n from entity_location l join entity e on e.id = l.entity_id
      where l.latitude is null and e.type = 'ORGANIZATION'`,
  );

  return {
    provider: place.id,
    attempted,
    placed,
    stillUnplaced: Number(remaining[0]?.n ?? 0),
    byPrecision,
  };
}

/* -------------------------------------------------------------------------- */
/* THE WHOLE THING                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Run a pilot that already exists.
 *
 * Split from creation for the same reason `createJob` and `runJob` are split:
 * a spec that will not validate, or a question that cannot be classified,
 * should be refused before anything has been fetched — and an API needs the id
 * back before the work starts so a caller can watch it rather than hold a
 * connection open for ten minutes.
 */
export async function executePilot(d: Driver, pilotId: string, opts: PilotOptions = {}): Promise<PilotResult> {
  const startedAt = performance.now();
  const rows = await d.query<{ spec: unknown; state: string }>('select spec, state from pilot where id = $1', [pilotId]);
  const row = rows[0];
  if (row === undefined) throw new Error(`no pilot ${pilotId}`);
  const spec = parsePilotSpec(typeof row.spec === 'string' ? JSON.parse(row.spec) : row.spec);
  const crawler = opts.crawler ?? new Crawler({ attempts: 2 });
  const place = opts.place ?? createPlaceProvider();
  const budget = new Budget(toRequest(spec));
  const limitations: string[] = [];

  await d.query(`update pilot set state = 'DISCOVERING', started_at = now(), place_provider = $2 where id = $1`, [
    pilotId,
    place.id,
  ]);

  const { subjects, report: discovery } = await discoverSubjects(d, pilotId, spec, place, budget);

  if (discovery.unavailable !== null) {
    limitations.push(
      `Geographic discovery was not available (${discovery.unavailable}), so this pilot searched only what it was given rather than the whole area.`,
    );
  }
  if ((discovery.rejected['NO_WEBSITE'] ?? 0) > 0) {
    limitations.push(
      `${discovery.rejected['NO_WEBSITE']} business(es) in this area were found with no website recorded anywhere this pilot could read, so nothing about their digital presence was established either way.`,
    );
  }
  if ((discovery.rejected['OVER_BUDGET'] ?? 0) > 0) {
    limitations.push(
      `${discovery.rejected['OVER_BUDGET']} further candidate(s) matched and were not researched, because the pilot allowed ${spec.budget.maxSubjects} subject(s).`,
    );
  }

  if (subjects.length === 0) {
    const detail =
      discovery.unavailable ?? 'no business in this area had a website candidate to read, and no seed URL was supplied';
    await d.query(`update pilot set state = 'BLOCKED', detail = $2, finished_at = now() where id = $1`, [pilotId, detail]);
    return {
      pilotId,
      state: 'BLOCKED',
      detail,
      jobId: null,
      discovery,
      acquisition: {
        urlsAttempted: 0, fetched: 0, unchanged: 0, refusedByRobots: 0, failed: 0,
        documents: 0, entities: 0, outcomes: {}, pointsFromProvider: 0,
      },
      geocoding: { provider: place.id, attempted: 0, placed: 0, stillUnplaced: 0, byPrecision: {} },
      research: null,
      refusals: budget.refusals,
      limitations,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const { report: acquisition } = await acquire(d, pilotId, spec, subjects, crawler, budget);
  if (acquisition.refusedByRobots > 0) {
    limitations.push(
      `${acquisition.refusedByRobots} page(s) were not read because the site's robots.txt refused. Nothing was concluded about those businesses from pages we were not allowed to fetch.`,
    );
  }

  const geocoding = await placeUnlocated(d, spec, place, budget);
  if (geocoding.stillUnplaced > 0) {
    limitations.push(
      `${geocoding.stillUnplaced} business(es) in the corpus have no resolved coordinate and are absent from the map rather than guessed at.`,
    );
  }

  await d.query(`update pilot set state = 'RESEARCHING' where id = $1`, [pilotId]);

  const request = toRequest(spec, { searches: budget.ledger.searches, pages: budget.ledger.pagesCrawled });
  const created = await createJob(d, request, { ...(opts.job ?? {}), ...(spec.projectId !== undefined ? { projectId: spec.projectId } : {}) });
  await d.query('update pilot set job_id = $2 where id = $1', [pilotId, created.jobId]);

  if (created.problems.length > 0) {
    const detail = created.problems.join('; ');
    await d.query(`update pilot set state = 'PARTIAL', detail = $2, finished_at = now() where id = $1`, [pilotId, detail]);
    return {
      pilotId, state: 'PARTIAL', detail, jobId: created.jobId, discovery, acquisition, geocoding,
      research: null, refusals: budget.refusals,
      limitations: [...limitations, `The pilot's question was not researched: ${detail}`],
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const research = await runJob(d, created.jobId, { crawler, ...(opts.job ?? {}) });
  const state = research.termination === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL';
  await d.query(`update pilot set state = $2, finished_at = now() where id = $1`, [pilotId, state]);

  return {
    pilotId,
    state,
    detail: research.termination === 'COMPLETE' ? null : research.termination,
    jobId: created.jobId,
    discovery,
    acquisition,
    geocoding,
    research,
    refusals: [...budget.refusals],
    limitations: [...limitations, ...research.limitations],
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

/** Create and run, for a script that wants both in one call. */
export async function runPilot(d: Driver, spec: PilotSpec, opts: PilotOptions = {}): Promise<PilotResult> {
  const pilotId = await createPilot(d, spec);
  return executePilot(d, pilotId, opts);
}
