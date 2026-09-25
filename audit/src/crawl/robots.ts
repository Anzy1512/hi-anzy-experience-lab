/**
 * robots.txt, parsed here rather than installed.
 *
 * The format is small and the rules that matter are few: group by
 * `User-agent`, match paths against `Allow` and `Disallow`, longest matching
 * rule wins, `Allow` wins a tie. Writing it keeps the dependency count honest
 * and — more usefully — keeps the *decision* visible, because the interesting
 * question is not how to parse the file but what to do when it is missing,
 * unreachable or returns a login page.
 *
 * ── THE DEFAULTS, AND WHY THEY GO THAT WAY ──────────────────────────────────
 *
 *   404 / no file      ALLOWED. A site with no robots.txt has expressed no
 *                      preference, and the convention is that silence permits.
 *   5xx / timeout      REFUSED. The site may well have rules we could not
 *                      read, and "I could not check" is not "there was
 *                      nothing to check".
 *   401 / 403          REFUSED, and this is the one worth being deliberate
 *                      about: a robots.txt behind authentication is a site
 *                      saying it is not open. Reading that as permission is
 *                      how a crawler ends up somewhere it was told not to be.
 *
 * This service does not attempt to get around anything. No credential is
 * presented, no paywall is defeated, no bot check is solved, and a refusal is
 * recorded as an outcome rather than retried differently.
 */

export interface RobotsRules {
  /** Longest-match rules for the agent we identified as. */
  allow: string[];
  disallow: string[];
  /** Seconds the site asked to be waited between requests, if it asked. */
  crawlDelay: number | null;
  sitemaps: string[];
}

export interface RobotsDecision {
  allowed: boolean;
  /** Why, in words that can go into a record. */
  reason: string;
  crawlDelay: number | null;
}

const EMPTY: RobotsRules = { allow: [], disallow: [], crawlDelay: null, sitemaps: [] };

/** Our own token, for matching `User-agent:` groups. */
function agentToken(userAgent: string): string {
  const slash = userAgent.indexOf('/');
  return (slash === -1 ? userAgent : userAgent.slice(0, slash)).trim().toLowerCase();
}

export function parseRobots(body: string, userAgent: string): RobotsRules {
  const me = agentToken(userAgent);
  const lines = body.split(/\r?\n/);

  /* Groups are collected separately for our token and for `*`, because a file
     may address both and the specific one wins outright rather than merging. */
  const mine: RobotsRules = { allow: [], disallow: [], crawlDelay: null, sitemaps: [] };
  const star: RobotsRules = { allow: [], disallow: [], crawlDelay: null, sitemaps: [] };
  const sitemaps: string[] = [];

  let current: RobotsRules[] = [];
  /* Consecutive User-agent lines form ONE group; a directive ends the header. */
  let inHeader = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }

    if (field === 'user-agent') {
      if (!inHeader) current = [];
      inHeader = true;
      const token = value.toLowerCase();
      if (token === '*') current.push(star);
      else if (token === me || me.includes(token) || token.includes(me)) current.push(mine);
      continue;
    }

    inHeader = false;
    if (current.length === 0) continue;

    for (const group of current) {
      if (field === 'disallow') {
        /* `Disallow:` with an empty value means "nothing is disallowed" and
           must not be stored as a rule matching every path. */
        if (value !== '') group.disallow.push(value);
      } else if (field === 'allow') {
        if (value !== '') group.allow.push(value);
      } else if (field === 'crawl-delay') {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) group.crawlDelay = n;
      }
    }
  }

  const chosen = mine.allow.length > 0 || mine.disallow.length > 0 || mine.crawlDelay !== null ? mine : star;
  return { ...chosen, sitemaps };
}

/** Does a rule pattern match this path? Supports `*` and an anchoring `$`. */
function matches(pattern: string, path: string): number {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  if (!body.includes('*')) {
    if (anchored) return path === body ? body.length : -1;
    return path.startsWith(body) ? body.length : -1;
  }
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp(`^${escaped}${anchored ? '$' : ''}`);
  return re.test(path) ? body.length : -1;
}

export function isAllowed(rules: RobotsRules, pathname: string): RobotsDecision {
  const path = pathname === '' ? '/' : pathname;
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const p of rules.allow) bestAllow = Math.max(bestAllow, matches(p, path));
  for (const p of rules.disallow) bestDisallow = Math.max(bestDisallow, matches(p, path));

  if (bestDisallow === -1) return { allowed: true, reason: 'no disallow rule matches', crawlDelay: rules.crawlDelay };
  /* Longest match wins; a tie goes to Allow, which is the documented rule and
     also the one that makes `Disallow: /` + `Allow: /public/` behave. */
  if (bestAllow >= bestDisallow) {
    return { allowed: true, reason: `allow rule (${bestAllow}) is at least as specific as disallow (${bestDisallow})`, crawlDelay: rules.crawlDelay };
  }
  return { allowed: false, reason: `disallowed by robots.txt (rule length ${bestDisallow})`, crawlDelay: rules.crawlDelay };
}

interface CacheEntry {
  rules: RobotsRules;
  /** Set when the file could not be read and the answer is a blanket one. */
  blanket: RobotsDecision | null;
  expiresAt: number;
}

/**
 * One robots.txt per origin, cached.
 *
 * Without the cache, a crawl of forty pages on one site fetches robots.txt
 * forty-one times, which is both wasteful and precisely the behaviour that
 * gets a crawler blocked.
 */
export class RobotsCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  constructor(userAgent: string, ttlMs = 3_600_000, fetchImpl: typeof fetch = fetch) {
    this.userAgent = userAgent;
    this.ttlMs = ttlMs;
    this.fetchImpl = fetchImpl;
  }

  async decide(url: URL, timeoutMs: number): Promise<RobotsDecision> {
    const entry = await this.entryFor(url.origin, timeoutMs);
    if (entry.blanket !== null) return entry.blanket;
    return isAllowed(entry.rules, url.pathname + url.search);
  }

  /**
   * The sitemaps this origin's robots.txt names, and the refusal when it has none.
   *
   * `parseRobots` has always collected these; nothing read them. Exposing them
   * here rather than letting a caller fetch robots.txt for itself matters for
   * one reason: this is the same cached entry the crawl path decides against,
   * so a site is asked for its rules once and a site that refuses refuses
   * both. A separate reader would fetch the file twice and could disagree with
   * the crawler about what it said.
   *
   * A blanket refusal comes back as `refused`, never as an empty list. "The
   * site told us not to" and "the site publishes no sitemap" are different
   * facts, and a caller that cannot tell them apart will report the first as
   * the second.
   */
  async sitemapsFor(origin: string, timeoutMs: number): Promise<{ sitemaps: string[]; refused: string | null }> {
    const entry = await this.entryFor(origin, timeoutMs);
    if (entry.blanket !== null && !entry.blanket.allowed) return { sitemaps: [], refused: entry.blanket.reason };
    return { sitemaps: entry.rules.sitemaps, refused: null };
  }

  private async entryFor(origin: string, timeoutMs: number): Promise<CacheEntry> {
    const now = Date.now();
    let entry = this.cache.get(origin);
    if (entry === undefined || entry.expiresAt < now) {
      entry = await this.load(origin, timeoutMs);
      this.cache.set(origin, entry);
    }
    return entry;
  }

  private async load(origin: string, timeoutMs: number): Promise<CacheEntry> {
    const expiresAt = Date.now() + this.ttlMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${origin}/robots.txt`, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': this.userAgent, accept: 'text/plain,*/*;q=0.8' },
      });

      if (res.status === 404 || res.status === 410) {
        return { rules: EMPTY, blanket: null, expiresAt };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          rules: EMPTY,
          blanket: { allowed: false, reason: `robots.txt returned ${res.status} — the site is not open`, crawlDelay: null },
          expiresAt,
        };
      }
      if (!res.ok) {
        return {
          rules: EMPTY,
          blanket: { allowed: false, reason: `robots.txt returned ${res.status}; rules could not be read`, crawlDelay: null },
          expiresAt,
        };
      }

      /* A 200 that is HTML is a catch-all route, not a robots file. Treating a
         login page as "no rules" is exactly the wrong reading. */
      const type = res.headers.get('content-type') ?? '';
      const body = await res.text();
      if (type.includes('html') || /^\s*<(!doctype|html)/i.test(body)) {
        return {
          rules: EMPTY,
          blanket: { allowed: false, reason: 'robots.txt served HTML; rules could not be read', crawlDelay: null },
          expiresAt,
        };
      }
      return { rules: parseRobots(body, this.userAgent), blanket: null, expiresAt };
    } catch (e) {
      return {
        rules: EMPTY,
        blanket: {
          allowed: false,
          reason: `robots.txt unreachable (${e instanceof Error ? e.message : String(e)})`,
          crawlDelay: null,
        },
        /* Retry sooner than a successful read: an outage should not block a
           site for an hour. */
        expiresAt: Date.now() + Math.min(this.ttlMs, 300_000),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
