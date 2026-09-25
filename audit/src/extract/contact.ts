import type { ExtractedValue } from './types.ts';

/**
 * PUBLICLY PRESENTED CONTACT DETAILS, AND THE LIMITS OF FINDING THEM.
 *
 * Only what a page puts on display for people to use — the address on a
 * contact page, the `mailto:` on a footer, the `tel:` on a header. Nothing
 * here reads a login-protected page, defeats an obfuscation, decodes an
 * image, or assembles an address from fragments the publisher deliberately
 * split up. A site that has gone to trouble to not publish something has
 * published nothing, and this treats that as the answer.
 *
 * ── WHY EVERY REGEX RESULT IS MARKED WEAKER ─────────────────────────────────
 *
 * A `mailto:` href is a declaration: the publisher marked that string as an
 * address in machine-readable form. A regex over prose is pattern-matching
 * with good odds, and its false positives are confident — version strings look
 * like phone numbers, `@` appears in handles, and a "call 020 7946 0000"
 * inside a quoted customer complaint is not the company's number.
 *
 * So both are collected and `method` separates them permanently. Nothing
 * downstream has to guess which kind it is holding.
 */

/* Deliberately conservative. A fuller pattern matches more addresses and also
   matches far more things that are not addresses, and the cost of a wrong
   contact detail in an audit is higher than the cost of a missing one. */
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/g;

/**
 * International-ish phone numbers.
 *
 * Requires either a leading `+` or a recognisable grouping, and a minimum
 * length, because `2024` and `1.2.3-456` otherwise match happily.
 */
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d{2,5}(?:[\s.-]\d{2,5}){1,4}\b/g;

/** Hosts whose presence in a link is a social profile rather than a citation. */
const SOCIAL_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)linkedin\.com$/i, 'linkedin'],
  [/(^|\.)x\.com$/i, 'x'],
  [/(^|\.)twitter\.com$/i, 'x'],
  [/(^|\.)facebook\.com$/i, 'facebook'],
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)youtube\.com$/i, 'youtube'],
  [/(^|\.)github\.com$/i, 'github'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
  [/(^|\.)threads\.net$/i, 'threads'],
  [/(^|\.)mastodon\.[a-z.]+$/i, 'mastodon'],
];

function around(text: string, start: number, end: number, pad = 60): string {
  return text.slice(Math.max(0, start - pad), Math.min(text.length, end + pad)).replace(/\s+/g, ' ').trim();
}

/** A phone number reduced to digits, for comparing two spellings of one number. */
function phoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function contactFromLinks(hrefs: Array<{ href: string; rel: string | null }>): ExtractedValue[] {
  const out: ExtractedValue[] = [];
  for (const { href, rel } of hrefs) {
    const lower = href.trim().toLowerCase();
    if (lower.startsWith('mailto:')) {
      const value = decodeURIComponent(href.slice(7).split('?')[0] ?? '').trim();
      if (value !== '' && EMAIL.test(value)) {
        EMAIL.lastIndex = 0;
        out.push({ field: 'email', value: value.toLowerCase(), method: 'link', charStart: null, charEnd: null, evidence: href });
      }
      EMAIL.lastIndex = 0;
      continue;
    }
    if (lower.startsWith('tel:')) {
      const value = decodeURIComponent(href.slice(4)).replace(/\s+/g, ' ').trim();
      if (value !== '' && phoneKey(value).length >= 7) {
        out.push({ field: 'phone', value, method: 'link', charStart: null, charEnd: null, evidence: href });
      }
      continue;
    }
    let host: string;
    try {
      host = new URL(href).hostname.toLowerCase();
    } catch {
      continue;
    }
    for (const [pattern, network] of SOCIAL_HOSTS) {
      if (pattern.test(host)) {
        out.push({
          field: 'social',
          value: href,
          /* rel="me" is the publisher asserting ownership of that profile,
             which is a stronger claim than merely linking to it. */
          method: rel?.includes('me') === true ? 'link' : 'dom',
          charStart: null,
          charEnd: null,
          evidence: `${network}: ${href}`,
        });
        break;
      }
    }
  }
  return out;
}

/** Pattern matches over the extracted prose. Always weaker than a link. */
export function contactFromText(text: string): ExtractedValue[] {
  const out: ExtractedValue[] = [];

  EMAIL.lastIndex = 0;
  for (const m of text.matchAll(EMAIL)) {
    const start = m.index ?? 0;
    out.push({
      field: 'email',
      value: m[0].toLowerCase(),
      method: 'pattern',
      charStart: start,
      charEnd: start + m[0].length,
      evidence: around(text, start, start + m[0].length),
    });
  }

  PHONE.lastIndex = 0;
  for (const m of text.matchAll(PHONE)) {
    const raw = m[0].trim();
    const key = phoneKey(raw);
    /* Reject the things that look like numbers and are not: too short, and
       long unbroken runs that are far more likely to be an id than a number. */
    if (key.length < 8 || key.length > 15) continue;
    if (!/[\s.()-]/.test(raw) && !raw.startsWith('+')) continue;
    const start = m.index ?? 0;
    out.push({
      field: 'phone',
      value: raw,
      method: 'pattern',
      charStart: start,
      charEnd: start + m[0].length,
      evidence: around(text, start, start + m[0].length),
    });
  }

  return out;
}

/**
 * Collapse rival spellings of the same value, keeping the strongest method.
 *
 * Without this, one email that appears in a `mailto:` and again in the footer
 * prose becomes two rows, and the weaker one is indistinguishable from an
 * independent find.
 */
export function dedupeValues(values: ExtractedValue[], strength: Record<string, number>): ExtractedValue[] {
  const best = new Map<string, ExtractedValue>();
  for (const v of values) {
    const identity =
      v.field === 'phone' ? `phone:${phoneKey(v.value)}` : `${v.field}:${v.value.trim().toLowerCase()}`;
    const existing = best.get(identity);
    if (existing === undefined || (strength[v.method] ?? 0) > (strength[existing.method] ?? 0)) {
      best.set(identity, v);
    }
  }
  return [...best.values()];
}
