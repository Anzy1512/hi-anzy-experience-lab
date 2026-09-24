/**
 * POLITENESS, ENFORCED RATHER THAN INTENDED.
 *
 * Three separate limits, because they stop three different things:
 *
 *   global concurrency   protects THIS service. Two hundred simultaneous
 *                        fetches is two hundred sockets, two hundred response
 *                        buffers, and an out-of-memory kill.
 *
 *   per-host concurrency protects the SITE. One crawler opening thirty
 *                        connections to one small server is indistinguishable
 *                        from an attack and is often treated as one.
 *
 *   per-host rate        protects the RELATIONSHIP. Concurrency 1 with no
 *                        delay still means as fast as the server can answer,
 *                        which for a fast server is hundreds per minute.
 *
 * Written rather than installed. It is forty lines, the semantics matter to
 * the correctness of the crawler, and a queue you did not write is a queue you
 * find out about under load.
 */

export interface LimiterOptions {
  globalConcurrency: number;
  perHostConcurrency: number;
  /** Requests per second, per host. 0.5 means one every two seconds. */
  perHostRps: number;
}

interface HostState {
  active: number;
  /** Earliest time the next request to this host may START. */
  nextAllowedAt: number;
  waiting: Array<() => void>;
}

export class CrawlLimiter {
  private readonly opts: LimiterOptions;
  private globalActive = 0;
  private readonly globalWaiting: Array<() => void> = [];
  private readonly hosts = new Map<string, HostState>();

  constructor(opts: LimiterOptions) {
    this.opts = opts;
  }

  private host(name: string): HostState {
    let s = this.hosts.get(name);
    if (s === undefined) {
      s = { active: 0, nextAllowedAt: 0, waiting: [] };
      this.hosts.set(name, s);
    }
    return s;
  }

  private async acquireGlobal(): Promise<void> {
    if (this.globalActive < this.opts.globalConcurrency) {
      this.globalActive += 1;
      return;
    }
    await new Promise<void>((resolve) => this.globalWaiting.push(resolve));
    this.globalActive += 1;
  }

  private releaseGlobal(): void {
    this.globalActive -= 1;
    const next = this.globalWaiting.shift();
    if (next) next();
  }

  private async acquireHost(name: string): Promise<void> {
    const s = this.host(name);
    if (s.active >= this.opts.perHostConcurrency) {
      await new Promise<void>((resolve) => s.waiting.push(resolve));
    }
    s.active += 1;

    /*
     * The rate gate is claimed BEFORE waiting, not after. Claiming it
     * afterwards lets every queued request read the same `nextAllowedAt`,
     * sleep the same amount, and then leave together — a burst produced by the
     * code that exists to prevent bursts.
     */
    const gap = this.opts.perHostRps > 0 ? 1000 / this.opts.perHostRps : 0;
    const now = Date.now();
    const startAt = Math.max(now, s.nextAllowedAt);
    s.nextAllowedAt = startAt + gap;
    const wait = startAt - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  private releaseHost(name: string): void {
    const s = this.host(name);
    s.active -= 1;
    const next = s.waiting.shift();
    if (next) next();
    /* Forget quiet hosts so a long crawl does not accumulate a map entry per
       domain it saw once. The rate gate only matters while requests are in
       flight or recent. */
    if (s.active === 0 && s.waiting.length === 0 && s.nextAllowedAt < Date.now()) {
      this.hosts.delete(name);
    }
  }

  /** Run `fn` under both limits and the per-host rate gate. */
  async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    await this.acquireGlobal();
    try {
      await this.acquireHost(host);
      try {
        return await fn();
      } finally {
        this.releaseHost(host);
      }
    } finally {
      this.releaseGlobal();
    }
  }

  stats(): { globalActive: number; hosts: number; queued: number } {
    let queued = this.globalWaiting.length;
    for (const s of this.hosts.values()) queued += s.waiting.length;
    return { globalActive: this.globalActive, hosts: this.hosts.size, queued };
  }
}

/**
 * Retry with exponential backoff and full jitter.
 *
 * Jitter matters more than the backoff curve: without it, everything that
 * failed at the same moment retries at the same moment, and a server that
 * briefly wobbled gets a perfectly synchronised second wave.
 *
 * Only retries what is worth retrying. A 404 will be a 404 again, and a 403 is
 * usually a decision rather than a fault — retrying either is spending
 * someone else's capacity to confirm something already known.
 */
export const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface BackoffOptions {
  attempts: number;
  baseMs: number;
  maxMs: number;
  signal?: AbortSignal | undefined;
}

export async function withBackoff<T>(
  fn: (attempt: number) => Promise<{ retry: false; value: T } | { retry: true; because: string; afterMs?: number | undefined }>,
  opts: BackoffOptions,
): Promise<{ value: T } | { failed: string; attempts: number }> {
  let because = 'not attempted';
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    if (opts.signal?.aborted === true) return { failed: 'aborted', attempts: attempt - 1 };
    const outcome = await fn(attempt);
    if (!outcome.retry) return { value: outcome.value };
    because = outcome.because;
    if (attempt === opts.attempts) break;

    /* Honour Retry-After when the server sent one: it is the server telling
       us what it wants, and guessing over the top of that is rude and worse. */
    const ceiling = Math.min(opts.maxMs, opts.baseMs * 2 ** (attempt - 1));
    const jittered = Math.random() * ceiling;
    const delay = outcome.afterMs !== undefined ? Math.max(outcome.afterMs, jittered) : jittered;
    await new Promise((r) => setTimeout(r, delay));
  }
  return { failed: because, attempts: opts.attempts };
}
