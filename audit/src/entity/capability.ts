import type { HtmlExtraction } from '../extract/html.ts';

/**
 * WHAT A BUSINESS CAN DO, INFERRED FROM EVIDENCE AND NEVER FROM SILENCE.
 *
 * ── THE ANSWER THAT DOES NOT EXIST ──────────────────────────────────────────
 *
 * "This business has no ecommerce" is not something a crawler can establish.
 * It can establish that it fetched four pages and found no cart, which is a
 * statement about the crawl at least as much as about the business — the shop
 * may be behind a subdomain nobody linked, on a marketplace, in an app, or on
 * a page that robots.txt refused.
 *
 * So there are four answers and `NOT_OBSERVED` is deliberately distinct from
 * false: it means somebody looked and did not find, which is worth knowing and
 * is not the same claim. A boolean column would have collapsed those two, and
 * every query built on it would have inherited the collapse.
 *
 * ── WHY SIGNALS ARE WEIGHTED AND SUMMED ─────────────────────────────────────
 *
 * A `<script src="cdn.shopify.com">` is close to decisive. The word "cart"
 * appearing in a page is close to meaningless — it is in navigation on sites
 * that sell nothing, and in blog posts about abandoned carts. Weighting lets
 * both contribute what they are worth instead of forcing a choice between
 * ignoring the weak signal and trusting it.
 */

export type CapabilityState = 'CONFIRMED' | 'PROBABLE' | 'NOT_OBSERVED' | 'UNKNOWN';

export interface CapabilitySignal {
  capability: string;
  signal: string;
  weight: number;
  /** What was actually seen, so the signal can be checked rather than trusted. */
  evidence: string;
}

/**
 * Platform fingerprints. Decisive because they are the platform naming itself.
 *
 * A page that loads Shopify's own CDN is running a Shopify storefront; that is
 * not an inference about intent, it is an observation about what the page is.
 */
const PLATFORM: Array<[RegExp, string, number, string]> = [
  [/cdn\.shopify\.com|shopify\.com\/s\/files|Shopify\.theme/i, 'shopify', 1.0, 'Shopify assets'],
  [/woocommerce|wc-ajax|wp-content\/plugins\/woocommerce/i, 'woocommerce', 1.0, 'WooCommerce markers'],
  [/cdn\.bigcommerce\.com|bigcommerce\.com\/s-/i, 'bigcommerce', 1.0, 'BigCommerce assets'],
  [/magento|mage\/cookies|static\/version\d+\/frontend/i, 'magento', 0.9, 'Magento markers'],
  [/squarespace-cdn\.com.*commerce|static1\.squarespace\.com\/static\/.*commerce/i, 'squarespace-commerce', 0.8, 'Squarespace commerce assets'],
  [/wixstores|_partials\/wixstores/i, 'wix-stores', 0.9, 'Wix Stores markers'],
  [/snipcart|gumroad\.com\/js|lemonsqueezy/i, 'hosted-checkout', 0.8, 'hosted checkout widget'],
  [/js\.stripe\.com|checkout\.razorpay\.com|checkout\.stripe\.com/i, 'payment-sdk', 0.7, 'payment SDK'],
];

/** Paths that are what they say they are. A `/checkout` route is a checkout. */
const COMMERCE_PATHS: Array<[RegExp, string, number]> = [
  [/\/(checkout|basket)(\/|$|\?)/i, 'checkout-path', 0.9],
  [/\/cart(\/|$|\?)/i, 'cart-path', 0.7],
  [/\/(shop|store|products?)(\/|$|\?)/i, 'shop-path', 0.35],
  [/\/(collections?|catalog)(\/|$|\?)/i, 'catalog-path', 0.3],
  [/add[-_]?to[-_]?cart/i, 'add-to-cart', 0.8],
];

/** Marketplaces, which are ecommerce on someone else's storefront. */
const MARKETPLACE: Array<[RegExp, string]> = [
  [/(^|\.)amazon\.[a-z.]+$/i, 'amazon'],
  [/(^|\.)flipkart\.com$/i, 'flipkart'],
  [/(^|\.)etsy\.com$/i, 'etsy'],
  [/(^|\.)ebay\.[a-z.]+$/i, 'ebay'],
  [/(^|\.)myntra\.com$/i, 'myntra'],
  [/(^|\.)nykaa\.com$/i, 'nykaa'],
  [/(^|\.)meesho\.com$/i, 'meesho'],
  [/(^|\.)indiamart\.com$/i, 'indiamart'],
  [/(^|\.)alibaba\.com$/i, 'alibaba'],
  [/(^|\.)zomato\.com$/i, 'zomato'],
  [/(^|\.)swiggy\.com$/i, 'swiggy'],
];

function typeOf(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return [];
  const t = (node as { '@type'?: unknown })['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

/**
 * Read one document for capability evidence.
 *
 * Returns the signals found AND the capabilities that were looked for, because
 * the second list is what turns an empty result into `NOT_OBSERVED` rather
 * than `UNKNOWN`. Without recording that we probed, a page that was never
 * checked is indistinguishable from one that was checked and was clean.
 */
export function detectCapabilities(
  extraction: HtmlExtraction,
  rawHtml: string,
): { signals: CapabilitySignal[]; probed: string[] } {
  const signals: CapabilitySignal[] = [];
  const probed = ['ecommerce', 'website', 'social', 'marketplace', 'phone', 'email'];
  const add = (capability: string, signal: string, weight: number, evidence: string) => {
    signals.push({ capability, signal, weight, evidence: evidence.slice(0, 200) });
  };

  /* ---- ecommerce: platform fingerprints ------------------------------- */
  for (const [pattern, name, weight, label] of PLATFORM) {
    const m = rawHtml.match(pattern);
    if (m) add('ecommerce', name, weight, `${label}: ${m[0]}`);
  }

  /* ---- ecommerce: structured Offer data ------------------------------- */
  for (const node of extraction.jsonld) {
    const types = typeOf(node);
    if (types.some((t) => /^Offer$/i.test(t))) {
      const o = node as Record<string, unknown>;
      /* An Offer with a price and an availability is a purchase proposition;
         an Offer with neither is frequently decoration on a service page. */
      const priced = o.price !== undefined || o.priceSpecification !== undefined;
      add('ecommerce', 'offer_jsonld', priced ? 0.85 : 0.4, `schema.org Offer${priced ? ' with a price' : ''}`);
    }
    if (types.some((t) => /^Product$/i.test(t))) {
      const o = node as Record<string, unknown>;
      add('ecommerce', 'product_jsonld', o.offers === undefined ? 0.35 : 0.8, 'schema.org Product');
    }
  }

  /* ---- ecommerce: routes the site links to ---------------------------- */
  const seenPath = new Set<string>();
  for (const link of extraction.links) {
    let path: string;
    try {
      path = new URL(link.href).pathname;
    } catch {
      continue;
    }
    for (const [pattern, name, weight] of COMMERCE_PATHS) {
      if (pattern.test(path) && !seenPath.has(name)) {
        seenPath.add(name);
        add('ecommerce', name, weight, link.href);
      }
    }
  }

  /* ---- marketplace presence ------------------------------------------- */
  const seenMarket = new Set<string>();
  for (const link of extraction.links) {
    let host: string;
    try {
      host = new URL(link.href).hostname;
    } catch {
      continue;
    }
    for (const [pattern, name] of MARKETPLACE) {
      if (pattern.test(host) && !seenMarket.has(name)) {
        seenMarket.add(name);
        add('marketplace', name, 0.8, link.href);
        /* A marketplace storefront IS ecommerce, on someone else's site. */
        add('ecommerce', `marketplace:${name}`, 0.7, link.href);
      }
    }
  }

  /* ---- the simple presences ------------------------------------------- */
  if (extraction.values.some((v) => v.field === 'email')) {
    const v = extraction.values.find((x) => x.field === 'email');
    add('email', v?.method ?? 'dom', v?.method === 'jsonld' || v?.method === 'link' ? 1 : 0.5, v?.value ?? '');
  }
  if (extraction.values.some((v) => v.field === 'phone')) {
    const v = extraction.values.find((x) => x.field === 'phone');
    add('phone', v?.method ?? 'dom', v?.method === 'jsonld' || v?.method === 'link' ? 1 : 0.5, v?.value ?? '');
  }
  for (const v of extraction.values.filter((x) => x.field === 'social')) {
    add('social', v.method, v.method === 'jsonld' ? 1 : 0.7, v.value);
  }
  add('website', 'crawled', 1, extraction.url);

  return { signals, probed };
}

/**
 * Turn accumulated signals into one of four answers.
 *
 * `probed` is the parameter that makes this honest: with no probe recorded the
 * answer is UNKNOWN, never NOT_OBSERVED, because nobody looked.
 */
export function capabilityState(
  signals: Array<{ signal: string; weight: number }>,
  probed: boolean,
): { state: CapabilityState; score: number; reason: string } {
  if (signals.length === 0) {
    return probed
      ? {
          state: 'NOT_OBSERVED',
          score: 0,
          /* The wording matters. This is a statement about what was looked at. */
          reason: 'looked for and not found in the sources crawled so far',
        }
      : { state: 'UNKNOWN', score: 0, reason: 'no source has been checked for this' };
  }

  const score = signals.reduce((a, s) => a + s.weight, 0);
  const strongest = [...signals].sort((a, b) => b.weight - a.weight)[0];

  if (score >= 1.0 && (strongest?.weight ?? 0) >= 0.8) {
    return { state: 'CONFIRMED', score, reason: `${strongest?.signal} is decisive on its own` };
  }
  if (score >= 0.7) {
    return {
      state: 'PROBABLE',
      score,
      reason: `${signals.length} signal(s) totalling ${score.toFixed(2)}, strongest ${strongest?.signal}`,
    };
  }
  return {
    state: 'PROBABLE',
    score,
    reason: `weak evidence only (${score.toFixed(2)}): ${signals.map((s) => s.signal).join(', ')}`,
  };
}
