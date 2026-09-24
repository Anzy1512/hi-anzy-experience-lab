import { config } from '../config.ts';
import { normaliseForIdentity, urlFacts } from '../crawl/url.ts';
import {
  unavailableResponse,
  type Availability,
  type Discovery,
  type ProviderId,
  type SearchOptions,
  type SearchProvider,
  type SearchResponse,
} from './types.ts';
import { SearxngProvider } from './searxng.ts';

/**
 * THE OTHER PROVIDERS, AND THE REGISTRY THAT MAKES THEM INTERCHANGEABLE.
 *
 * Brave and Tavily are here now rather than later for one reason: an
 * abstraction validated against a single implementation is a guess. Writing
 * three against the same contract is what proves the contract holds, and all
 * three are plain HTTP — no SDK, no dependency, about sixty lines each. Tavily
 * being "optional, not a core dependency" is satisfied by it costing nothing
 * to have present and doing nothing until a key exists.
 *
 * `direct` is a provider too, and that is the design decision worth noticing.
 * A directly supplied URL could have been a special case threaded through the
 * pipeline beside the search path; making it a provider means the pipeline has
 * exactly one input shape, and "search unavailable but direct URLs still work"
 * stops being a code path that has to be maintained and becomes the ordinary
 * behaviour of a registry with one provider in it.
 */

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
function asDate(v: unknown): Date | null {
  const s = asString(v);
  if (s === null) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* -------------------------------------------------------------------------- */
/* BRAVE                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Brave Search API — the independent index.
 *
 * Worth having alongside SearXNG precisely because it is not a metasearch: it
 * is Brave's own crawl, so agreement between the two is weak evidence that a
 * URL is real rather than two views of the same upstream engine.
 */
export class BraveProvider implements SearchProvider {
  readonly id = 'brave' as const;
  readonly label = 'Brave Search';
  private readonly key: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(key: string | undefined = config.SEARCH_API_KEY, fetchImpl: typeof fetch = fetch) {
    this.key = key;
    this.fetchImpl = fetchImpl;
  }

  async available(): Promise<Availability> {
    if (this.key === undefined) {
      return {
        ok: false,
        detail: 'no API key',
        problem: { reason: 'not_configured', detail: 'Set SEARCH_API_KEY to a Brave subscription token.' },
      };
    }
    const probe = await this.search('availability probe', { limit: 1 });
    return probe.unavailable === undefined
      ? { ok: true, detail: `answered in ${probe.elapsedMs}ms` }
      : { ok: false, detail: probe.unavailable.detail, problem: probe.unavailable };
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const startedAt = performance.now();
    if (this.key === undefined) {
      return unavailableResponse(this.id, query, { reason: 'not_configured', detail: 'SEARCH_API_KEY is not set' });
    }
    const issued = opts.site ? `site:${opts.site} ${query}` : query;
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', issued);
    url.searchParams.set('count', String(Math.min(opts.limit ?? 10, 20)));
    if (opts.lang) url.searchParams.set('search_lang', opts.lang);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const res = await this.fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { accept: 'application/json', 'x-subscription-token': this.key },
      });
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (!res.ok) {
        return unavailableResponse(
          this.id,
          issued,
          {
            reason: res.status === 401 || res.status === 403 ? 'rejected' : 'unreachable',
            detail: `Brave returned HTTP ${res.status}`,
          },
          elapsedMs,
        );
      }
      const body = (await res.json()) as { web?: { results?: unknown } };
      const raw = Array.isArray(body.web?.results) ? (body.web.results as Record<string, unknown>[]) : [];
      const discoveredAt = new Date();
      const seen = new Set<string>();
      const results: Discovery[] = [];
      for (const r of raw) {
        const href = asString(r.url);
        if (href === null) continue;
        const identity = normaliseForIdentity(href);
        if (identity === null || seen.has(identity)) continue;
        seen.add(identity);
        results.push({
          provider: this.id,
          query: issued,
          url: href,
          canonicalUrl: null,
          title: asString(r.title),
          snippet: asString(r.description),
          rank: results.length + 1,
          publishedAt: asDate(r.page_age ?? r.age),
          discoveredAt,
          providerMetadata: { profile: r.profile, language: r.language, family_friendly: r.family_friendly },
        });
      }
      return { provider: this.id, query: issued, results, elapsedMs };
    } catch (e) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      return unavailableResponse(
        this.id,
        issued,
        controller.signal.aborted
          ? { reason: 'timeout', detail: 'Brave did not answer in time' }
          : { reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) },
        elapsedMs,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* TAVILY                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Tavily — optional, and deliberately used for nothing special.
 *
 * It returns cleaned page content alongside each result, which is its selling
 * point and which this service ignores: content that arrives with a search
 * result is still the provider's rendering of a page, not the page, and
 * accepting it would put a second, unverifiable path into the corpus that
 * bypasses every guard in the crawler. It discovers URLs like the others do.
 */
export class TavilyProvider implements SearchProvider {
  readonly id = 'tavily' as const;
  readonly label = 'Tavily';
  private readonly key: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(key: string | undefined = config.SEARCH_API_KEY, fetchImpl: typeof fetch = fetch) {
    this.key = key;
    this.fetchImpl = fetchImpl;
  }

  async available(): Promise<Availability> {
    if (this.key === undefined) {
      return {
        ok: false,
        detail: 'no API key',
        problem: { reason: 'not_configured', detail: 'Set SEARCH_API_KEY to a Tavily key.' },
      };
    }
    const probe = await this.search('availability probe', { limit: 1 });
    return probe.unavailable === undefined
      ? { ok: true, detail: `answered in ${probe.elapsedMs}ms` }
      : { ok: false, detail: probe.unavailable.detail, problem: probe.unavailable };
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const startedAt = performance.now();
    if (this.key === undefined) {
      return unavailableResponse(this.id, query, { reason: 'not_configured', detail: 'SEARCH_API_KEY is not set' });
    }
    const issued = opts.site ? `site:${opts.site} ${query}` : query;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const res = await this.fetchImpl('https://api.tavily.com/search', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          api_key: this.key,
          query: issued,
          max_results: opts.limit ?? 10,
          /* Explicitly off. See the note above: its content is not evidence. */
          include_raw_content: false,
          include_answer: false,
        }),
      });
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (!res.ok) {
        return unavailableResponse(
          this.id,
          issued,
          {
            reason: res.status === 401 || res.status === 403 ? 'rejected' : 'unreachable',
            detail: `Tavily returned HTTP ${res.status}`,
          },
          elapsedMs,
        );
      }
      const body = (await res.json()) as { results?: unknown };
      const raw = Array.isArray(body.results) ? (body.results as Record<string, unknown>[]) : [];
      const discoveredAt = new Date();
      const seen = new Set<string>();
      const results: Discovery[] = [];
      for (const r of raw) {
        const href = asString(r.url);
        if (href === null) continue;
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
          publishedAt: asDate(r.published_date),
          discoveredAt,
          providerMetadata: { score: typeof r.score === 'number' ? r.score : undefined },
        });
      }
      return { provider: this.id, query: issued, results, elapsedMs };
    } catch (e) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      return unavailableResponse(
        this.id,
        issued,
        controller.signal.aborted
          ? { reason: 'timeout', detail: 'Tavily did not answer in time' }
          : { reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) },
        elapsedMs,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* DIRECT                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Directly supplied URLs, as a provider.
 *
 * Always available, never reaches the network, and produces the same shape as
 * everything else. That last property is the whole point: the requirement that
 * direct ingestion keeps working when no search provider is configured is met
 * by there being nothing to keep working — the pipeline cannot tell.
 */
export class DirectProvider implements SearchProvider {
  readonly id = 'direct' as const;
  readonly label = 'Direct URL';

  async available(): Promise<Availability> {
    return { ok: true, detail: 'always available; makes no network request' };
  }

  /** `query` is a whitespace- or comma-separated list of URLs. */
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const startedAt = performance.now();
    const discoveredAt = new Date();
    const seen = new Set<string>();
    const results: Discovery[] = [];
    for (const token of query.split(/[\s,]+/)) {
      if (token === '') continue;
      if (results.length >= (opts.limit ?? 100)) break;
      const facts = urlFacts(token);
      if (facts === null) continue;
      if (seen.has(facts.identity)) continue;
      seen.add(facts.identity);
      results.push({
        provider: this.id,
        query,
        url: facts.url.toString(),
        canonicalUrl: null,
        title: null,
        /* A direct URL comes with no summary, and inventing one from the URL
           would be the same mistake as trusting a search snippet. */
        snippet: null,
        rank: results.length + 1,
        publishedAt: null,
        discoveredAt,
        providerMetadata: { supplied: token },
      });
    }
    return { provider: this.id, query, results, elapsedMs: Math.round(performance.now() - startedAt) };
  }
}

/* -------------------------------------------------------------------------- */
/* REGISTRY                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The only thing the pipeline is given.
 *
 * It asks for a provider by id, or for the configured default, and receives
 * something implementing `SearchProvider`. It never constructs one, never
 * branches on which one it got, and never reads a provider-specific field.
 */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, SearchProvider>();
  /**
   * The provider this registry prefers, when the caller states one.
   *
   * Configuration is the right source for a deployment, and the wrong one for
   * a caller that already knows which provider it wants — a job pinned to a
   * particular source, or a harness supplying its own. Stated here it stays
   * explicit; read from `config` it would be invisible at the call site.
   */
  private readonly preferred: ProviderId | null;

  constructor(providers: SearchProvider[], preferred: ProviderId | null = null) {
    for (const p of providers) this.providers.set(p.id, p);
    this.preferred = preferred;
  }

  static fromConfig(fetchImpl: typeof fetch = fetch): ProviderRegistry {
    return new ProviderRegistry([
      new SearxngProvider(config.SEARXNG_URL, fetchImpl),
      new BraveProvider(config.SEARCH_API_KEY, fetchImpl),
      new TavilyProvider(config.SEARCH_API_KEY, fetchImpl),
      new DirectProvider(),
    ]);
  }

  get(id: ProviderId): SearchProvider | undefined {
    return this.providers.get(id);
  }

  ids(): ProviderId[] {
    return [...this.providers.keys()];
  }

  /**
   * The configured discovery provider, or `direct` when none is configured.
   *
   * Falling back to `direct` rather than to an error is what keeps the
   * service useful with no search at all: it can still be handed URLs.
   */
  default(): SearchProvider {
    const stated = this.preferred === null ? undefined : this.providers.get(this.preferred);
    const configured = stated ?? this.providers.get(config.SEARCH_PROVIDER as ProviderId);
    return configured ?? (this.providers.get('direct') as SearchProvider);
  }

  async report(): Promise<Array<{ id: ProviderId; label: string } & Availability>> {
    const out: Array<{ id: ProviderId; label: string } & Availability> = [];
    for (const p of this.providers.values()) {
      out.push({ id: p.id, label: p.label, ...(await p.available()) });
    }
    return out;
  }
}
