import { METHOD_LABELS } from './canonical';

/**
 * AGENCY SIMULATOR — content and model inputs.
 *
 * The methodology is the company's own, read from the commercial frontend:
 * AUDIT → ARCHITECT → BUILD → CONNECT → SCALE, via `METHOD_LABELS` so there is
 * one copy of it in this product and not two. No methodology has been invented
 * here.
 *
 * This comment described the previous sequence — absorb → clarify → blueprint
 * → assemble → sustain, from an older printed deck — for a phase and a half
 * after Phase 5.5 replaced the data underneath it. The file was importing the
 * right stages the whole time and explaining the wrong ones, which is its own
 * kind of untruth in a file whose subject is not inventing methodology.
 *
 * Capability clusters are the company's own service groupings. Nothing in this
 * file predicts a business outcome, and the output vocabulary is deliberately
 * hedged — LIKELY, POSSIBLE, NEEDS VALIDATION, OPEN QUESTION.
 */

/** The axes a brief is scored on. Deliberately few, and each one legible. */
export type Axis =
  /*
   * How UNRESOLVED the brief is. Higher means the visitor cannot yet name their
   * own problem.
   *
   * This axis was originally called `clarity`, and it was incoherent: some
   * options raised it to mean "this is clear" while others raised it to mean
   * "this needs clarifying", so a visitor who answered "I DON'T KNOW YET" and
   * "NOBODY CAN EXPLAIN IT" scored as maximally clear. Naming the axis after the
   * thing being measured rather than the thing being wanted makes every weight
   * in this file mean one thing.
   */
  | 'ambiguity'
  | 'urgency' // time pressure
  | 'identity' // brand/positioning need
  | 'infrastructure' // technology and systems need
  | 'reach' // audience acquisition need
  | 'presence' // physical/cultural/human need
  | 'proof'; // evidence, reputation, trust need

export const AXIS_LABEL: Record<Axis, string> = {
  ambiguity: 'AMBIGUITY',
  urgency: 'URGENCY',
  identity: 'IDENTITY',
  infrastructure: 'INFRASTRUCTURE',
  reach: 'REACH',
  presence: 'PRESENCE',
  proof: 'PROOF',
};

export type Weights = Partial<Record<Axis, number>>;

export interface Option {
  id: string;
  label: string;
  /** The fragment words this choice puts on the table. */
  fragments: string[];
  weights: Weights;
}

export interface Question {
  id: string;
  stage: string;
  prompt: string;
  /** One line explaining why this question is being asked at all. */
  note: string;
  options: Option[];
}

export const QUESTIONS: Question[] = [
  {
    id: 'intent',
    stage: 'AUDIT',
    prompt: 'What are you trying to change?',
    note: 'Everything downstream is a consequence of this one answer.',
    options: [
      {
        id: 'start',
        label: 'START SOMETHING',
        fragments: ['NOTHING EXISTS YET', 'FIRST IMPRESSION', 'NAME', 'FOUNDATION'],
        weights: { identity: 3, ambiguity: 1, infrastructure: 2 },
      },
      {
        id: 'fix',
        label: 'FIX SOMETHING',
        fragments: ['SOMETHING IS BROKEN', 'DIAGNOSIS', 'REPAIR', 'TRUST'],
        weights: { proof: 3, infrastructure: 2 },
      },
      {
        id: 'grow',
        label: 'GROW SOMETHING',
        fragments: ['IT WORKS', 'MORE OF IT', 'CHANNELS', 'COMPOUNDING'],
        weights: { reach: 3, infrastructure: 2, urgency: 1, ambiguity: -1 },
      },
      {
        id: 'reposition',
        label: 'REPOSITION SOMETHING',
        fragments: ['WRONG SHELF', 'WHO IS THIS FOR', 'MEANING', 'DISTANCE'],
        weights: { identity: 3, ambiguity: 2, proof: 1 },
      },
      {
        id: 'connect',
        label: 'CONNECT SOMETHING',
        fragments: ['PEOPLE', 'ROOMS', 'CULTURE', 'PRESENCE'],
        weights: { presence: 3, reach: 2 },
      },
      {
        id: 'notice',
        label: 'MAKE PEOPLE NOTICE',
        fragments: ['SILENCE', 'ATTENTION', 'MOMENT', 'VOLUME'],
        weights: { reach: 3, presence: 2, urgency: 2 },
      },
      {
        id: 'system',
        label: 'BUILD THE SYSTEM',
        fragments: ['MANUAL WORK', 'GLUE', 'PIPELINE', 'SCALE'],
        weights: { infrastructure: 4 },
      },
      {
        id: 'unknown',
        label: "I DON'T KNOW YET",
        fragments: ['UNRESOLVED', 'TOO MANY THREADS', 'AMBIGUITY', 'START HERE'],
        weights: { ambiguity: 4, identity: 1, proof: 1 },
      },
    ],
  },
  {
    id: 'state',
    stage: 'AUDIT',
    prompt: 'Where is it now?',
    note: 'Not maturity as a score — maturity as a constraint on sequence.',
    options: [
      {
        id: 'idea',
        label: 'AN IDEA',
        fragments: ['NO SURFACE', 'NO AUDIENCE', 'BLANK SHEET'],
        weights: { identity: 3, infrastructure: 2, proof: -1, ambiguity: 1 },
      },
      {
        id: 'launched',
        label: 'LAUNCHED, QUIET',
        fragments: ['IT EXISTS', 'NOBODY CAME', 'THIN SIGNAL'],
        weights: { reach: 3, identity: 1 },
      },
      {
        id: 'working',
        label: 'WORKING, UNEVEN',
        fragments: ['SOME OF IT WORKS', 'INCONSISTENT', 'PATCHES'],
        weights: { infrastructure: 2, ambiguity: 1, proof: 2 },
      },
      {
        id: 'established',
        label: 'ESTABLISHED, DRIFTING',
        fragments: ['KNOWN', 'DATED', 'DRIFT'],
        weights: { identity: 3, proof: 2, ambiguity: 1 },
      },
    ],
  },
  {
    id: 'audience',
    stage: 'ARCHITECT',
    prompt: 'Who has to change their mind?',
    note: 'A brief with no named audience is a brief that cannot be finished.',
    options: [
      {
        id: 'consumer',
        label: 'PEOPLE WHO BUY',
        fragments: ['CONSIDERATION', 'HABIT', 'PRICE'],
        weights: { reach: 2, identity: 2 },
      },
      {
        id: 'culture',
        label: 'PEOPLE WHO SET THE TONE',
        fragments: ['CREATORS', 'ROOMS', 'SUBCULTURE'],
        weights: { presence: 3, reach: 2 },
      },
      {
        id: 'business',
        label: 'PEOPLE WHO SIGN THINGS',
        fragments: ['RISK', 'EVIDENCE', 'PROCUREMENT'],
        weights: { proof: 3, ambiguity: 1 },
      },
      {
        id: 'internal',
        label: 'PEOPLE INSIDE THE COMPANY',
        fragments: ['ALIGNMENT', 'LANGUAGE', 'PERMISSION'],
        weights: { ambiguity: 3, identity: 2 },
      },
    ],
  },
  {
    id: 'pressure',
    stage: 'ARCHITECT',
    prompt: 'How much time is there?',
    note: 'Time pressure does not change what is right. It changes the order.',
    options: [
      {
        id: 'now',
        label: 'A DATE IS ALREADY SET',
        fragments: ['FIXED DATE', 'NO SLACK', 'SEQUENCE MATTERS'],
        weights: { urgency: 4, reach: 1 },
      },
      {
        id: 'season',
        label: 'THIS SEASON',
        fragments: ['A WINDOW', 'MOMENTUM'],
        weights: { urgency: 2 },
      },
      {
        id: 'open',
        label: 'NO DEADLINE, JUST DRIFT',
        fragments: ['NO FORCING FUNCTION', 'SLOW EROSION'],
        weights: { urgency: -2, ambiguity: 2 },
      },
    ],
  },
  {
    id: 'obstacle',
    stage: 'BUILD',
    prompt: 'What is actually in the way?',
    note: 'The honest answer here decides which capabilities lead.',
    options: [
      {
        id: 'meaning',
        label: 'NOBODY CAN EXPLAIN IT',
        fragments: ['NO STORY', 'NO POSITION', 'MUDDLE'],
        weights: { identity: 4, ambiguity: 4 },
      },
      {
        id: 'plumbing',
        label: 'THE PLUMBING DOES NOT WORK',
        fragments: ['BROKEN FLOW', 'MANUAL STEPS', 'NO DATA'],
        weights: { infrastructure: 4, proof: 1 },
      },
      {
        id: 'attention',
        label: 'NOBODY IS LOOKING',
        fragments: ['NO REACH', 'NO ROOMS', 'NO VOICE'],
        weights: { reach: 4, presence: 2 },
      },
      {
        id: 'belief',
        label: 'NOBODY BELIEVES IT YET',
        fragments: ['NO EVIDENCE', 'NO REFERENCE', 'DOUBT'],
        weights: { proof: 4, presence: 1 },
      },
      {
        id: 'capacity',
        label: 'THERE IS NOBODY TO DO IT',
        fragments: ['NO HANDS', 'NO OWNER', 'STALLED'],
        weights: { infrastructure: 2, ambiguity: 1, urgency: 2 },
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* capability clusters — the deck's own service groupings                      */
/* -------------------------------------------------------------------------- */

export interface Cluster {
  id: string;
  name: string;
  /** What this cluster would actually do. Service language, not promises. */
  line: string;
  /** Which axes pull this cluster in. */
  affinity: Weights;
  /** Clusters this one leans on. Used for the dependency reading. */
  needs: string[];
  /** The Living World district this corresponds to, where one does. */
  district?: string;
  /**
   * Which of the company's six real service categories this capability sits
   * inside. The clusters are finer-grained than the commercial site's taxonomy
   * on purpose — a reading is more useful when it names the specific capability
   * — but every one of them belongs to a category the company actually sells,
   * and the reading says which.
   */
  category: string;
}

export const CLUSTERS: Cluster[] = [
  {
    id: 'strategy',
    name: 'STRATEGY',
    category: 'business-audit-strategy',
    line: 'Positioning, market and competition reading, a roadmap that survives contact.',
    affinity: { ambiguity: 2.2, identity: 1.4, proof: 0.8 },
    needs: [],
    district: 'strategy',
  },
  {
    id: 'design',
    name: 'DESIGN',
    category: 'brand-experience',
    line: 'Identity system, typography and colour, packaging, guidelines.',
    affinity: { identity: 2.4, ambiguity: 0.4 },
    needs: ['strategy'],
    district: 'design',
  },
  {
    id: 'technology',
    name: 'TECHNOLOGY',
    category: 'digital-technology-automation',
    line: 'Web and app build, cloud and CMS, the systems the rest runs on.',
    affinity: { infrastructure: 2.6 },
    needs: ['design'],
    district: 'technology',
  },
  {
    id: 'martech',
    name: 'MAR-TECH',
    category: 'digital-technology-automation',
    line: 'CRM, customer data, workflow automation, integration.',
    affinity: { infrastructure: 1.8, proof: 1.0, reach: 0.6 },
    needs: ['technology'],
    district: 'technology',
  },
  {
    id: 'digital',
    name: 'DIGITAL MARKETING',
    category: 'growth-content-commerce',
    line: 'Search, paid media, funnels, remarketing.',
    affinity: { reach: 2.4, urgency: 0.8 },
    needs: ['technology'],
    district: 'growth',
  },
  {
    id: 'social',
    name: 'SOCIAL',
    category: 'growth-content-commerce',
    line: 'Platform strategy, content, community, listening.',
    affinity: { reach: 1.8, presence: 1.2, identity: 0.6 },
    needs: ['design'],
    district: 'growth',
  },
  {
    id: 'production',
    name: 'PRODUCTION',
    category: 'media-creators-experiences',
    line: 'Film, photography, sound, the material the rest distributes.',
    affinity: { identity: 1.2, reach: 1.0, presence: 1.2 },
    needs: ['design'],
    district: 'production',
  },
  {
    id: 'creators',
    name: 'CREATORS',
    category: 'media-creators-experiences',
    line: 'Artist and creator collaboration, UGC, co-branded work.',
    affinity: { presence: 2.4, reach: 1.2 },
    needs: ['production'],
    district: 'culture',
  },
  {
    id: 'experience',
    name: 'ON-GROUND',
    category: 'media-creators-experiences',
    line: 'Pop-ups, festivals, venues, rooms with people actually in them.',
    affinity: { presence: 2.6, urgency: 0.6 },
    needs: ['production'],
    district: 'culture',
  },
  {
    id: 'reputation',
    name: 'REPUTATION',
    category: 'media-creators-experiences',
    line: 'Review monitoring, ORM, crisis communication, customer success.',
    affinity: { proof: 2.6 },
    needs: ['strategy'],
    district: 'strategy',
  },
  {
    id: 'mainline',
    name: 'MAINLINE',
    category: 'media-creators-experiences',
    line: 'Outdoor, radio, cinema, transit, integrated ATL.',
    affinity: { reach: 1.4, urgency: 1.6, presence: 0.8 },
    needs: ['production'],
    district: 'production',
  },
];

export const SIM_COPY = {
  title: 'AGENCY SIMULATOR',
  tagline: 'GIVE HI ANZY A PROBLEM.',
  intro:
    'State a problem. Watch it get taken apart and put back together as a system. This is a deterministic model of how the method works — not an audit, not a forecast, and not a person.',
  begin: 'STATE THE PROBLEM',
  restart: 'START AGAIN',
  back: 'REVISE',
  /** The real method, mirrored from the commercial frontend. */
  stages: METHOD_LABELS,
  mapTitle: 'THE SYSTEM',
  disclaimer:
    'A structured reading of what you described, produced by fixed rules. It is a starting point for a conversation, not a plan, a quote, or a prediction.',
  hintPointer: 'CLICK TO CHOOSE · ← BACK',
  hintTouch: 'TAP TO CHOOSE',

  /* ---- stating the problem, in the visitor's own words ------------------ */
  stateTitle: 'WHAT IS ACTUALLY WRONG?',
  stateNote:
    'One or two sentences, in your own words. This is matched against the diagnostic areas Hi Anzy actually audits — it reads words, not meaning, and it will tell you when nothing matched rather than guessing.',
  statePlaceholder: 'e.g. we get plenty of traffic but almost nobody checks out',
  stateGo: 'FRAME IT',
  stateEmpty: 'Nothing matched. Try naming what is happening rather than how it feels — traffic, conversion, margin, churn, reporting, handover, brand, automation.',
  stateExample: 'USE AN EXAMPLE',

  /*
   * Shown instead of the cold prompt when the visitor has already described
   * the situation somewhere else in the system — the terminal, usually. The
   * product is holding their sentence, so asking for it again would be the
   * product admitting it forgot.
   */
  stateCarriedTitle: 'THIS IS WHAT YOU SAID',
  stateCarriedNote:
    'You described this already, so it is here rather than being asked for twice. Change it if it was not quite right.',

  /* ---- the run ---------------------------------------------------------- */
  runTitle: 'HI ANZY — PROBLEM BRIEF',
  runGo: 'PRODUCE THE BRIEF',
  runNote:
    'Every line below says where it came from. A finished run is mostly DERIVED and UNKNOWN, which is the honest shape of knowing one sentence about a business.',
  legend: {
    FACT: 'You said it, or chose it.',
    DERIVED: 'A canonical table produced it from a fact above.',
    UNKNOWN: 'Not established. This cannot establish it.',
    RECOMMENDATION: 'An opinion, offered as one.',
  },
  /*
   * The two send labels that used to live here — 'SEND TO SYSTEM.APP' and
   * 'SENT — OPEN ANZY.OS' — are gone with the hand-written button that used
   * them. Phase 8.7 moved CONTINUE into the shared artifact bar, which names
   * its destination from the index rather than from copy held beside one tool:
   * a label typed here would have gone stale the moment a mode was retitled,
   * and this file has already had to fix exactly that class of bug once.
   */
} as const;
