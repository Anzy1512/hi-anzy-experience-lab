/**
 * THE ENGINE, AS THE INTELLIGENCE DESKS SPEAK TO IT.
 *
 * INTELLIGENCE is the Lab's front end for the Commercial Intelligence Engine — a
 * separate program (`comintel serve`) that runs on this machine and asks public
 * sources for businesses, brands and places. This file is the whole of the
 * Lab's network surface: one base address, JSON in and out, every request
 * cancellable, and every failure returned as a value a desk can print rather
 * than thrown into the app (an unhandled rejection resets the Lab).
 *
 * The address is `/engine` — Vite forwards it to the engine in development and
 * preview (see vite.config.ts) — or `VITE_ENGINE_URL` when a build names one.
 * Nothing here is stored, and nothing is sent anywhere but the engine.
 */

export const ENGINE_BASE: string =
  (import.meta.env.VITE_ENGINE_URL as string | undefined)?.replace(/\/+$/, '') || '/engine';

/* ---- what the engine answers with (only the parts the desks read) -------- */

export interface EngineHealth {
  status: string;
  version: string;
  local_knowledge: boolean;
  notes: string[];
}

export interface EngineSource {
  id: string;
  name: string;
  /* absent from an engine older than the research tools */
  role?: 'discovery' | 'closer look' | 'research';
  capabilities: string[];
  problem: string | null;
  available: boolean;
  usable?: boolean;
  registry?: string;
  status?: string;
  licence: string | null;
  attribution?: string | null;
  coverage_note?: string | null;
}

export interface ParsedQuestion {
  specification: Record<string, unknown> | null;
  report: { assumptions?: string[]; warnings?: string[] };
  error: string | null;
}

export interface ReportSource {
  source_id: string;
  name: string;
  status: 'answered' | 'failed' | 'skipped' | 'not_selected';
  reason: string | null;
  in_area_records: number;
  notes?: string[];
  /* questions a local extract answered instead of the live service, and which (D-055) */
  local_answers?: number;
  local_from?: string[];
}

export interface SurveyReport {
  discovery_confidence: string;
  confidence_reasons: string[];
  statements: string[];
  limitations: string[];
  results: { matched: number; undetermined: number; excluded: number };
  undetermined_by_field: { field: string; entities: number; reason: string }[];
  sources: ReportSource[];
}

/** queued · running · done · failed while in memory; saved · unfinished from local knowledge */
export type SearchState = 'queued' | 'running' | 'done' | 'failed' | 'saved' | 'unfinished';

export interface SearchStatus {
  id: string;
  query: string | null;
  status: SearchState;
  stage?: string | null;
  created_at: string;
  finished_at: string | null;
  error: string | null;
  counts: Partial<Record<'true' | 'unknown' | 'false', number>>;
  report?: SurveyReport | null;
  area?: { description: string | null; geojson: GeoJSONGeometry | null } | null;
  attribution?: string[];
}

export interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}

export interface FieldValue {
  value: unknown;
  confidence?: number;
  sources?: string[];
}

/** One condition of the question, as the engine decided it for one business. */
export interface ConditionOutcome {
  field: string;
  op: string;
  result: 'true' | 'unknown' | 'false';
  values: unknown[];
  reason: string | null;
}

export interface ResultItem {
  id: string;
  name: string | null;
  location: { lat: number; lon: number } | null;
  distance_m: number | null;
  verdict: 'true' | 'unknown' | 'false';
  fields: Record<string, { values?: FieldValue[] }>;
  records: { source: string; record: string; url?: string }[];
  sources: string[];
  undetermined_fields?: string[];
  conditions?: ConditionOutcome[];
  /* what this search established about it — its brand, which of the brand's places it is */
  search?: Record<string, { state: string; values?: unknown[] }>;
}

export type Verdict = 'matched' | 'undetermined' | 'excluded';

/** What a search's businesses share: a brand, an operator, a site, a phone … */
export interface Graph {
  nodes: (
    | { id: string; type: 'business'; label: string; verdict: string | null; category: string }
    | { id: string; type: 'shared'; kind: string; label: string; businesses: number }
  )[];
  links: { business: string; shared: string; relation: string; sources: string[] }[];
  summary: { businesses: number; linked: number; shared: Record<string, number>; shared_only: boolean };
}

export interface ReviewRecord {
  source: string;
  record: string;
  name: string | null;
  business: string | null;
}

export interface ReviewPair {
  left: ReviewRecord;
  right: ReviewRecord;
  score: number;
  evidence: string[];
}

export type Judgement = 'positive' | 'negative' | 'unsure';

export interface Brand {
  id: string;
  name: string;
  kind: string;
  category: string;
  wikidata: string | null;
  names: string[];
  description: string | null;
  trades_in: string[];
  excludes: string[];
  websites: string[];
  locators: string[];
  social: Record<string, string>;
}

export interface BrandReport {
  text: string;
  countries: string[];
  family: string | null;
  atp_run: string | null;
  atp_problem: string | null;
  brands: (Brand & { spiders: { spider: string; places: number }[]; osm_tagged: number | null })[];
  source: string;
}

export interface Area {
  description: string;
  kind: string;
  area_km2: number;
  bbox: [number, number, number, number];
  center: { lat: number; lon: number };
  osm_area: string | null;
  place: { display_name: string; source_ref: string; place_type: string } | null;
  geojson: GeoJSONGeometry;
}

export interface AreaReport {
  place: string;
  found: boolean;
  area: Area | null;
  asked_at_once: boolean;
  cells: number | null;
  cell_m: number | null;
  also: { display_name: string; place_type: string; source_ref: string }[];
  assumptions: string[];
  warnings: string[];
  error: string | null;
}

export interface StoreRecord {
  source: string;
  record: string;
  location: { lat: number; lon: number } | null;
  url: string | null;
  retrieved_at: string;
  values: Record<string, unknown>;
}

export interface LocatorResult {
  brand_text: string;
  brands: Brand[];
  area: Area | null;
  inside: StoreRecord[];
  outside: number;
  unplaced: number;
  requests: number;
  notes: string[];
  rules: string;
}

/** A legal entity as GLEIF records it (CC0). A name match is not ownership. */
export interface LegalEntity {
  lei: string;
  name: string;
  other_names: string[];
  jurisdiction: string | null;
  city: string | null;
  country: string | null;
  status: string | null;
  category: string | null;
  legal_form: string | null;
  registration: string | null;
  registered_at: string | null;
  url: string;
}

export interface LegalReport {
  name: string;
  countries: string[];
  total: number;
  entities: LegalEntity[];
  source: string;
}

export interface Parents {
  lei: string;
  direct: LegalEntity | null;
  ultimate: LegalEntity | null;
  notes: string[];
}

export interface NewsArticle {
  title: string;
  url: string;
  domain: string | null;
  language: string | null;
  country: string | null;
  seen: string | null;
}

export interface NewsReport {
  query: string;
  months: number;
  articles: NewsArticle[];
  source: string;
}

/** What a domain's public records say, section by section; a section that could not be read says why. */
export interface DomainReading {
  domain: string;
  registration: {
    registered: string | null;
    expires: string | null;
    changed: string | null;
    registrar: string | null;
    status: string[];
    nameservers: string[];
    server: string | null;
    problem: string | null;
  };
  dns: {
    mail_hosts: string[];
    mail_provider: string | null;
    senders: string[];
    dmarc: string | null;
    verifications: string[];
    problem: string | null;
  };
  certificates: {
    issued: number;
    first_seen: string | null;
    latest_expiry: string | null;
    hostnames: string[];
    other_names: number;
    problem: string | null;
  };
  archive: {
    first: string | null;
    last: string | null;
    first_url: string | null;
    last_url: string | null;
    problem: string | null;
  };
  sources: string[];
}

export interface SiteProfile {
  url: string;
  final_url: string;
  status: number;
  from_cache: boolean;
  title: string;
  description: string;
  parked: string[];
  platforms: string[];
  technologies: { name: string; slug: string; categories: string[]; confidence: number; evidence: string[] }[];
  trackers: { id: string; name: string; kind: string; value: string }[];
  payments: string[];
  cart_signals: string[];
  product_offers: number;
  product_names: string[];
  phones: string[];
  emails: string[];
  profiles: { network: string; url: string }[];
  listings: { platform: string; url: string }[];
  amenities: { field: string; value: unknown; read_from: string }[];
}

export interface SiteReading {
  url: string;
  profile: SiteProfile | null;
  failure: { kind: string; detail: string; status: number | null } | null;
}

export interface DatasetQuestion {
  question: string;
  search_id?: string;
  area?: string | null;
  matched?: number;
  undetermined?: number;
  excluded?: number;
  confidence?: string | null;
  new?: number;
  already_found?: number;
  error: string | null;
}

export interface DatasetSummary {
  questions: DatasetQuestion[];
  search_ids: string[];
  rows: number;
  matching: number;
  undetermined: number;
  located: number;
  attribution: string[];
  failed: boolean;
}

/** One business in a dataset, as the engine's export columns name it. */
export type DatasetRow = Record<string, string | number | boolean | null>;

export type TaskState = 'queued' | 'running' | 'done' | 'failed';

export interface Task<R> {
  id: string;
  kind: string;
  title: string;
  status: TaskState;
  progress: string[];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  result?: R | null;
}

export interface Knowledge {
  on: boolean;
  reason?: string;
  businesses?: number;
  merged_businesses?: number;
  records?: number;
  record_versions?: number;
  observations?: number;
  searches?: number;
  unfinished_searches?: number;
  source_runs?: number;
  judgements?: number;
  oldest_search?: string | null;
  newest_search?: string | null;
}

export interface RegistrySummary {
  tools: number;
  by_status: Record<string, number>;
  reviewed_individually: number;
  installed: string[];
  coverage: { capability: string; tools: { id: string; name: string; status: string; installed: boolean }[] }[];
  restricted: string[];
}

export interface RegistryTool {
  id: string;
  name: string;
  url: string;
  status: string;
  reason: string;
  capabilities: string[];
  sections: string[];
  licence: string | null;
  pricing: string;
  api_key_required: boolean;
  access: string;
  relevance: string;
  privacy_risk: string;
  installed: boolean;
  last_reviewed: string;
}

/** One bulk dataset kept on the engine's machine (D-055): an OpenStreetMap extract, an Overture region. */
export interface ExtractDataset {
  id: string;
  source_id: string;
  title: string;
  origin: string;
  snapshot: string;
  data_as_of: string | null;
  status: 'loading' | 'ready';
  started_at: string;
  loaded_at: string | null;
  places: number;
  regions: number;
  bytes_read: number;
  licence: string | null;
  attribution: string | null;
  notes: string[];
  /** ready and young enough: searches inside it are answered by it */
  answers: boolean;
  box: [number, number, number, number];
}

export interface ExtractAvailable {
  kind: 'osm' | 'overture';
  key: string;
  dataset_id: string;
  title: string;
  file: string | null;
  file_bytes: number | null;
}

export interface Extracts {
  datasets: ExtractDataset[];
  available: ExtractAvailable[];
  totals: {
    sources: Record<string, { places: number; businesses: number; branded: number; filed: number }>;
    /** regions held, by the level places are filed under (in India: states, districts) */
    regions: { region1: number; region2: number };
  };
  loads: Task<unknown>[];
}

export interface LoadedExtract {
  dataset_id: string;
  title: string;
  source_id: string;
  places: number;
  regions: number;
  bytes_read: number;
  seconds: number;
  data_as_of: string | null;
  notes: string[];
}

export interface AtlasRow {
  region_id: string | null;
  name: string | null;
  parent: string | null;
  counts: Record<string, number>;
  apart: Record<string, number>;
}

/** Counts by region from the local extracts: per source, never added together. */
export interface Atlas {
  kind: 'brand' | 'category';
  asked: string;
  subject: string[];
  level: 1 | 2;
  within: string | null;
  wikidata: string[];
  categories: string[];
  totals: Record<string, number>;
  apart: Record<string, Record<string, number>>;
  rows: AtlasRow[];
  notes: string[];
  datasets: ExtractDataset[];
}

export interface Region {
  id: string;
  name: string;
  name_en: string | null;
  wikidata: string | null;
  parent_id: string | null;
}

/* ---- calls ---------------------------------------------------------------- */

/** A call's outcome: the answer, or a sentence saying why there is none. */
export type Answer<T> = { ok: true; value: T } | { ok: false; problem: string; status?: number };

async function call<T>(path: string, signal: AbortSignal, init?: RequestInit): Promise<Answer<T>> {
  let response: Response;
  try {
    response = await fetch(`${ENGINE_BASE}${path}`, {
      ...init,
      signal,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (err) {
    if (signal.aborted) return { ok: false, problem: 'cancelled' };
    return { ok: false, problem: `the engine could not be reached (${(err as Error).message})` };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    // the forwarder answers 502–504 itself when nothing is listening behind it
    if (body === null && response.status >= 502 && response.status <= 504) {
      return { ok: false, problem: 'no answer — the engine is not running there', status: response.status };
    }
    const detail = (body as { detail?: unknown } | null)?.detail;
    // an engine older than this page does not have the route at all
    if (response.status === 404 && detail === 'Not Found') {
      return { ok: false, problem: 'this engine does not have that tool yet — update it and restart it', status: 404 };
    }
    const said =
      typeof detail === 'string'
        ? detail
        : typeof (detail as { error?: unknown } | undefined)?.error === 'string'
          ? String((detail as { error: string }).error)
          : Array.isArray(detail)
            ? 'the engine did not accept that request'
            : `HTTP ${response.status}`;
    return { ok: false, problem: said, status: response.status };
  }
  if (body === null) return { ok: false, problem: 'the engine answered with something that is not JSON' };
  return { ok: true, value: body as T };
}

const q = encodeURIComponent;

function countryParams(countries: string[] | undefined): string {
  return (countries ?? []).map((c) => `&country=${q(c)}`).join('');
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const engine = {
  health: (signal: AbortSignal) => call<EngineHealth>('/api/health', signal),
  sources: (signal: AbortSignal) => call<EngineSource[]>('/api/sources', signal),
  parse: (text: string, signal: AbortSignal) => call<ParsedQuestion>(`/api/parse?q=${q(text)}`, signal),

  /* searches */
  start: (body: { query: string; depth?: string; checks?: number; fresh?: boolean }, signal: AbortSignal) =>
    call<SearchStatus>('/api/searches', signal, post(body)),
  status: (id: string, signal: AbortSignal) => call<SearchStatus>(`/api/searches/${q(id)}`, signal),
  results: (id: string, verdict: Verdict, offset: number, limit: number, signal: AbortSignal) =>
    call<{ items: ResultItem[] }>(
      `/api/searches/${q(id)}/results?verdict=${verdict}&offset=${offset}&limit=${limit}`,
      signal,
    ),
  searches: (limit: number, signal: AbortSignal) => call<SearchStatus[]>(`/api/searches?limit=${limit}`, signal),
  graph: (id: string, signal: AbortSignal) => call<Graph>(`/api/searches/${q(id)}/graph`, signal),
  review: (id: string, signal: AbortSignal) =>
    call<{ pairs: ReviewPair[]; judged: number; can_judge: boolean }>(`/api/searches/${q(id)}/review`, signal),
  judge: (
    body: {
      left: { source: string; record: string };
      right: { source: string; record: string };
      judgement: Judgement;
      reason: string;
    },
    signal: AbortSignal,
  ) => call<Record<string, unknown>>('/api/judgements', signal, post(body)),

  /* research */
  brand: (name: string, countries: string[] | undefined, offline: boolean, signal: AbortSignal) =>
    call<BrandReport>(`/api/research/brand?name=${q(name)}${countryParams(countries)}&offline=${offline}`, signal),
  area: (place: string, countries: string[] | undefined, signal: AbortSignal) =>
    call<AreaReport>(`/api/research/area?place=${q(place)}${countryParams(countries)}`, signal),
  locator: (body: { brand: string; place?: string; country?: string[]; depth?: string }, signal: AbortSignal) =>
    call<Task<LocatorResult>>('/api/research/locator', signal, post(body)),
  legal: (name: string, countries: string[] | undefined, signal: AbortSignal) =>
    call<LegalReport>(`/api/research/legal?name=${q(name)}${countryParams(countries)}`, signal),
  parents: (lei: string, signal: AbortSignal) => call<Parents>(`/api/research/legal/${q(lei)}/parents`, signal),
  news: (text: string, months: number, signal: AbortSignal) =>
    call<NewsReport>(`/api/research/news?q=${q(text)}&months=${months}`, signal),
  domain: (domain: string, signal: AbortSignal) =>
    call<Task<DomainReading>>('/api/research/domain', signal, post({ domain })),
  site: (url: string, signal: AbortSignal) => call<SiteReading>(`/api/site?url=${q(url)}`, signal),
  task: <R>(id: string, signal: AbortSignal) => call<Task<R>>(`/api/tasks/${q(id)}`, signal),

  /* datasets */
  dataset: (
    body: { questions: string[]; matched_only?: boolean; depth?: string; checks?: number; fresh?: boolean },
    signal: AbortSignal,
  ) => call<Task<DatasetSummary>>('/api/datasets', signal, post(body)),
  datasetRows: (id: string, offset: number, limit: number, signal: AbortSignal) =>
    call<{ total: number; offset: number; items: DatasetRow[] }>(
      `/api/datasets/${q(id)}/rows?offset=${offset}&limit=${limit}`,
      signal,
    ),

  /* the local extracts, and counting from them */
  extracts: (signal: AbortSignal) => call<Extracts>('/api/extracts', signal),
  extractsTop: (by: 'categories' | 'brand', limit: number, signal: AbortSignal) =>
    call<{ value: string; places: number }[]>(`/api/extracts/top?by=${by}&limit=${limit}`, signal),
  loadExtract: (body: { kind: 'osm' | 'overture' | 'all'; key?: string; download?: boolean }, signal: AbortSignal) =>
    call<Task<{ loaded: LoadedExtract[] }>>('/api/extracts/load', signal, post(body)),
  atlas: (
    ask: { brand?: string; category?: string; level: 1 | 2; within?: string | null },
    countries: string[] | undefined,
    signal: AbortSignal,
  ) => {
    const subject = ask.brand ? `brand=${q(ask.brand)}` : `category=${q(ask.category ?? '')}`;
    const within = ask.within ? `&within=${q(ask.within)}` : '';
    return call<Atlas>(`/api/atlas?${subject}&level=${ask.level}${within}${countryParams(countries)}`, signal);
  },
  regions: (level: 1 | 2, parent: string | null, signal: AbortSignal) =>
    call<Region[]>(`/api/atlas/regions?level=${level}${parent ? `&parent=${q(parent)}` : ''}`, signal),

  /* what the engine is, and holds */
  knowledge: (signal: AbortSignal) => call<Knowledge>('/api/knowledge', signal),
  registry: (signal: AbortSignal) => call<RegistrySummary>('/api/registry', signal),
  registryTools: (
    filter: { status?: string; capability?: string; q?: string; offset?: number; limit?: number },
    signal: AbortSignal,
  ) => {
    const params = Object.entries(filter)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${q(String(v))}`)
      .join('&');
    return call<{ total: number; offset: number; items: RegistryTool[] }>(`/api/registry/tools?${params}`, signal);
  },
};

export type ExportFormat = 'csv' | 'xlsx' | 'geojson' | 'json';
export const EXPORT_FORMATS: ExportFormat[] = ['csv', 'xlsx', 'geojson', 'json'];

/** A download the engine builds itself: a search's dataset, whole, in its own formats. */
export function exportUrl(id: string, format: ExportFormat): string {
  return `${ENGINE_BASE}/api/searches/${q(id)}/export?format=${format}`;
}

/** The same, for a dataset built from many questions. */
export function datasetExportUrl(id: string, format: ExportFormat): string {
  return `${ENGINE_BASE}/api/datasets/${q(id)}/export?format=${format}`;
}

/* ---- reading a result ----------------------------------------------------- */

export function values(item: ResultItem, path: string): string[] {
  return (item.fields[path]?.values ?? [])
    .map((v) => v.value)
    .filter((v): v is string | number | boolean => v !== null && v !== undefined)
    .map(String);
}

/** The stages a search goes through, in the order the engine reports them. */
export const STAGES = [
  'area',
  'plan',
  'route',
  'discovery',
  'resolution',
  'knowledge',
  'evaluate',
  'enrichment',
  'report',
  'save',
] as const;

/** The wait between two looks at something running, ended early by `signal`. */
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      window.clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const t = window.setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}
