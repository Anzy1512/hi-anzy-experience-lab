import type { CapabilityState } from '../entity/capability.ts';
import type { EvidencePacket } from './evidence.ts';
import { conflicting, derived, fact, recommendation, unknown, type Finding } from './findings.ts';

/**
 * THE FINDINGS A MODEL IS NOT ALLOWED TO PRODUCE.
 *
 * ── WHY MOST OF AN AUDIT IS A RULE ENGINE ───────────────────────────────────
 *
 * "This business has a website and no storefront was observed" is not a
 * judgement. It is two stored capability states and a sentence, and sending it
 * to a model would cost money to introduce the possibility of a different
 * answer on Tuesday. Everything mechanical lives here, versioned, so that the
 * same evidence produces the same findings forever and a changed finding
 * implies a changed rule — which is greppable.
 *
 * What is left for a model is genuinely small: ordering, emphasis, and saying
 * what a set of findings amounts to. That is the correct division, and it is
 * also the cheap one.
 *
 * ── EVERY RULE STATES ITS OWN LIMITS ────────────────────────────────────────
 *
 * Not as a disclaimer. `NOT_OBSERVED` means a crawl looked and did not find,
 * which is a different claim from "does not have" in a way that matters
 * commercially — a business with a storefront the crawler could not reach is a
 * bad lead and a false report. The limitation travels with the finding so it
 * cannot be lost between here and the page.
 */

export const RULE_SET_VERSION = 'l4-rules-1';

/** How old evidence has to be before it is reported as stale rather than current. */
const STALE_DAYS = 180;

export interface RuleContext {
  entityId: string | null;
  entityName: string;
  packet: EvidencePacket;
  /** Capability state per capability that was asked about. */
  capabilities: Record<string, CapabilityState>;
  /** Evidence id for each capability item, so findings can cite the probe. */
  capabilityItem: Record<string, string>;
  /** field → value for every non-UNKNOWN claim. */
  claims: Record<string, string>;
  /** field → evidence id. */
  claimItem: Record<string, string>;
  relationships: number;
  /** Distinct documents behind this entity. */
  sourceCount: number;
  newestObservation: Date | null;
  now: Date;
}

export interface Rule {
  id: string;
  version: string;
  /** One line, readable, so a rule list is a document. */
  describe: string;
  run(ctx: RuleContext): Finding[];
}

const cite = (...ids: Array<string | undefined>): string[] => ids.filter((v): v is string => v !== undefined);

/* -------------------------------------------------------------------------- */
/* PRESENCE                                                                    */
/* -------------------------------------------------------------------------- */

const websitePresence: Rule = {
  id: 'PRESENCE_WEBSITE',
  version: RULE_SET_VERSION,
  describe: 'Whether a working website was reached for this business.',
  run(ctx) {
    const state = ctx.capabilities['website'];
    if (state === undefined) return [];
    const item = ctx.capabilityItem['website'];

    if (state === 'CONFIRMED' || state === 'PROBABLE') {
      return [
        fact({
          key: 'website',
          entityId: ctx.entityId,
          findingType: 'WEBSITE_PRESENT',
          statement: `${ctx.entityName} has a website that was reached and read.`,
          citations: cite(item, ctx.claimItem['website']),
          area: 'Technology',
          outcome: 'What is happening',
          ruleId: this.id,
          ruleVersion: this.version,
          limitations:
            state === 'PROBABLE'
              ? 'The site was inferred from links rather than fetched directly, so its current state is not confirmed.'
              : 'Confirms the site existed when it was fetched. It says nothing about uptime since.',
        }),
      ];
    }

    if (state === 'NOT_OBSERVED') {
      return [
        derived({
          key: 'website',
          entityId: ctx.entityId,
          findingType: 'WEBSITE_NOT_OBSERVED',
          statement: `No working website was found for ${ctx.entityName} in the sources checked.`,
          inference: 'A crawl looked for a site and did not reach one; absence in the sources checked is not absence in the world.',
          citations: cite(item),
          area: 'Technology',
          outcome: 'What is happening',
          ruleId: this.id,
          ruleVersion: this.version,
          limitations:
            'This means nothing was found, not that nothing exists. A site behind a redirect, a ' +
            'robots exclusion or a different name would produce the same result.',
        }),
      ];
    }

    return [
      unknown({
        key: 'website',
        entityId: ctx.entityId,
        findingType: 'WEBSITE_UNKNOWN',
        statement: `Whether ${ctx.entityName} has a website has not been established.`,
        citations: cite(item),
        area: 'Technology',
        outcome: 'What is happening',
        ruleId: this.id,
        ruleVersion: this.version,
        limitations: 'Nothing has looked for one yet. This is a gap in the research, not a property of the business.',
      }),
    ];
  },
};

const ecommerce: Rule = {
  id: 'ECOMMERCE_STATE',
  version: RULE_SET_VERSION,
  describe: 'Whether an online storefront was observed, and what may be said if not.',
  run(ctx) {
    const state = ctx.capabilities['ecommerce'];
    if (state === undefined) return [];
    const item = ctx.capabilityItem['ecommerce'];
    const hasSite = ctx.capabilities['website'] === 'CONFIRMED' || ctx.capabilities['website'] === 'PROBABLE';

    if (state === 'CONFIRMED' || state === 'PROBABLE') {
      return [
        fact({
          key: 'ecommerce',
          entityId: ctx.entityId,
          findingType: 'ECOMMERCE_PRESENT',
          statement: `${ctx.entityName} sells online — storefront markers were found on its own pages.`,
          citations: cite(item),
          area: 'Sales',
          outcome: 'What is happening',
          ruleId: this.id,
          ruleVersion: this.version,
          limitations: 'Storefront markers show a shop exists. They say nothing about whether it is used or what it earns.',
        }),
      ];
    }

    if (state === 'NOT_OBSERVED') {
      const f = derived({
        key: 'ecommerce',
        entityId: ctx.entityId,
        findingType: 'ECOMMERCE_NOT_OBSERVED',
        statement: hasSite
          ? `${ctx.entityName} has a website, and no way to buy from it was found.`
          : `No way to buy from ${ctx.entityName} online was found.`,
        inference:
          'The pages that were fetched were searched for cart paths, checkout routes, product markup and ' +
          'known platform markers, and none were present.',
        citations: cite(item, ctx.capabilityItem['website']),
        area: 'Sales',
        outcome: 'What is happening',
        ruleId: this.id,
        ruleVersion: this.version,
        limitations:
          'This is the result of looking, not proof of absence. A shop on a subdomain, behind a login, ' +
          'on a marketplace or on a page the crawl did not reach would not be seen.',
      });
      return [f];
    }

    return [
      unknown({
        key: 'ecommerce',
        entityId: ctx.entityId,
        findingType: 'ECOMMERCE_UNKNOWN',
        statement: `Whether ${ctx.entityName} sells online is not established.`,
        citations: cite(item),
        area: 'Sales',
        outcome: 'What is happening',
        ruleId: this.id,
        ruleVersion: this.version,
        limitations: 'No probe has run. Reporting this as "no ecommerce" would be inventing a result.',
      }),
    ];
  },
};

const contactability: Rule = {
  id: 'CONTACT_COMPLETENESS',
  version: RULE_SET_VERSION,
  describe: 'Whether a reachable contact route was found.',
  run(ctx) {
    const routes = (['phone', 'email', 'address'] as const).filter((k) => ctx.claims[k] !== undefined);
    if (routes.length === 0) {
      return [
        unknown({
          key: 'contact',
          entityId: ctx.entityId,
          findingType: 'CONTACT_NONE_FOUND',
          statement: `No phone number, email address or postal address was found for ${ctx.entityName}.`,
          citations: [],
          area: 'Customer',
          outcome: 'What is happening',
          ruleId: this.id,
          ruleVersion: this.version,
          limitations: 'Contact details behind a form, an image or a login would not be extracted by this pipeline.',
        }),
      ];
    }
    if (routes.length < 3) {
      const missing = (['phone', 'email', 'address'] as const).filter((k) => ctx.claims[k] === undefined);
      return [
        fact({
          key: 'contact',
          entityId: ctx.entityId,
          findingType: 'CONTACT_PARTIAL',
          statement: `${ctx.entityName} can be reached by ${routes.join(' and ')}; no ${missing.join(' or ')} was found.`,
          citations: cite(...routes.map((r) => ctx.claimItem[r])),
          area: 'Customer',
          outcome: 'What is happening',
          ruleId: this.id,
          ruleVersion: this.version,
          limitations: 'Only the pages that were fetched were searched.',
        }),
      ];
    }
    return [
      fact({
        key: 'contact',
        entityId: ctx.entityId,
        findingType: 'CONTACT_COMPLETE',
        statement: `${ctx.entityName} publishes a phone number, an email address and a postal address.`,
        citations: cite(...routes.map((r) => ctx.claimItem[r])),
        area: 'Customer',
        outcome: 'What is happening',
        ruleId: this.id,
        ruleVersion: this.version,
        limitations: 'Published, not verified. Nothing here was dialled or delivered to.',
      }),
    ];
  },
};

/* -------------------------------------------------------------------------- */
/* THE RESEARCH, AUDITED                                                       */
/* -------------------------------------------------------------------------- */

const corroboration: Rule = {
  id: 'SINGLE_SOURCE_ENTITY',
  version: RULE_SET_VERSION,
  describe: 'Whether anything independent corroborates what is known about this business.',
  run(ctx) {
    if (ctx.sourceCount === 0) return [];
    if (ctx.sourceCount > 1) return [];
    return [
      derived({
        key: 'corroboration',
        entityId: ctx.entityId,
        findingType: 'SINGLE_SOURCE_ENTITY',
        statement: `Everything known about ${ctx.entityName} comes from one source.`,
        inference: 'Distinct documents behind this entity were counted, and there is one.',
        citations: ctx.packet.items.slice(0, 1).map((i) => i.id),
        /* About the research rather than about the company, so no diagnostic
           area is claimed. Forcing it into one would invent a category. */
        area: null,
        outcome: null,
        ruleId: this.id,
        ruleVersion: this.version,
        limitations:
          'A single source can be entirely correct. What cannot be done is telling the difference ' +
          'between correct and unchallenged.',
      }),
    ];
  },
};

const freshness: Rule = {
  id: 'STALE_EVIDENCE',
  version: RULE_SET_VERSION,
  describe: `Whether the newest evidence is older than ${STALE_DAYS} days.`,
  run(ctx) {
    if (ctx.newestObservation === null) return [];
    const days = Math.floor((ctx.now.getTime() - ctx.newestObservation.getTime()) / 86_400_000);
    if (days < STALE_DAYS) return [];
    return [
      derived({
        key: 'freshness',
        entityId: ctx.entityId,
        findingType: 'STALE_EVIDENCE',
        statement: `The most recent evidence about ${ctx.entityName} is ${days} days old.`,
        inference: 'The newest observation timestamp was compared with the current time.',
        citations: ctx.packet.items.filter((i) => i.observedAt !== null).slice(0, 1).map((i) => i.id),
        area: null,
        outcome: null,
        ruleId: this.id,
        ruleVersion: this.version,
        limitations: 'Age is not wrongness. Stale evidence is reported as old, never as false.',
      }),
    ];
  },
};

const contradictions: Rule = {
  id: 'CONFLICTING_CLAIM',
  version: RULE_SET_VERSION,
  describe: 'Fields where sources disagree. Both readings are reported; neither is chosen.',
  run(ctx) {
    return ctx.packet.conflicts.map((c) => {
      /*
       * Show three and count the rest.
       *
       * A security advisory page produced seventy distinct "phone" values, and
       * a sentence listing all of them is not a finding — it is the raw data
       * with a full stop on the end. Three is enough to show that the values
       * genuinely differ; the count is what says how badly.
       */
      const shown = c.values.slice(0, 3).map((v) => `"${v}"`);
      const rest = c.values.length - shown.length;
      const list = rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(' and ');

      return conflicting({
        key: `conflict:${c.field}`,
        entityId: ctx.entityId,
        findingType: 'CONFLICTING_CLAIM',
        statement: `Sources disagree about ${ctx.entityName}'s ${c.field}: ${list}.`,
        /* One citation per side, not one per observation. */
        citations: c.claimItemIds.slice(0, 8),
        area: null,
        outcome: null,
        ruleId: this.id,
        ruleVersion: this.version,
        limitations:
          `${c.values.length} different values are held for this field. The engine will not pick a ` +
          'side: one source may simply be older, and without a date on each statement there is no ' +
          'honest way to tell which. A field with many values is usually an extraction problem ' +
          'rather than a business that changed its mind.',
      });
    });
  },
};

const isolation: Rule = {
  id: 'NO_RELATIONSHIPS',
  version: RULE_SET_VERSION,
  describe: 'Whether this business was found connected to any other.',
  run(ctx) {
    if (ctx.relationships > 0) return [];
    return [
      unknown({
        key: 'relationships',
        entityId: ctx.entityId,
        findingType: 'NO_RELATIONSHIPS_FOUND',
        statement: `No suppliers, stockists or related businesses were found for ${ctx.entityName}.`,
        citations: [],
        area: null,
        outcome: null,
        ruleId: this.id,
        ruleVersion: this.version,
        limitations:
          'Relationships are only recorded where a page states one. Most trading relationships are ' +
          'never published, so this is close to meaningless as a commercial signal on its own.',
      }),
    ];
  },
};

/* -------------------------------------------------------------------------- */
/* ADVICE, KEPT APART                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Recommendations, and the reason they are a separate rule rather than a field
 * on a finding.
 *
 * A recommendation has no evidence. It cannot: it is about something that has
 * not happened. Attaching one to a finding would give it the finding's
 * citations and make advice look sourced. So they are produced separately,
 * carry the key of the finding they answer, and render in their own section.
 */
const advice: Rule = {
  id: 'RECOMMENDATIONS',
  version: RULE_SET_VERSION,
  describe: 'What to do about the gaps found. Advice, never evidence.',
  run(ctx) {
    const out: Finding[] = [];
    const rec = (key: string, findingType: string, statement: string, area: string) =>
      out.push(
        recommendation({
          key,
          entityId: ctx.entityId,
          findingType,
          statement,
          citations: [],
          area,
          outcome: 'What should change',
          ruleId: 'RECOMMENDATIONS',
          ruleVersion: RULE_SET_VERSION,
          limitations: 'This is advice, not a finding. Nothing was measured to produce it.',
        }),
      );

    if (ctx.capabilities['ecommerce'] === 'NOT_OBSERVED' && (ctx.capabilities['website'] === 'CONFIRMED' || ctx.capabilities['website'] === 'PROBABLE')) {
      rec('rec:ecommerce', 'RECOMMEND_STOREFRONT', 'Confirm directly whether online ordering exists before treating this as an opportunity.', 'Sales');
    }
    if (ctx.claims['phone'] === undefined && ctx.claims['email'] === undefined) {
      rec('rec:contact', 'RECOMMEND_CONTACT_ROUTE', 'Find a direct contact route before this business can be approached at all.', 'Customer');
    }
    if (ctx.sourceCount === 1) {
      rec('rec:corroborate', 'RECOMMEND_CORROBORATE', 'Check a second, independent source before acting on any of this.', 'Data');
    }
    if (ctx.packet.conflicts.length > 0) {
      rec('rec:conflict', 'RECOMMEND_RESOLVE_CONFLICT', 'Settle the contradictions by hand; the engine cannot choose between them.', 'Data');
    }
    return out;
  },
};

export const RULES: Rule[] = [
  websitePresence,
  ecommerce,
  contactability,
  corroboration,
  freshness,
  contradictions,
  isolation,
  advice,
];

/**
 * Run everything. Deterministic, ordered, and free.
 *
 * A rule that throws takes down one finding, not the audit — but it is not
 * swallowed either: the failure becomes an UNKNOWN naming the rule, so a broken
 * rule shows up in the output rather than as a silently shorter list.
 */
export function runRules(ctx: RuleContext, rules: Rule[] = RULES): Finding[] {
  const out: Finding[] = [];
  for (const rule of rules) {
    try {
      out.push(...rule.run(ctx));
    } catch (err) {
      out.push(
        unknown({
          key: `rule-error:${rule.id}`,
          entityId: ctx.entityId,
          findingType: 'RULE_FAILED',
          statement: `The ${rule.id} check could not be completed.`,
          citations: [],
          ruleId: rule.id,
          ruleVersion: rule.version,
          limitations: `The rule raised: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
    }
  }
  return out;
}
