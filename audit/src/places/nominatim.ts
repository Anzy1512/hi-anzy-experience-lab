import { config } from '../config.ts';
import { parseUrl } from '../crawl/url.ts';
import type { Availability, SearchOptions } from '../search/types.ts';
import {
  boundingBox,
  haversineKm,
  NoPlaceProvider,
  type Geocode,
  type GeocodeResponse,
  type PlaceArea,
  type PlaceCandidate,
  type PlacePrecision,
  type PlaceProvider,
  type PlaceResponse,
} from './types.ts';

/**
 * NOMINATIM — OPENSTREETMAP'S GAZETTEER, USED WITHIN ITS OWN RULES.
 *
 * ── WHY THIS ONE ────────────────────────────────────────────────────────────
 *
 * It is the only geographic source this service can prove today. It needs no
 * key, no account and no billing relationship, which means the geographic half
 * of the pilot can be RUN rather than described — and layer 6 closed with the
 * map working only against a fixture that published its own coordinates,
 * because nothing real did. Overpass would be the better instrument for
 * "everything of this kind in this box" and was tried first; it answered 504
 * from one endpoint and refused the connection from the other, so it is
 * recorded as unavailable rather than as a dependency that works elsewhere.
 *
 * ── THE RULES, WHICH ARE PART OF THE ADAPTER AND NOT OF THE README ──────────
 *
 * The public instance is donated capacity with a published usage policy: no
 * more than one request per second, and identify yourself. Both are enforced
 * here, in the object, because a limit that lives in a caller's discipline is a
 * limit that is one refactor from being gone. `minGapMs` serialises every
 * request this provider makes through one paced queue, so two concurrent
 * callers cannot together exceed what one was allowed.
 *
 * Bulk work belongs on a self-hosted instance, which is what `NOMINATIM_URL`
 * is for. A bounded pilot asking a handful of questions is within the policy;
 * a monitoring loop would not be, and this service does not have one.
 *
 * ── AND THE TWO READINGS THAT WOULD BE WRONG ────────────────────────────────
 *
 * `importance` is not a confidence. It is roughly how famous a place is, and
 * handing it back as a match score would turn "this is a well-known street"
 * into "we are 40% sure this is your shop". It stays in `raw` and `confidence`
 * stays null, because this provider does not report one.
 *
 * A `website` extratag is not the company's website. It is what a mapper typed,
 * and mappers move on while businesses change hands. It leaves here as
 * `websiteCandidate` and earns no standing until the crawler has fetched it and
 * the entity pipeline has decided, on the page's own evidence, which business
 * it belongs to.
 */

/**
 * Nominatim's own rank scale, read rather than reinterpreted.
 *
 * 30 is a building or a point of interest; 26 is a street; anything lower is an
 * administrative area of some size. The thresholds are Nominatim's, and a rank
 * this table does not recognise becomes UNKNOWN rather than being rounded into
 * the nearest confident-sounding answer.
 */
function precisionOf(placeRank: number | null, addressType: string | null): PlacePrecision {
  if (addressType === 'postcode') return 'POSTAL';
  if (placeRank === null) return 'UNKNOWN';
  if (placeRank >= 30) return 'POINT';
  if (placeRank >= 27) return 'BUILDING';
  if (placeRank === 26) return 'STREET';
  if (placeRank > 0) return 'AREA';
  return 'UNKNOWN';
}

interface NominatimRow {
  place_id?: unknown;
  osm_type?: unknown;
  osm_id?: unknown;
  lat?: unknown;
  lon?: unknown;
  name?: unknown;
  display_name?: unknown;
  category?: unknown;
  type?: unknown;
  addresstype?: unknown;
  place_rank?: unknown;
  importance?: unknown;
  extratags?: unknown;
  address?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** The website a mapper recorded, under any of the keys they use for it. */
function websiteOf(extratags: unknown): string | null {
  if (extratags === null || typeof extratags !== 'object') return null;
  const t = extratags as Record<string, unknown>;
  for (const key of ['website', 'contact:website', 'url', 'website:en']) {
    const raw = str(t[key]);
    if (raw === null) continue;
    /* Mappers write bare hostnames. A URL we cannot parse is discarded rather
       than repaired into something that might resolve somewhere else. */
    const parsed = parseUrl(raw) ?? parseUrl(`https://${raw}`);
    if (parsed !== null) return parsed.toString();
  }
  return null;
}

export interface NominatimOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Minimum gap between requests. The public instance's policy is one second. */
  minGapMs?: number;
  timeoutMs?: number;
}

export class NominatimProvider implements PlaceProvider {
  readonly id = 'nominatim' as const;
  readonly label = 'Nominatim (OpenStreetMap)';
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minGapMs: number;
  private readonly timeoutMs: number;
  private queue: Promise<unknown> = Promise.resolve();
  private lastAt = 0;

  constructor(opts: NominatimOptions = {}) {
    this.base = (opts.baseUrl ?? config.NOMINATIM_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.minGapMs = opts.minGapMs ?? 1100;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  /**
   * One request at a time, no faster than the policy allows.
   *
   * Chained rather than counted: a semaphore of one would let two callers
   * interleave their waits and issue two requests in the same second. The
   * queue makes the gap a property of the provider rather than of the caller.
   */
  private paced<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.minGapMs - (Date.now() - this.lastAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastAt = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async call(
    path: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<{ ok: true; rows: NominatimRow[] } | { ok: false; problem: NonNullable<Availability['problem']> }> {
    const url = new URL(path, `${this.base}/`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    return this.paced(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      signal?.addEventListener('abort', () => controller.abort(), { once: true });
      try {
        const res = await this.fetchImpl(url.toString(), {
          signal: controller.signal,
          headers: { accept: 'application/json', 'user-agent': config.CRAWL_USER_AGENT },
        });
        if (!res.ok) {
          return {
            ok: false as const,
            problem: {
              reason: res.status === 403 || res.status === 429 ? ('rejected' as const) : ('unreachable' as const),
              detail: `${this.base} returned HTTP ${res.status}`,
            },
          };
        }
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('json')) {
          return {
            ok: false as const,
            problem: { reason: 'rejected' as const, detail: `${this.base} returned ${type || 'an unknown type'} rather than JSON` },
          };
        }
        const body: unknown = await res.json();
        return { ok: true as const, rows: Array.isArray(body) ? (body as NominatimRow[]) : [] };
      } catch (e) {
        return {
          ok: false as const,
          problem: controller.signal.aborted
            ? { reason: 'timeout' as const, detail: `${this.base} did not answer in ${this.timeoutMs}ms` }
            : { reason: 'unreachable' as const, detail: e instanceof Error ? e.message : String(e) },
        };
      } finally {
        clearTimeout(timer);
      }
    });
  }

  async available(): Promise<Availability> {
    const res = await this.call('search', { format: 'jsonv2', limit: '1', q: 'Leeds' });
    return res.ok
      ? { ok: true, detail: `${this.base} answered` }
      : { ok: false, detail: res.problem.detail, problem: res.problem };
  }

  /**
   * Businesses matching a term inside an area.
   *
   * The viewbox is a rectangle and the question was a circle, so everything the
   * provider returns is measured against the radius before it is kept. A caller
   * that asked for 2km gets 2km, and the count of what fell outside is the
   * pilot's to report.
   */
  async discover(query: string, area: PlaceArea, opts: SearchOptions = {}): Promise<PlaceResponse> {
    const startedAt = performance.now();
    const box = boundingBox(area);
    const res = await this.call(
      'search',
      {
        format: 'jsonv2',
        addressdetails: '1',
        extratags: '1',
        bounded: '1',
        viewbox: `${box.west},${box.north},${box.east},${box.south}`,
        limit: String(Math.min(opts.limit ?? 20, 50)),
        q: query,
      },
      opts.signal,
    );
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (!res.ok) return { provider: this.id, query, candidates: [], elapsedMs, unavailable: res.problem };

    const discoveredAt = new Date();
    const seen = new Set<string>();
    const candidates: PlaceCandidate[] = [];
    for (const row of res.rows) {
      const lat = num(row.lat);
      const lon = num(row.lon);
      if (lat === null || lon === null) continue;
      if (haversineKm({ latitude: lat, longitude: lon }, area) > area.radiusKm) continue;

      const osmType = str(row.osm_type);
      const osmId = num(row.osm_id);
      const externalId =
        osmType !== null && osmId !== null ? `osm:${osmType}/${osmId}` : `nominatim:place/${num(row.place_id) ?? candidates.length}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);

      const category = str(row.category);
      const type = str(row.type);
      candidates.push({
        provider: this.id,
        externalId,
        query,
        name: str(row.name) ?? null,
        category: category !== null && type !== null ? `${category}/${type}` : (category ?? type),
        latitude: lat,
        longitude: lon,
        precision: precisionOf(num(row.place_rank), str(row.addresstype)),
        websiteCandidate: websiteOf(row.extratags),
        address: str(row.display_name),
        /* This provider reports no match confidence. See the header. */
        confidence: null,
        raw: {
          place_id: num(row.place_id),
          place_rank: num(row.place_rank),
          importance: num(row.importance),
          addresstype: str(row.addresstype),
          address: row.address ?? null,
        },
        discoveredAt,
      });
    }
    return { provider: this.id, query, candidates, elapsedMs };
  }

  /** One address to one point. No match is an answer, not a failure. */
  async geocode(address: string, opts: SearchOptions = {}): Promise<GeocodeResponse> {
    const startedAt = performance.now();
    const res = await this.call(
      'search',
      { format: 'jsonv2', addressdetails: '1', limit: '1', q: address },
      opts.signal,
    );
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (!res.ok) return { provider: this.id, query: address, geocode: null, elapsedMs, unavailable: res.problem };

    const row = res.rows[0];
    if (row === undefined) return { provider: this.id, query: address, geocode: null, elapsedMs };
    const lat = num(row.lat);
    const lon = num(row.lon);
    if (lat === null || lon === null) return { provider: this.id, query: address, geocode: null, elapsedMs };

    const osmType = str(row.osm_type);
    const osmId = num(row.osm_id);
    const geocode: Geocode = {
      provider: this.id,
      query: address,
      externalId: osmType !== null && osmId !== null ? `osm:${osmType}/${osmId}` : null,
      latitude: lat,
      longitude: lon,
      precision: precisionOf(num(row.place_rank), str(row.addresstype)),
      matchedAddress: str(row.display_name),
      confidence: null,
      raw: { place_rank: num(row.place_rank), importance: num(row.importance), addresstype: str(row.addresstype) },
      resolvedAt: new Date(),
    };
    return { provider: this.id, query: address, geocode, elapsedMs };
  }
}

/** The configured geographic provider, or the one that says there is none. */
export function createPlaceProvider(opts: NominatimOptions = {}): PlaceProvider {
  return config.PLACE_PROVIDER === 'nominatim' ? new NominatimProvider(opts) : new NoPlaceProvider();
}
