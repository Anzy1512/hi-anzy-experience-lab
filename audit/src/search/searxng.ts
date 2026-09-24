import { config } from '../config.ts';
import { normaliseForIdentity } from '../crawl/url.ts';
import {
  unavailableResponse,
  type Availability,
  type Discovery,
  type SearchOptions,
  type SearchProvider,
  type SearchResponse,
} from './types.ts';

/**
 * SearXNG — the default discovery provider.
 *
 * A metasearch front end that queries other engines and returns the union. It
 * is the right default here for reasons that are not about quality: it is
 * self-hosted, so discovery costs nothing per query and no third party
 * receives a log of which companies are being investigated. For an OSINT tool
 * that second property is not a detail.
 *
 * ── THE ONE THING THAT ALWAYS GOES WRONG ────────────────────────────────────
 *
 * Most SearXNG instances ship with the JSON format DISABLED, and a JSON
 * request against one returns an HTML page with HTTP 200. Parsed naively that
 * is "zero results" — a silent, permanent, entirely wrong answer that looks
 * like a quiet web. So a non-JSON 200 is reported as `rejected` with the
 * setting that fixes it, rather than returned as an empty list.
 *
 * Add to the instance's `settings.yml`:
 *
 *     search:
 *       formats:
 *         - html
 *         - json
 */

interface SearxResult {
  url?: unknown;
  title?: unknown;
  content?: unknown;
  engine?: unknown;
  engines?: unknown;
  category?: unknown;
  score?: unknown;
  publishedDate?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * A date only when the provider genuinely reported one.
 *
 * `null` means "this provider did not say". Defaulting to now, or to the
 * epoch, would turn an absence into a claim, and anything that later sorts by
 * recency would act on it.
 */
function asDate(v: unknown): Date | null {
  const s = asString(v);
  if (s === null) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class SearxngProvider implements SearchProvider {
  readonly id = 'searxng' as const;
  readonly label = 'SearXNG';
  private readonly base: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string | undefined = config.SEARXNG_URL, fetchImpl: typeof fetch = fetch) {
    this.base = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  async available(): Promise<Availability> {
    if (this.base === undefined) {
      return {
        ok: false,
        detail: 'SEARXNG_URL is not set',
        problem: { reason: 'not_configured', detail: 'Set SEARXNG_URL to a SearXNG instance.' },
      };
    }
    const probe = await this.search('hi anzy availability probe', { limit: 1 });
    return probe.unavailable === undefined
      ? { ok: true, detail: `${this.base} answered in ${probe.elapsedMs}ms` }
      : { ok: false, detail: probe.unavailable.detail, problem: probe.unavailable };
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const startedAt = performance.now();
    if (this.base === undefined) {
      return unavailableResponse(this.id, query, {
        reason: 'not_configured',
        detail: 'SEARXNG_URL is not set',
      });
    }

    const issued = opts.site ? `site:${opts.site} ${query}` : query;
    const url = new URL('/search', this.base);
    url.searchParams.set('q', issued);
    url.searchParams.set('format', 'json');
    if (opts.lang) url.searchParams.set('language', opts.lang);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const res = await this.fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': config.CRAWL_USER_AGENT },
      });
      const elapsedMs = Math.round(performance.now() - startedAt);

      if (!res.ok) {
        return unavailableResponse(
          this.id,
          issued,
          { reason: 'rejected', detail: `SearXNG returned HTTP ${res.status}` },
          elapsedMs,
        );
      }

      const type = res.headers.get('content-type') ?? '';
      const text = await res.text();
      if (!type.includes('json')) {
        return unavailableResponse(
          this.id,
          issued,
          {
            reason: 'rejected',
            detail:
              `SearXNG returned ${type || 'an unknown content type'} rather than JSON. ` +
              'The instance almost certainly has the JSON format disabled: add `json` under `search.formats` in settings.yml.',
          },
          elapsedMs,
        );
      }

      let parsed: { results?: unknown };
      try {
        parsed = JSON.parse(text) as { results?: unknown };
      } catch {
        return unavailableResponse(
          this.id,
          issued,
          { reason: 'rejected', detail: 'SearXNG returned a body that is not valid JSON' },
          elapsedMs,
        );
      }

      const raw = Array.isArray(parsed.results) ? (parsed.results as SearxResult[]) : [];
      const limit = opts.limit ?? 10;
      const discoveredAt = new Date();
      const seen = new Set<string>();
      const results: Discovery[] = [];

      for (const r of raw) {
        if (results.length >= limit) break;
        const href = asString(r.url);
        if (href === null) continue;
        /* One engine's result appearing under three engines is one URL. */
        const identity = normaliseForIdentity(href);
        if (identity === null || seen.has(identity)) continue;
        seen.add(identity);

        results.push({
          provider: this.id,
          query: issued,
          url: href,
          canonicalUrl: null,
          title: asString(r.title),
          snippet: asString(r.content),
          rank: results.length + 1,
          publishedAt: asDate(r.publishedDate),
          discoveredAt,
          providerMetadata: {
            engine: asString(r.engine),
            engines: Array.isArray(r.engines) ? r.engines : undefined,
            category: asString(r.category),
            score: typeof r.score === 'number' ? r.score : undefined,
          },
        });
      }

      return { provider: this.id, query: issued, results, elapsedMs };
    } catch (e) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const aborted = controller.signal.aborted;
      return unavailableResponse(
        this.id,
        issued,
        aborted
          ? { reason: 'timeout', detail: 'SearXNG did not answer in time' }
          : { reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) },
        elapsedMs,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
