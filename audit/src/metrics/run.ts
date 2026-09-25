import type { Driver } from '../db/client.ts';
import { runIdsIn } from '../jobs/orchestrator.ts';

/**
 * WHAT A RUN ACTUALLY DID, COUNTED FROM THE ROWS IT LEFT.
 *
 * ── COMPUTED, NEVER ACCUMULATED ─────────────────────────────────────────────
 *
 * Every number here is a query over tables the pipeline already writes. There
 * is no metrics table, no counter incremented beside the work, and no summary
 * column updated in a second statement — because that is the arrangement where
 * the number and the thing it counts drift apart, and the number is the one
 * people read. A count that disagrees with the corpus is worse than no count,
 * since nothing about it looks wrong.
 *
 * It costs a handful of aggregate queries per run. That is the right trade for
 * a figure that cannot be stale.
 *
 * ── AND THREE THINGS DELIBERATELY ABSENT ────────────────────────────────────
 *
 * No precision. No recall. No F1. All three need a labelled denominator — a
 * set of findings a person has judged — and until `verification_feedback` has
 * rows there is no such set. Computing them against "findings the system
 * accepted" would measure the system against itself and produce a number near
 * 1.0 that means nothing, which is the most dangerous possible metric because
 * it is reassuring. Once reviews exist, `reviewMetrics` reports agreement
 * counts, and that is all the data supports.
 *
 * `costMicros` is `null` when no price table is configured. Never 0. A free
 * call and an unpriced call are different facts and only one of them is free.
 */

const n = (v: unknown): number => Number(v ?? 0);

/** A count, or null when the thing being counted has no defined value yet. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

export interface DiscoveryMetrics {
  /** Every place a geographic provider named, used or not. */
  candidatesDiscovered: number;
  subjectsTaken: number;
  /** Counts by the reason a candidate became nothing. */
  rejectedByReason: Record<string, number>;
  /** URLs a search or sitemap provider produced. */
  urlsDiscovered: number;
  sourcesAccepted: number;
  sourcesRejected: number;
  robotsRefusals: number;
  /** Counts by fetch outcome, so a failure mode is visible rather than pooled. */
  fetchOutcomes: Record<string, number>;
}

export interface RetrievalMetrics {
  chunksConsidered: number;
  chunksSelected: number;
  /** How many selected passages each index found. They overlap; that is the point. */
  lexicalContribution: number;
  denseContribution: number;
  /** Selected ÷ considered. Null when nothing was retrieved. */
  selectionRate: number | null;
  /** Evidence items offered to a packet, and how many survived the budget. */
  evidenceConsidered: number;
  evidenceIncluded: number;
  evidenceDroppedByReason: Record<string, number>;
}

export interface EntityMetrics {
  organisations: number;
  merged: number;
  decisions: Record<string, number>;
  /** Judgements the resolver refused to settle. Working, not failing. */
  ambiguous: number;
  conflictingClaims: number;
  singleSourceEntities: number;
  located: number;
  unplaced: number;
  /** Who placed the points that exist. `declared` is the business's own page. */
  geocodeProviders: Record<string, number>;
  geocodePrecision: Record<string, number>;
}

export interface EvidenceMetrics {
  findings: number;
  sourced: number;
  unsupported: number;
  unknown: number;
  recommendations: number;
  conflicting: number;
  /**
   * Findings that must carry a citation and do not. Should be zero.
   *
   * Scoped to FACT and CONFLICTING deliberately. A DERIVED finding reasons over
   * evidence and may cite the reasoning rather than a passage; a RECOMMENDATION
   * cites nothing by design. Counting those as failures would report a
   * permanent non-zero number and make the one number that should always read
   * zero useless.
   */
  citationFailures: number;
  citations: number;
  /** Distinct origins behind the citations. One is a corroboration problem. */
  sourceDiversity: number;
}

export interface ModelMetrics {
  calls: number;
  liveCalls: number;
  failedCalls: number;
  tokensIn: number;
  tokensOut: number;
  /** Null when unpriced. Never zero to mean unknown. */
  costMicros: number | null;
  /** Calls ÷ requests answered. Lower is better at equal quality. */
  invocationRate: number | null;
  rejectedGenerations: number;
  byPurpose: Record<string, number>;
}

export interface ProductMetrics {
  runs: number;
  findingsReturned: number;
  unknownFindings: number;
  recommendations: number;
  /** Milliseconds, measured from the run's own timestamps. */
  medianLatencyMs: number | null;
  maxLatencyMs: number | null;
  costMicros: number | null;
  pagesCrawled: number;
  searches: number;
}

export interface RunMetrics {
  discovery: DiscoveryMetrics;
  retrieval: RetrievalMetrics;
  entity: EntityMetrics;
  evidence: EvidenceMetrics;
  model: ModelMetrics;
  product: ProductMetrics;
}

/**
 * A SQL fragment scoping a query to a set of runs, or to everything.
 *
 * Passed as a parameter array rather than interpolated, because the one place a
 * metrics module must not become is a string-built query over a table of
 * findings.
 */
interface Scope {
  runIds: string[] | null;
  pilotId: string | null;
}

async function discoveryMetrics(d: Driver, scope: Scope): Promise<DiscoveryMetrics> {
  const places = await d.query<{ use: string; n: string }>(
    scope.pilotId === null
      ? 'select use, count(*)::text as n from place_observation group by use'
      : 'select use, count(*)::text as n from place_observation where pilot_id = $1 group by use',
    scope.pilotId === null ? [] : [scope.pilotId],
  );
  const rejectedByReason: Record<string, number> = {};
  let candidatesDiscovered = 0;
  let subjectsTaken = 0;
  for (const row of places) {
    candidatesDiscovered += n(row.n);
    if (row.use === 'SUBJECT') subjectsTaken += n(row.n);
    else rejectedByReason[row.use] = n(row.n);
  }

  const urls = await d.query<{ n: string }>('select count(*)::text as n from discovery');
  const outcomes = await d.query<{ outcome: string | null; n: string }>(
    'select outcome, count(*)::text as n from document group by outcome',
  );
  const fetchOutcomes: Record<string, number> = {};
  for (const row of outcomes) fetchOutcomes[row.outcome ?? 'unrecorded'] = n(row.n);

  const robotsRefusals = fetchOutcomes['blocked_robots'] ?? 0;
  const sourcesAccepted = (fetchOutcomes['ok'] ?? 0) + (fetchOutcomes['unchanged'] ?? 0);
  const sourcesRejected = Object.entries(fetchOutcomes)
    .filter(([k]) => k !== 'ok' && k !== 'unchanged' && k !== 'unrecorded')
    .reduce((t, [, v]) => t + v, 0);

  return {
    candidatesDiscovered,
    subjectsTaken,
    rejectedByReason,
    urlsDiscovered: n(urls[0]?.n),
    sourcesAccepted,
    sourcesRejected,
    robotsRefusals,
    fetchOutcomes,
  };
}

async function retrievalMetrics(d: Driver, scope: Scope): Promise<RetrievalMetrics> {
  const where = scope.runIds === null ? '' : 'where audit_run_id = any($1::uuid[])';
  const params = scope.runIds === null ? [] : [scope.runIds];

  const r = await d.query<{ considered: string; selected: string; lexical: string; dense: string }>(
    `select count(*)::text as considered,
            count(*) filter (where used_in_prompt = 1)::text as selected,
            count(*) filter (where used_in_prompt = 1 and score_lexical > 0)::text as lexical,
            count(*) filter (where used_in_prompt = 1 and score_vector > 0)::text as dense
       from retrieval ${where}`,
    params,
  );
  const row = r[0];

  const sel = await d.query<{ included: number; reason: string; n: string }>(
    `select included, reason, count(*)::text as n from evidence_selection ${where} group by included, reason`,
    params,
  );
  const evidenceDroppedByReason: Record<string, number> = {};
  let evidenceConsidered = 0;
  let evidenceIncluded = 0;
  for (const s of sel) {
    evidenceConsidered += n(s.n);
    if (Number(s.included) === 1) evidenceIncluded += n(s.n);
    else evidenceDroppedByReason[s.reason] = (evidenceDroppedByReason[s.reason] ?? 0) + n(s.n);
  }

  const considered = n(row?.considered);
  const selected = n(row?.selected);
  return {
    chunksConsidered: considered,
    chunksSelected: selected,
    lexicalContribution: n(row?.lexical),
    denseContribution: n(row?.dense),
    selectionRate: ratio(selected, considered),
    evidenceConsidered,
    evidenceIncluded,
    evidenceDroppedByReason,
  };
}

async function entityMetrics(d: Driver): Promise<EntityMetrics> {
  const counts = await d.query<{ orgs: string; merged: string }>(
    `select count(*) filter (where type = 'ORGANIZATION' and status <> 'MERGED')::text as orgs,
            count(*) filter (where status = 'MERGED')::text as merged
       from entity`,
  );
  const decisionRows = await d.query<{ decision: string; n: string }>(
    'select decision, count(*)::text as n from resolution_judgement group by decision',
  );
  const decisions: Record<string, number> = {};
  for (const row of decisionRows) decisions[row.decision] = n(row.n);

  const conflicts = await d.query<{ n: string }>(
    `select count(*)::text as n from claim where temporal = 'CONFLICTING'`,
  );
  const single = await d.query<{ n: string }>(
    `select count(*)::text as n from (
       select e.id from entity e
         join observation o on o.entity_id = e.id
         join document doc on doc.id = o.document_id
        where e.type = 'ORGANIZATION' and e.status <> 'MERGED'
        group by e.id having count(distinct doc.source_id) = 1
     ) t`,
  );
  const loc = await d.query<{ located: string; unplaced: string }>(
    `select count(*) filter (where l.latitude is not null)::text as located,
            count(*) filter (where l.latitude is null)::text as unplaced
       from entity_location l join entity e on e.id = l.entity_id
      where e.type = 'ORGANIZATION'`,
  );
  const providers = await d.query<{ geocode_provider: string | null; n: string }>(
    `select geocode_provider, count(*)::text as n from entity_location
      where latitude is not null group by geocode_provider`,
  );
  const precision = await d.query<{ geocode_precision: string | null; n: string }>(
    'select geocode_precision, count(*)::text as n from entity_location group by geocode_precision',
  );

  const geocodeProviders: Record<string, number> = {};
  for (const p of providers) geocodeProviders[p.geocode_provider ?? 'unrecorded'] = n(p.n);
  const geocodePrecision: Record<string, number> = {};
  for (const p of precision) {
    if (p.geocode_precision !== null) geocodePrecision[p.geocode_precision] = n(p.n);
  }

  return {
    organisations: n(counts[0]?.orgs),
    merged: n(counts[0]?.merged),
    decisions,
    ambiguous: decisions['AMBIGUOUS'] ?? 0,
    conflictingClaims: n(conflicts[0]?.n),
    singleSourceEntities: n(single[0]?.n),
    located: n(loc[0]?.located),
    unplaced: n(loc[0]?.unplaced),
    geocodeProviders,
    geocodePrecision,
  };
}

async function evidenceMetrics(d: Driver, scope: Scope): Promise<EvidenceMetrics> {
  const where = scope.runIds === null ? '' : 'where f.audit_run_id = any($1::uuid[])';
  const params = scope.runIds === null ? [] : [scope.runIds];

  const rows = await d.query<{
    findings: string; sourced: string; unsupported: string; unknown: string;
    recommendations: string; conflicting: string; citations: string; uncited: string;
  }>(
    `select count(*)::text as findings,
            count(*) filter (where f.status in ('FACT','DERIVED'))::text as sourced,
            count(*) filter (where f.status = 'UNSUPPORTED')::text as unsupported,
            count(*) filter (where f.status = 'UNKNOWN')::text as unknown,
            count(*) filter (where f.status = 'RECOMMENDATION')::text as recommendations,
            count(*) filter (where f.status = 'CONFLICTING')::text as conflicting,
            (select count(*) from finding_citation c
               join finding f2 on f2.id = c.finding_id
              ${scope.runIds === null ? '' : 'where f2.audit_run_id = any($1::uuid[])'})::text as citations,
            count(*) filter (
              where f.status in ('FACT','CONFLICTING')
                and not exists (select 1 from finding_citation c where c.finding_id = f.id)
            )::text as uncited
       from finding f ${where}`,
    params,
  );
  const row = rows[0];

  const diversity = await d.query<{ n: string }>(
    `select count(distinct c.url)::text as n from finding_citation c
       join finding f on f.id = c.finding_id
      ${scope.runIds === null ? 'where c.url is not null' : 'where c.url is not null and f.audit_run_id = any($1::uuid[])'}`,
    params,
  );

  return {
    findings: n(row?.findings),
    sourced: n(row?.sourced),
    unsupported: n(row?.unsupported),
    unknown: n(row?.unknown),
    recommendations: n(row?.recommendations),
    conflicting: n(row?.conflicting),
    citationFailures: n(row?.uncited),
    citations: n(row?.citations),
    sourceDiversity: n(diversity[0]?.n),
  };
}

async function modelMetrics(d: Driver, scope: Scope): Promise<ModelMetrics> {
  const where = scope.runIds === null ? '' : 'where audit_run_id = any($1::uuid[])';
  const params = scope.runIds === null ? [] : [scope.runIds];

  const rows = await d.query<{
    calls: string; failed: string; tin: string; tout: string; cost: string | null; priced: string;
  }>(
    `select count(*)::text as calls,
            count(*) filter (where ok = 0)::text as failed,
            coalesce(sum(tokens_in),0)::text as tin,
            coalesce(sum(tokens_out),0)::text as tout,
            sum(cost_micros)::text as cost,
            count(*) filter (where cost_micros is not null)::text as priced
       from model_call ${where}`,
    params,
  );
  const row = rows[0];

  const purposes = await d.query<{ purpose: string; n: string }>(
    `select purpose, count(*)::text as n from model_call ${where} group by purpose`,
    params,
  );
  const byPurpose: Record<string, number> = {};
  for (const p of purposes) byPurpose[p.purpose] = n(p.n);

  const live = await d.query<{ n: string }>('select count(*)::text as n from live_model_call where ok = 1');

  const runCount = await d.query<{ n: string }>(
    scope.runIds === null
      ? 'select count(*)::text as n from audit_run'
      : 'select count(*)::text as n from audit_run where id = any($1::uuid[])',
    params,
  );
  const rejected = await d.query<{ n: string }>(
    `select count(*)::text as n from finding f
      where f.status = 'UNSUPPORTED' ${scope.runIds === null ? '' : 'and f.audit_run_id = any($1::uuid[])'}`,
    params,
  );

  const calls = n(row?.calls);
  return {
    calls,
    liveCalls: n(live[0]?.n),
    failedCalls: n(row?.failed),
    tokensIn: n(row?.tin),
    tokensOut: n(row?.tout),
    /*
     * Three states, not two.
     *
     * No calls at all cost zero — that is a fact, and the deterministic path
     * this whole system prefers is exactly where it happens, so reporting it as
     * UNKNOWN would hide the best result as a missing one. Calls with no price
     * configured are UNKNOWN, because money was spent and nobody told us how
     * much. A sum of nulls is neither.
     */
    costMicros: calls === 0 ? 0 : n(row?.priced) === 0 ? null : n(row?.cost),
    invocationRate: ratio(calls, n(runCount[0]?.n)),
    rejectedGenerations: n(rejected[0]?.n),
    byPurpose,
  };
}

async function productMetrics(d: Driver, scope: Scope): Promise<ProductMetrics> {
  const where = scope.runIds === null ? '' : 'where id = any($1::uuid[])';
  const params = scope.runIds === null ? [] : [scope.runIds];

  const rows = await d.query<{ runs: string; cost: string | null; priced: string }>(
    `select count(*)::text as runs,
            sum(cost_micros)::text as cost,
            count(*) filter (where cost_micros is not null)::text as priced
       from audit_run ${where}`,
    params,
  );
  const row = rows[0];

  /*
   * Pages and searches come from `job`, not from `audit_run`.
   *
   * A run is one answer; a job is the work that produced several. The crawl and
   * search ledgers belong to the job because that is the level the budget is
   * enforced at, and reading them off a run would have counted a job's whole
   * crawl once per answer it produced.
   */
  const spend = await d.query<{ pages: string; searches: string }>(
    scope.runIds === null
      ? 'select coalesce(sum(pages_crawled),0)::text as pages, coalesce(sum(searches),0)::text as searches from job'
      : `select coalesce(sum(j.pages_crawled),0)::text as pages, coalesce(sum(j.searches),0)::text as searches
           from job j where exists (select 1 from task t where t.job_id = j.id and t.audit_run_id = any($1::uuid[]))`,
    params,
  );

  /*
   * The median, not the mean.
   *
   * One run that waited forty seconds on a slow host moves a mean of five runs
   * by eight seconds and tells the reader nothing about what a request feels
   * like. Both are reported: the middle, and the worst.
   */
  const latency = await d.query<{ ms: number }>(
    `select extract(epoch from (finished_at - started_at)) * 1000 as ms
       from audit_run
      ${scope.runIds === null ? 'where finished_at is not null' : 'where finished_at is not null and id = any($1::uuid[])'}
      order by ms`,
    params,
  );
  const values = latency.map((l) => Math.round(Number(l.ms))).filter((v) => Number.isFinite(v));
  const median = values.length === 0 ? null : (values[Math.floor((values.length - 1) / 2)] ?? null);

  const ev = await evidenceMetrics(d, scope);

  return {
    runs: n(row?.runs),
    findingsReturned: ev.findings - ev.unsupported,
    unknownFindings: ev.unknown,
    recommendations: ev.recommendations,
    medianLatencyMs: median,
    maxLatencyMs: values.length === 0 ? null : (values[values.length - 1] ?? null),
    costMicros: n(row?.priced) === 0 ? null : n(row?.cost),
    pagesCrawled: n(spend[0]?.pages),
    searches: n(spend[0]?.searches),
  };
}

/** Every metric, for a set of runs or for the whole corpus. */
export async function metricsFor(d: Driver, scope: Partial<Scope> = {}): Promise<RunMetrics> {
  const full: Scope = { runIds: scope.runIds ?? null, pilotId: scope.pilotId ?? null };
  const [discovery, retrieval, entity, evidence, model, product] = await Promise.all([
    discoveryMetrics(d, full),
    retrievalMetrics(d, full),
    entityMetrics(d),
    evidenceMetrics(d, full),
    modelMetrics(d, full),
    productMetrics(d, full),
  ]);
  return { discovery, retrieval, entity, evidence, model, product };
}

/**
 * The runs a pilot's job produced, so a pilot can be measured end to end.
 *
 * Read from each task's OUTPUT, not from `task.audit_run_id`. That column is
 * only set when a task produced exactly one run, and the interesting case is
 * the opposite one: an analyst task auditing three businesses produces three
 * runs, leaves the column null, and a pilot scoped by it reported "0 research
 * runs" next to metrics that had counted all three. `runIdsIn` is what the
 * jobs API already uses, so both read the same thing.
 */
export async function runIdsForPilot(d: Driver, pilotId: string): Promise<string[]> {
  const rows = await d.query<{ output: unknown; audit_run_id: string | null }>(
    `select t.output, t.audit_run_id from task t join pilot p on p.job_id = t.job_id
      where p.id = $1 order by t.ord`,
    [pilotId],
  );
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.audit_run_id !== null) ids.add(r.audit_run_id);
    if (r.output === null) continue;
    const parsed: unknown = typeof r.output === 'string' ? JSON.parse(r.output) : r.output;
    for (const id of runIdsIn(parsed)) ids.add(id);
  }
  return [...ids];
}

export async function metricsForPilot(d: Driver, pilotId: string): Promise<RunMetrics> {
  const runIds = await runIdsForPilot(d, pilotId);
  return metricsFor(d, { pilotId, runIds: runIds.length > 0 ? runIds : null });
}
