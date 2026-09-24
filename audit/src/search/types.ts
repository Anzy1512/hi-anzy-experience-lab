/**
 * WHAT A SEARCH PROVIDER IS, AND WHAT IT IS NOT ALLOWED TO BE.
 *
 * ── THE LINE THIS FILE EXISTS TO HOLD ───────────────────────────────────────
 *
 * A provider DISCOVERS URLs. It does not establish anything.
 *
 * Every one of these services returns a snippet, and every snippet is a
 * plausible-looking sentence about the page that the page may not contain: an
 * engine's own summary, a meta description written by a marketing team, a
 * fragment reassembled around the query terms. Treating one as page content is
 * the cheapest possible way to produce a confident, cited, false statement —
 * and it would be indistinguishable from a real one a single join later.
 *
 * So `snippet` is carried here, written to the `discovery` table, and read by
 * exactly nothing downstream. Evidence comes from the crawler or it does not
 * exist. `RANKING_ONLY` below says so where a compiler can see it.
 *
 * ── AND WHY THE PIPELINE CANNOT SEE THROUGH THIS ────────────────────────────
 *
 * The pipeline takes `Discovery[]`. It has no access to the provider object,
 * no provider-shaped branches, and no way to ask which engine produced a
 * result beyond a label it only ever writes down. That is deliberate: the
 * moment one stage special-cases one provider, adding the next provider stops
 * being configuration and becomes a refactor.
 *
 * `provider` is present on the result for PROVENANCE — so the record can say
 * where a URL came from — and for nothing else.
 */

/** The providers this service knows how to speak to. */
export type ProviderId = 'searxng' | 'brave' | 'tavily' | 'direct' | 'sitemap';

/**
 * One discovered URL, in a shape no provider gets to influence.
 *
 * Every provider maps its own response into this. Where a provider cannot
 * supply a field, the field is `null` — never a default, never an empty
 * string, never a zero. `publishedAt: null` means "this provider did not tell
 * us", which is a different fact from "published at the epoch", and the
 * difference matters the moment anything sorts by recency.
 */
export interface Discovery {
  provider: ProviderId;
  /** The query as ISSUED to this provider, which is not always the user's words. */
  query: string;
  /** The URL to fetch. Normalised, never yet validated for safety. */
  url: string;
  /** What the provider claims is the canonical address, if it claims one. */
  canonicalUrl: string | null;
  title: string | null;
  /**
   * RANKING_ONLY. The provider's summary of the page.
   *
   * Recorded for provenance and for cheap relevance filtering BEFORE a fetch
   * is spent. Never chunked, never embedded, never cited, never permitted to
   * become the text of a finding.
   */
  snippet: string | null;
  /** 1-based position in that provider's own result list. */
  rank: number;
  /** Only when the provider actually reported a date. */
  publishedAt: Date | null;
  discoveredAt: Date;
  /** Whatever else the provider said, kept verbatim and interpreted by nobody. */
  providerMetadata: Record<string, unknown>;
}

export interface SearchOptions {
  /** How many results to ask for. Providers may return fewer; none may return more. */
  limit?: number;
  /** Restrict to a single site, where the provider supports it. */
  site?: string;
  /** Two-letter language hint. */
  lang?: string;
  /** Abort signal, so a slow provider cannot hold a pipeline open. */
  signal?: AbortSignal;
}

/**
 * Why a provider could not answer.
 *
 * A provider being unavailable is an ORDINARY OUTCOME, not an exception. The
 * service is required to keep working on directly supplied URLs when no search
 * provider is configured or reachable, so "unavailable" has to be a value the
 * caller can act on rather than a throw that unwinds the run.
 */
export type Unavailable =
  | { reason: 'not_configured'; detail: string }
  | { reason: 'unreachable'; detail: string }
  | { reason: 'rejected'; detail: string } /* bad key, quota, 4xx */
  | { reason: 'timeout'; detail: string };

export interface Availability {
  ok: boolean;
  detail: string;
  /** Present only when `ok` is false. */
  problem?: Unavailable;
}

export interface SearchResponse {
  provider: ProviderId;
  query: string;
  results: Discovery[];
  /** Milliseconds the provider took. Recorded so a slow one is visible. */
  elapsedMs: number;
  /**
   * Set when the provider could not answer. `results` is then empty and the
   * caller carries on with whatever else it has — which is the whole point.
   */
  unavailable?: Unavailable;
}

export interface SearchProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Can this provider be used at all, right now? Cheap; may be cached. */
  available(): Promise<Availability>;
  /** Never throws for an expected failure. Returns `unavailable` instead. */
  search(query: string, opts?: SearchOptions): Promise<SearchResponse>;
}

/** A response for a provider that cannot answer. Keeps every caller uniform. */
export function unavailableResponse(
  provider: ProviderId,
  query: string,
  problem: Unavailable,
  elapsedMs = 0,
): SearchResponse {
  return { provider, query, results: [], elapsedMs, unavailable: problem };
}
