import type { ModeDefinition } from '../experience/types';

/**
 * THE REALITY INDEX.
 *
 * Content lives here, apart from anything that renders it. Copy is original to
 * the Experience Lab. Nothing in this file asserts a client, a result, a metric,
 * an award or a partnership — the Lab is an experimental universe, and the
 * factual record stays in docs/HI_ANZY_DECK_CONTENT.md where it belongs.
 */

/**
 * `webgpu` is false everywhere, deliberately.
 *
 * Three modes used to declare `webgpu: true`, which the type documents as
 * "enhanced by WebGPU where available". Nothing in the Lab is: WebGPU is
 * detected and reported by Matter Engine as PRESENT · UNUSED, and that is the
 * whole of it. A requirement flag that promises an enhancement nobody wrote is
 * a claim, so it is off until something actually uses it.
 */
const NONE = {
  webgl: false,
  webgpu: false,
  audio: false,
  camera: false,
} as const;

export const MODES: ModeDefinition[] = [
  {
    id: 'living-world',
    index: '01',
    title: 'LIVING WORLD',
    tagline: 'Enter Hi Anzy.',
    description:
      'A continuous spatial territory rather than a set of pages. Districts for strategy, design, technology, production and the people who make the work — walked through, not scrolled past.',
    status: 'online',
    tier: 'flagship',
    material: 'ink',
    requirements: { ...NONE, webgl: true, cost: 'extreme', mobile: 'adapted', reducedMotion: 'adapted' },
    load: () => import('../modes/world/WorldMode'),
  },
  {
    id: 'reality-compiler',
    index: '02',
    title: 'REALITY COMPILER',
    tagline: 'Turn the website into a world.',
    description:
      'The interface is read as source. Structure is decomposed, lifted off the plane, resolved into space, then recompiled back into a page that remembers it was somewhere else.',
    status: 'online',
    tier: 'flagship',
    material: 'ink',
    requirements: { ...NONE, webgl: true, cost: 'high', mobile: 'adapted', reducedMotion: 'adapted' },
    load: () => import('../modes/compiler/CompilerMode'),
  },
  {
    id: 'matter-engine',
    index: '03',
    title: 'MATTER ENGINE',
    tagline: 'Control digital matter.',
    description:
      'Millions of addressable elements behaving as a single substance. Poured, disturbed, frozen and released under direct control.',
    status: 'online',
    tier: 'flagship',
    material: 'ink',
    requirements: { ...NONE, webgl: true, cost: 'extreme', mobile: 'adapted', reducedMotion: 'adapted' },
    load: () => import('../modes/matter/MatterMode'),
  },
  {
    id: 'agency-simulator',
    index: '04',
    title: 'AGENCY SIMULATOR',
    tagline: 'Give Hi Anzy a problem.',
    /* Reads the canonical five in order — AUDIT, ARCHITECT, BUILD, CONNECT,
       SCALE — because the mode itself runs them off `METHOD_LABELS`. The
       previous wording narrated ABSORB / CLARIFY / BLUEPRINT / ASSEMBLE /
       SUSTAIN, the earlier printed deck's method that `canonical.ts` says was
       replaced, so the index described a sequence the reality does not run. */
    description:
      'State a brief and watch it get taken apart: looked at before it is answered, decided into a map, built, staffed with whoever the problem needs, and proved against the measure you agreed. The method, made operable.',
    status: 'online',
    tier: 'flagship',
    material: 'paper',
    requirements: { ...NONE, cost: 'low', mobile: 'full', reducedMotion: 'full' },
    load: () => import('../modes/simulator/SimulatorMode'),
  },
  {
    id: 'presence',
    index: '05',
    title: 'PRESENCE',
    tagline: 'You are the controller.',
    description:
      'The pointer is retired. Hands, posture and proximity drive the interface directly, with everything staying on-device.',
    status: 'online',
    tier: 'flagship',
    material: 'ink',
    requirements: { ...NONE, webgl: true, camera: true, cost: 'high', mobile: 'adapted', reducedMotion: 'adapted' },
    load: () => import('../modes/presence/PresenceMode'),
  },
  {
    id: 'memory',
    index: '06',
    title: 'MEMORY',
    tagline: 'Walk through reconstructed ideas.',
    description:
      'An archive reconstructed from its own residue. Every point is a sample of a record’s typography; approaching reassembles it, leaving lets it fall apart, and fields the archive lost stay lost.',
    status: 'online',
    tier: 'flagship',
    material: 'ink',
    requirements: { ...NONE, webgl: true, cost: 'high', mobile: 'full', reducedMotion: 'adapted' },
    load: () => import('../modes/memory/MemoryMode'),
  },
  {
    id: 'anzy-os',
    index: '07',
    title: 'ANZY.OS',
    tagline: 'Run Hi Anzy.',
    description:
      'Not a desktop metaphor. An ink bench with paper sheets on it, where the capabilities are resident processes and a job ticket at the bottom of the screen can start any other reality.',
    status: 'online',
    tier: 'flagship',
    material: 'ink',
    requirements: { ...NONE, cost: 'low', mobile: 'full', reducedMotion: 'full' },
    load: () => import('../modes/os/OsMode'),
  },
  {
    id: 'portal',
    index: '08',
    title: 'PORTAL',
    tagline: 'Bring Hi Anzy into your world.',
    description:
      'An aperture cut in the sheet with the territory behind it. Immersive XR is offered only where the browser reports it, and the fallback is the same portal driven by device tilt or the pointer — never a dead end.',
    status: 'online',
    tier: 'flagship',
    // Paper: the mode is a bone sheet with a hole cut in it. The mode host's
    // chrome takes its colour from this, so declaring `ink` here would have
    // printed a bone EXIT control onto bone stock.
    material: 'paper',
    requirements: { ...NONE, cost: 'low', mobile: 'full', reducedMotion: 'adapted' },
    load: () => import('../modes/portal/PortalMode'),
  },
  {
    id: 'commercial-audit',
    index: '09',
    title: 'COMMERCIAL AUDIT',
    tagline: 'Read a real business, and show the working.',
    description:
      'Points at businesses in a real area, reads what they publish, and reports what it could and could not establish. Every conclusion carries the passage it rests on, and what was looked for and not found is reported as not found rather than as absent.',
    status: 'online',
    tier: 'flagship',
    /* Paper: a printed argument on bone stock, so the host's chrome stays
       legible above it. */
    material: 'paper',
    requirements: { ...NONE, cost: 'low', mobile: 'full', reducedMotion: 'full' },
    load: () => import('../modes/audit/AuditMode'),
  },

  /* ---------------------------------------------------------------------- */
  /* REVERSE SIDE — supporting experiments                                   */
  /* ---------------------------------------------------------------------- */
  {
    id: 'x-ray',
    index: 'X1',
    title: 'X-RAY',
    tagline: 'See beneath the interface.',
    description:
      'The sheet turned to its construction: grid, boxes, type metrics, measured space, pointer telemetry and structure — measured live off the real document.',
    status: 'online',
    tier: 'experiment',
    material: 'blueprint',
    requirements: { ...NONE, webgl: true, cost: 'medium', mobile: 'adapted', reducedMotion: 'adapted' },
    load: () => import('../modes/xray/XRayMode'),
  },
  {
    id: 'director',
    index: 'X2',
    title: 'DIRECTOR',
    tagline: 'Watch Hi Anzy become a system.',
    description:
      'An 84-second film the browser performs live, in six acts. No video file, no pre-render — the same typography, rules and registration the rest of the Lab is built from, cut to a clock.',
    status: 'online',
    tier: 'experiment',
    material: 'ink',
    requirements: { ...NONE, audio: true, cost: 'low', mobile: 'full', reducedMotion: 'adapted' },
    load: () => import('../modes/director/DirectorMode'),
  },
  {
    id: 'chaos',
    index: 'X3',
    title: 'CHAOS',
    tagline: 'Do not press.',
    description:
      'Ten stages of escalating failure, then silence, then exact reconstruction. The destruction is theatrical: the pieces are a copy this reality owns, no application state is mutated, and Escape works at maximum chaos.',
    status: 'online',
    tier: 'experiment',
    material: 'ink',
    requirements: { ...NONE, cost: 'medium', mobile: 'full', reducedMotion: 'adapted' },
    load: () => import('../modes/chaos/ChaosMode'),
  },
  {
    id: 'dream',
    index: 'X4',
    title: 'DREAM',
    tagline: 'When the system stops explaining itself.',
    description:
      'One idea, followed all the way: the contours remember the words they came from. A word is mixed into the same seeded field the Lab draws terrain from, held, and withdrawn. The same seed always dreams the same dream.',
    status: 'online',
    tier: 'experiment',
    material: 'ink',
    requirements: { ...NONE, cost: 'medium', mobile: 'full', reducedMotion: 'adapted' },
    load: () => import('../modes/dream/DreamMode'),
  },
  {
    id: 'after-dark',
    index: 'X5',
    title: 'AFTER DARK',
    tagline: 'The Lab, unattended.',
    description:
      'The cultural side, on night stock. Black card, one sodium light, grain instead of halftone, and type set as posters. It prints no event, no venue and no line-up, because there are none to print.',
    status: 'online',
    tier: 'experiment',
    material: 'ink',
    requirements: { ...NONE, audio: true, cost: 'low', mobile: 'full', reducedMotion: 'adapted' },
    load: () => import('../modes/afterdark/AfterDarkMode'),
  },
  {
    id: 'sonic-architecture',
    index: 'X6',
    title: 'SONIC ARCHITECTURE',
    tagline: 'The interface is an instrument.',
    description:
      'A genuine browser instrument. The score is an elevation: sixteen bays with a height and a material, where height is pitch and nearness, place is pan, and material is timbre. One scale, six voices — you cannot play a wrong note.',
    status: 'online',
    tier: 'experiment',
    material: 'ink',
    requirements: { ...NONE, audio: true, cost: 'low', mobile: 'full', reducedMotion: 'full' },
    load: () => import('../modes/sonic/SonicMode'),
  },
  {
    id: 'time-machine',
    index: 'X7',
    title: 'TIME MACHINE',
    tagline: 'The same information, through different webs.',
    description:
      'The same content through seven eras of the web, each reimplementing navigation and interaction rather than repainting. One source object renders all seven — content persists, interfaces change.',
    status: 'online',
    tier: 'experiment',
    material: 'ink',
    requirements: { ...NONE, cost: 'low', mobile: 'full', reducedMotion: 'full' },
    load: () => import('../modes/timemachine/TimeMachineMode'),
  },
  {
    id: 'performance',
    index: 'X8',
    title: 'PERFORMANCE',
    tagline: 'The machine, watched.',
    description:
      'The Lab instrumenting itself in public. Every value is measured in this session or is marked UNKNOWN by name — no estimates, no invented frame rates, and nothing read from your environment.',
    status: 'online',
    tier: 'experiment',
    material: 'blueprint',
    requirements: { ...NONE, cost: 'low', mobile: 'full', reducedMotion: 'full' },
    load: () => import('../modes/performance/PerformanceMode'),
  },
];

export const FLAGSHIP_MODES = MODES.filter((m) => m.tier === 'flagship');
export const EXPERIMENT_MODES = MODES.filter((m) => m.tier === 'experiment');

export function findMode(id: string | null): ModeDefinition | undefined {
  if (!id) return undefined;
  return MODES.find((m) => m.id === id);
}

/** How many realities are actually enterable. Counted, never written down. */
export function onlineCount(): number {
  return MODES.filter((m) => m.status === 'online').length;
}
