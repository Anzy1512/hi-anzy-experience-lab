/**
 * THE ENGINE, AS SURVEY SPEAKS TO IT.
 *
 * SURVEY is the Lab's front end for the Commercial Intelligence Engine — a
 * separate program (`comintel serve`) that runs on this machine and asks public
 * sources for businesses. This file is the whole of the Lab's network surface:
 * one base address, JSON in and out, every request cancellable, and every
 * failure returned as a value the mode can print rather than thrown into the
 * app (an unhandled rejection resets the Lab).
 *
 * The address is `/engine` — Vite forwards it to the engine in development and
 * preview (see vite.config.ts) — or `VITE_ENGINE_URL` when a build names one.
 * Nothing here is stored, and nothing is sent anywhere but the engine.
 */

export const ENGINE_BASE: string =
  (import.meta.env.VITE_ENGINE_URL as string | undefined)?.replace(/\/+$/, '') || '/engine';

/* ---- what the engine answers with (only the parts SURVEY reads) ---------- */

export interface EngineHealth {
  status: string;
  version: string;
  local_knowledge: boolean;
  notes: string[];
}

export interface EngineSource {
  id: string;
  name: string;
  capabilities: string[];
  problem: string | null;
  available: boolean;
  licence: string | null;
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

export type SearchState = 'queued' | 'running' | 'done' | 'failed';

export interface SearchStatus {
  id: string;
  query: string | null;
  status: SearchState;
  stage: string | null;
  created_at: string;
  finished_at: string | null;
  error: string | null;
  counts: Partial<Record<'true' | 'unknown' | 'false', number>>;
  report?: SurveyReport | null;
  area?: { description: string; geojson: GeoJSONGeometry | null } | null;
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
}

export type Verdict = 'matched' | 'undetermined';

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
    const said =
      typeof detail === 'string'
        ? detail
        : typeof (detail as { error?: unknown } | undefined)?.error === 'string'
          ? String((detail as { error: string }).error)
          : `HTTP ${response.status}`;
    return { ok: false, problem: said, status: response.status };
  }
  if (body === null) return { ok: false, problem: 'the engine answered with something that is not JSON' };
  return { ok: true, value: body as T };
}

export const engine = {
  health: (signal: AbortSignal) => call<EngineHealth>('/api/health', signal),
  sources: (signal: AbortSignal) => call<EngineSource[]>('/api/sources', signal),
  parse: (q: string, signal: AbortSignal) =>
    call<ParsedQuestion>(`/api/parse?q=${encodeURIComponent(q)}`, signal),
  start: (
    body: { query: string; depth?: string; checks?: number; fresh?: boolean },
    signal: AbortSignal,
  ) => call<SearchStatus>('/api/searches', signal, { method: 'POST', body: JSON.stringify(body) }),
  status: (id: string, signal: AbortSignal) =>
    call<SearchStatus>(`/api/searches/${encodeURIComponent(id)}`, signal),
  results: (id: string, verdict: Verdict, offset: number, limit: number, signal: AbortSignal) =>
    call<{ items: ResultItem[] }>(
      `/api/searches/${encodeURIComponent(id)}/results?verdict=${verdict}&offset=${offset}&limit=${limit}`,
      signal,
    ),
};

/** A download the engine builds itself: the dataset, whole, in its own formats. */
export function exportUrl(id: string, format: 'csv' | 'xlsx' | 'geojson' | 'json'): string {
  return `${ENGINE_BASE}/api/searches/${encodeURIComponent(id)}/export?format=${format}`;
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
