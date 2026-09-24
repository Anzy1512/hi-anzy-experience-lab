/**
 * THE CANONICAL BRIDGE.
 *
 * The Experience Lab is an alternate runtime interpretation of a real company,
 * not a parallel invention of one. Everything in this file is mirrored from the
 * commercial frontend — `Anzy1512/hi-anzy-website-2.0`,
 * `frontend/src/data/content.js` — and this is the single place the Lab reads it
 * from. Sixteen realities share these definitions rather than each keeping a
 * private copy of the business.
 *
 * The Agency repository is READ ONLY from here, and always has been: nothing in
 * the Lab writes to it, and the Lab builds and runs with no clone of it on the
 * machine.
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
  repo: 'Anzy1512/hi-anzy-website-2.0',
  file: 'frontend/src/data/content.js',
  mirroredFrom: 'branch main',
  /* The commit these values were read at. `scripts/check-canonical-sync.mjs`
     holds the same string and is what tells you when it has gone stale;
     PERFORMANCE prints it so a visitor can see which version they are looking
     at rather than taking "converged" on trust. */
  commit: '0208378',
  /* Verified 2026-09-24 against `origin/main`, read with `git show` rather than
     from a checkout — the clone is standing on `deploy/aws-staging`, and the
     remote ref was confirmed with `git ls-remote` so a stale fetch could not be
     mistaken for current truth. */
  verifiedAgainst: 'origin/main',
  verifiedOn: '2026-09-24',
  /*
   * WHERE THIS FILE'S VALUES CAME FROM BEFORE, AND WHY THAT IS RECORDED.
   *
   * Until Phase 8.12C every value here was mirrored from `hi-anzy-platform` at
   * `eac2282` (2026-09-01), which was the commercial repository at the time and
   * is now LEGACY. That is history and it stays written down: relabelling an old
   * snapshot with a repository it was never read from is a fabricated
   * provenance, and this project does not do that even when it would make a
   * check green.
   *
   * What changed in 8.12C is that the sources were actually re-read. Every
   * mirrored export below was compared field by field against
   * `hi-anzy-website-2.0` at `0208378`, so the commit above is current rather
   * than inherited. `docs/PHASE_8_12_RELEASE_AND_CANONICAL.md` lists what was
   * adopted, what was refused and what the comparison found wrong in the Lab.
   */
  previously: {
    repo: 'Anzy1512/hi-anzy-platform',
    commit: 'eac2282',
    read: '2026-09-12',
    note: 'LEGACY. Correct for everything mirrored before Phase 8.12C.',
  },
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
    title: 'Understand what needs to change.',
    page: 'First, establish a shared diagnosis.',
    duration: '2–4 weeks',
    outputs: [
      'Evidence and findings ranked by impact',
      'A clearly defined problem',
      'Priorities for the next stage',
    ],
  },
  {
    label: 'ARCHITECT',
    title: 'Agree the plan and its priorities.',
    page: 'Next, design the route forward.',
    duration: '2–4 weeks',
    outputs: [
      'A sequenced roadmap with named owners',
      'Agreed scope and success measures',
      'Dependencies and decision points',
    ],
  },
  {
    label: 'BUILD',
    title: 'Turn the blueprint into working tools.',
    page: 'Then, build and test the system.',
    duration: '6–16 weeks',
    outputs: [
      'Tested deliverables ready for use',
      'Practical documentation',
      'Training and a clear handover',
    ],
  },
  {
    label: 'CONNECT',
    title: 'Bring the right expertise together.',
    page: 'Connect the people and channels.',
    duration: 'Per engagement',
    outputs: [
      'A team matched to the scope',
      'Clear roles and credited contributions',
      'A coordinated activation plan',
    ],
  },
  {
    label: 'SCALE',
    title: 'Measure, learn and improve.',
    page: 'Use results to guide the next move.',
    duration: 'Ongoing, reviewed quarterly',
    outputs: [
      'Results against agreed goals',
      'Prioritised improvements and experiments',
      'An updated roadmap for growth',
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
    copy:
      'Understand the constraint before choosing where to invest.',
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
    copy:
      'Make your offer easy to understand and consistent at every customer touchpoint.',
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
    copy:
      'Connect websites, data and workflows so your team can spend less time moving information.',
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
    copy:
      'Connect content, channels and conversion to the outcomes your business needs.',
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
    copy:
      'Bring your story to relevant audiences through creators, media and live experiences.',
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
    copy:
      'Strengthen the processes, responsibilities and safeguards that growth depends on.',
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

/**
 * THE LAB'S OWN LINE ABOUT THE COMPANY — not the company's line about itself.
 *
 * This was labelled "the company's own positioning line, as the site states
 * it" and it is not: Phase 8.12C searched the canonical frontend at 0208378,
 * the legacy frontend at eac2282, and `docs/HI_ANZY_DECK_CONTENT.md`, and the
 * sentence appears in none of them. The only place it occurs in the Agency
 * repository is inside `frontend/lab/`, which is a built copy of this product
 * — the Lab reading its own output back and mistaking it for a source.
 *
 * `system/brief.ts` printed it into every exported brief as "Hi Anzy's own
 * statement of itself", which made a Lab tagline into a quoted business fact.
 * The sentence is good and it stays; the attribution does not.
 *
 * `questions` was removed with the same correction. It claimed to be
 * `WHY_HOW_NOW` "reduced to its three questions" and two of the three were not
 * that export's questions in any version — canonical asks "What needs to exist
 * for that change to happen?" and "What deserves to happen first?". Nothing
 * read it, so the reduction was never visible and never checked.
 */
export const POSITION = {
  /** Written for the Lab, by the Lab. Attribute it to nobody else. */
  statement: 'One company. Multiple realities.',
} as const;

/** Services grouped by the method stage they belong to. */
export function servicesForStage(stage: string): ServiceCategory[] {
  return SERVICES.filter((s) => s.stage === stage);
}

/* -------------------------------------------------------------------------- */
/* THE REST OF THE CANONICAL MODEL                                             */
/* -------------------------------------------------------------------------- */

/**
 * `TRUST_PRINCIPLES` — five of the company's nine, condensed to one line each.
 *
 * Anzy.OS prints these as system policy, which is the honest place for them: a
 * promise the operating environment holds itself to. The NAMES are canonical
 * and now actually are — two of the five read `Labelled credit` and `Measured
 * outcome`, which are not principle names in any version of the source.
 * `Labelled credit` was lifted from the CONNECT stage's outputs and `Measured
 * outcome` was a paraphrase of `Measurable goals`, both presented under a
 * heading that says these are the company's own words.
 *
 * The one-line form IS the Lab's condensation — canonical carries a paragraph
 * per principle and a terminal cannot — and the four omitted principles
 * (Relevant specialists, Documentation, Operational thinking, Security where it
 * matters) are omitted rather than reworded into these five.
 */
export const PRINCIPLES: { name: string; short: string }[] = [
  { name: 'Defined problem', short: 'The problem, its evidence and the change it should create, agreed first.' },
  { name: 'Clear roadmap', short: 'The sequence, the dependencies and the decision points, named.' },
  { name: 'Named ownership', short: 'Every deliverable and decision has a named owner.' },
  { name: 'Transparent scope', short: 'Deliverables, exclusions, cost and timing in writing.' },
  { name: 'Measurable goals', short: 'The measures are agreed before the work begins.' },
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

/*
 * `SOMETHINGS_OFF` WAS MIRRORED HERE AS `SIGNALS` AND IS NOT ANY MORE.
 *
 * Its five values were byte-exact canonical and its comment said "the Agency
 * Simulator opens on one of these because that is the real starting condition:
 * not a brief, a feeling." The Simulator does not: it opens on a free
 * statement and five constraint questions, and nothing in `src/` ever imported
 * `SIGNALS`. A mirrored export with no reader is the dead weight this file
 * already refuses on ORBIT_CATEGORIES's behalf — carrying one that also
 * describes behaviour the product does not have is worse, because it reads as
 * though somebody checked.
 *
 * The values are unchanged in canonical between eac2282 and 0208378, so
 * re-mirroring them is a copy-and-paste on the day something reads them.
 * `frontend/src/data/content.js`, export `SOMETHINGS_OFF`.
 */

/** `NETWORK_CATEGORIES_HOME` — the twelve disciplines the network is built from. */
export const NETWORK_DISCIPLINES: string[] = [
  'STRATEGY', 'DESIGN', 'TECHNOLOGY', 'AI', 'AUTOMATION', 'MEDIA',
  'CREATORS', 'PRODUCTION', 'EXPERIENCES', 'PR', 'SECURITY', 'OPERATIONS',
];

/*
 * `INSIGHT_CATEGORIES` WAS MIRRORED HERE AND IS NOT ANY MORE.
 *
 * It held ['Strategy', 'Design', 'Technology', 'Culture', 'Operations'] under
 * a comment calling it "the knowledge taxonomy". Canonical's taxonomy is five
 * named categories with blurbs — Business, Unpacked · Brand, Decoded · Tech,
 * Without Theatre · Growth, With Receipts · Things We Noticed — and six as of
 * 0208378, which added Media & Creators. The Lab's five matched neither
 * version, at eac2282 or now: they were invented and labelled as mirrored.
 *
 * Nothing read them, which is how five invented values survived two phases of
 * sync checking. The manifest now records the source as EXCLUDED with this
 * reason rather than as a completed mirror.
 */

/* ==========================================================================
   PHASE 6 — the structural content Phase 5.5 saw and did not take.

   All of it is category shape, taxonomy and diagram: no client is named, no
   result is claimed, no person appears. The exclusions Phase 5.5 recorded for
   BRAND_REFS, CHARACTERS and the rest are untouched.
   ========================================================================== */

/*
 * `ORBIT_CATEGORIES` WAS READ AND IS NOT MIRRORED HERE.
 *
 * Six categories — BUILT HERE, BUILT TOGETHER, MINDS IN THE MIX, FACES &
 * VOICES, PLACES WITH POSSIBILITY, PARTNERS IN PROGRESS — each with a
 * descriptor and the site's own tagline. It is good, truthful, non-client
 * material and Living World's districts are its obvious destination.
 *
 * It is not here because nothing consumes it yet, and a mirrored export with no
 * reader is the same dead weight as a translation primitive with no consumer:
 * it makes coverage look larger than the work. Phase 5.5 deleted two graph
 * helpers for exactly this reason. When Living World's territory is rebuilt on
 * it, mirror it then — `frontend/src/data/content.js:632`.
 *
 * The manifest records it as read, with this as the reason.
 */

/**
 * `NETWORK_SUBCATS` — sixteen disciplines and what each actually contains.
 *
 * The Lab already mirrored the twelve discipline *names*. This is the layer
 * underneath them, and it is the difference between a district having a label
 * and a district having contents.
 */
export const NETWORK_CAPABILITIES: Record<string, string[]> = {
  Strategy: ['Diagnostics', 'Positioning', 'Roadmaps', 'Go-to-market', 'Pricing'],
  Brand: ['Naming & story', 'Identity systems', 'Tone of voice', 'Repositioning', 'Founder brand'],
  Design: ['UX/UI', 'Packaging', 'Motion design', 'Design systems'],
  Technology: ['Web dev', 'Shopify / Woo', 'CRM integration', 'Backend & hosting', 'Analytics setup'],
  AI: ['AI systems', 'Assistants & agents', 'Readiness audits'],
  Automation: ['Workflows', 'n8n / Zapier', 'Internal tools', 'Drip systems'],
  Performance: ['Paid social', 'Google & YouTube', 'Funnel design', 'CRO', 'Growth loops'],
  Media: ['Print & digital', 'Broadcast', 'Entertainment', 'Intl. press', 'Vertical desks'],
  Creators: ['Singers', 'Comedians', 'Sketch artists', 'Podcasters', 'Vloggers', 'Voice artists'],
  Production: ['Video & TVC', 'Photography', 'Motion graphics', 'Sound design', 'Post production'],
  Events: ['Festivals', 'Campus circuit', 'Launches', 'Co-branded stages'],
  Venues: ['Hotels', 'Clubs', 'Stadiums', 'Institutions'],
  Experiences: ['Pop-up tours', 'Stage design', 'Booth branding', 'Merchandise'],
  PR: ['Media placement', 'ORM', 'Crisis comms', 'Sentiment'],
  Security: ['Audits', 'Privacy readiness', 'Infra hardening'],
  Operations: ['Fulfilment', 'Merch production', 'Event ops', 'Logistics'],
};

/**
 * `components/SystemDiagnostic.js` — five parts of a business wired in a loop,
 * with the hop that gives out.
 *
 * The component's own note is the argument, and it is the Agency Simulator's
 * argument too: "Nothing here is broken on its own; the connection between two
 * working things is what failed." The failing link is `sales → ops` in the
 * source and it is not the Lab's to move.
 */
export const SYSTEM_LOOP = {
  nodes: ['BRAND', 'PRODUCT', 'SALES', 'OPS', 'DATA'] as const,
  links: [
    ['BRAND', 'PRODUCT'],
    ['PRODUCT', 'SALES'],
    ['SALES', 'OPS'],
    ['OPS', 'DATA'],
    ['DATA', 'BRAND'],
  ] as [string, string][],
  /** The one that fails, by index into `links`. */
  failingLink: 2,
} as const;

/*
 * `CASE_SECTIONS` / CaseAnatomy's seven steps — SITUATION, GAP, INSIGHT,
 * DECISION, BUILD, RESULT, WHAT HAPPENED NEXT — were read and are likewise not
 * mirrored, for the same reason: no reality reads them today. The shape is
 * recorded in `spatial/translation.ts` as ANATOMY_SPINE, which is the part the
 * Lab actually uses, and the Agency Simulator's registers are built on it.
 */

/* -------------------------------------------------------------------------- */
/* THE ORBIT — the six categories the Hi Anzy ecosystem is grouped into        */
/* -------------------------------------------------------------------------- */

/**
 * `ORBIT_CATEGORIES` from the commercial frontend.
 *
 * Added in Phase 8.6. It entered canonical `main` when the work-ecosystem
 * branch merged, and the Lab had been mirroring around it: six live routes and
 * the page that serves them were the one gap in a manifest whose entire premise
 * is that no surface goes unaccounted for.
 *
 * ── ONLY THE TAXONOMY CROSSES, NEVER THE ROSTER ─────────────────────────────
 *
 * The categories are the company's own structure and are safe to mirror. What
 * fills them is not: `EcosystemCategoryPage` fetches its items from the
 * commercial backend, and those items are named collaborators, named artists,
 * named venues and named partners. That is precisely the class of content this
 * product may never assert — see the manifest entry, which excludes the page
 * for that reason rather than for a technical one. The Lab can say what kinds
 * of relationship exist. It cannot name a single one of them.
 */
export const ORBIT_CATEGORIES = [
  { num: '01', key: 'built_here', name: 'BUILT HERE', descriptor: 'In-house projects', route: '/work/built-here' },
  { num: '02', key: 'built_together', name: 'BUILT TOGETHER', descriptor: 'Collaborations & joint work', route: '/work/built-together' },
  { num: '03', key: 'collaborator', name: 'MINDS IN THE MIX', descriptor: 'Collaborators & specialists', route: '/network/collaborators' },
  { num: '04', key: 'creator', name: 'FACES & VOICES', descriptor: 'Artists & creators', route: '/network/artists-creators' },
  { num: '05', key: 'venue', name: 'PLACES WITH POSSIBILITY', descriptor: 'Venues & institutions', route: '/network/venue-partners' },
  { num: '06', key: 'partner', name: 'PARTNERS IN PROGRESS', descriptor: 'Media, production & strategic partners', route: '/network/partners' },
] as const;
