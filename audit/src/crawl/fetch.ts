import { createHash } from 'node:crypto';

import { config } from '../config.ts';
import { guardUrl } from './guard.ts';
import { RobotsCache } from './robots.ts';
import { CrawlLimiter, RETRYABLE_STATUS, withBackoff } from './limiter.ts';
import { urlFacts } from './url.ts';

/**
 * ONE GUARDED FETCH, AND EVERY WAY IT IS ALLOWED TO SAY NO.
 *
 * A refusal here is an OUTCOME, not an exception. `blocked_private`,
 * `too_large` and `blocked_type` are things this crawler is supposed to do,
 * they get written to `discovery.outcome` and `document.outcome`, and a
 * pipeline that treated them as errors would either lose them in a log or stop
 * a whole run because one URL out of forty pointed at a PDF.
 *
 * The order of checks is deliberate and is cheapest-first, because each one
 * that fires saves the cost of every check after it:
 *
 *   scheme  →  address  →  robots  →  rate gate  →  conditional GET  →
 *   status  →  content-type  →  declared size  →  streamed size  →  hash
 *
 * The last three are the same limit enforced three times for three different
 * attacks: a lying Content-Length, a body with no Content-Length at all, and a
 * small compressed body that expands to gigabytes.
 */

export type FetchOutcome =
  | 'ok'
  | 'unchanged'
  | 'blocked_robots'
  | 'blocked_private'
  | 'blocked_scheme'
  | 'blocked_type'
  | 'too_large'
  | 'too_many_redirects'
  | 'timeout'
  | 'http_error'
  | 'network_error';

export interface FetchResult {
  outcome: FetchOutcome;
  /** The URL actually requested first. */
  requestedUrl: string;
  /** Where we ended up after redirects. Equal to `requestedUrl` when there were none. */
  finalUrl: string;
  /** Every hop, in order, for provenance. */
  redirectChain: string[];
  status: number | null;
  contentType: string | null;
  body: string | null;
  /** sha256 of the raw body. The dedup and change key. */
  contentHash: string | null;
  byteLen: number;
  etag: string | null;
  lastModified: string | null;
  fetchedAt: Date;
  elapsedMs: number;
  /** Why, when the outcome is not `ok`. Always human-readable. */
  detail: string;
}

/**
 * What this crawler is willing to read.
 *
 * Narrow on purpose. The extractor understands markup and text; a PDF, an
 * image or a zip is refused with `blocked_type` and recorded, rather than
 * downloaded to find out it cannot be used. Binary formats are a later
 * decision with their own extraction story, not a quiet exception here.
 */
const ALLOWED_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'text/xml',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/json',
  'application/ld+json',
];

export interface CrawlerOptions {
  maxRedirects?: number;
  attempts?: number;
  globalConcurrency?: number;
  perHostConcurrency?: number;
  /** Injected for tests, so a fixture server can be driven without a network. */
  fetchImpl?: typeof fetch;
}

export interface FetchRequest {
  url: string;
  /** Sent as If-None-Match, so an unchanged page costs a round trip and no body. */
  etag?: string | null;
  /** Sent as If-Modified-Since. */
  lastModified?: string | null;
  /** Compared against the new hash to report `unchanged` even without a 304. */
  knownHash?: string | null;
  signal?: AbortSignal;
}

function emptyResult(url: string, outcome: FetchOutcome, detail: string, startedAt: number): FetchResult {
  return {
    outcome,
    requestedUrl: url,
    finalUrl: url,
    redirectChain: [],
    status: null,
    contentType: null,
    body: null,
    contentHash: null,
    byteLen: 0,
    etag: null,
    lastModified: null,
    fetchedAt: new Date(),
    elapsedMs: Math.round(performance.now() - startedAt),
    detail,
  };
}

export class Crawler {
  private readonly limiter: CrawlLimiter;
  private readonly robots: RobotsCache;
  private readonly maxRedirects: number;
  private readonly attempts: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CrawlerOptions = {}) {
    this.maxRedirects = opts.maxRedirects ?? 5;
    this.attempts = opts.attempts ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.limiter = new CrawlLimiter({
      globalConcurrency: opts.globalConcurrency ?? 8,
      perHostConcurrency: opts.perHostConcurrency ?? 2,
      perHostRps: config.CRAWL_PER_HOST_RPS,
    });
    this.robots = new RobotsCache(config.CRAWL_USER_AGENT, 3_600_000, this.fetchImpl);
  }

  stats() {
    return this.limiter.stats();
  }

  /**
   * What sitemaps this origin advertises, read from the rules we already hold.
   *
   * Discovery that starts here is discovery a site asked for: a sitemap is a
   * published invitation to crawl listed pages, which is the opposite of
   * guessing at URLs. It is also the only discovery path in this service that
   * needs no API key, so it is the one that can be proven to work.
   */
  async sitemaps(origin: string): Promise<{ sitemaps: string[]; refused: string | null }> {
    return this.robots.sitemapsFor(origin, config.CRAWL_TIMEOUT_MS);
  }

  async fetch(req: FetchRequest): Promise<FetchResult> {
    const startedAt = performance.now();
    const facts = urlFacts(req.url);
    if (facts === null) {
      return emptyResult(req.url, 'blocked_scheme', 'not an http(s) URL this service will fetch', startedAt);
    }

    const guard = await guardUrl(facts.url);
    if (!guard.ok) {
      return emptyResult(req.url, guard.refusal.kind, guard.refusal.detail, startedAt);
    }

    if (config.CRAWL_RESPECT_ROBOTS) {
      const decision = await this.robots.decide(facts.url, config.CRAWL_TIMEOUT_MS);
      if (!decision.allowed) {
        return emptyResult(req.url, 'blocked_robots', decision.reason, startedAt);
      }
    }

    return this.limiter.run(facts.host, async () => {
      const attempt = await withBackoff<FetchResult>(
        async () => {
          const r = await this.once(req, startedAt);
          /* Retry only what a retry can change. A 404 is a fact. */
          if (r.outcome === 'network_error' || r.outcome === 'timeout') {
            return { retry: true, because: r.detail };
          }
          if (r.outcome === 'http_error' && r.status !== null && RETRYABLE_STATUS.has(r.status)) {
            return { retry: true, because: `HTTP ${r.status}`, afterMs: r.status === 429 ? 5_000 : undefined };
          }
          return { retry: false, value: r };
        },
        { attempts: this.attempts, baseMs: 500, maxMs: 8_000, signal: req.signal },
      );
      if ('value' in attempt) return attempt.value;
      return emptyResult(req.url, 'network_error', `${attempt.failed} after ${attempt.attempts} attempts`, startedAt);
    });
  }

  /** One pass, following redirects manually so every hop can be re-judged. */
  private async once(req: FetchRequest, startedAt: number): Promise<FetchResult> {
    const chain: string[] = [];
    let current = req.url;

    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.CRAWL_TIMEOUT_MS);
      const onOuterAbort = () => controller.abort();
      req.signal?.addEventListener('abort', onOuterAbort, { once: true });

      let res: Response;
      try {
        const headers: Record<string, string> = {
          'user-agent': config.CRAWL_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'accept-language': 'en',
        };
        /* Conditional request. The cheapest successful crawl is a 304. */
        if (hop === 0 && req.etag) headers['if-none-match'] = req.etag;
        if (hop === 0 && req.lastModified) headers['if-modified-since'] = req.lastModified;

        res = await this.fetchImpl(current, {
          method: 'GET',
          headers,
          /* Manual, always. `redirect: 'follow'` hands the decision to the
             stack and the guard never sees the intermediate hops — which is
             the single most common way an SSRF check is bypassed. */
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (e) {
        const aborted = controller.signal.aborted;
        return {
          ...emptyResult(req.url, aborted ? 'timeout' : 'network_error', e instanceof Error ? e.message : String(e), startedAt),
          finalUrl: current,
          redirectChain: chain,
        };
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onOuterAbort);
      }

      /* ---- 304: the page has not changed ------------------------------
       * BEFORE the redirect branch, deliberately. 304 is inside the 3xx range
       * and carries no Location, so a redirect check that runs first sees a
       * malformed redirect and reports an error — turning the single cheapest
       * outcome in the whole pipeline into a failure. Found by the test that
       * asserts a conditional request reads no body.
       */
      if (res.status === 304) {
        await res.body?.cancel().catch(() => undefined);
        return {
          ...emptyResult(req.url, 'unchanged', 'server reported 304 Not Modified', startedAt),
          finalUrl: current,
          redirectChain: chain,
          status: 304,
          etag: res.headers.get('etag'),
          lastModified: res.headers.get('last-modified'),
        };
      }

      /* ---- redirect -------------------------------------------------- */
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (location === null || location.trim() === '') {
          return {
            ...emptyResult(req.url, 'http_error', `HTTP ${res.status} with no Location`, startedAt),
            finalUrl: current,
            redirectChain: chain,
            status: res.status,
          };
        }
        const next = new URL(location, current).toString();
        chain.push(next);
        if (hop === this.maxRedirects) {
          return {
            ...emptyResult(req.url, 'too_many_redirects', `more than ${this.maxRedirects} redirects`, startedAt),
            finalUrl: next,
            redirectChain: chain,
            status: res.status,
          };
        }
        /* EVERY hop is re-judged from scratch. */
        const nextFacts = urlFacts(next);
        if (nextFacts === null) {
          return {
            ...emptyResult(req.url, 'blocked_scheme', `redirect to a non-http(s) target: ${next}`, startedAt),
            finalUrl: next,
            redirectChain: chain,
            status: res.status,
          };
        }
        const guard = await guardUrl(nextFacts.url);
        if (!guard.ok) {
          return {
            ...emptyResult(req.url, guard.refusal.kind, `redirect refused: ${guard.refusal.detail}`, startedAt),
            finalUrl: next,
            redirectChain: chain,
            status: res.status,
          };
        }
        if (config.CRAWL_RESPECT_ROBOTS) {
          const decision = await this.robots.decide(nextFacts.url, config.CRAWL_TIMEOUT_MS);
          if (!decision.allowed) {
            return {
              ...emptyResult(req.url, 'blocked_robots', `redirect target: ${decision.reason}`, startedAt),
              finalUrl: next,
              redirectChain: chain,
              status: res.status,
            };
          }
        }
        current = next;
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return {
          ...emptyResult(req.url, 'http_error', `HTTP ${res.status}`, startedAt),
          finalUrl: current,
          redirectChain: chain,
          status: res.status,
        };
      }

      /* ---- content-type ----------------------------------------------- */
      const rawType = res.headers.get('content-type');
      const type = (rawType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      if (type !== '' && !ALLOWED_TYPES.includes(type)) {
        await res.body?.cancel().catch(() => undefined);
        return {
          ...emptyResult(req.url, 'blocked_type', `content-type ${type} is not one this crawler reads`, startedAt),
          finalUrl: current,
          redirectChain: chain,
          status: res.status,
          contentType: rawType,
        };
      }

      /* ---- declared size ---------------------------------------------- */
      const declared = Number(res.headers.get('content-length') ?? NaN);
      if (Number.isFinite(declared) && declared > config.CRAWL_MAX_BYTES) {
        await res.body?.cancel().catch(() => undefined);
        return {
          ...emptyResult(req.url, 'too_large', `Content-Length ${declared} exceeds ${config.CRAWL_MAX_BYTES}`, startedAt),
          finalUrl: current,
          redirectChain: chain,
          status: res.status,
          contentType: rawType,
        };
      }

      /* ---- actual size, streamed --------------------------------------
       * Content-Length is a claim. This counts what arrives, DECOMPRESSED,
       * and stops the moment the limit is passed — which is the only check
       * that catches a small gzip that expands to gigabytes, and the only one
       * that works at all when there is no Content-Length.
       */
      const reader = res.body?.getReader();
      if (reader === undefined) {
        return {
          ...emptyResult(req.url, 'ok', 'empty body', startedAt),
          finalUrl: current,
          redirectChain: chain,
          status: res.status,
          contentType: rawType,
          body: '',
          contentHash: createHash('sha256').update('').digest('hex'),
        };
      }

      const parts: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value === undefined) continue;
          total += value.byteLength;
          if (total > config.CRAWL_MAX_BYTES) {
            await reader.cancel().catch(() => undefined);
            return {
              ...emptyResult(req.url, 'too_large', `body exceeded ${config.CRAWL_MAX_BYTES} bytes while streaming`, startedAt),
              finalUrl: current,
              redirectChain: chain,
              status: res.status,
              contentType: rawType,
              byteLen: total,
            };
          }
          parts.push(value);
        }
      } catch (e) {
        return {
          ...emptyResult(req.url, 'network_error', `while reading body: ${e instanceof Error ? e.message : String(e)}`, startedAt),
          finalUrl: current,
          redirectChain: chain,
          status: res.status,
        };
      }

      const buf = Buffer.concat(parts, total);
      const contentHash = createHash('sha256').update(buf).digest('hex');
      const body = buf.toString('utf8');

      return {
        outcome: req.knownHash !== null && req.knownHash === contentHash ? 'unchanged' : 'ok',
        requestedUrl: req.url,
        finalUrl: current,
        redirectChain: chain,
        status: res.status,
        contentType: rawType,
        body,
        contentHash,
        byteLen: total,
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        fetchedAt: new Date(),
        elapsedMs: Math.round(performance.now() - startedAt),
        detail:
          req.knownHash !== null && req.knownHash === contentHash
            ? 'content hash matches the stored version'
            : 'fetched',
      };
    }

    return emptyResult(req.url, 'too_many_redirects', `more than ${this.maxRedirects} redirects`, startedAt);
  }
}
