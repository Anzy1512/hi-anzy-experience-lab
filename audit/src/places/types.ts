import type { Availability, SearchOptions } from '../search/types.ts';

/**
 * WHAT A PLACE PROVIDER IS, AND WHY IT IS NOT A SEARCH PROVIDER.
 *
 * ── THE DISTINCTION THIS FILE EXISTS TO KEEP ────────────────────────────────
 *
 * `SearchProvider` says, in its own header, that a provider DISCOVERS URLs and
 * that its snippet is read by nothing downstream. That is the property which
 * makes the search contract safe: no field a provider returns can become a
 * fact, because the only field anyone reads is the address of a page the
 * crawler will fetch for itself.
 *
 * A geographic provider breaks that property on purpose. Its coordinates ARE
 * read — they are the whole reason to ask it — so they cannot travel in
 * `providerMetadata`, the field the search contract promises is "interpreted by
 * nobody". Rather than weaken that promise for every provider, geography gets
 * its own contract where the reading is explicit and the provenance is
 * mandatory.
 *
 * ── WHAT IS EVIDENCE HERE AND WHAT IS NOT ───────────────────────────────────
 *
 * A place record carries two things of very different standing.
 *
 * `latitude`/`longitude` are the provider's measurement of where something is.
 * Recorded with the provider's name against them, they are an honest
 * third-party observation — the same standing as a page that publishes its own
 * coordinates, minus the fact that the business said it. So a plotted point
 * must always be able to say who placed it. `geocode_provider` on
 * `entity_location` is where that lands, and `declared` (the page said so) and
 * `nominatim` (a gazetteer said so) must never collapse into each other.
 *
 * `websiteCandidate` is a CLAIM BY A STRANGER. Somebody typed a URL into a map
 * database and may have typed the wrong one, or the right one five years ago.
 * It is a place to point the crawler, and nothing else: the business on the
 * page it returns is resolved by the ordinary entity pipeline, against the
 * ordinary evidence, and is allowed to turn out to be a different business
 * entirely. Treating this field as "the company's website" would import a
 * stranger's error as a sourced fact — and the citation would look perfect.
 *
 * ── AND WHY THERE IS NO CONFIDENCE NUMBER ───────────────────────────────────
 *
 * Gazetteers do not report match confidence. They report how prominent a place
 * is, which is a different quantity with a similar shape, and mapping one onto
 * the other would manufacture a 0.87 out of a popularity score. What they do
 * report honestly is how precisely they resolved a thing — a doorway, a street,
 * a city centroid — and that distinction is the one that actually changes
 * whether a point should be trusted. So `precision` is a named state and
 * `confidence` is only ever a number a provider genuinely gave us.
 */

export type PlaceProviderId = 'nominatim' | 'none';

/**
 * How precisely a provider says it resolved a location.
 *
 * Ordered coarse-ward. `AREA` is the dangerous one: a geocode that fell back to
 * a city or a postcode district is a point in the middle of somewhere, and
 * plotted without this label it is indistinguishable from a shop front.
 */
export type PlacePrecision = 'POINT' | 'BUILDING' | 'STREET' | 'POSTAL' | 'AREA' | 'UNKNOWN';

export interface PlaceArea {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

/** One place a provider reported, with everything needed to trace it back. */
export interface PlaceCandidate {
  provider: PlaceProviderId;
  /** The provider's own identifier, so a re-run can be compared to this one. */
  externalId: string;
  /** The query as issued, which is not always the caller's words. */
  query: string;
  name: string | null;
  /** The provider's own classification, in the provider's own words. */
  category: string | null;
  latitude: number;
  longitude: number;
  precision: PlacePrecision;
  /** A stranger's claim about which site belongs here. A crawl target only. */
  websiteCandidate: string | null;
  address: string | null;
  /** Only ever a number the provider itself reported as a confidence. */
  confidence: number | null;
  /** Everything else it said, kept verbatim and interpreted by nobody. */
  raw: Record<string, unknown>;
  discoveredAt: Date;
}

/** One address resolved to a point. */
export interface Geocode {
  provider: PlaceProviderId;
  query: string;
  externalId: string | null;
  latitude: number;
  longitude: number;
  precision: PlacePrecision;
  /** What the provider thought it matched, so a wrong match is visible. */
  matchedAddress: string | null;
  confidence: number | null;
  raw: Record<string, unknown>;
  resolvedAt: Date;
}

export interface PlaceResponse {
  provider: PlaceProviderId;
  query: string;
  candidates: PlaceCandidate[];
  elapsedMs: number;
  /** Set when the provider could not answer; `candidates` is then empty. */
  unavailable?: Availability['problem'];
}

export interface GeocodeResponse {
  provider: PlaceProviderId;
  query: string;
  /** Null when the provider answered and matched nothing, which is not a fault. */
  geocode: Geocode | null;
  elapsedMs: number;
  unavailable?: Availability['problem'];
}

export interface PlaceProvider {
  readonly id: PlaceProviderId;
  readonly label: string;
  available(): Promise<Availability>;
  /** Businesses matching `query` inside `area`. Never throws for an expected failure. */
  discover(query: string, area: PlaceArea, opts?: SearchOptions): Promise<PlaceResponse>;
  /** One address to one point, or null when nothing matched. */
  geocode(address: string, opts?: SearchOptions): Promise<GeocodeResponse>;
}

/**
 * No geographic provider configured.
 *
 * Present so that "geography is unavailable" is a provider that says so rather
 * than a null check at every call site, and so the pilot's own report can name
 * what was missing instead of quietly producing nothing.
 */
export class NoPlaceProvider implements PlaceProvider {
  readonly id = 'none' as const;
  readonly label = 'No geographic provider';

  async available(): Promise<Availability> {
    return {
      ok: false,
      detail: 'no geographic provider configured',
      problem: {
        reason: 'not_configured',
        detail: 'Set PLACE_PROVIDER=nominatim to discover businesses by area and resolve addresses to points.',
      },
    };
  }

  async discover(query: string, _area: PlaceArea): Promise<PlaceResponse> {
    const problem = (await this.available()).problem;
    return {
      provider: this.id,
      query,
      candidates: [],
      elapsedMs: 0,
      ...(problem !== undefined ? { unavailable: problem } : {}),
    };
  }

  async geocode(address: string): Promise<GeocodeResponse> {
    const problem = (await this.available()).problem;
    return {
      provider: this.id,
      query: address,
      geocode: null,
      elapsedMs: 0,
      ...(problem !== undefined ? { unavailable: problem } : {}),
    };
  }
}

/** Great-circle distance in km. Used to report a point's offset, never to invent one. */
export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A bounding box around a point, for providers that take one.
 *
 * A box is not a circle, so anything inside the corners but outside the radius
 * comes back and has to be filtered by distance afterwards. Doing that
 * filtering rather than pretending the box was the question is the difference
 * between "within 2km" meaning what it says and meaning "roughly, in a square".
 */
export function boundingBox(area: PlaceArea): { west: number; north: number; east: number; south: number } {
  const latDelta = area.radiusKm / 111.32;
  /* Longitude degrees shrink toward the poles; at 60° a degree is half as wide. */
  const cos = Math.max(0.01, Math.cos((area.latitude * Math.PI) / 180));
  const lonDelta = area.radiusKm / (111.32 * cos);
  return {
    west: area.longitude - lonDelta,
    north: area.latitude + latDelta,
    east: area.longitude + lonDelta,
    south: area.latitude - latDelta,
  };
}
