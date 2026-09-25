/**
 * DETERMINISTIC NORMALIZATION. NO MODEL IS CONSULTED, EVER.
 *
 * Every function here is a pure function of its input. That is not a stylistic
 * preference: normalisation decides identity, identity decides merges, and a
 * merge is the one operation in this system that can silently attribute one
 * business's phone number to another. A rule you can read is a rule you can
 * argue with when it is wrong. A model's judgement about whether two strings
 * mean the same company is neither reproducible nor checkable, and it would be
 * making exactly the decision that must never be a guess.
 *
 * ── THE PRINCIPLE THAT SHAPES ALL OF IT ─────────────────────────────────────
 *
 * Normalisation LOSES information, on purpose. So the raw value is always kept
 * beside the normalised one, and normalisation never removes something that
 * could be the distinguishing feature. "Grand Hotel Delhi" and "Grand Hotel
 * Gurgaon" must not normalise to the same string — the city is the entire
 * difference between them.
 */

/* -------------------------------------------------------------------------- */
/* TEXT                                                                        */
/* -------------------------------------------------------------------------- */

/** Strip accents so "Café" and "Cafe" meet, without touching anything else. */
export function foldDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/**
 * Legal forms, recognised rather than deleted.
 *
 * "Acme Pvt Ltd" and "Acme Private Limited" are the same company, so the suffix
 * must not block a match. But the suffix is also the difference between a legal
 * entity and a brand, so it is EXTRACTED and returned rather than thrown away.
 */
const LEGAL_FORMS: Array<[RegExp, string]> = [
  [/\b(private limited|pvt\.? ?ltd\.?|pvt\.? limited)\b/g, 'PVT_LTD'],
  [/\b(public limited|plc)\b/g, 'PLC'],
  [/\b(limited liability partnership|llp)\b/g, 'LLP'],
  [/\b(limited|ltd\.?)\b/g, 'LTD'],
  [/\b(incorporated|inc\.?)\b/g, 'INC'],
  [/\b(l\.?l\.?c\.?)\b/g, 'LLC'],
  [/\b(gmbh)\b/g, 'GMBH'],
  [/\b(b\.?v\.?)\b/g, 'BV'],
  [/\b(pte\.? ?ltd\.?|pte)\b/g, 'PTE'],
  [/\b(s\.?a\.?r\.?l\.?)\b/g, 'SARL'],
  [/\b(co\.|company)\b/g, 'CO'],
  [/\b(corp\.?|corporation)\b/g, 'CORP'],
];

export interface NormalizedName {
  /** Lowercase, folded, punctuation-free, legal form removed. The blocking key. */
  normalized: string;
  /** The same, with the legal form still in it. For display comparisons. */
  withLegalForm: string;
  /** Which legal forms were recognised, if any. */
  legalForms: string[];
  /** Word tokens of `normalized`, for set-overlap comparison. */
  tokens: string[];
  raw: string;
}

export function normalizeName(raw: string): NormalizedName {
  const folded = foldDiacritics(raw)
    .toLowerCase()
    /* An ampersand is a word, and "Marks & Spencer" vs "Marks and Spencer"
       should meet rather than differ by a character class. */
    .replace(/&/g, ' and ')
    .replace(/[''`]/g, '')
    /* Keep alphanumerics and spaces. Hyphens become spaces so "abc-cafe" and
       "abc cafe" tokenise identically. */
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let stripped = ` ${folded} `;
  const legalForms: string[] = [];
  for (const [pattern, label] of LEGAL_FORMS) {
    pattern.lastIndex = 0;
    if (pattern.test(stripped)) {
      legalForms.push(label);
      pattern.lastIndex = 0;
      stripped = stripped.replace(pattern, ' ');
    }
  }
  const normalized = stripped.replace(/\s+/g, ' ').trim();

  return {
    /* If removing the legal form leaves nothing, the legal form WAS the name.
       "Limited" as a company name is rare and refusing to empty the string is
       cheaper than the bug that follows an empty blocking key. */
    normalized: normalized === '' ? folded : normalized,
    withLegalForm: folded,
    legalForms: [...new Set(legalForms)],
    tokens: (normalized === '' ? folded : normalized).split(' ').filter((t) => t !== ''),
    raw,
  };
}

/* -------------------------------------------------------------------------- */
/* DOMAIN AND URL                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A domain, reduced to what identifies a site.
 *
 * `https://WWW.Example.com/`, `example.com` and `http://example.com/#x` are one
 * site. A leading `www.` is stripped because it is a convention rather than a
 * distinction; no other subdomain is, because `shop.example.com` and
 * `careers.example.com` genuinely are different places.
 */
export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (value === '') return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = `http://${value}`;
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/\.$/, '').replace(/^www\./, '');
  if (host === '' || !host.includes('.')) return null;
  return host;
}

/** A URL reduced to a stable identity: scheme dropped, path kept, query sorted. */
export function normalizeWebUrl(input: string): string | null {
  let value = input.trim();
  if (value === '') return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  url.searchParams.sort();
  const query = url.searchParams.toString();
  let path = url.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '/') path = '';
  return `${host}${path}${query === '' ? '' : `?${query}`}`;
}

/* -------------------------------------------------------------------------- */
/* PHONE                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Dialling codes this normaliser knows, longest-first.
 *
 * Deliberately a short list rather than a full plan: a wrong country code
 * produces a wrong identity, and a country that is absent here degrades to
 * NATIONAL — which is a weaker match, not an incorrect one. Adding a country
 * is adding a row.
 */
const DIAL_CODES: Array<{ code: string; iso: string; nsnLength: number[] }> = [
  { code: '1', iso: 'US', nsnLength: [10] },
  { code: '7', iso: 'RU', nsnLength: [10] },
  { code: '20', iso: 'EG', nsnLength: [9, 10] },
  { code: '27', iso: 'ZA', nsnLength: [9] },
  { code: '33', iso: 'FR', nsnLength: [9] },
  { code: '34', iso: 'ES', nsnLength: [9] },
  { code: '39', iso: 'IT', nsnLength: [9, 10] },
  { code: '44', iso: 'GB', nsnLength: [10] },
  { code: '49', iso: 'DE', nsnLength: [10, 11] },
  { code: '52', iso: 'MX', nsnLength: [10] },
  { code: '55', iso: 'BR', nsnLength: [10, 11] },
  { code: '61', iso: 'AU', nsnLength: [9] },
  { code: '65', iso: 'SG', nsnLength: [8] },
  { code: '81', iso: 'JP', nsnLength: [10] },
  { code: '86', iso: 'CN', nsnLength: [11] },
  { code: '91', iso: 'IN', nsnLength: [10] },
  { code: '971', iso: 'AE', nsnLength: [9] },
  { code: '966', iso: 'SA', nsnLength: [9] },
  { code: '880', iso: 'BD', nsnLength: [10] },
  { code: '977', iso: 'NP', nsnLength: [10] },
];

export interface NormalizedPhone {
  /** Full international form, only when the country is actually known. */
  e164: string | null;
  /**
   * The national significant number — the digits without country code or
   * trunk prefix. Always produced. This is the BLOCKING key: it brings
   * candidates together without asserting they are the same number.
   */
  national: string;
  countryIso: string | null;
  /**
   * `international` — a `+` was present, so the country is stated.
   * `national`    — no country was stated and none was supplied. The digits
   *                 match, the country does not, and a match on this alone is
   *                 a candidate rather than a strong identifier.
   * `invalid`     — too few digits to be a phone number.
   */
  form: 'international' | 'national' | 'invalid';
  raw: string;
}

/**
 * Normalise a phone number without assuming where the world is.
 *
 * `defaultCountry` is a parameter and has no default value. A service that
 * quietly assumes one country produces a subtle, confident error the moment it
 * meets a number from anywhere else, and the failure looks like a data problem
 * rather than a code one. When no country is known, the result is NATIONAL and
 * downstream treats it as weaker evidence — which is exactly what it is.
 */
export function normalizePhone(raw: string, defaultCountry?: string): NormalizedPhone {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+') || trimmed.startsWith('00');
  let digits = trimmed.replace(/[^\d]/g, '');
  if (trimmed.startsWith('00')) digits = digits.slice(2);

  if (digits.length < 7) {
    return { e164: null, national: digits, countryIso: null, form: 'invalid', raw };
  }

  if (hasPlus) {
    /* Longest matching dial code wins: '91' must not shadow '911'. */
    const candidates = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const c of candidates) {
      if (!digits.startsWith(c.code)) continue;
      let nsn = digits.slice(c.code.length);
      /* A trunk prefix after a country code is a formatting error people make
         constantly: +91 098… is +91 98…. */
      if (nsn.startsWith('0')) nsn = nsn.replace(/^0+/, '');
      if (c.nsnLength.includes(nsn.length)) {
        return { e164: `+${c.code}${nsn}`, national: nsn, countryIso: c.iso, form: 'international', raw };
      }
    }
    /* A `+` we cannot attribute is still international; keep the digits whole
       rather than inventing a split. */
    return { e164: `+${digits}`, national: digits, countryIso: null, form: 'international', raw };
  }

  /* No country stated. A leading zero is a trunk prefix in most national plans. */
  let nsn = digits.replace(/^0+/, '');

  if (defaultCountry !== undefined) {
    const c = DIAL_CODES.find((x) => x.iso === defaultCountry.toUpperCase());
    if (c) {
      if (nsn.startsWith(c.code) && c.nsnLength.includes(nsn.length - c.code.length)) {
        nsn = nsn.slice(c.code.length);
      }
      if (c.nsnLength.includes(nsn.length)) {
        return { e164: `+${c.code}${nsn}`, national: nsn, countryIso: c.iso, form: 'international', raw };
      }
    }
  }

  /* Keep the last 10 as the comparable tail where the number is longer: a
     national number written with an area code still ends in the same digits. */
  const tail = nsn.length > 10 ? nsn.slice(-10) : nsn;
  return { e164: null, national: tail, countryIso: null, form: 'national', raw };
}

/* -------------------------------------------------------------------------- */
/* EMAIL                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Lowercased, and nothing else.
 *
 * Gmail's dot-and-plus aliasing is a Gmail rule, not an email rule — applying
 * it generally would merge two genuinely different mailboxes at any provider
 * that treats dots as significant. The local part is left alone.
 */
export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  const m = value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  if (m === null) return null;
  const at = value.lastIndexOf('@');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).replace(/\.$/, '');
  if (local === '' || domain === '') return null;
  return `${local}@${domain}`;
}

/* -------------------------------------------------------------------------- */
/* SOCIAL                                                                      */
/* -------------------------------------------------------------------------- */

const SOCIAL_PATTERNS: Array<{ network: string; host: RegExp; path: RegExp }> = [
  { network: 'linkedin', host: /(^|\.)linkedin\.com$/i, path: /^\/(company|school|in)\/([^/?#]+)/i },
  { network: 'instagram', host: /(^|\.)instagram\.com$/i, path: /^\/([^/?#]+)/ },
  { network: 'x', host: /(^|\.)(x|twitter)\.com$/i, path: /^\/([^/?#]+)/ },
  { network: 'facebook', host: /(^|\.)facebook\.com$/i, path: /^\/([^/?#]+)/ },
  { network: 'youtube', host: /(^|\.)youtube\.com$/i, path: /^\/(@[^/?#]+|c\/[^/?#]+|channel\/[^/?#]+)/i },
  { network: 'github', host: /(^|\.)github\.com$/i, path: /^\/([^/?#]+)/ },
  { network: 'tiktok', host: /(^|\.)tiktok\.com$/i, path: /^\/(@[^/?#]+)/ },
];

/** Paths that are the platform's own furniture, never an account. */
const SOCIAL_RESERVED = new Set([
  'share', 'sharer', 'intent', 'home', 'login', 'signup', 'explore', 'about',
  'privacy', 'terms', 'help', 'legal', 'settings', 'search', 'p', 'posts', 'pages', 'dialog', 'tr',
]);

export interface NormalizedSocial {
  network: string;
  handle: string;
  /** `network:handle`, the matching key. */
  key: string;
  raw: string;
}

export function normalizeSocial(raw: string): NormalizedSocial | null {
  let value = raw.trim();
  if (value === '') return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  for (const p of SOCIAL_PATTERNS) {
    if (!p.host.test(host)) continue;
    const m = url.pathname.match(p.path);
    if (m === null) return null;
    const captured = (m[2] ?? m[1] ?? '').toLowerCase().replace(/^@/, '').replace(/\/$/, '');
    if (captured === '' || SOCIAL_RESERVED.has(captured)) return null;
    return { network: p.network, handle: captured, key: `${p.network}:${captured}`, raw };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* ADDRESS AND POSTCODE                                                        */
/* -------------------------------------------------------------------------- */

const STREET_WORDS: Array<[RegExp, string]> = [
  [/\bstreet\b/g, 'st'],
  [/\broad\b/g, 'rd'],
  [/\bavenue\b/g, 'ave'],
  [/\bboulevard\b/g, 'blvd'],
  [/\bdrive\b/g, 'dr'],
  [/\blane\b/g, 'ln'],
  [/\bsuite\b/g, 'ste'],
  [/\bfloor\b/g, 'fl'],
  [/\bbuilding\b/g, 'bldg'],
  [/\bapartment\b/g, 'apt'],
  [/\bnagar\b/g, 'ngr'],
  [/\bmarg\b/g, 'mg'],
  [/\bsector\b/g, 'sec'],
  [/\bphase\b/g, 'ph'],
];

export function normalizeAddress(raw: string): string {
  let value = foldDiacritics(raw).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [pattern, short] of STREET_WORDS) {
    pattern.lastIndex = 0;
    value = value.replace(pattern, short);
  }
  return value.replace(/\s+/g, ' ').trim();
}

/** Uppercased and unspaced. No country's format is assumed or validated. */
export function normalizePostalCode(raw: string): string | null {
  const value = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (value.length < 3 || value.length > 10) return null;
  return value;
}

/* -------------------------------------------------------------------------- */
/* CATEGORY                                                                    */
/* -------------------------------------------------------------------------- */

export function normalizeCategory(raw: string): string {
  return foldDiacritics(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* GEOGRAPHY                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A coarse grid cell, for blocking before any distance is computed.
 *
 * ~0.1° is roughly 11 km of latitude, and less of longitude away from the
 * equator. It is not a precise tiling and does not need to be: it exists so a
 * nearby search reads a few hundred rows rather than the whole table, and the
 * real distance filter runs afterwards on the survivors. Neighbouring cells
 * are searched too, so a point near a boundary is not missed.
 */
export function geoCell(lat: number, lon: number, precision = 1): string {
  const f = 10 ** precision;
  return `${Math.floor(lat * f) / f}:${Math.floor(lon * f) / f}`;
}

export function neighbouringCells(lat: number, lon: number, radiusKm: number, precision = 1): string[] {
  const step = 1 / 10 ** precision;
  /* One degree of latitude is ~111 km everywhere; longitude shrinks with
     latitude, so the span is widened by 1/cos(lat) to stay correct near the
     poles rather than only near the equator. */
  const latSpan = radiusKm / 111;
  const lonSpan = radiusKm / Math.max(1e-6, 111 * Math.cos((lat * Math.PI) / 180));
  const cells = new Set<string>();
  for (let dLat = -latSpan; dLat <= latSpan + step; dLat += step) {
    for (let dLon = -lonSpan; dLon <= lonSpan + step; dLon += step) {
      cells.add(geoCell(lat + dLat, lon + dLon, precision));
    }
  }
  cells.add(geoCell(lat, lon, precision));
  return [...cells];
}

/** Great-circle distance in kilometres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* -------------------------------------------------------------------------- */
/* SIMILARITY                                                                  */
/* -------------------------------------------------------------------------- */

/** Jaro-Winkler: good on short strings and forgiving of a shared prefix. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aFlags = new Array<boolean>(a.length).fill(false);
  const bFlags = new Array<boolean>(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const from = Math.max(0, i - window);
    const to = Math.min(i + window + 1, b.length);
    for (let j = from; j < to; j++) {
      if (bFlags[j] === true || a[i] !== b[j]) continue;
      aFlags[i] = true;
      bFlags[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (aFlags[i] !== true) continue;
    while (bFlags[k] !== true) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  const t = transpositions / 2;
  const jaro = (matches / a.length + matches / b.length + (matches - t) / matches) / 3;

  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Token-set overlap. Catches reordering that character similarity misses. */
export function tokenJaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

export interface NameSimilarity {
  /** The combined figure. Used for ranking candidates, never for deciding. */
  score: number;
  jaroWinkler: number;
  jaccard: number;
  /**
   * Tokens present in one name and not the other.
   *
   * The most important field here, and the reason similarity is returned as a
   * structure rather than a number. "Grand Hotel Delhi" and "Grand Hotel
   * Gurgaon" score 0.88 on characters and share two of three tokens — and the
   * token that differs is the city, which is the whole difference between two
   * real, separate hotels. A scalar cannot express that; this can.
   */
  distinguishingTokens: string[];
}

export function nameSimilarity(a: NormalizedName, b: NormalizedName): NameSimilarity {
  const jw = jaroWinkler(a.normalized, b.normalized);
  const jac = tokenJaccard(a.tokens, b.tokens);
  const setA = new Set(a.tokens);
  const setB = new Set(b.tokens);
  const distinguishing = [
    ...a.tokens.filter((t) => !setB.has(t)),
    ...b.tokens.filter((t) => !setA.has(t)),
  ];
  return {
    /* Weighted toward token overlap, which is the more reliable of the two for
       multi-word business names; characters carry the rest. */
    score: 0.45 * jw + 0.55 * jac,
    jaroWinkler: jw,
    jaccard: jac,
    distinguishingTokens: [...new Set(distinguishing)],
  };
}
