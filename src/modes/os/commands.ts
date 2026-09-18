import { APPS, COMMANDS, FUTURE_PROCESSES, OS_COPY, RUNNABLE, type AppId } from '../../content/os';
import { APP_BODY } from '../../content/os';
import {
  DIAGNOSTIC_AREAS,
  METHOD,
  NETWORK_CAPABILITIES,
  NETWORK_DISCIPLINES,
  PRINCIPLES,
  SERVICES,
} from '../../content/canonical';
import { DISCLAIMER, frame } from '../../system/diagnose';
import { getBrief, setFrame } from '../../system/brief';
import { getProject, setStatement } from '../../system/project';
import { beginProject, flushNow, projectStatus, projectTitle, storageSentence, workspace } from '../../system/projects';
import { storageState } from '../../system/storage';

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
  /** What has been typed this session, oldest first. */
  history: string[];
  /** Hand the brief to the artifact layer. Async, so it reports back itself. */
  exportBrief: (how: 'copy' | 'markdown' | 'json') => void;
  /** Same path, for the whole project rather than one document. */
  exportProject: (how: 'copy' | 'markdown' | 'json') => void;
  /** Reading a project body is asynchronous, so it reports back itself too. */
  openProject: (id: string) => void;
}

/** `14:32` — a time, not a date. A shell session is one sitting. */
function hhmm(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
        ...COMMANDS.map((c) => `  ${(c.name + ' ' + (c.args ?? '')).padEnd(20)}${c.help}`),
        '',
        `PROCESSES  ${APP_IDS.join('  ')}`,
        `REALITIES  ${[...new Set(Object.values(RUNNABLE))].join('  ')}`,
        '',
        'Every answer below comes out of the company’s own content file. This',
        'shell makes no requests, runs no operating-system commands, and has no',
        'model behind it — it matches words against a table and says so when it',
        'cannot. Tab completes; the arrow keys walk back through what you typed.',
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

    case 'method': {
      if (!arg) {
        return [
          'METHOD — five stages',
          ...APP_BODY.method.map(([k, v], i) => `  ${String(i + 1).padStart(2, '0')}  ${k.padEnd(11)}${v}`),
          '',
          'try `method audit` for one stage in full.',
        ];
      }
      const st = METHOD.find((m) => m.label.toLowerCase() === arg);
      if (!st) return [`method: no stage called ${arg}. try \`method\`.`];
      return [
        `${st.label} — ${st.title}`,
        `    typical ${st.duration}`,
        '',
        `    ${st.page}`,
        '',
        '    OUTPUTS',
        ...st.outputs.map((o) => `      · ${o}`),
      ];
    }

    /* ---- canonical reference -------------------------------------------- */

    case 'services':
      return [
        'SERVICE CATEGORIES — the company’s own six',
        ...SERVICES.map((sv) => `  ${sv.num}  ${sv.slug.padEnd(32)}${sv.title}`),
        '',
        'try `service <slug>` for one of them.',
      ];

    case 'service': {
      if (!arg) return ['service: which one? try `services`'];
      const sv =
        SERVICES.find((x) => x.slug === arg) ??
        SERVICES.find((x) => x.num === arg) ??
        SERVICES.find((x) => x.title.toLowerCase().includes(arg));
      if (!sv) return [`service: nothing called ${arg}. try \`services\`.`];
      return [
        `${sv.num}  ${sv.title}`,
        `    ${sv.label} · stage ${sv.stage} · typical ${sv.typical}`,
        '',
        `    ${sv.copy}`,
        '',
        '    CAPABILITIES',
        ...sv.capabilities.map((c) => `      · ${c}`),
      ];
    }

    case 'capabilities': {
      const entries = Object.entries(NETWORK_CAPABILITIES);
      if (!arg) {
        return [
          'CAPABILITY GROUPS',
          ...entries.map(([k, v]) => `  ${k.padEnd(16)}${v.length} listed`),
          '',
          'try `capabilities <term>` to search across all of them.',
        ];
      }
      const hits = entries
        .map(([k, v]) => [k, v.filter((c) => c.toLowerCase().includes(arg))] as const)
        .filter(([k, v]) => v.length > 0 || k.toLowerCase().includes(arg));
      if (!hits.length) return [`capabilities: nothing matching “${arg}”.`];
      return hits.flatMap(([k, v]) => [
        k,
        ...(v.length ? v : NETWORK_CAPABILITIES[k]).map((c) => `  · ${c}`),
      ]);
    }

    case 'network': {
      if (!arg) {
        return [
          `NETWORK — ${NETWORK_DISCIPLINES.length} disciplines`,
          ...NETWORK_DISCIPLINES.map((d) => `  · ${d}`),
          '',
          'try `network <term>` to see which disciplines carry a capability.',
          'This lists kinds of specialist. It never names a person.',
        ];
      }
      const hits = Object.entries(NETWORK_CAPABILITIES).filter(
        ([k, v]) => k.toLowerCase().includes(arg) || v.some((c) => c.toLowerCase().includes(arg)),
      );
      if (!hits.length) return [`network: no discipline matching “${arg}”.`];
      return [
        `DISCIPLINES FOR “${arg}”`,
        ...hits.map(([k, v]) => `  ${k.padEnd(16)}${v.join(', ')}`),
        '',
        'Kinds of specialist, not people. The roster is not in this product.',
      ];
    }

    case 'areas':
      return [
        `DIAGNOSTIC AREAS — ${DIAGNOSTIC_AREAS.length}`,
        ...DIAGNOSTIC_AREAS.map((a) => `  · ${a}`),
      ];

    case 'principles':
      return [
        'HOW THE COMPANY SAYS IT WORKS',
        ...PRINCIPLES.map((p) => `  ${p.name.padEnd(20)}${p.short}`),
      ];

    /* ---- the working surface -------------------------------------------- */

    /*
     * `diagnose` is the one command that produces state rather than a lookup.
     * It frames the sentence against the canonical areas and hands the result
     * to the session brief, which SYSTEM.app reads — that is the whole of the
     * cross-tool flow, and it is one small module rather than a bus.
     */
    case 'diagnose': {
      const said = rest.join(' ').replace(/^["“]|["”]$/g, '').trim();
      if (!said) {
        return [
          'diagnose: describe the situation in your own words.',
          '  e.g. diagnose our website gets traffic but conversion is weak',
        ];
      }
      const f = frame(said);
      if (f.empty) {
        return [
          `no canonical area matched “${said}”.`,
          '',
          'This shell matches words, not meaning — it has no model and will not',
          'guess. Try naming what is happening: traffic, conversion, margin,',
          'churn, handover, reporting, brand, automation.',
          '',
          '`areas` lists everything it can map onto.',
        ];
      }
      setFrame(f, 'terminal');
      /* The project keeps the sentence, so the next tool the visitor opens
         already knows what this is about and does not ask again. */
      setStatement(said);
      return [
        'PROBLEM FRAME',
        `  stated      ${f.statement}`,
        `  areas       ${f.areas.join(' · ')}`,
        ...f.areas.map((a) => `    ${a.padEnd(12)}matched on: ${f.matched[a].join(', ')}`),
        '',
        '  SEQUENCE',
        ...f.sequence.map(
          (m, i) => `    ${String(i + 1).padStart(2, '0')}  ${m.label.padEnd(11)}${m.title} (${m.duration})`,
        ),
        '',
        '  CATEGORIES',
        ...f.services.map((sv) => `    · ${sv.title}`),
        '',
        `  ${f.evidence.length} pieces of evidence still required, ${f.questions.length} open questions.`,
        '  `brief` prints the whole thing. `export brief` saves it.',
        '  SYSTEM.app has it too.',
        '',
        `  ${DISCLAIMER}`,
      ];
    }

    case 'brief': {
      const { frame: f, origin, selected } = getBrief();
      if (!f) {
        return [
          'no brief yet.',
          'run `diagnose <your situation>` first, or build one in AGENCY SIMULATOR.',
        ];
      }
      return [
        'HI ANZY — PROBLEM BRIEF',
        `  origin      ${origin ?? 'unknown'}`,
        `  stated      ${f.statement}`,
        `  areas       ${f.areas.join(' · ')}`,
        `  categories  ${f.services.map((sv) => sv.title).join(' · ') || 'none'}`,
        `  sequence    ${f.sequence.map((m) => m.label).join(' → ') || 'none'}`,
        `  selected    ${selected.length ? selected.join(', ') : 'nothing selected'}`,
        '',
        '  CAPABILITIES',
        ...f.capabilities.map((c) => `    · ${c}`),
        '',
        '  EVIDENCE STILL REQUIRED',
        ...f.evidence.map((e) => `    · ${e}`),
        '',
        '  OPEN QUESTIONS',
        ...f.questions.map((q) => `    · ${q}`),
        '',
        '  `export brief` saves it as markdown, `export brief json` as data.',
        `  ${DISCLAIMER}`,
      ];
    }

    case 'export': {
      if (!getBrief().frame) return ['export: no brief yet. run `diagnose <your situation>`.'];
      const how = arg.includes('json') ? 'json' : arg.includes('copy') ? 'copy' : 'markdown';
      ctx.exportBrief(how);
      /* The outcome is printed by the callback rather than here: a download can
         be refused and a clipboard write can reject, and saying "saved" before
         the browser has agreed to save it is the kind of small lie this product
         does not tell anywhere else. */
      return [];
    }

    case 'copy': {
      if (!getBrief().frame) return ['copy: no brief yet. run `diagnose <your situation>`.'];
      ctx.exportBrief('copy');
      return [];
    }

    /* ---- the project ----------------------------------------------------- */

    /*
     * These call the same services SYSTEM.app's panel calls. There is no second
     * persistence implementation behind the terminal and there must never be
     * one: a shell that could write projects by a different route would be a
     * shell that could write them differently.
     */
    case 'projects': {
      const ws = workspace();
      if (!ws.ready) return ['projects: still reading what this browser has stored.'];
      if (!ws.projects.length) {
        return [
          'nothing saved in this browser yet.',
          '',
          'A project starts keeping itself the moment you state something or make',
          'something. Until then nothing is written and closing the tab leaves',
          'nothing behind.',
        ];
      }
      const here = getProject().id;
      return [
        `SAVED IN THIS BROWSER — ${ws.projects.length}`,
        ...ws.projects.map((p, i) => {
          const t = projectTitle({ title: p.title, statement: p.excerpt });
          const mark = p.id === here ? '›' : ' ';
          return `${mark} ${String(i + 1).padStart(2, '0')}  ${t.text.slice(0, 46).padEnd(48)}${String(p.artifactCount).padStart(2)} made`;
        }),
        '',
        '`resume <number>` opens one. `project` describes the one you are in.',
      ];
    }

    case 'project': {
      const p = getProject();
      const ws = workspace();
      const sub = arg.toLowerCase();

      if (sub.startsWith('history')) {
        return p.history.length
          ? ['HOW THIS PROJECT GOT HERE', ...p.history.map((h) => `  ${hhmm(h.at)}  ${h.kind.padEnd(18)}${h.note}`)]
          : ['nothing has happened to this project yet.'];
      }
      if (sub.startsWith('export')) {
        const how = sub.includes('json') ? 'json' : sub.includes('copy') ? 'copy' : 'markdown';
        ctx.exportProject(how);
        return [];
      }

      const t = projectTitle(p);
      return [
        'THIS PROJECT',
        `  name        ${t.text}${t.named ? '' : '   (derived — nobody has named it)'}`,
        `  state       ${projectStatus(p)}`,
        `  stated      ${p.statement ?? 'nothing yet'}`,
        `  constraints ${p.constraints.length} of 5`,
        `  made        ${p.artifacts.length}`,
        `  saved       ${ws.storage.kind !== 'READY' ? 'NO' : ws.saved ? 'yes, in this browser only' : 'not yet'}`,
        '',
        `  ${storageSentence(ws.storage)}`,
        '',
        '`project history` prints how it got here. `project export` saves it.',
      ];
    }

    /* `open` already opens an application sheet, so this is `resume`, which is
       also the better word for what it does to a project. */
    case 'resume': {
      const n = Number.parseInt(arg, 10);
      const ws = workspace();
      if (!arg) return ['resume: which one? `projects` lists them by number.'];
      if (!Number.isFinite(n) || n < 1 || n > ws.projects.length) {
        return [`resume: there is no project ${arg}. \`projects\` lists them by number.`];
      }
      const target = ws.projects[n - 1];
      ctx.openProject(target.id);
      /* Reading a project body is asynchronous and can fail. The outcome is
         printed when it arrives, for the same reason `export` says nothing
         here: claiming success before the read has happened is a small lie. */
      return [];
    }

    case 'new':
      beginProject();
      return [
        'new project started.',
        'The previous one is saved and still listed — `projects` shows it.',
      ];

    case 'save':
      flushNow();
      return [
        storageState().kind === 'READY'
          ? 'written to this browser.'
          : `not written. ${storageSentence()}`,
      ];

    case 'history':
      return ctx.history.length
        ? ctx.history.map((h, i) => `  ${String(i + 1).padStart(3, ' ')}  ${h}`)
        : ['nothing typed yet this session.'];

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

/* -------------------------------------------------------------------------- */
/* COMPLETION                                                                  */
/* -------------------------------------------------------------------------- */

const VERBS = [
  'help', 'list', 'open', 'close', 'run', 'method', 'services', 'service',
  'capabilities', 'network', 'areas', 'principles', 'diagnose', 'brief',
  'export', 'copy', 'history', 'status', 'about', 'clear',
];

/**
 * What the second word of a command can be.
 *
 * Only for commands whose argument is drawn from a closed set. `diagnose` is
 * deliberately absent: its argument is the visitor's own sentence, and offering
 * completions there would quietly push them toward the words the lexicon
 * already knows — which is precisely the bias that would make the frame look
 * cleverer than it is. It is better that an unmatched sentence returns nothing
 * and says why.
 */
function argsFor(verb: string): string[] {
  switch (verb) {
    case 'open':
    case 'close':
      return [...APP_IDS, 'all'];
    case 'run':
      return Object.keys(RUNNABLE);
    case 'method':
      return METHOD.map((m) => m.label.toLowerCase());
    case 'service':
      return SERVICES.map((s) => s.slug);
    case 'capabilities':
    case 'network':
      return Object.keys(NETWORK_CAPABILITIES).map((k) => k.toLowerCase());
    case 'export':
      return ['brief', 'brief json'];
    case 'project':
      return ['history', 'export', 'export json'];
    default:
      return [];
  }
}

export interface Completion {
  /** The line as it should now read. Unchanged when there is nothing to add. */
  line: string;
  /** Every candidate, when there is more than one. The caller prints these. */
  options: string[];
}

/**
 * Complete the word under the cursor.
 *
 * Completes to the longest common prefix rather than to the first match, which
 * is what a shell does and what anybody who has used one expects: typing `se`
 * and pressing Tab should get you to `service` and stop, not silently pick
 * `services` for you.
 */
export function complete(raw: string): Completion {
  const trailing = /\s$/.test(raw);
  const parts = raw.trimStart().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return { line: raw, options: VERBS };

  const completing = trailing ? '' : (parts[parts.length - 1] ?? '');
  const isVerb = parts.length === 1 && !trailing;
  const pool = isVerb ? VERBS : argsFor(parts[0].toLowerCase());
  if (!pool.length) return { line: raw, options: [] };

  const hits = pool.filter((c) => c.startsWith(completing.toLowerCase()));
  if (hits.length === 0) return { line: raw, options: [] };

  let common = hits[0];
  for (const h of hits) {
    let i = 0;
    while (i < common.length && i < h.length && common[i] === h[i]) i++;
    common = common.slice(0, i);
  }

  const head = isVerb ? '' : `${parts.slice(0, trailing ? parts.length : -1).join(' ')} `;
  const line = `${head}${common}${hits.length === 1 ? ' ' : ''}`;
  return { line, options: hits.length > 1 ? hits : [] };
}
