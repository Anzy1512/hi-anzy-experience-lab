/**
 * THE CANONICAL BRIDGE.
 *
 * The Experience Lab is an alternate runtime interpretation of a real company,
 * not a parallel invention of one. Everything in this file is mirrored from the
 * commercial frontend — `Anzy1512/hi-anzy-platform`, `frontend/src/data/content.js`
 * — and this is the single place the Lab reads it from. Sixteen realities share
 * these definitions rather than each keeping a private copy of the business.
 *
 * WHY MIRRORED RATHER THAN IMPORTED
 * The commercial frontend is a separate repository with its own build, its own
 * React version and its own deployment. Importing across that boundary would
 * couple two products that are deliberately independent and would put the Lab's
 * bundle at the mercy of a codebase it does not control. So this is a mirror
 * with its provenance written down, and `docs/PHASE_5_5_FRONTEND_INVENTORY.md`
 * records what was taken and what was deliberately left.
 *
 * WHAT IS NOT HERE, ON PURPOSE
 * Client names. The commercial site carries a real, sourced, provenance-checked
 * client list (`BRAND_REFS`, `TOP_CLIENT_MARKS`) and is the right place for it —
 * it has the context that makes such a list mean something. The Lab has never
 * asserted a client relationship, and Memory goes as far as marking names and
 * consent-to-publish explicitly UNRECOVERED. Importing a client marquee here
 * would contradict a deliberate position, so it is excluded by decision rather
 * than by omission.
 *
 * WHEN THE COMMERCIAL SITE CHANGES
 * This file goes stale silently. That is the known cost of mirroring; the
 * inventory doc names it, and re-syncing is a manual read of `content.js`.
 */

export const CANONICAL_SOURCE = {
  repo: 'Anzy1512/hi-anzy-platform',
  file: 'frontend/src/data/content.js',
  mirroredFrom: 'branch main',
} as const;

/* -------------------------------------------------------------------------- */
/* THE METHOD — the real one                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `METHOD_STAGES` from the commercial frontend.
 *
 * This replaces the Lab's previous ABSORB → CLARIFY → BLUEPRINT → ASSEMBLE →
 * SUSTAIN, which came from an earlier printed deck. The company's own site now
 * states the method as AUDIT → ARCHITECT → BUILD → CONNECT → SCALE, so that is
 * what the Lab says. Five realities were reading the old sequence.
 */
export interface MethodStage {
  label: string;
  /** The one-line promise, as the site states it. */
  title: string;
  /** The short narration used in sequence. */
  page: string;
  duration: string;
  /** What the stage produces. Used where a reality needs concrete output. */
  outputs: string[];
}

export const METHOD: MethodStage[] = [
  {
    label: 'AUDIT',
    title: "See what's really happening.",
    page: 'First, we look.',
    duration: '2–4 weeks',
    outputs: [
      'Findings ranked by what they actually cost',
      'A named problem, in one sentence',
      'The shortlist of what to fix first',
    ],
  },
  {
    label: 'ARCHITECT',
    title: 'Turn the mess into a map.',
    page: 'Then, we decide.',
    duration: '2–4 weeks',
    outputs: [
      'A sequenced blueprint with owners',
      'What is explicitly not happening',
      'Dependencies mapped before they bite',
    ],
  },
  {
    label: 'BUILD',
    title: 'Make the plan real.',
    page: 'Then, we make.',
    duration: '6–16 weeks',
    outputs: [
      'The thing itself, working',
      'Documentation your team can act on',
      'A handover that does not need us present',
    ],
  },
  {
    label: 'CONNECT',
    title: 'Bring the right minds into the room.',
    page: 'Then, we bring in whoever the problem needs.',
    duration: 'Per engagement',
    outputs: [
      'A roster assembled for this problem',
      'Labelled credit: who did what, always',
      'Relationships that outlast the project',
    ],
  },
  {
    label: 'SCALE',
    title: "Keep what works. Improve what doesn't.",
    page: 'Then, we prove whether it worked.',
    duration: 'Ongoing, reviewed quarterly',
    outputs: [
      'Results against the measure you agreed',
      'A shorter list of things you still do',
      'Systems that survive your growth',
    ],
  },
];

export const METHOD_LABELS = METHOD.map((m) => m.label);

/* -------------------------------------------------------------------------- */
/* THE SERVICE TAXONOMY — the real six                                         */
/* -------------------------------------------------------------------------- */

/**
 * `CATEGORIES` from the commercial frontend, reduced to what the Lab needs.
 *
 * The full source carries long-form body copy, signals, deliverables and
 * per-service lists. The Lab takes the identity of each category and its
 * capabilities, because those are what a spatial interpretation can render —
 * the essay belongs on the site that has room to be read.
 */
export interface ServiceCategory {
  num: string;
  slug: string;
  /** The imperative the site leads with. */
  label: string;
  title: string;
  copy: string;
  /** Which method stage this category belongs to. */
  stage: string;
  typical: string;
  capabilities: string[];
}

export const SERVICES: ServiceCategory[] = [
  {
    num: '01',
    slug: 'business-audit-strategy',
    label: 'SEE CLEARLY',
    title: 'Business Audit & Strategy',
    copy: 'Before spending money on the solution, make sure you diagnosed the right problem.',
    stage: 'AUDIT',
    typical: '2–6 weeks',
    capabilities: [
      'Business diagnostics',
      'Market intelligence',
      'Customer understanding',
      'Positioning',
      'Opportunity mapping',
      'Transformation roadmaps',
      'Go-to-market strategy',
      'Operating model improvement',
    ],
  },
  {
    num: '02',
    slug: 'brand-experience',
    label: 'MAKE SENSE',
    title: 'Brand & Experience',
    copy: 'People rarely buy what they do not understand. Clarity converts before the CTA does.',
    stage: 'ARCHITECT',
    typical: '4–10 weeks',
    capabilities: [
      'Brand strategy',
      'Naming',
      'Identity',
      'Messaging',
      'Packaging',
      'Retail and environment',
      'Guidelines',
      'Design systems',
      'Content design',
    ],
  },
  {
    num: '03',
    slug: 'digital-technology-automation',
    label: 'MAKE IT WORK',
    title: 'Digital, Technology & Automation',
    copy: 'Technology should remove friction. Not create a new Slack channel about friction.',
    stage: 'BUILD',
    typical: '6–16 weeks',
    capabilities: [
      'Websites',
      'Commerce',
      'Applications',
      'Dashboards',
      'Cloud',
      'CMS',
      'Integration',
      'Workflow automation',
      'Data plumbing',
      'Analytics',
    ],
  },
  {
    num: '04',
    slug: 'growth-content-commerce',
    label: 'MAKE IT MOVE',
    title: 'Growth, Content & Commerce',
    copy: 'Attention is useful. What happens after attention pays the bills.',
    stage: 'SCALE',
    typical: 'Ongoing, reviewed quarterly',
    capabilities: [
      'Content strategy',
      'Social',
      'Performance marketing',
      'SEO',
      'Lifecycle and CRM',
      'Commerce operations',
      'Retention',
      'Measurement',
      'Creative testing',
    ],
  },
  {
    num: '05',
    slug: 'media-creators-experiences',
    label: 'MAKE IT TRAVEL',
    title: 'Media, Creators & Experiences',
    copy: 'A good idea should travel further than your own feed.',
    stage: 'CONNECT',
    typical: 'Campaign-based',
    capabilities: [
      'Creators',
      'PR',
      'Media',
      'Events',
      'Activations',
      'Partnerships',
      'Production',
      'Talent',
      'Community',
    ],
  },
  {
    num: '06',
    slug: 'advisory-security-scale',
    label: 'MAKE IT LAST',
    title: 'Advisory, Security & Scale',
    copy: 'Growth is exciting until the weak systems start introducing themselves.',
    stage: 'SCALE',
    typical: 'Retained or milestone-based',
    capabilities: [
      'Founder advisory',
      'Technology advisory',
      'Security',
      'Privacy readiness',
      'Governance',
      'Operating cadence',
      'Hiring shape',
      'Continuity',
    ],
  },
];

/** The company's own positioning line, as the site states it. */
export const POSITION = {
  statement: 'One company. Multiple realities.',
  /** `WHY_HOW_NOW` reduced to its three questions. */
  questions: [
    'What are we actually trying to change?',
    'How will it actually work?',
    'Why now, and what happens if we wait?',
  ],
} as const;

/** Services grouped by the method stage they belong to. */
export function servicesForStage(stage: string): ServiceCategory[] {
  return SERVICES.filter((s) => s.stage === stage);
}

/* -------------------------------------------------------------------------- */
/* THE REST OF THE CANONICAL MODEL                                             */
/* -------------------------------------------------------------------------- */

/**
 * `TRUST_PRINCIPLES` — how the company says it works, in its own words.
 * Anzy.OS prints these as system policy, which is the honest place for them:
 * a promise the operating environment holds itself to.
 */
export const PRINCIPLES: { name: string; short: string }[] = [
  { name: 'Defined problem', short: 'We will not start until the problem fits in one sentence.' },
  { name: 'Clear roadmap', short: 'What happens, in what order, and what must be true first.' },
  { name: 'Named ownership', short: 'Every item has a person, not a department.' },
  { name: 'Labelled credit', short: 'Who did what, always.' },
  { name: 'Measured outcome', short: 'The measure is agreed in advance or it is not a measure.' },
];

/** `AUDIENCES` — who the work is for. Shapes of business, never named clients. */
export const AUDIENCES: string[] = [
  'Idea builders',
  'Entrepreneurs',
  'Founder-led companies',
  'Established businesses modernising systems',
  'D2C businesses',
  'Commerce businesses',
  'Hospitality',
  'Service companies',
  'Experience-led businesses',
  'Internal innovation teams',
  'Companies adopting AI or automation',
  'Teams entering the next stage of growth',
];

/** `DIAGNOSTIC_AREAS` — the eleven areas an audit actually covers. */
export const DIAGNOSTIC_AREAS: string[] = [
  'Business', 'Brand', 'Customer', 'Sales', 'Marketing', 'Technology',
  'Data', 'Operations', 'Automation', 'Security', 'Growth',
];

/** `DIAGNOSTIC_OUTCOMES` — what an audit produces, in order. */
export const DIAGNOSTIC_OUTCOMES: string[] = [
  'What is happening',
  'Why it matters',
  'What it is costing you',
  'What should change',
  'What happens first',
  'Who should own it',
  'How success gets measured',
];

/**
 * `SOMETHINGS_OFF` — the symptoms a business notices before it can name the
 * problem. The Agency Simulator opens on one of these because that is the real
 * starting condition: not a brief, a feeling.
 */
export const SIGNALS: string[] = [
  'Sales are growing but margins are not invited.',
  'Marketing is busy. Nobody can explain what the busy-ness returns.',
  'The website gets traffic. The traffic gets confused. The confusion leaves.',
  'Four tools, three spreadsheets and one person who knows how it all connects. She is on leave.',
  'Everything looks normal. That is occasionally the most expensive symptom of all.',
];

/** `NETWORK_CATEGORIES_HOME` — the twelve disciplines the network is built from. */
export const NETWORK_DISCIPLINES: string[] = [
  'STRATEGY', 'DESIGN', 'TECHNOLOGY', 'AI', 'AUTOMATION', 'MEDIA',
  'CREATORS', 'PRODUCTION', 'EXPERIENCES', 'PR', 'SECURITY', 'OPERATIONS',
];

/** `INSIGHT_CATEGORIES` — the knowledge taxonomy. */
export const INSIGHT_CATEGORIES: string[] = [
  'Strategy', 'Design', 'Technology', 'Culture', 'Operations',
];
