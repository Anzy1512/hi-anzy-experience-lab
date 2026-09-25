import type { Driver } from '../db/client.ts';
import { normalizeCategory } from './normalize.ts';

/**
 * A SMALL CONTROLLED VOCABULARY, SEEDED ONCE.
 *
 * Uncontrolled categories are the failure this prevents: "Cafe", "Café",
 * "Coffee Shop", "coffee-shop" and "Coffee shop " become five categories, and
 * then "find cafes near here" returns a fifth of the cafes while looking like
 * it worked. Aliases collapse to one canonical row.
 *
 * Deliberately small and deliberately not model-generated. A vocabulary an LLM
 * invents per document is not a vocabulary — it is a synonym problem with extra
 * steps, and it grows every time the crawler runs. Adding a category means
 * adding a row here, which is a decision somebody makes once and can review.
 *
 * `entity_category.source_value` always keeps what the page actually said. The
 * mapping is our interpretation; the source text is the evidence for it.
 */

interface Seed {
  slug: string;
  label: string;
  aliases: string[];
}

export const SEED_CATEGORIES: Seed[] = [
  { slug: 'cafe', label: 'Cafe', aliases: ['cafe', 'coffee shop', 'coffeehouse', 'coffee house', 'espresso bar', 'tea room'] },
  { slug: 'restaurant', label: 'Restaurant', aliases: ['restaurant', 'bistro', 'eatery', 'diner', 'brasserie'] },
  { slug: 'bakery', label: 'Bakery', aliases: ['bakery', 'patisserie', 'bake shop'] },
  { slug: 'retail', label: 'Retail', aliases: ['retail', 'shop', 'store', 'boutique', 'retailer'] },
  { slug: 'grocery', label: 'Grocery', aliases: ['grocery', 'supermarket', 'kirana', 'provision store'] },
  { slug: 'hotel', label: 'Hotel', aliases: ['hotel', 'inn', 'guest house', 'guesthouse', 'resort'] },
  { slug: 'salon', label: 'Salon', aliases: ['salon', 'hair salon', 'beauty salon', 'barber', 'spa'] },
  { slug: 'gym', label: 'Gym', aliases: ['gym', 'fitness centre', 'fitness center', 'health club'] },
  { slug: 'clinic', label: 'Clinic', aliases: ['clinic', 'medical centre', 'medical center', 'dental clinic'] },
  { slug: 'pharmacy', label: 'Pharmacy', aliases: ['pharmacy', 'chemist', 'drugstore', 'medical store'] },
  { slug: 'agency', label: 'Agency', aliases: ['agency', 'marketing agency', 'creative agency', 'advertising agency', 'consultancy', 'consulting'] },
  { slug: 'software', label: 'Software', aliases: ['software', 'software company', 'saas', 'technology company', 'it services'] },
  { slug: 'manufacturer', label: 'Manufacturer', aliases: ['manufacturer', 'manufacturing', 'factory', 'producer'] },
  { slug: 'wholesaler', label: 'Wholesaler', aliases: ['wholesaler', 'wholesale', 'distributor', 'stockist', 'supplier'] },
  { slug: 'logistics', label: 'Logistics', aliases: ['logistics', 'courier', 'freight', 'shipping company'] },
  { slug: 'education', label: 'Education', aliases: ['school', 'college', 'institute', 'academy', 'training centre', 'training center', 'coaching'] },
  { slug: 'real-estate', label: 'Real Estate', aliases: ['real estate', 'realtor', 'property dealer', 'estate agent'] },
  { slug: 'construction', label: 'Construction', aliases: ['construction', 'builder', 'contractor', 'civil works'] },
  { slug: 'automotive', label: 'Automotive', aliases: ['automotive', 'car dealer', 'garage', 'workshop', 'auto repair'] },
  { slug: 'financial-services', label: 'Financial Services', aliases: ['financial services', 'accountant', 'chartered accountant', 'insurance', 'broker'] },
  { slug: 'legal', label: 'Legal', aliases: ['legal', 'law firm', 'solicitor', 'advocate', 'attorney'] },
  { slug: 'events', label: 'Events', aliases: ['events', 'event management', 'wedding planner', 'catering'] },
];

/** Idempotent. Safe on every boot; a new seed row is added once. */
export async function seedCategories(d: Driver): Promise<{ categories: number; aliases: number }> {
  let categories = 0;
  let aliases = 0;
  for (const s of SEED_CATEGORIES) {
    const rows = await d.query<{ id: string }>(
      `insert into category (slug, label) values ($1,$2)
       on conflict (slug) do update set label = excluded.label
       returning id`,
      [s.slug, s.label],
    );
    const id = rows[0]?.id;
    if (id === undefined) continue;
    categories += 1;
    for (const alias of [s.slug.replace(/-/g, ' '), s.label, ...s.aliases]) {
      const normalized = normalizeCategory(alias);
      if (normalized === '') continue;
      await d.query(
        `insert into category_alias (category_id, alias, provenance) values ($1,$2,'seed')
         on conflict (alias) do nothing`,
        [id, normalized],
      );
      aliases += 1;
    }
  }
  return { categories, aliases };
}

/** Map a source string to a canonical category. Null when nothing matches. */
export async function mapCategory(
  d: Driver,
  sourceValue: string,
): Promise<{ categoryId: string; slug: string; label: string; alias: string } | null> {
  const alias = normalizeCategory(sourceValue);
  if (alias === '') return null;
  const rows = await d.query<{ id: string; slug: string; label: string }>(
    `select c.id, c.slug, c.label from category_alias ca join category c on c.id = ca.category_id
      where ca.alias = $1 limit 1`,
    [alias],
  );
  const r = rows[0];
  if (!r) return null;
  return { categoryId: r.id, slug: r.slug, label: r.label, alias };
}

/**
 * Find a category mentioned anywhere in a piece of text.
 *
 * Longest alias first, so "coffee shop" is not matched as "shop". Word
 * boundaries are required: "cafeteria" must not match "cafe", and a plain
 * substring test would make that mistake constantly.
 */
export async function detectCategories(
  d: Driver,
  text: string,
  limit = 3,
): Promise<Array<{ categoryId: string; slug: string; label: string; matched: string }>> {
  const haystack = normalizeCategory(text);
  if (haystack === '') return [];
  const rows = await d.query<{ id: string; slug: string; label: string; alias: string }>(
    `select c.id, c.slug, c.label, ca.alias
       from category_alias ca join category c on c.id = ca.category_id
      order by length(ca.alias) desc`,
  );
  const out: Array<{ categoryId: string; slug: string; label: string; matched: string }> = [];
  const taken = new Set<string>();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);
  for (const r of rows) {
    if (out.length >= limit) break;
    if (taken.has(r.id)) continue;
    const pattern = new RegExp(`(^|\\s)${escape(r.alias)}(\\s|$)`);
    if (pattern.test(haystack)) {
      taken.add(r.id);
      out.push({ categoryId: r.id, slug: r.slug, label: r.label, matched: r.alias });
    }
  }
  return out;
}
