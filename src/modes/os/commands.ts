import { APPS, COMMANDS, FUTURE_PROCESSES, OS_COPY, RUNNABLE, type AppId } from '../../content/os';
import { APP_BODY } from '../../content/os';

/**
 * THE INTERPRETER.
 *
 * A fixed table of commands over the OS's own state. It is a **fictional shell**
 * and is built so that it cannot be anything else: there is no `eval`, no
 * dynamic dispatch, no filesystem, no network, no access to `import.meta.env`,
 * `process`, `document.cookie`, storage or any other ambient value. An unknown
 * word is an unknown word. Nothing a visitor types can reach outside this file's
 * switch statement.
 */

export type LineKind = 'in' | 'out' | 'err' | 'head';

export interface OsLine {
  id: number;
  kind: LineKind;
  text: string;
}

export interface CommandContext {
  open: (id: AppId) => void;
  close: (id: AppId) => void;
  openIds: AppId[];
  clear: () => void;
  run: (realityId: string) => void;
  profile: string;
  webgl: boolean;
}

const APP_IDS = APPS.map((a) => a.id);

function resolveApp(word: string): AppId | null {
  const w = word.toLowerCase().replace(/\.app$/, '');
  return (APP_IDS as string[]).includes(w) ? (w as AppId) : null;
}

/** Returns the lines to print. Side effects go through `ctx`, never globals. */
export function execute(raw: string, ctx: CommandContext): string[] {
  const input = raw.trim();
  if (!input) return [];

  const [word, ...rest] = input.split(/\s+/);
  const cmd = word.toLowerCase();
  const arg = rest.join(' ').toLowerCase();

  switch (cmd) {
    case 'help':
      return [
        'COMMANDS',
        ...COMMANDS.map((c) => `  ${(c.name + ' ' + (c.args ?? '')).padEnd(16)}${c.help}`),
        '',
        `PROCESSES  ${APP_IDS.join('  ')}`,
        `REALITIES  ${[...new Set(Object.values(RUNNABLE))].join('  ')}`,
      ];

    case 'list':
      return [
        'RESIDENT',
        ...APPS.map((a) => {
          const on = ctx.openIds.includes(a.id);
          return `  ${on ? '●' : '○'} ${a.name.padEnd(16)}${a.line}`;
        }),
        '',
        'NOT RUNNING',
        ...FUTURE_PROCESSES.map((p) => `  ○ ${p.padEnd(16)}named, not built`),
      ];

    case 'open': {
      if (!arg) return ['open: which process? try `list`'];
      const id = resolveApp(arg);
      if (!id) return [`open: no process named ${arg}`];
      ctx.open(id);
      return [`opened ${id}`];
    }

    case 'close': {
      if (arg === 'all') {
        ctx.openIds.forEach(ctx.close);
        return ['closed all sheets'];
      }
      const id = resolveApp(arg);
      if (!id) return [`close: no process named ${arg}`];
      ctx.close(id);
      return [`closed ${id}`];
    }

    case 'run': {
      if (!arg) return ['run: which reality? try `help`'];
      const target = RUNNABLE[arg];
      if (!target) return [`run: ${arg} is not a reality this shell can start`];
      ctx.run(target);
      return [`starting ${target}…`];
    }

    case 'method':
      return [
        'METHOD — five stages',
        ...APP_BODY.method.map(([k, v], i) => `  ${String(i + 1).padStart(2, '0')}  ${k.padEnd(11)}${v}`),
      ];

    case 'status':
      return [
        `sheets open      ${ctx.openIds.length}`,
        `resident         ${APPS.length}`,
        `not running      ${FUTURE_PROCESSES.length}`,
        `render profile   ${ctx.profile}`,
        `webgl            ${ctx.webgl ? 'available' : 'unavailable'}`,
        'network          none — this shell makes no requests',
        'storage          none — nothing here is saved',
      ];

    case 'about':
      return [OS_COPY.about];

    case 'clear':
      ctx.clear();
      return [];

    case 'exit':
    case 'quit':
      return ['exit: press ESC, or use the EXIT control.'];

    default:
      return [`${cmd}: unknown command. try \`help\`.`];
  }
}
