import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { config } from '../config.ts';
import { isFetchable, parseUrl } from './url.ts';

/**
 * THE GUARD THAT STOPS THIS SERVICE BEING A PROXY INTO ITS OWN NETWORK.
 *
 * ── THE ATTACK ──────────────────────────────────────────────────────────────
 *
 * A caller supplies a URL and this service fetches it. That is the feature. It
 * is also, unguarded, a request forgery appliance with a REST interface: point
 * it at `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
 * and a cloud host hands over role credentials; point it at
 * `http://127.0.0.1:5432` or an internal admin panel and it reaches things no
 * external caller can. The URL does not have to look internal — a public
 * hostname can resolve to a private address, which is why this resolves before
 * it decides rather than reading the string.
 *
 * ── WHAT IS CHECKED ─────────────────────────────────────────────────────────
 *
 *   1. scheme        http and https only. No file:, no ftp:, no gopher:,
 *                    and no data: — several of which older fetch stacks
 *                    happily followed on a redirect.
 *   2. hostname      names that mean "here" are refused before any lookup.
 *   3. resolution    the host is resolved and EVERY returned address is
 *                    checked. One public A record does not excuse a private
 *                    AAAA record; a host with both is the standard bypass.
 *   4. every hop     redirects are re-validated from scratch. A public URL
 *                    that 302s to a private one is the other standard bypass,
 *                    and it defeats any check performed only on input.
 *
 * ── WHAT IS NOT CLOSED, STATED PLAINLY ──────────────────────────────────────
 *
 * There is a window between resolving a name and connecting to it, and a
 * hostile DNS server can answer differently in between — classic rebinding.
 * Closing it means connecting to a pinned address rather than to a name, which
 * needs a custom dispatcher (an undici `Agent` with a `connect` hook) and
 * therefore a dependency this layer has not been given a reason to add yet.
 * It is recorded in the README's limitations rather than left for someone to
 * assume is handled.
 */

export type Refusal =
  | { kind: 'blocked_scheme'; detail: string }
  | { kind: 'blocked_private'; detail: string }
  | { kind: 'network_error'; detail: string };

export type GuardResult =
  | { ok: true; addresses: string[] }
  | { ok: false; refusal: Refusal };

/** Hostnames that mean "this machine" or "this network" without any lookup. */
const LOCAL_NAMES = [/^localhost$/i, /\.localhost$/i, /^ip6-\w+$/i, /\.local$/i, /\.internal$/i, /\.localdomain$/i];

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/**
 * Every IPv4 block that is not a routable public address.
 *
 * `169.254.0.0/16` is the one that matters most in practice: it is link-local,
 * and `169.254.169.254` is the cloud metadata endpoint on AWS, GCP, Azure,
 * DigitalOcean and Oracle alike. `100.64.0.0/10` is carrier-grade NAT, which
 * is genuinely reachable and genuinely not the public internet.
 */
const V4_BLOCKS: Array<[string, number, string]> = [
  ['0.0.0.0', 8, 'this network'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'carrier-grade NAT'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local — includes cloud metadata'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'IETF protocol assignments'],
  ['192.0.2.0', 24, 'documentation'],
  ['192.88.99.0', 24, '6to4 relay anycast'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'benchmarking'],
  ['198.51.100.0', 24, 'documentation'],
  ['203.0.113.0', 24, 'documentation'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
];

function v4Reason(ip: string): string | null {
  const n = v4ToInt(ip);
  if (n === null) return 'unparseable IPv4 address';
  for (const [base, bits, why] of V4_BLOCKS) {
    const b = v4ToInt(base);
    if (b === null) continue;
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    if ((n & mask) >>> 0 === (b & mask) >>> 0) return why;
  }
  return null;
}

function expandV6(ip: string): string[] | null {
  const zone = ip.indexOf('%');
  const bare = (zone === -1 ? ip : ip.slice(0, zone)).toLowerCase();
  const halves = bare.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' || halves[0] === undefined ? [] : halves[0].split(':');
  const tail = halves.length === 2 ? (halves[1] === '' ? [] : (halves[1] ?? '').split(':')) : [];
  const groups = halves.length === 2 ? [...head, ...new Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  if (groups.length !== 8) return null;
  return groups.map((g) => (g === '' ? '0' : g));
}

function v6Reason(ip: string): string | null {
  const g = expandV6(ip);
  if (g === null) return 'unparseable IPv6 address';

  /* An IPv4-mapped or NAT64-embedded address is an IPv4 address wearing a
     different notation, and is the bypass people reach for first. */
  const embedded = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded?.[1]) {
    const why = v4Reason(embedded[1]);
    if (why !== null) return `${why} (IPv4 embedded in IPv6)`;
  }

  const first = parseInt(g[0] ?? '0', 16);
  const all = g.map((x) => parseInt(x, 16));
  if (all.every((x) => x === 0)) return 'unspecified address';
  if (all.slice(0, 7).every((x) => x === 0) && all[7] === 1) return 'loopback';
  if ((first & 0xfe00) === 0xfc00) return 'unique local';
  if ((first & 0xffc0) === 0xfe80) return 'link-local';
  if ((first & 0xff00) === 0xff00) return 'multicast';
  if (first === 0x2001 && all[1] === 0x0db8) return 'documentation';
  /* ::ffff:0:0/96 with a non-dotted tail, e.g. ::ffff:7f00:1 */
  if (all.slice(0, 5).every((x) => x === 0) && all[5] === 0xffff) {
    const a = ((all[6] ?? 0) >> 8) & 0xff;
    const b = (all[6] ?? 0) & 0xff;
    const c = ((all[7] ?? 0) >> 8) & 0xff;
    const d = (all[7] ?? 0) & 0xff;
    const why = v4Reason(`${a}.${b}.${c}.${d}`);
    if (why !== null) return `${why} (IPv4-mapped)`;
  }
  return null;
}

/** Why this literal address must not be fetched, or null if it is fine. */
export function addressRefusalReason(ip: string): string | null {
  const family = isIP(ip);
  if (family === 4) return v4Reason(ip);
  if (family === 6) return v6Reason(ip);
  return 'not an IP address';
}

/**
 * Resolve and judge. Called for the input URL and again for every redirect.
 *
 * `config.CRAWL_ALLOW_PRIVATE_NETWORKS` skips the address checks and nothing
 * else. It exists so that a deliberate local-fixture test can run, it defaults
 * false, and it is greppable — which is the only reason it is a flag rather
 * than a code change.
 */
export async function guardUrl(raw: string | URL): Promise<GuardResult> {
  const url = typeof raw === 'string' ? parseUrl(raw) : raw;
  if (url === null) return { ok: false, refusal: { kind: 'blocked_scheme', detail: 'unparseable URL' } };
  if (!isFetchable(url)) {
    return { ok: false, refusal: { kind: 'blocked_scheme', detail: `scheme ${url.protocol} is not fetchable` } };
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (!config.CRAWL_ALLOW_PRIVATE_NETWORKS) {
    for (const pattern of LOCAL_NAMES) {
      if (pattern.test(host)) {
        return { ok: false, refusal: { kind: 'blocked_private', detail: `hostname ${host} names this machine` } };
      }
    }
  }

  /* A literal address needs no lookup and must still be judged. */
  if (isIP(host) !== 0) {
    if (config.CRAWL_ALLOW_PRIVATE_NETWORKS) return { ok: true, addresses: [host] };
    const why = addressRefusalReason(host);
    if (why !== null) {
      return { ok: false, refusal: { kind: 'blocked_private', detail: `${host} is ${why}` } };
    }
    return { ok: true, addresses: [host] };
  }

  let addresses: string[];
  try {
    const found = await lookup(host, { all: true, verbatim: true });
    addresses = found.map((a) => a.address);
  } catch (e) {
    return {
      ok: false,
      refusal: { kind: 'network_error', detail: `cannot resolve ${host}: ${e instanceof Error ? e.message : String(e)}` },
    };
  }

  if (addresses.length === 0) {
    return { ok: false, refusal: { kind: 'network_error', detail: `${host} resolved to nothing` } };
  }
  if (config.CRAWL_ALLOW_PRIVATE_NETWORKS) return { ok: true, addresses };

  /*
   * EVERY address, not the first one.
   *
   * A host that answers with one public A record and one private AAAA record
   * passes any check that stops at the first result, and then the request goes
   * out over whichever family the stack prefers. Refusing the whole host is
   * the only safe reading of a mixed answer.
   */
  for (const address of addresses) {
    const why = addressRefusalReason(address);
    if (why !== null) {
      return {
        ok: false,
        refusal: { kind: 'blocked_private', detail: `${host} resolves to ${address}, which is ${why}` },
      };
    }
  }

  return { ok: true, addresses };
}
