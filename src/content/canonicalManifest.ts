/**
 * THE CANONICAL MANIFEST.
 *
 * Every meaningful public-facing surface of the commercial Hi Anzy frontend,
 * with an explicit treatment. This is the machine-readable coverage record —
 * `docs/PHASE_5_5_FRONTEND_INVENTORY.md` narrates it, PERFORMANCE derives its
 * counts from it, and nothing here is a hardcoded total.
 *
 * `NOT_MAPPED` is deliberately absent from the `Treatment` union. An item is
 * either given a treatment or excluded with a written reason; "we did not get
 * to it" is not a state this file can express, which is the point.
 *
 * SOURCE OF TRUTH
 *   repo   github.com/Anzy1512/hi-anzy-website-2.0
 *   branch main (read from `origin/main`, never a local checkout)
 *   commit 0208378 — re-read 2026-09-24 in Phase 8.12C
 *
 * Before 8.12C this read `hi-anzy-platform` @ `eac2282`, which was the
 * commercial repository until Phase 8.12 and is now LEGACY. That commit remains
 * the correct provenance for everything mirrored before the re-read; see
 * `canonical.ts`'s `CANONICAL_SOURCE.previously`.
 * The commercial frontend is never imported at runtime. See `canonical.ts` for
 * the mirroring decision and `scripts/check-canonical-sync.mjs` for the drift
 * check that tells you when this file has gone stale.
 */

export type Treatment =
  /** Mirrored into `canonical.ts`; realities read the data. */
  | 'SYSTEM_SOURCE'
  /** Its *behaviour* became a Lab spatial primitive. */
  | 'SPATIAL_TRANSFORM'
  /** It has a direct spatial counterpart in a reality. */
  | 'SPATIAL_TWIN'
  /** Supplies material/visual language rather than data. */
  | 'MATERIAL_SOURCE'
  /** Belongs to the commercial site; the Lab does not reinterpret it. */
  | 'DOM_ONLY'
  /** Deliberately not brought across. `rationale` is mandatory. */
  | 'EXCLUDED'
  /** Exists but could not be assessed. `rationale` is mandatory. */
  | 'UNAVAILABLE';

export type SourceType = 'route' | 'export' | 'component' | 'assetFamily' | 'font';

export interface ManifestEntry {
  /** Path or export name in the canonical repository. */
  source: string;
  sourceType: SourceType;
  treatment: Treatment;
  /** Lab realities, primitives or modules that consume it. */
  destinations: string[];
  /** Why this treatment. Required for EXCLUDED and UNAVAILABLE. */
  rationale: string;
  /** Does using this risk publishing someone's likeness, name or words? */
  consentRisk: 'none' | 'low' | 'high';
  /** Would importing this add meaningful bytes to the Lab? */
  payloadRisk: 'none' | 'low' | 'high';
  status: 'done' | 'partial';
}

/* -------------------------------------------------------------------------- */
/* ROUTES — 17                                                                 */
/* -------------------------------------------------------------------------- */

export const ROUTES: ManifestEntry[] = [
  {
    source: 'pages/Home.js',
    sourceType: 'route',
    treatment: 'MATERIAL_SOURCE',
    destinations: ['launcher', 'reality-index', 'director'],
    rationale:
      'The narrative hierarchy — statement, then problem, then system — is the shape Director already cuts to and the launcher already opens with. Taken as composition, not as content.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/WhyHiAnzy.js',
    sourceType: 'route',
    treatment: 'SYSTEM_SOURCE',
    destinations: ['canonical.POSITION', 'time-machine'],
    rationale: 'Positioning and the three WHY/HOW/NOW questions.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/HowWeWork.js',
    sourceType: 'route',
    treatment: 'SPATIAL_TRANSFORM',
    destinations: ['agency-simulator', 'anzy-os', 'director', 'memory', 'time-machine'],
    rationale:
      'The method is the Lab’s spine. Its five stages became the Agency Simulator’s working registers, Anzy.OS’s METHOD.app, Director’s Act III and two Memory records.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/WhatWeDo.js',
    sourceType: 'route',
    treatment: 'SYSTEM_SOURCE',
    destinations: ['canonical.SERVICES', 'anzy-os', 'agency-simulator'],
    rationale: 'The six-category service architecture.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/Discipline.js',
    sourceType: 'route',
    treatment: 'SYSTEM_SOURCE',
    destinations: ['canonical.SERVICES'],
    rationale: 'Per-discipline detail; the Lab consumes the category identity and capabilities.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'partial',
  },
  {
    source: 'pages/ServiceDetail.js',
    sourceType: 'route',
    treatment: 'SYSTEM_SOURCE',
    destinations: ['canonical.SERVICES', 'agency-simulator'],
    rationale:
      'Long-form service essays stay on the site, which has room to be read. The Lab takes identity, capabilities, stage and typical duration.',
    consentRisk: 'none',
    payloadRisk: 'low',
    status: 'done',
  },
  {
    source: 'pages/Work.js',
    sourceType: 'route',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Project presentation carries named client work. The Lab has never asserted a client relationship and Memory explicitly marks such fields UNRECOVERED. Excluded by standing policy, not by omission.',
    consentRisk: 'high',
    payloadRisk: 'high',
    status: 'done',
  },
  {
    source: 'pages/WorkDetail.js',
    sourceType: 'route',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale: 'As Work.js — per-project claims and outcomes.',
    consentRisk: 'high',
    payloadRisk: 'high',
    status: 'done',
  },
  {
    source: 'pages/Network.js',
    sourceType: 'route',
    treatment: 'SPATIAL_TWIN',
    destinations: ['living-world'],
    rationale:
      'The network’s node-and-branch topology is the same grammar Living World draws as districts and routes. Taken as topology; no named collaborator is reproduced.',
    consentRisk: 'low',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/WhoWeWorkWith.js',
    sourceType: 'route',
    treatment: 'SYSTEM_SOURCE',
    destinations: ['canonical.AUDIENCES'],
    rationale: 'Audience shapes, not named clients.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/Insights.js',
    sourceType: 'route',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Read, and deliberately not mirrored. The Lab held five invented category names under this source’s label for three phases — Strategy, Design, Technology, Culture, Operations — which match neither the taxonomy at eac2282 nor the six at 0208378. Nothing consumed them, which is exactly why nobody noticed. Mirroring the real six is a copy-and-paste on the day a reality needs a knowledge taxonomy; carrying them unread is how the wrong five survived.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/InsightDetail.js',
    sourceType: 'route',
    treatment: 'DOM_ONLY',
    destinations: [],
    rationale: 'Long-form reading. A spatial reinterpretation would make it harder to read, not easier.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/Resources.js',
    sourceType: 'route',
    treatment: 'DOM_ONLY',
    destinations: [],
    rationale: 'Downloadable material. A file list has no spatial argument to make.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/Careers.js',
    sourceType: 'route',
    treatment: 'DOM_ONLY',
    destinations: [],
    rationale: 'A hiring surface with forms. Conversion-critical; belongs where it converts.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/Collaborate.js',
    sourceType: 'route',
    treatment: 'DOM_ONLY',
    destinations: [],
    rationale: 'As Careers — a form-led action surface.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/Contact.js',
    sourceType: 'route',
    treatment: 'DOM_ONLY',
    destinations: [],
    rationale:
      'The Lab links out rather than reproducing a contact form. Forms and critical controls stay DOM-first on the site that owns them.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/ComingSoon.js',
    sourceType: 'route',
    treatment: 'SYSTEM_SOURCE',
    destinations: ['anzy-os'],
    rationale:
      'Names the not-yet-shipped products. Anzy.OS already lists IMKAAN.app and HI-ANZY-AI.app as processes that are named and not running — the same honest statement.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'pages/NotFound.js',
    sourceType: 'route',
    treatment: 'DOM_ONLY',
    destinations: [],
    rationale: 'An error surface. The Lab has its own recovery path via emergencyReset.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    /*
     * Phase 8.6 found this one missing. It serves six live routes —
     * /work/built-here, /work/built-together, and the four /network rosters —
     * and arrived in canonical `main` when the work-ecosystem branch merged.
     * A manifest whose stated premise is that `NOT_MAPPED` is not a value the
     * type can hold had a page it had never heard of, which is the exact
     * failure this file exists to make impossible.
     */
    source: 'pages/ecosystem/EcosystemCategoryPage.js',
    sourceType: 'route',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Its taxonomy is mirrored as ORBIT_CATEGORIES; its contents are not, and never will be. The page fetches its items from the commercial backend, and those items are named collaborators, named artists, named venues and named partners. The Lab may describe the kinds of relationship the network holds. It may not name one — that is the same rule that keeps Memory full of unrecovered fields rather than case studies.',
    consentRisk: 'high',
    payloadRisk: 'low',
    status: 'done',
  },
];

/* -------------------------------------------------------------------------- */
/* CONTENT EXPORTS — 27                                                        */
/* -------------------------------------------------------------------------- */

const sys = (
  source: string,
  destinations: string[],
  rationale: string,
  status: 'done' | 'partial' = 'done',
): ManifestEntry => ({
  source,
  sourceType: 'export',
  treatment: 'SYSTEM_SOURCE',
  destinations,
  rationale,
  consentRisk: 'none',
  payloadRisk: 'none',
  status,
});

export const EXPORTS: ManifestEntry[] = [
  sys('METHOD_STAGES', ['canonical.METHOD', 'agency-simulator', 'anzy-os', 'director', 'memory', 'time-machine'], 'The real methodology. Replaced the obsolete deck sequence across five realities.'),
  sys('CATEGORIES', ['canonical.SERVICES', 'anzy-os', 'agency-simulator', 'time-machine'], 'The six-category service taxonomy.'),
  sys('CATEGORY_BY_SLUG', ['canonical.SERVICES'], 'A lookup over CATEGORIES; the Lab derives its own.'),
  {
    source: 'WHY_HOW_NOW',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Read, and not mirrored. `canonical.POSITION.questions` claimed to be this export reduced to three questions and two of the three were never its questions — canonical asks "What needs to exist for that change to happen?" and "What deserves to happen first?". Nothing read it, so the reduction was never checked. Removed in Phase 8.12C rather than corrected, because a mirrored export with no reader is dead weight either way.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  sys('TRUST_PRINCIPLES', ['canonical.PRINCIPLES', 'anzy-os'], 'Five of the nine, condensed to one line each for the OS’s system-policy readout. Names are canonical; the one-line form is the Lab’s. Two names were not canonical at all until Phase 8.12C corrected them.', 'partial'),
  sys('AUDIENCES', ['canonical.AUDIENCES', 'agency-simulator'], 'Who the work is for — shapes, not names.'),
  sys('DIAGNOSTIC_AREAS', ['canonical.DIAGNOSTIC_AREAS', 'agency-simulator'], 'The eleven areas an audit covers. Becomes the simulator’s coverage readout.'),
  sys('DIAGNOSTIC_OUTCOMES', ['canonical.DIAGNOSTIC_OUTCOMES'], 'What an audit produces.'),
  {
    source: 'SOMETHINGS_OFF',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Read, mirrored byte-exact as `canonical.SIGNALS`, and removed in Phase 8.12C. Nothing in src/ ever imported it, and its comment said the Agency Simulator opens on one of these — the Simulator opens on a free statement and five constraint questions. The values are unchanged in canonical between eac2282 and 0208378, so re-mirroring is a copy-and-paste on the day something reads them.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  sys('NETWORK_CATEGORIES_HOME', ['living-world'], 'The twelve network disciplines; Living World reads them as territory.'),
  sys('NETWORK_SUBCATS', ['living-world'], 'Sub-disciplines per category.', 'partial'),
  sys('ORBIT_CATEGORIES', ['spatial/translation OrbitCluster'], 'Relationships arranged around a centre — the source of the ORBIT_CLUSTER primitive.'),
  {
    source: 'INSIGHT_CATEGORIES',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Read, and not mirrored. See pages/Insights.js above: the five values carried under this name were invented, matched no version of the source, and had no reader. Canonical gained a sixth category, Media & Creators, at 0208378.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  sys('FILTER_LIST', ['living-world'], 'The filter vocabulary the network is navigated by.', 'partial'),
  sys('DISCIPLINES', ['canonical.SERVICES'], 'Per-discipline detail behind the six categories.', 'partial'),
  sys('DISCIPLINE_BY_SLUG', ['canonical.SERVICES'], 'A lookup; the Lab derives its own.'),
  sys('DISCIPLINE_BY_CATEGORY', ['canonical.SERVICES'], 'A lookup; the Lab derives its own.'),
  sys('NAV_LINKS', ['reality-index'], 'The site’s own top-level shape, which the Reality Index deliberately does not imitate — it is a map of realities, not a copy of the nav.'),
  sys('FOOTER_LINKS', ['reality-index'], 'As NAV_LINKS.'),
  {
    source: 'PROVENANCE_STYLES',
    sourceType: 'export',
    treatment: 'SPATIAL_TRANSFORM',
    destinations: ['spatial/translation ProvenanceMark', 'memory'],
    rationale:
      'The site labels every piece of work with who did it. That habit — credit as a first-class visual object — became the ProvenanceMark primitive and is why Memory marks unrecovered fields rather than hiding them.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'BRAND_REFS',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Real, sourced client names. The commercial site carries the context that makes a client list mean something; the Lab has never asserted a client relationship. Excluded by decision.',
    consentRisk: 'high',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'TOP_CLIENT_MARKS',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale: 'As BRAND_REFS — the curated top tier, same policy.',
    consentRisk: 'high',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'CHARACTERS',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Photographs of people with assigned archetypes. Publishing likenesses inside an experimental reconstruction is a consent question the Lab cannot answer from here.',
    consentRisk: 'high',
    payloadRisk: 'high',
    status: 'done',
  },
  {
    source: 'TEAM_QUOTE',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'An attributed collective statement. Reproducing it in a different voice-context risks changing what it means.',
    consentRisk: 'high',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'ROTATING_QUOTES',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale: 'As TEAM_QUOTE — attributed voice.',
    consentRisk: 'high',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'PACKAGES',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Commercial offer construction with prices. Forcing a buying flow into an art experience would weaken both, and a stale mirrored price is worse than no price.',
    consentRisk: 'none',
    payloadRisk: 'low',
    status: 'done',
  },
  {
    source: 'COMBOS',
    sourceType: 'export',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale: 'As PACKAGES — packaged commercial bundles.',
    consentRisk: 'none',
    payloadRisk: 'low',
    status: 'done',
  },
];

/* -------------------------------------------------------------------------- */
/* COMPONENTS — 64                                                             */
/* -------------------------------------------------------------------------- */

const comp = (
  source: string,
  treatment: Treatment,
  destinations: string[],
  rationale: string,
): ManifestEntry => ({
  source,
  sourceType: 'component',
  treatment,
  destinations,
  rationale,
  consentRisk: 'none',
  payloadRisk: 'none',
  status: 'done',
});

/**
 * Behaviour, not code, crosses the repository boundary. Each entry below records
 * what the canonical component *does* and which Lab primitive inherited it.
 */
export const COMPONENTS: ManifestEntry[] = [
  /* ---- the distinctive interaction language --------------------------- */
  comp('PinnedSequence.js', 'SPATIAL_TRANSFORM', ['translation.PINNED_FIELD', 'reality-compiler'], 'Content holds position while narrative state advances. Became PINNED_FIELD; the Compiler already holds the document still while its stages change.'),
  comp('EvidenceDeck.js', 'SPATIAL_TRANSFORM', ['translation.SPATIAL_DECK', 'anzy-os'], 'A fan of plates, one forward at a time, cycled by drag or click. Became SPATIAL_DECK; Anzy.OS sheets are the same object at rest.'),
  comp('CaseAnatomy.js', 'SPATIAL_TRANSFORM', ['translation.ANATOMY_SPINE', 'agency-simulator'], 'An ordered spine that fills in one step at a time. Became ANATOMY_SPINE; the simulator’s method registers fill the same way.'),
  comp('OrbitSection.js', 'SPATIAL_TRANSFORM', ['translation.ORBIT_CLUSTER', 'living-world'], 'Relationships arranged around a conceptual centre, opening from collapsed. Became ORBIT_CLUSTER.'),
  comp('RouteLine.js', 'SPATIAL_TRANSFORM', ['translation.ROUTE_TRACE', 'living-world'], 'The signature orange route, drawn rather than revealed. Became ROUTE_TRACE; Living World’s routes are the same line in three dimensions.'),
  comp('DissolveImage.js', 'SPATIAL_TRANSFORM', ['translation.GRAIN_RESOLVE', 'memory', 'dream'], 'Displacement noise resolving into an image. Became GRAIN_RESOLVE — which is, independently, exactly what Memory already does with sampled type.'),
  comp('SystemDiagnostic.js', 'SPATIAL_TRANSFORM', ['translation.DIAGNOSTIC_FIELD', 'agency-simulator'], 'Five parts of a business wired in a loop, with one failing link. Became DIAGNOSTIC_FIELD; the simulator’s dependency reading makes the same argument.'),
  comp('MenuConstellation.js', 'MATERIAL_SOURCE', ['living-world'], 'Nodes finding each other, drawn in 2D canvas on purpose to avoid paying for a renderer on a phone. The Lab took the restraint as much as the motif.'),
  comp('ProvenanceTag.js', 'SPATIAL_TRANSFORM', ['translation.PROVENANCE_MARK', 'memory'], 'Credit as a typed system label. Became PROVENANCE_MARK.'),
  comp('ProofStrip.js', 'MATERIAL_SOURCE', ['performance'], 'A strip of verifiable claims. Performance carries the same idea applied to the machine.'),

  /* ---- three/ — the canonical WebGL layer ----------------------------- */
  comp('three/SignalField.js', 'SPATIAL_TRANSFORM', ['translation.ORBIT_CLUSTER'], 'Categories orbiting a core with pulses travelling out and back.'),
  comp('three/IndexSpine.js', 'SPATIAL_TRANSFORM', ['reality-index'], 'A rail with a travelling node at the reader’s position, carrying no information the DOM does not. The Index’s register/trail follows the same rule.'),
  comp('three/Constellation.js', 'MATERIAL_SOURCE', ['living-world'], 'The network motif in WebGL.'),
  comp('three/HalftoneBackdrop.js', 'MATERIAL_SOURCE', ['graphics/ContourPlate'], 'Halftone as a material. The Lab’s plate is the same idea, generated.'),
  comp('three/HalftoneStatic.js', 'MATERIAL_SOURCE', ['graphics/ContourPlate'], 'The static fallback for the above — the Lab’s semantic-fallback habit, in the canonical codebase.'),
  comp('three/LensField.js', 'MATERIAL_SOURCE', ['x-ray'], 'Focus as an optical instrument.'),
  comp('three/SparkGap.js', 'MATERIAL_SOURCE', ['matter-engine'], 'Energy across a gap.'),
  comp(
    'three/SystemCore.js',
    'SPATIAL_TRANSFORM',
    ['reality-index', 'translation.LATTICE_ASSEMBLY'],
    'Phase 5.5 guessed at this one — "the system as a rendered object", pointed at Anzy.OS, from the filename. Phase 6 read it. Sixteen scattered nodes assemble into a lattice around a core, each meshing with its two nearest neighbours, and the comment states the argument as "disconnected things, meshed into one system". Sixteen nodes; sixteen realities. It is now built as the Reality Index’s cross-reference figure, with the graph’s twelve travellable edges drawn in signal across the structural mesh.',
  ),
  comp('three/AdaptiveQuality.js', 'SYSTEM_SOURCE', ['core/capability'], 'Quality tiers from device capability — the same architecture the Lab arrived at independently.'),
  comp('three/Fallbacks.js', 'SYSTEM_SOURCE', ['spatial/SpatialCanvas'], 'WebGL failure containment.'),
  comp('three/useSceneVisibility.js', 'SYSTEM_SOURCE', ['core/raf', 'matter-engine'], 'Stop rendering when unseen. The Lab’s frameloop discipline states the same rule.'),

  /* ---- motion/ -------------------------------------------------------- */
  comp('motion/ContextualCursor.js', 'SPATIAL_TRANSFORM', ['components/Pointer'], 'An additive label beside the real cursor, never a replacement. The Lab’s pointer instrument follows the identical rule and never draws a fake cursor on touch.'),
  comp('motion/OrderingGrid.js', 'MATERIAL_SOURCE', ['reality-index'], 'Ordering as a visible grid operation.'),
  comp('motion/ScrollVelocity.js', 'SYSTEM_SOURCE', ['core/pointer'], 'Velocity as an input signal — the Lab derives pointer velocity the same way.'),

  /* ---- deck/ illustration set ----------------------------------------- */
  ...['HandsSpark', 'InboxUnfold', 'InfographicGlyphs', 'LensFocus', 'MotifFrame', 'OrbitGlyphs', 'QuestionOrbit'].map(
    (n) =>
      comp(
        `deck/${n}.js`,
        'EXCLUDED',
        [],
        'Bespoke illustration for the commercial site’s own sections. The Lab generates every mark procedurally and importing illustration would add payload for decoration it does not need.',
      ),
  ),

  /* ---- structural / editorial chrome ---------------------------------- */
  comp('Nav.js', 'DOM_ONLY', [], 'Site navigation.'),
  comp('Footer.js', 'DOM_ONLY', [], 'Site footer.'),
  comp('Seo.js', 'DOM_ONLY', [], 'Document head management.'),
  comp('ThemeToggle.js', 'DOM_ONLY', [], 'Light/dark preference for the site. The Lab has material states instead.'),
  comp('CommandPalette.js', 'SPATIAL_TRANSFORM', ['anzy-os'], 'Type a command to move through the system. Anzy.OS’s job ticket is the same interaction, made the primary one.'),
  comp('SectionIndex.js', 'SPATIAL_TRANSFORM', ['reality-index'], 'A rail that tracks position through a document.'),
  comp('SectionHeading.js', 'MATERIAL_SOURCE', ['design-system/typography'], 'Editorial heading treatment.'),
  comp('SectionConnector.js', 'MATERIAL_SOURCE', ['translation.ROUTE_TRACE'], 'Drawn connections between sections.'),
  comp('ProgressRule.js', 'MATERIAL_SOURCE', ['director', 'chaos'], 'Progress as a drawn rule, not a bar. Director’s edit strip and Chaos’s progress rule are the same object.'),
  comp('ScrollProgress.js', 'DOM_ONLY', [], 'Scroll position indicator for a long document.'),
  comp('ScrollInfoPanel.js', 'DOM_ONLY', [], 'Scroll-triggered detail panel.'),
  comp('CollapseOnScroll.js', 'DOM_ONLY', [], 'Chrome that yields to content.'),
  comp('Reveal.js', 'EXCLUDED', [], 'Generic scroll reveal. The Lab bans fade-up as a reveal mechanism and uses masks, rules and registration instead — this is the one canonical behaviour deliberately not inherited.'),
  comp('StickyCta.js', 'DOM_ONLY', [], 'Conversion surface.'),
  comp('NextSteps.js', 'SPATIAL_TRANSFORM', ['experience/graph'], 'Where to go after this. Became the cross-reality graph.'),
  comp('NotesSubscribe.js', 'DOM_ONLY', [], 'Email capture.'),
  comp('MagneticButton.js', 'EXCLUDED', [], 'Pointer-attracted control. The Lab’s controls are instrument-like and deliberately do not chase the cursor.'),
  comp('Picture.js', 'DOM_ONLY', [], 'Responsive image element.'),
  comp(
    'PopIllustration.js',
    'EXCLUDED',
    [],
    'The delivery component for the deck/ illustration set — it renders artwork the Lab does not ship. Excluded for the same reason as the artwork itself: every mark in the Lab is drawn at runtime, and there is no image file in the bundle for this to render.',
  ),
  comp(
    'PunPop.js',
    'EXCLUDED',
    [],
    'A component whose whole job is to land a joke in the brand’s editorial voice. That voice is the commercial site’s, written by people, and the Lab does not get to borrow it — originality of copy is a standing rule here, and a wisecrack lifted across the boundary would be the site talking, not this product. The behaviour is also not spatial: there is nothing underneath it to translate.',
  ),
  comp('CharacterQuote.js', 'EXCLUDED', [], 'Attributed quote with a portrait — consent risk, as CHARACTERS.'),
  comp(
    'ClientMarquee.js',
    'EXCLUDED',
    [],
    'A scrolling wall of real client logos. This is the exclusion the Lab is least willing to compress into a cross-reference: it is the one place a single imported component would turn a product that has never claimed a client into one that appears to claim fourteen. The marquee stays on the commercial site, which carries the context that makes a client list mean something. See BRAND_REFS for the same decision at the data layer.',
  ),
  comp('CardCarousel.js', 'MATERIAL_SOURCE', ['translation.SPATIAL_DECK'], 'Superseded by EvidenceDeck as the deck behaviour; recorded for completeness.'),
  comp('Packages.js', 'EXCLUDED', [], 'Commercial packaging UI — as PACKAGES.'),
  comp('PackageBuilder.js', 'EXCLUDED', [], 'Interactive offer construction. Genuinely good, and genuinely a buying tool; the Agency Simulator produces a reading, not a quote, and mixing the two would make the reading look like a sales funnel.'),
  comp('FitQuadrant.js', 'MATERIAL_SOURCE', ['agency-simulator'], 'Fit expressed as position on two axes — the simulator’s axis model is the same idea with seven axes.'),
  comp('TouchpointTicker.js', 'DOM_ONLY', [], 'A running list of touchpoints.'),
  ...['ui/circular-carousel.jsx', 'ui/dropdown-menu.jsx', 'ui/input.jsx', 'ui/sheet.jsx', 'ui/sonner.jsx', 'ui/textarea.jsx'].map((n) =>
    comp(n, 'DOM_ONLY', [], 'Low-level shadcn primitive with no distinctive brand behaviour. The Lab has no UI kit by policy.'),
  ),
];

/* -------------------------------------------------------------------------- */
/* ASSET FAMILIES + FONTS                                                      */
/* -------------------------------------------------------------------------- */

export const ASSETS: ManifestEntry[] = [
  {
    source: 'public/brand/logo-{light,dark}.{avif,png,webp}',
    sourceType: 'assetFamily',
    treatment: 'MATERIAL_SOURCE',
    destinations: ['components/Launcher'],
    rationale:
      'The logotype’s misregistration — the bars sitting slightly off each other — is the Lab’s founding visual device. Inherited as geometry the launcher redraws in type, not as an imported image file.',
    consentRisk: 'none',
    payloadRisk: 'low',
    status: 'done',
  },
  {
    source: 'public/brand/char-*.{avif,jpg,webp} (7 figures × 3 formats)',
    sourceType: 'assetFamily',
    treatment: 'MATERIAL_SOURCE',
    destinations: ['content/specimens', 'components/Specimen', 'modes/memory', 'modes/director'],
    rationale:
      'Was EXCLUDED on a consent reading — "photographs of identifiable people" — until Phase 6.5B opened the files and found that is not what they are: twelve of the fourteen replace the head with an object, and the two that are not figures show hands and a flag. There is nobody to identify. The seven AVIFs are mirrored into public/brand and carried with their hashes and native sizes in content/specimens.',
    consentRisk: 'none',
    payloadRisk: 'low',
    status: 'done',
  },
  {
    source: 'public/brand/pop-*.{avif,png,webp}',
    sourceType: 'assetFamily',
    treatment: 'MATERIAL_SOURCE',
    destinations: ['content/specimens', 'components/Specimen', 'modes/memory', 'modes/director', 'modes/compiler'],
    rationale:
      'The cut-out half of the same collage set, and the reason the Lab has a CUT/MOUNTED distinction at all: pop-camera-duo is char-walkers with the ground removed. Seven AVIFs mirrored into public/brand in Phase 6.5B. Phase 8.6 E added the Compiler as a destination — the real pages these appear on are mostly picture, and a tool that takes a website apart must not silently drop that.',
    consentRisk: 'none',
    payloadRisk: 'low',
    status: 'done',
  },
  {
    source: 'public/brand/art-*.{avif,png,webp}',
    sourceType: 'assetFamily',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Collated artwork for two editorial sections — Home’s DIAGNOSTIC and WHAT WE DO’s masthead. Still excluded, and now the only canonical image family that is: the collage sets earned their way in by being load-bearing in three modes, and these two files would be carried for decoration alone. The Compiler reports them as NOT MIRRORED on the two planes that use them rather than pretending those planes are text, which is the honest version of an exclusion. (The rationale this replaces claimed the Lab shipped no raster files at all; that stopped being true in Phase 6.5B and had not been corrected.)',
    consentRisk: 'none',
    payloadRisk: 'high',
    status: 'done',
  },
  {
    source: 'public/fonts/rajdhani-*.woff2',
    sourceType: 'font',
    treatment: 'MATERIAL_SOURCE',
    destinations: ['design-system/typography'],
    rationale: 'Already the Lab’s display face, self-hosted from the same family. Confirmed identical to canonical.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'public/fonts/ibm-plex-mono-*.woff2',
    sourceType: 'font',
    treatment: 'MATERIAL_SOURCE',
    destinations: ['design-system/typography'],
    rationale: 'Already the Lab’s instrument voice. Confirmed identical to canonical.',
    consentRisk: 'none',
    payloadRisk: 'none',
    status: 'done',
  },
  {
    source: 'public/fonts/{figtree,newsreader,amaranth}-*.woff2',
    sourceType: 'font',
    treatment: 'EXCLUDED',
    destinations: [],
    rationale:
      'Phase 6 reversed this. The rationale here used to say the Lab kept IBM Plex Sans because three voices had to stay apart — which described the Lab’s rule while ignoring the site’s, and App.css declares that one locked: Rajdhani = System Voice, Newsreader = Human Voice. newsreader-200-800-normal-latin and its italic are now mirrored byte-for-byte (sha256/12 62981321d9a3, 48bc8861b9b2) and Plex Sans is gone. Figtree and Amaranth remain excluded: the site itself notes Figtree is a fallback nothing sets as a primary face, and Amaranth dresses one editorial joke component the Lab does not carry.',
    consentRisk: 'none',
    payloadRisk: 'low',
    status: 'done',
  },
];

/* -------------------------------------------------------------------------- */
/* DERIVED COVERAGE — never hardcode a count                                   */
/* -------------------------------------------------------------------------- */

export const MANIFEST: ManifestEntry[] = [...ROUTES, ...EXPORTS, ...COMPONENTS, ...ASSETS];

export interface Coverage {
  total: number;
  byType: Record<string, number>;
  byTreatment: Record<string, number>;
  excluded: number;
  partial: number;
}

export function coverage(): Coverage {
  const byType: Record<string, number> = {};
  const byTreatment: Record<string, number> = {};
  for (const e of MANIFEST) {
    byType[e.sourceType] = (byType[e.sourceType] ?? 0) + 1;
    byTreatment[e.treatment] = (byTreatment[e.treatment] ?? 0) + 1;
  }
  return {
    total: MANIFEST.length,
    byType,
    byTreatment,
    excluded: MANIFEST.filter((e) => e.treatment === 'EXCLUDED').length,
    partial: MANIFEST.filter((e) => e.status === 'partial').length,
  };
}

/** A rationale this short cannot state a reason on its own. */
const SELF_CONTAINED_MIN = 70;

/**
 * Every exclusion must carry a reason. Enforced, not merely intended.
 *
 * A rationale passes if it either states the reason itself, or defers to a
 * sibling entry that does — "As BRAND_REFS — the curated top tier, same
 * policy." is a reason; repeating the BRAND_REFS paragraph nine times would
 * make this file worse, not more honest. What does not pass is a deferral whose
 * target does not exist, or whose target is itself a deferral, because that is
 * how a reason quietly becomes a chain of pointers to nothing.
 *
 * This used to be a character count, which is a check that a sentence is long
 * rather than a check that it says anything.
 */
export function exclusionsWithoutReason(): ManifestEntry[] {
  const reasoned = new Set(
    MANIFEST.filter((e) => e.rationale.trim().length >= SELF_CONTAINED_MIN).map((e) => e.source),
  );
  // Match a deferral target by its bare name: `Work.js`, `BRAND_REFS`, `deck/`.
  const names = MANIFEST.map((e) => ({ source: e.source, token: e.source.split('/').pop() || e.source }));

  return MANIFEST.filter((e) => {
    if (e.treatment !== 'EXCLUDED' && e.treatment !== 'UNAVAILABLE') return false;
    const r = e.rationale.trim();
    if (r.length >= SELF_CONTAINED_MIN) return false;
    // Short: it must name a sibling that carries the reason in full.
    return !names.some((n) => n.source !== e.source && r.includes(n.token) && reasoned.has(n.source));
  });
}
