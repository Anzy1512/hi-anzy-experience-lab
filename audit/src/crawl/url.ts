import { createHash } from 'node:crypto';

/**
 * TWO DIFFERENT QUESTIONS ABOUT A URL, KEPT APART.
 *
 *   "what do I fetch"   the URL as it was given. Parameter order preserved,
 *                       because a minority of servers care and being clever
 *                       about it produces a 404 nobody can reproduce.
 *
 *   "is this the same   a normalised form: lowercased host, default port
 *    page I already      dropped, fragment dropped, tracking parameters
 *    have"               removed, remaining parameters sorted.
 *
 * Collapsing them is how a corpus ends up holding the same article five times
 * under five campaign tags, each one crawled, chunked and embedded at full
 * price. So `document.url` stores the first and `document.url_hash` stores a
 * hash of the second, and deduplication happens on the hash.
 */

/**
 * Parameters that identify a CAMPAIGN rather than a document.
 *
 * Conservative on purpose. Anything not on this list is kept, because a
 * parameter that looks decorative is occasionally the entire query — `?id=`,
 * `?p=`, `?q=` and `?page=` all select content and all look like noise.
 */
const TRACKING = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'fbclid', 'igshid', 'twclid', 'ttclid', 'msclkid', 'yclid',
  'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'hsa_acc', 'hsa_cam',
  'ref', 'referrer', 'source', 'spm',
  'scid', 'sc_campaign', 'sc_channel', 'sc_content',
]);

/** The only schemes this service will ever fetch. */
export const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export function parseUrl(raw: string, base?: string): URL | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    return new URL(trimmed, base);
  } catch {
    return null;
  }
}

/** Is this a scheme we are willing to make a request for? */
export function isFetchable(url: URL): boolean {
  return ALLOWED_SCHEMES.has(url.protocol);
}

/**
 * The identity form. Two URLs that normalise the same are the same document.
 *
 * Deliberately NOT what gets fetched — see the note at the top of this file.
 */
export function normaliseForIdentity(input: URL | string): string | null {
  const url = typeof input === 'string' ? parseUrl(input) : input;
  if (url === null || !isFetchable(url)) return null;

  const u = new URL(url.href);
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, ''); /* the root-dot form */
  u.hash = '';
  u.username = '';
  u.password = '';

  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
    u.port = '';
  }

  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  u.searchParams.sort();

  /* A bare host and a bare host with a slash are the same page everywhere. */
  if (u.pathname === '') u.pathname = '/';
  /* `/a/b/` and `/a/b` are the same page almost everywhere, and the exceptions
     are rarer than the duplicates this collapses. */
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);

  return u.toString();
}

/** sha256 of the identity form. The deduplication key for the whole corpus. */
export function urlHash(input: URL | string): string | null {
  const identity = normaliseForIdentity(input);
  if (identity === null) return null;
  return createHash('sha256').update(identity).digest('hex');
}

/**
 * The registrable domain, approximately.
 *
 * A correct answer needs the Public Suffix List, which is a dependency and a
 * data file that goes stale. This handles the common multi-part suffixes and
 * is used ONLY for grouping — retrieval diversity, per-host politeness — never
 * for a security decision. Nothing is permitted because two hosts looked
 * related; the SSRF guard resolves addresses and does not consult this.
 */
const MULTIPART_SUFFIX = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in', 'edu.in', 'firm.in', 'gen.in', 'ind.in',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'co.za', 'org.za', 'net.za',
  'com.br', 'com.mx', 'com.ar', 'com.sg', 'com.hk', 'com.tw', 'com.tr',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr',
]);

export function registrableDomain(input: URL | string): string | null {
  const url = typeof input === 'string' ? parseUrl(input) : input;
  if (url === null) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === '') return null;
  /* A literal address is its own group; there is no domain to register. */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host;

  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTIPART_SUFFIX.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.');
  return lastTwo;
}

/** Everything a fetch needs to know about a URL before it decides to make one. */
export interface UrlFacts {
  url: URL;
  identity: string;
  hash: string;
  host: string;
  domain: string;
}

export function urlFacts(raw: string, base?: string): UrlFacts | null {
  const url = parseUrl(raw, base);
  if (url === null || !isFetchable(url)) return null;
  const identity = normaliseForIdentity(url);
  const domain = registrableDomain(url);
  if (identity === null || domain === null) return null;
  return {
    url,
    identity,
    hash: createHash('sha256').update(identity).digest('hex'),
    host: url.hostname.toLowerCase(),
    domain,
  };
}
