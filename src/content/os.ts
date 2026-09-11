import { METHOD, NETWORK_CAPABILITIES, SERVICES } from './canonical';

/**
 * ANZY.OS — an operating environment for a consultancy.
 *
 * Not a desktop clone. The metaphor is a **print workshop's job system**: the
 * desk is ink, the windows are sheets of paper laid on it, applications are
 * processes, and the command line is a job ticket. That comes from the same
 * place everything else in the Lab comes from — the source material was a
 * printed proposal — rather than from Windows, macOS or a hacker terminal.
 *
 * Application content is the company's real service taxonomy and method, read
 * through `canonical.ts`. Nothing here names a client, an award, a metric, a
 * result or a partnership — see that file for why client marks are excluded.
 */

export type AppId =
  | 'strategy'
  | 'design'
  | 'technology'
  | 'network'
  | 'method'
  | 'system'
  | 'terminal';

/**
 * THE STOCK A SHEET IS PRINTED ON.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Seven applications were seven identical bone rectangles with different words
 * inside. That is the failure mode of every OS pastiche: the window is the
 * product and the content is a payload. A print workshop's bench is the
 * opposite — you can tell what a sheet is from across the room, because a
 * tracing overlay, a mounted proof, a piece of engineering grid and a docket
 * roll are visibly different materials before you read a single word.
 *
 * ── THE RULE THIS OBEYS ─────────────────────────────────────────────────────
 *
 * Phase 6.5's research produced a standing rule: **materials are distinguished
 * by pattern and weight, never by hue.** So there are no colour themes here.
 * Every stock below is the company's own bone; what differs is what has been
 * ruled, screened, punched, cut or laminated onto it, and how heavy it is.
 *
 * Seven applications, seven stocks, each chosen because it is the material that
 * kind of document is actually made on:
 */
export type SheetStock =
  /** Translucent. The bench reads through it. A strategy is an overlay drawn
      on top of the business that already exists — which is what tracing paper
      is for, and why STRATEGY.app is the only sheet you can see the desk
      through. */
  | 'tracing'
  /** Heavy board with an aperture cut in it and a bevelled edge. How a piece of
      finished work is actually presented. DESIGN.app is the only sheet holding
      a specimen, so it is the only one that needs a mount. */
  | 'mount'
  /** Engineering grid, ruled at the line height. A specification is drawn on
      squared paper before it is anything else. */
  | 'grid'
  /** A printed dot screen. A directory is a printed object — sixteen headings
      set small and dense, the way a trade directory actually sets them. */
  | 'screen'
  /** Punched for a register bar: five stages as five leaves on one spine. */
  | 'leaf'
  /** Uncoated, unruled, unscreened. SYSTEM.app reports what this session
      measured, and an instrument's own readout earns no stock character — the
      plainness is the argument. */
  | 'plain'
  /** Continuous roll, perforated down one edge, torn off at the bottom. A
      terminal is a printout, not a window. */
  | 'docket';

export interface OsApp {
  id: AppId;
  /** Process name, as the system refers to it. */
  name: string;
  line: string;
  /** What the sheet is made of. See `SheetStock`. */
  stock: SheetStock;
  /**
   * A specimen from the company's own collage library, where one is genuinely
   * about what the application does.
   *
   * Two of seven. Imagery that appears on every sheet is wallpaper; imagery
   * that appears on two is evidence. The other five are documents, and a
   * document with a picture stapled to it for balance is worse than one
   * without.
   */
  specimen?: string;
  /** Which realities this app can hand off to, if any. */
  opens?: string;
  status: 'resident' | 'future';
}

export const APPS: OsApp[] = [
  {
    id: 'strategy',
    name: 'STRATEGY.app',
    line: 'Business audit, positioning, roadmaps.',
    stock: 'tracing',
    status: 'resident',
  },
  {
    id: 'design',
    name: 'DESIGN.app',
    line: 'Brand, identity, experience, design systems.',
    stock: 'mount',
    /* A figure with one hand raised to where a chin would be, and a Rubik's
       cube where the head is not. A design system is a combinatorial object
       somebody is in the middle of solving — that is the sheet's own subject,
       not an illustration of it. */
    specimen: 'char-fixer',
    status: 'resident',
  },
  {
    id: 'technology',
    name: 'TECHNOLOGY.app',
    line: 'Web, commerce, cloud, integration, automation.',
    stock: 'grid',
    status: 'resident',
  },
  {
    id: 'network',
    name: 'NETWORK.app',
    line: 'Creators, PR, media, events, partnerships.',
    stock: 'screen',
    /* Two figures walking arm in arm, scissored out of whatever they were
       photographed in. A network is people cut from their own contexts and
       brought into one — the CUT state is the point, which is why this is the
       cut-out and not the mounted plate. */
    specimen: 'pop-camera-duo',
    status: 'resident',
  },
  {
    id: 'method',
    name: 'METHOD.app',
    line: 'How the work actually proceeds.',
    stock: 'leaf',
    status: 'resident',
  },
  {
    id: 'system',
    name: 'SYSTEM.app',
    line: 'Processes, realities, resources.',
    stock: 'plain',
    status: 'resident',
  },
  {
    id: 'terminal',
    name: 'TERMINAL',
    line: 'Direct instruction.',
    stock: 'docket',
    status: 'resident',
  },
];

/**
 * Which real service category each capability sheet reads from.
 *
 * Held here rather than inside the rendering layer, so the sheets and the
 * terminal's `method`/`list` output cannot drift apart about which category is
 * which.
 */
export const APP_SERVICE: Record<'strategy' | 'design' | 'technology' | 'network', string> = {
  strategy: 'business-audit-strategy',
  design: 'brand-experience',
  technology: 'digital-technology-automation',
  network: 'media-creators-experiences',
};

/** Named but not implemented. Listed as processes that are not running. */
export const FUTURE_PROCESSES = [
  'IMKAAN.app',
  'HI-ANZY-AI.app',
  'ARCHIVE.app',
  'MEMORY.svc',
  'PORTAL.svc',
];

/**
 * Content for the resident applications.
 *
 * The three capability sheets are now the company's real service taxonomy,
 * mirrored through `canonical.ts` — STRATEGY is the AUDIT category, DESIGN is
 * ARCHITECT, TECHNOLOGY is BUILD, NETWORK is CONNECT. The paraphrase that used
 * to live here predated the commercial site stating them itself.
 */
/** One capability sheet, built from a real service category. */
function sheetFor(slug: string): string[][] {
  const cat = SERVICES.find((c) => c.slug === slug);
  if (!cat) return [];
  return [
    [cat.label, cat.copy],
    ['CAPABILITIES', cat.capabilities.join(' · ')],
    ['STAGE', `${cat.stage} · typically ${cat.typical}`],
  ];
}

export const APP_BODY: Record<Exclude<AppId, 'terminal' | 'system'>, string[][]> = {
  strategy: sheetFor(APP_SERVICE.strategy),
  design: sheetFor(APP_SERVICE.design),
  technology: sheetFor(APP_SERVICE.technology),
  /*
   * NETWORK.app is the one sheet that outgrew its category.
   *
   * It used to print the CONNECT service category and stop, which described the
   * offer but not the thing being offered. `NETWORK_SUBCATS` on the commercial
   * site names sixteen disciplines and what each one actually contains, and
   * that is what a network directory is: not "we have a network", but the
   * sixteen headings and what sits under each. Nobody is named — these are
   * capabilities, and the canonical source is careful about the difference.
   */
  network: [
    ...sheetFor(APP_SERVICE.network),
    ...Object.entries(NETWORK_CAPABILITIES).map(([discipline, subs]) => [
      discipline.toUpperCase(),
      subs.join(' · '),
    ]),
  ],
  // The real method, mirrored from the commercial frontend rather than kept as
  // a second copy here. Each sheet prints the stage's own promise and duration.
  method: METHOD.map((m) => [m.label, `${m.title} ${m.page} (${m.duration})`]),
};

export const BOOT_LINES = [
  'HA/XL — ANZY.OS',
  'SHEET SYSTEM ONLINE',
  'MOUNTING /method',
  'MOUNTING /capabilities',
  'MOUNTING /territory',
  'REGISTRATION: IN TOLERANCE',
  'PROCESSES RESIDENT: 7',
  'READY',
];

export interface Command {
  name: string;
  args?: string;
  help: string;
}

export const COMMANDS: Command[] = [
  { name: 'help', help: 'List everything this terminal understands.' },
  { name: 'list', help: 'List resident and future processes.' },
  { name: 'open', args: '<app>', help: 'Open an application sheet.' },
  { name: 'close', args: '<app>', help: 'Close a sheet.' },
  { name: 'run', args: '<reality>', help: 'Leave ANZY.OS and enter another reality.' },
  { name: 'status', help: 'Report system state.' },
  { name: 'method', help: 'Print the five stages of the method.' },
  { name: 'clear', help: 'Clear this terminal.' },
  { name: 'about', help: 'What this operating environment is.' },
];

/** Realities `run` can hand off to. Keys match the Reality Index ids. */
export const RUNNABLE: Record<string, string> = {
  'x-ray': 'x-ray',
  xray: 'x-ray',
  compile: 'reality-compiler',
  compiler: 'reality-compiler',
  world: 'living-world',
  'living-world': 'living-world',
  simulate: 'agency-simulator',
  simulator: 'agency-simulator',
  agency: 'agency-simulator',
  matter: 'matter-engine',
  presence: 'presence',
};

export const OS_COPY = {
  title: 'ANZY.OS',
  tagline: 'RUN HI ANZY.',
  prompt: 'anzy',
  about:
    'An operating environment for a consultancy. Capabilities are processes, the method is a command, and the realities of the Experience Lab are programs this shell can start.',
  hintPointer: 'TYPE A COMMAND · DRAG A SHEET BY ITS HEAD',
  hintTouch: 'TAP A PROCESS · TYPE A COMMAND',
} as const;
