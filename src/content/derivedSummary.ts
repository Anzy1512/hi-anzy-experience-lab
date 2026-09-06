import { METHOD, SERVICES } from './canonical';

/**
 * DERIVED_SUMMARY — the primitive, as runtime.
 *
 * SOURCE
 * `components/PackageBuilder.js` in the commercial frontend. It is the one
 * commerce-shaped thing on that site, and its own comment explains what it
 * deliberately is not: "no price, no cart total and no checkout, because scope
 * here is genuinely a conversation and a number printed next to a checkbox
 * would be a lie". What it keeps is the useful half — pick what you want, see
 * the shape of what you picked. And the shape is *derived*: "which systems you
 * have touched, which method stages that implies, and the rough duration band".
 *
 * THE DISCIPLINE
 * Derived, never stored. Everything below is computed from what the visitor
 * did in this session and held nowhere — no persistence, no accumulation, no
 * profile. Reload and it is gone, which is the only version of this that can
 * be offered without asking anybody for anything.
 *
 * WHAT IT REFUSES TO PRODUCE
 * No ROI, no revenue, no probability, no confidence score, no projected
 * outcome, no "AI analysis". Those are the numbers a builder like this is
 * always tempted toward and every one of them would be invented. The stages
 * and the duration band below are canonical facts about how the company works,
 * looked up — not predictions about how a project would go.
 */

export interface DerivedSummary {
  /** Canonical service categories the visitor's answers actually touched. */
  systems: string[];
  /** The method stages those categories belong to, in canonical order. */
  stages: string[];
  /**
   * The span of the method this implies, as the site itself states it —
   * summed from each stage's own published duration, never estimated.
   */
  span: string | null;
  /** What the summary cannot know. Always present, never empty by accident. */
  unknown: string[];
}

/** Canonical stage order. The Lab does not get to reorder the method. */
const STAGE_ORDER = METHOD.map((m) => m.label);

/**
 * Weeks implied by a stage's published duration string.
 *
 * The canonical durations read like "2–4 weeks". This takes the *lower* bound
 * of each, deliberately: a range summed at its upper bound reads as a quote,
 * and the one thing this must never start resembling is a quote. The label it
 * produces says "from", and means it.
 */
function lowerWeeks(duration: string): number {
  const m = duration.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function deriveSummary(clusterCategorySlugs: string[]): DerivedSummary {
  const slugs = [...new Set(clusterCategorySlugs)];
  const cats = slugs
    .map((slug) => SERVICES.find((s) => s.slug === slug))
    .filter((c): c is (typeof SERVICES)[number] => Boolean(c));

  const systems = cats.map((c) => c.label);

  const stages = [...new Set(cats.map((c) => c.stage))].sort(
    (a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b),
  );

  /* The span runs from the earliest stage touched to the latest — the method is
     a sequence, so touching AUDIT and SCALE implies everything between them
     whether or not a category was named in the middle. */
  const first = stages.length ? STAGE_ORDER.indexOf(stages[0]) : -1;
  const last = stages.length ? STAGE_ORDER.indexOf(stages[stages.length - 1]) : -1;
  let span: string | null = null;
  if (first >= 0 && last >= first) {
    const weeks = METHOD.slice(first, last + 1).reduce((n, m) => n + lowerWeeks(m.duration), 0);
    if (weeks > 0) {
      span = `${STAGE_ORDER[first]} → ${STAGE_ORDER[last]} · from ${weeks} weeks`;
    }
  }

  return {
    systems,
    stages,
    span,
    unknown: [
      'What any of it costs',
      'How long it actually takes here',
      'Whether this is the right shape at all',
    ],
  };
}
