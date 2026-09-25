import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

process.env.API_KEY ??= 'test-key-that-is-long-enough-to-pass-validation';
process.env.CRAWL_ALLOW_PRIVATE_NETWORKS = 'false';

const N = await import('../src/entity/normalize.ts');
const { compareEntities } = await import('../src/entity/resolve.ts');
const { capabilityState, detectCapabilities } = await import('../src/entity/capability.ts');
const { extractHtml } = await import('../src/extract/html.ts');

type EntityFacts = Parameters<typeof compareEntities>[0];

/** A minimal entity, so each test states only the field it is about. */
const ent = (
  name: string,
  overrides: Partial<Omit<EntityFacts, 'name'>> = {},
): EntityFacts => ({
  id: overrides.id ?? name,
  type: overrides.type ?? 'ORGANIZATION',
  canonicalName: name,
  name: N.normalizeName(name),
  identifiers: overrides.identifiers ?? [],
  locations: overrides.locations ?? [],
});

const loc = (o: Partial<EntityFacts['locations'][number]> = {}): EntityFacts['locations'][number] => ({
  postalCode: o.postalCode ?? null,
  city: o.city ?? null,
  locality: o.locality ?? null,
  country: o.country ?? null,
  latitude: o.latitude ?? null,
  longitude: o.longitude ?? null,
  addressNormalized: o.addressNormalized ?? null,
});

/* ========================================================================== */
describe('normalization — names', () => {
  it('folds diacritics so Café and Cafe meet', () => {
    assert.equal(N.normalizeName('ABC Café').normalized, N.normalizeName('ABC Cafe').normalized);
  });

  it('recognises a legal form instead of deleting it', () => {
    const a = N.normalizeName('Acme Foods Pvt Ltd');
    const b = N.normalizeName('Acme Foods Private Limited');
    assert.equal(a.normalized, b.normalized, 'the same company written two ways');
    assert.equal(a.normalized, 'acme foods');
    assert.ok(a.legalForms.includes('PVT_LTD'), 'and the legal form is kept, not thrown away');
  });

  it('treats & and "and" as the same word', () => {
    assert.equal(N.normalizeName('Marks & Spencer').normalized, N.normalizeName('Marks and Spencer').normalized);
  });

  it('does NOT collapse names that differ by a place', () => {
    const a = N.normalizeName('Grand Hotel Delhi');
    const b = N.normalizeName('Grand Hotel Gurgaon');
    assert.notEqual(a.normalized, b.normalized, 'the city is the entire difference between two hotels');
  });

  it('refuses to normalise a name down to nothing', () => {
    assert.notEqual(N.normalizeName('Limited').normalized, '');
  });
});

describe('normalization — domains and URLs', () => {
  it('collapses scheme, case, www and trailing slash', () => {
    const forms = ['www.example.com/', 'https://example.com', 'EXAMPLE.COM', 'http://WWW.Example.com/#x'];
    const normalized = forms.map((f) => N.normalizeDomain(f));
    assert.deepEqual(new Set(normalized), new Set(['example.com']), 'all four are one domain');
  });

  it('keeps a meaningful subdomain', () => {
    assert.equal(N.normalizeDomain('https://shop.example.com'), 'shop.example.com');
    assert.notEqual(N.normalizeDomain('shop.example.com'), N.normalizeDomain('careers.example.com'));
  });

  it('rejects things that are not web addresses', () => {
    assert.equal(N.normalizeDomain('not a domain'), null);
    assert.equal(N.normalizeDomain('localhost'), null);
  });
});

describe('normalization — phones', () => {
  it('handles an Indian number in every spelling people use', () => {
    const forms = ['+91 98765 43210', '+919876543210', '0091-98765-43210', '+91 098765 43210'];
    const e164 = forms.map((f) => N.normalizePhone(f).e164);
    assert.deepEqual(new Set(e164), new Set(['+919876543210']), forms.join(' / '));
  });

  it('strips a trunk prefix but does not invent a country', () => {
    const national = N.normalizePhone('098765 43210');
    assert.equal(national.form, 'national', 'no country was stated, so none is asserted');
    assert.equal(national.countryIso, null);
    assert.equal(national.e164, null, 'inventing +91 here would be a guess');
    assert.equal(national.national, '9876543210', 'but the digits still block against the E.164 form');
  });

  it('uses a country hint when one is supplied, and only then', () => {
    const hinted = N.normalizePhone('098765 43210', 'IN');
    assert.equal(hinted.e164, '+919876543210');
    assert.equal(hinted.countryIso, 'IN');
  });

  it('does not mistake one country code for another', () => {
    assert.equal(N.normalizePhone('+44 20 7946 0000').countryIso, 'GB');
    assert.equal(N.normalizePhone('+1 415 555 0100').countryIso, 'US');
    assert.equal(N.normalizePhone('+971 50 123 4567').countryIso, 'AE');
  });

  it('rejects things that are too short to be a phone number', () => {
    assert.equal(N.normalizePhone('2024').form, 'invalid');
  });
});

describe('normalization — email, social, address, postcode', () => {
  it('lowercases an email and leaves the local part alone', () => {
    assert.equal(N.normalizeEmail('  Hello@Example.COM '), 'hello@example.com');
    assert.notEqual(
      N.normalizeEmail('first.last@example.com'),
      N.normalizeEmail('firstlast@example.com'),
      'dot-stripping is a Gmail rule, not an email rule',
    );
    assert.equal(N.normalizeEmail('nope'), null);
  });

  it('extracts a social handle from any URL form', () => {
    const a = N.normalizeSocial('https://www.instagram.com/abccafe/');
    const b = N.normalizeSocial('instagram.com/@AbcCafe?hl=en');
    assert.equal(a?.key, 'instagram:abccafe');
    assert.equal(b?.key, a?.key);
    assert.equal(N.normalizeSocial('https://facebook.com/sharer')?.key, undefined, 'platform furniture is not an account');
  });

  it('normalises addresses without destroying the distinguishing part', () => {
    assert.equal(N.normalizeAddress('12 High Street, London'), N.normalizeAddress('12 High St London'));
    assert.notEqual(N.normalizeAddress('12 High St, Delhi'), N.normalizeAddress('12 High St, Gurgaon'));
  });

  it('normalises postcodes without asserting a country format', () => {
    assert.equal(N.normalizePostalCode('e1 6an'), 'E16AN');
    assert.equal(N.normalizePostalCode('110 001'), '110001');
    assert.equal(N.normalizePostalCode('x'), null);
  });
});

describe('similarity', () => {
  it('reports the tokens that distinguish two similar names', () => {
    const s = N.nameSimilarity(N.normalizeName('Grand Hotel Delhi'), N.normalizeName('Grand Hotel Gurgaon'));
    assert.ok(s.score > 0.5, 'they really are similar');
    assert.deepEqual(new Set(s.distinguishingTokens), new Set(['delhi', 'gurgaon']));
  });

  it('scores a reordering as similar', () => {
    const s = N.nameSimilarity(N.normalizeName('Hotel Grand'), N.normalizeName('Grand Hotel'));
    assert.ok(s.jaccard > 0.9, 'the same tokens in a different order');
  });
});

describe('geography', () => {
  it('measures a known distance correctly', () => {
    /* Delhi to Gurgaon is about 30 km; the exact figure depends on the points. */
    const km = N.haversineKm(28.6139, 77.209, 28.4595, 77.0266);
    assert.ok(km > 20 && km < 40, `expected roughly 30km, got ${km.toFixed(1)}`);
  });

  it('covers a radius with grid cells, including the origin', () => {
    const cells = N.neighbouringCells(28.6139, 77.209, 5);
    assert.ok(cells.includes(N.geoCell(28.6139, 77.209)), 'the origin cell must be searched');
    assert.ok(cells.length >= 4, 'and its neighbours, so a point near a boundary is not lost');
  });

  it('widens the longitude span away from the equator', () => {
    const equator = N.neighbouringCells(0, 0, 50).length;
    const north = N.neighbouringCells(60, 0, 50).length;
    assert.ok(north > equator, 'a degree of longitude is shorter at 60N and the search must widen');
  });
});

/* ========================================================================== */
describe('entity resolution — strong identifiers', () => {
  it('merges on a shared declared domain', () => {
    const a = ent('ABC Cafe', { id: 'a', identifiers: [{ kind: 'domain', value: 'abc-cafe.com', verified: true }] });
    const b = ent('ABC Café', { id: 'b', identifiers: [{ kind: 'domain', value: 'abc-cafe.com', verified: true }] });
    const r = compareEntities(a, b);
    assert.equal(r.decision, 'SAME_ENTITY');
    assert.match(r.reason, /domain/);
  });

  it('will NOT merge on a shared phone alone', () => {
    const a = ent('ABC Cafe', { id: 'a', identifiers: [{ kind: 'phone', value: '+919876543210', verified: true }] });
    const b = ent('XYZ Salon', { id: 'b', identifiers: [{ kind: 'phone', value: '+919876543210', verified: true }] });
    const r = compareEntities(a, b);
    assert.equal(r.decision, 'PROBABLE_SAME', 'a shared switchboard is several businesses on one number');
    assert.notEqual(r.decision, 'SAME_ENTITY');
  });

  it('merges on a shared phone when the names also agree', () => {
    const a = ent('ABC Cafe', { id: 'a', identifiers: [{ kind: 'phone', value: '+919876543210', verified: true }] });
    const b = ent('ABC Café', { id: 'b', identifiers: [{ kind: 'phone', value: '+919876543210', verified: true }] });
    assert.equal(compareEntities(a, b).decision, 'SAME_ENTITY');
  });
});

describe('entity resolution — composite', () => {
  it('merges the same name at the same postcode', () => {
    const a = ent('ABC Cafe', { id: 'a', locations: [loc({ postalCode: '110001' })] });
    const b = ent('ABC Café', { id: 'b', locations: [loc({ postalCode: '110001' })] });
    const r = compareEntities(a, b);
    assert.equal(r.decision, 'SAME_ENTITY');
    assert.match(r.reason, /same place|postal/i);
  });

  it('merges the same name at nearly the same coordinates', () => {
    const a = ent('ABC Cafe', { id: 'a', locations: [loc({ latitude: 28.6139, longitude: 77.209 })] });
    const b = ent('ABC Cafe', { id: 'b', locations: [loc({ latitude: 28.6140, longitude: 77.2091 })] });
    assert.equal(compareEntities(a, b).decision, 'SAME_ENTITY');
  });
});

describe('entity resolution — FALSE MERGE PREVENTION', () => {
  it('refuses two businesses with the same name in different cities', () => {
    const a = ent('Grand Hotel', { id: 'a', locations: [loc({ city: 'delhi' })] });
    const b = ent('Grand Hotel', { id: 'b', locations: [loc({ city: 'gurgaon' })] });
    const r = compareEntities(a, b);
    assert.equal(r.decision, 'PROBABLE_DIFFERENT', 'identical names, demonstrably different places');
    assert.ok(r.features.blockers.length > 0);
  });

  it('refuses names distinguished by a place, and says which token', () => {
    const a = ent('Grand Hotel Delhi', { id: 'a', locations: [loc({ city: 'delhi' })] });
    const b = ent('Grand Hotel Gurgaon', { id: 'b', locations: [loc({ city: 'gurgaon' })] });
    const r = compareEntities(a, b);
    assert.equal(r.decision, 'PROBABLE_DIFFERENT');
    assert.match(r.reason, /delhi|gurgaon/i, 'the reason must name the distinguishing place');
  });

  it('refuses two businesses at the same building with different names', () => {
    const a = ent('ABC Cafe', { id: 'a', locations: [loc({ postalCode: '110001', latitude: 28.6, longitude: 77.2 })] });
    const b = ent('XYZ Salon', { id: 'b', locations: [loc({ postalCode: '110001', latitude: 28.6, longitude: 77.2 })] });
    const r = compareEntities(a, b);
    assert.ok(
      r.decision === 'DIFFERENT_ENTITY' || r.decision === 'AMBIGUOUS',
      `sharing an address is not identity, got ${r.decision}`,
    );
  });

  it('refuses when both declare a DIFFERENT domain, however alike the names', () => {
    const a = ent('Acme Foods', { id: 'a', identifiers: [{ kind: 'domain', value: 'acmefoods.com', verified: true }] });
    const b = ent('Acme Foods', { id: 'b', identifiers: [{ kind: 'domain', value: 'acme-foods.in', verified: true }] });
    const r = compareEntities(a, b);
    assert.equal(r.decision, 'PROBABLE_DIFFERENT');
    assert.match(r.features.blockers.join(' '), /different domain/);
  });

  it('never merges across entity types', () => {
    const brand = ent('ABC Cafe', { id: 'a', type: 'BRAND' });
    const location = ent('ABC Cafe', { id: 'b', type: 'BUSINESS_LOCATION' });
    const r = compareEntities(brand, location);
    assert.equal(r.decision, 'DIFFERENT_ENTITY');
    assert.match(r.reason, /relationship, not an identity/);
  });

  it('keeps a chain’s branches separate', () => {
    const a = ent('ABC Cafe', { id: 'a', type: 'BUSINESS_LOCATION', locations: [loc({ postalCode: '110001' })] });
    const b = ent('ABC Cafe', { id: 'b', type: 'BUSINESS_LOCATION', locations: [loc({ postalCode: '400001' })] });
    const r = compareEntities(a, b);
    assert.equal(r.decision, 'PROBABLE_DIFFERENT', 'two branches are two locations, related by the brand');
  });
});

describe('entity resolution — AMBIGUITY IS AN ANSWER', () => {
  it('refuses to decide on a similar name with nothing else', () => {
    const r = compareEntities(ent('Grand Hotel', { id: 'a' }), ent('Hotel Grand', { id: 'b' }));
    assert.equal(r.decision, 'AMBIGUOUS');
    assert.match(r.reason, /nothing else connects them|no corroborating/);
  });

  it('downgrades a strong identifier when something contradicts it', () => {
    const a = ent('ABC Cafe', {
      id: 'a',
      identifiers: [{ kind: 'email', value: 'hi@abc.com', verified: true }],
      locations: [loc({ city: 'delhi' })],
    });
    const b = ent('ABC Cafe', {
      id: 'b',
      identifiers: [{ kind: 'email', value: 'hi@abc.com', verified: true }],
      locations: [loc({ city: 'mumbai' })],
    });
    const r = compareEntities(a, b);
    assert.equal(r.decision, 'AMBIGUOUS', 'one signal says merge and another says do not; that is ambiguous');
    assert.match(r.reason, /points to one entity.*points to two/);
  });

  it('says different when nothing matches at all', () => {
    const r = compareEntities(ent('ABC Cafe', { id: 'a' }), ent('Zenith Logistics', { id: 'b' }));
    assert.equal(r.decision, 'DIFFERENT_ENTITY');
  });

  it('always records features a human can check', () => {
    const r = compareEntities(ent('Grand Hotel Delhi', { id: 'a' }), ent('Grand Hotel Gurgaon', { id: 'b' }));
    assert.ok(typeof r.features.name.score === 'number');
    assert.ok(Array.isArray(r.features.name.distinguishingTokens));
    assert.ok(r.reason.length > 10, 'a reason, never a bare number');
    assert.ok(r.ruleVersion.length > 0, 'and the rule version, so a decision can be replayed');
  });
});

/* ========================================================================== */
describe('ecommerce capability', () => {
  const build = (body: string, head = '') =>
    extractHtml(`<!doctype html><html><head><title>Shop</title>${head}</head><body>${body}</body></html>`, 'https://shop.example/');

  it('confirms a platform fingerprint', () => {
    const e = build('<article><p>Our lovely products, described at some length for the extractor.</p></article>',
      '<script src="https://cdn.shopify.com/s/files/x.js"></script>');
    const { signals } = detectCapabilities(e, '<script src="https://cdn.shopify.com/s/files/x.js"></script>');
    const ecom = signals.filter((s) => s.capability === 'ecommerce');
    assert.ok(ecom.some((s) => s.signal === 'shopify'));
    assert.equal(capabilityState(ecom, true).state, 'CONFIRMED');
  });

  it('treats a cart link as evidence but not as proof on its own', () => {
    const html = '<article><p>Some prose about the business and what it does for its customers.</p><a href="/cart">Cart</a></article>';
    const e = build(html);
    const { signals } = detectCapabilities(e, html);
    const ecom = signals.filter((s) => s.capability === 'ecommerce');
    assert.ok(ecom.some((s) => s.signal === 'cart-path'));
    assert.equal(capabilityState(ecom, true).state, 'PROBABLE', 'a /cart route alone is suggestive, not decisive');
  });

  it('says NOT_OBSERVED when it looked and found nothing', () => {
    const r = capabilityState([], true);
    assert.equal(r.state, 'NOT_OBSERVED');
    assert.match(r.reason, /looked for and not found/);
  });

  it('says UNKNOWN when nothing was checked, which is a different claim', () => {
    const r = capabilityState([], false);
    assert.equal(r.state, 'UNKNOWN');
    assert.notEqual(r.state, 'NOT_OBSERVED');
  });

  it('counts a marketplace storefront as ecommerce elsewhere', () => {
    const html = '<article><p>Find us on the marketplace, where our whole catalogue is listed for sale.</p><a href="https://www.amazon.in/stores/page/X">Amazon</a></article>';
    const e = build(html);
    const { signals } = detectCapabilities(e, html);
    assert.ok(signals.some((s) => s.capability === 'marketplace' && s.signal === 'amazon'));
    assert.ok(signals.some((s) => s.capability === 'ecommerce' && s.signal.startsWith('marketplace:')));
  });
});
