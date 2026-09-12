import {
  DIAGNOSTIC_AREAS,
  DIAGNOSTIC_OUTCOMES,
  METHOD,
  NETWORK_CAPABILITIES,
  SERVICES,
  type ServiceCategory,
} from '../content/canonical';

/**
 * THE FRAMING ENGINE — one problem, mapped onto the company's own structure.
 *
 * Three realities need the same thing: the Terminal's `diagnose`, SYSTEM.app's
 * project brief, and the Agency Simulator's run. Building it three times would
 * produce three subtly different Hi Anzys, so it is built once, here, and none
 * of them owns it.
 *
 * ── WHAT IT IS, SAID PLAINLY ────────────────────────────────────────────────
 *
 * It is a **lexicon and a lookup**. A visitor's sentence is matched against a
 * vocabulary, matched terms point at canonical diagnostic areas, areas select
 * canonical services, and services carry the method stages they belong to. That
 * is the entire mechanism. It is deterministic — the same sentence returns the
 * same frame on every machine, forever — and every noun it hands back came out
 * of the commercial site's own content file.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 *
 * It is not a diagnosis, an audit, a forecast, a recommendation or a price. It
 * has no model, makes no request and cannot learn. It does not know the
 * visitor's business, and the fields it returns under `evidence` and `questions`
 * exist precisely to say so: they are the things a real audit would have to go
 * and find, listed rather than guessed at. `DISCLAIMER` below is not decoration
 * and every surface that prints a frame must print it too.
 *
 * The honest claim is narrow and worth making: *if* you brought this problem to
 * Hi Anzy, this is the shape of the company that would meet it. Nothing more.
 */

/** Printed by every consumer, verbatim. */
export const DISCLAIMER =
  'This is a structured mapping of your words onto Hi Anzy’s own method and service categories. It is not an audit, a forecast, or a professional diagnosis, and it knows nothing about your business beyond the sentence you typed.';

/**
 * The lexicon.
 *
 * Authored by the Lab, not mirrored: the commercial site names its diagnostic
 * areas in its own vocabulary ("Customer", "Operations") and a visitor types in
 * theirs ("checkout", "handover", "nobody replies"). This is the join between
 * the two, and it is the one piece of language here that is not canonical — so
 * it maps *only* onto canonical area names and never introduces an area of its
 * own. Adding a word can change which canonical area is selected; it can never
 * invent a service, a stage or a capability.
 */
const LEXICON: Record<string, readonly string[]> = {
  Business: ['margin', 'profit', 'revenue', 'pricing', 'price', 'cost', 'costs', 'unit economics', 'cashflow', 'model', 'strategy', 'competitor', 'market'],
  Brand: ['brand', 'identity', 'logo', 'positioning', 'story', 'voice', 'messaging', 'name', 'naming', 'look', 'reputation', 'perception'],
  Customer: ['customer', 'customers', 'user', 'users', 'audience', 'retention', 'churn', 'loyalty', 'complaint', 'complaints', 'support', 'experience', 'journey'],
  Sales: ['sales', 'sell', 'selling', 'lead', 'leads', 'pipeline', 'deal', 'deals', 'conversion', 'convert', 'converting', 'checkout', 'cart', 'quote', 'proposal'],
  Marketing: ['marketing', 'campaign', 'campaigns', 'ads', 'ad', 'advertising', 'traffic', 'seo', 'content', 'social', 'reach', 'awareness', 'funnel', 'engagement'],
  Technology: ['website', 'site', 'app', 'platform', 'cms', 'shopify', 'woocommerce', 'wordpress', 'crm', 'integration', 'integrations', 'api', 'stack', 'tech', 'technology', 'software', 'hosting', 'performance', 'slow', 'broken', 'bug'],
  Data: ['data', 'analytics', 'tracking', 'report', 'reports', 'reporting', 'dashboard', 'metrics', 'measure', 'measurement', 'attribution', 'spreadsheet', 'spreadsheets'],
  Operations: ['operations', 'process', 'processes', 'workflow', 'handover', 'admin', 'manual', 'team', 'staff', 'people', 'capacity', 'bottleneck', 'chaos', 'disorganised', 'disorganized'],
  Automation: ['automation', 'automate', 'automated', 'zapier', 'n8n', 'repetitive', 'copy paste', 'copy-paste', 'by hand', 'manually'],
  Security: ['security', 'secure', 'breach', 'compliance', 'gdpr', 'backup', 'backups', 'risk', 'access', 'password', 'passwords'],
  Growth: ['growth', 'grow', 'growing', 'scale', 'scaling', 'expand', 'expansion', 'plateau', 'stalled', 'stuck', 'flat'],
};

/**
 * Areas a service speaks to.
 *
 * Derived from the service's own `stage` and `capabilities` where that is
 * honest, and stated where it is not: `capabilities` are phrased for a buyer
 * ("Go-to-market strategy"), not for a matcher, so a pure string search across
 * them would miss most of what each category actually covers. These are the
 * canonical area names only.
 */
const SERVICE_AREAS: Record<string, readonly string[]> = {
  'business-audit-strategy': ['Business', 'Customer', 'Growth', 'Data'],
  'brand-experience': ['Brand', 'Customer'],
  'digital-technology-automation': ['Technology', 'Automation', 'Operations', 'Data', 'Security'],
  'growth-content-commerce': ['Marketing', 'Sales', 'Growth'],
  'media-creators-experiences': ['Marketing', 'Brand'],
  'advisory-security-scale': ['Security', 'Operations', 'Growth', 'Business'],
};

export interface Frame {
  /** Exactly what the visitor typed, untouched. */
  statement: string;
  /** Canonical diagnostic areas, most strongly matched first. */
  areas: string[];
  /** The words that put each area there. Shown so the mapping is inspectable. */
  matched: Record<string, string[]>;
  /** Canonical service categories that speak to those areas. */
  services: ServiceCategory[];
  /** Canonical method stages, in canonical order. */
  sequence: { label: string; title: string; duration: string; outputs: string[] }[];
  /** Canonical capabilities the areas imply. */
  capabilities: string[];
  /** What an audit would have to establish. Not answers — the gaps. */
  evidence: string[];
  /** What this mapping cannot know. */
  questions: string[];
  /** True when nothing matched: the frame is empty and must say so. */
  empty: boolean;
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ')} `;

/**
 * Map a sentence onto the company's structure.
 *
 * Scoring is deliberately crude — one point per distinct matched term — because
 * anything cleverer would be a model pretending to be a lookup, and the visitor
 * could no longer see why they got the answer they got. `matched` is returned
 * for exactly that reason: the frame shows its working.
 */
export function frame(statement: string): Frame {
  const text = norm(statement);
  const matched: Record<string, string[]> = {};
  const score: Record<string, number> = {};

  for (const area of DIAGNOSTIC_AREAS) {
    const terms = LEXICON[area] ?? [];
    const hits = terms.filter((t) => text.includes(` ${t} `) || text.includes(` ${t}s `));
    if (hits.length) {
      matched[area] = hits;
      score[area] = hits.length;
    }
  }

  const areas = Object.keys(score).sort((a, b) => score[b] - score[a] || a.localeCompare(b));

  if (areas.length === 0) {
    return {
      statement,
      areas: [],
      matched: {},
      services: [],
      sequence: [],
      capabilities: [],
      evidence: [],
      questions: [],
      empty: true,
    };
  }

  /* Only the areas that actually carry weight. A sentence mentioning one
     technology word does not make Security a theme of the problem. */
  const top = areas.filter((a) => score[a] >= Math.max(1, score[areas[0]] - 1)).slice(0, 4);

  const services = SERVICES.filter((s) =>
    (SERVICE_AREAS[s.slug] ?? []).some((a) => top.includes(a)),
  );

  /*
   * Canonical order, never match order: the method is a sequence, and printing
   * it in the order a sentence happened to mention things would misrepresent
   * the one thing about it that is load-bearing.
   *
   * AUDIT is always the first stage, whether or not a matched service belongs
   * to it. Measured on the worked example — "our website gets traffic but
   * conversion is weak" — the matched categories are BUILD, CONNECT and SCALE,
   * so the sequence opened on BUILD: go and make the thing. That is the exact
   * advice this product exists to argue against, and it contradicted the same
   * frame's own evidence list, every line of which reads "not established".
   * A problem known only from one sentence has had no audit by definition, and
   * the company's own first principle is that nothing starts until the problem
   * fits in one sentence *and is understood*.
   */
  const stages = new Set(services.map((s) => s.stage));
  stages.add('AUDIT');
  const sequence = METHOD.filter((m) => stages.has(m.label)).map((m) => ({
    label: m.label,
    title: m.title,
    duration: m.duration,
    outputs: m.outputs,
  }));

  const capabilities = [
    ...new Set(
      top.flatMap((a) => NETWORK_CAPABILITIES[a] ?? []).concat(
        services.flatMap((s) => s.capabilities.slice(0, 3)),
      ),
    ),
  ].slice(0, 12);

  return {
    statement,
    areas: top,
    matched: Object.fromEntries(top.map((a) => [a, matched[a]])),
    services,
    sequence,
    capabilities,
    /* DIAGNOSTIC_OUTCOMES is what an audit *produces*. Turned around, the same
       list is what is missing before one has been done — which is the honest
       thing to show somebody who has typed one sentence. */
    evidence: DIAGNOSTIC_OUTCOMES.map((o) => `${o} — not established`),
    questions: [
      `Which of ${top.join(', ')} is the cause and which is the symptom?`,
      'What has already been tried, and what happened?',
      'What does the business measure today, and does it trust the numbers?',
      'Who owns this problem internally, and what can they change?',
      'What is the deadline, and what is driving it?',
    ],
    empty: false,
  };
}

/** Every term the lexicon knows. Used by the Terminal for Tab completion. */
export function lexiconTerms(): string[] {
  return [...new Set(Object.values(LEXICON).flat())].sort();
}
