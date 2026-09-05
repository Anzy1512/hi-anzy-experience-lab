import { METHOD, SERVICES } from './canonical';

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

export interface OsApp {
  id: AppId;
  /** Process name, as the system refers to it. */
  name: string;
  line: string;
  /** Which realities this app can hand off to, if any. */
  opens?: string;
  status: 'resident' | 'future';
}

export const APPS: OsApp[] = [
  {
    id: 'strategy',
    name: 'STRATEGY.app',
    line: 'Business audit, positioning, roadmaps.',
    status: 'resident',
  },
  { id: 'design', name: 'DESIGN.app', line: 'Brand, identity, experience, design systems.', status: 'resident' },
  {
    id: 'technology',
    name: 'TECHNOLOGY.app',
    line: 'Web, commerce, cloud, integration, automation.',
    status: 'resident',
  },
  {
    id: 'network',
    name: 'NETWORK.app',
    line: 'Creators, PR, media, events, partnerships.',
    status: 'resident',
  },
  { id: 'method', name: 'METHOD.app', line: 'How the work actually proceeds.', status: 'resident' },
  { id: 'system', name: 'SYSTEM.app', line: 'Processes, realities, resources.', status: 'resident' },
  { id: 'terminal', name: 'TERMINAL', line: 'Direct instruction.', status: 'resident' },
];

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
  strategy: sheetFor('business-audit-strategy'),
  design: sheetFor('brand-experience'),
  technology: sheetFor('digital-technology-automation'),
  network: sheetFor('media-creators-experiences'),
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
