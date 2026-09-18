import { SCHEMA_VERSION, projectStatus, projectTitle } from './schema';
import type { HistoryEntry } from './schema';
import type { Project } from './project';
import { CANONICAL_SOURCE } from '../content/canonical';
import { findMode } from '../content/lab';

/**
 * THE PROJECT, LEAVING THE BROWSER.
 *
 * Two files that say the same thing to two different readers: PROJECT.md for a
 * person who was never in the room, PROJECT.json for a machine — and for this
 * product reading it back one day.
 *
 * ── WHAT IS IN IT, AND WHAT IS NOT ──────────────────────────────────────────
 *
 * Everything durable is in it, in full: the statement, the constraints, every
 * artifact with its document and its limits line, the history, the provenance.
 * Measured, that is under a hundred kilobytes for a project holding one of
 * every kind — small enough that splitting the documents out into side files
 * would be complexity bought with nothing.
 *
 * What is NOT in it is any image. The Matter Engine's PNG is handed to the
 * browser's download path the moment it is made and never retained by this
 * product, so there is no binary here to embed and none is claimed. The recipe
 * that reproduces the composition is here instead, which is the durable half.
 * That is stated in the file rather than left for somebody to notice.
 *
 * ── EVERY LINE CARRIES ITS OWN LIMITS ───────────────────────────────────────
 *
 * An artifact's `limits` travels with it, because the screen that qualified it
 * is exactly what does not survive being forwarded. A manifest that listed six
 * documents and dropped what each of them cannot tell you would be a more
 * confident document than any of its contents.
 */

export interface ProjectExport {
  markdown: string;
  json: unknown;
  /** `hi-anzy-project-2026-09-13` — the bar slugs and dates it. */
  name: string;
}

function stamp(at: number): string {
  return new Date(at).toISOString();
}

function modeName(id: string): string {
  return findMode(id)?.title ?? id.toUpperCase().replace(/-/g, ' ');
}

const STATUS_LINE: Record<ReturnType<typeof projectStatus>, string> = {
  EMPTY: 'Nothing has been stated and nothing has been made.',
  STATED: 'A situation has been described. Nothing has been produced from it yet.',
  WORKING: 'Work is under way; results exist and nothing has been packaged.',
  PACKAGED: 'A delivery package has been made from what this project holds.',
};

export function exportProject(p: Project): ProjectExport {
  const title = projectTitle(p);
  const status = projectStatus(p);
  const unknowns = p.artifacts.length === 0 ? ['Nothing has been produced, so nothing is outstanding.'] : [];

  if (p.artifacts.some((a) => a.kind === 'manifest') && !p.artifacts.some((a) => a.kind === 'specimen')) {
    unknowns.push(
      'LIVE MEASUREMENT WAS NOT PERFORMED. A page was read from its committed source only; nothing here reports what a browser did with it.',
    );
  }
  if (!p.statement) {
    unknowns.push('No situation was stated, so nothing here is a response to one.');
  }
  if (p.constraints.length > 0 && p.constraints.length < 5) {
    unknowns.push(
      `${p.constraints.length} of the five constraints were given, so the brief that reads them is incomplete.`,
    );
  }

  const md: string[] = [
    `# ${title.text}`,
    '',
    title.named ? '' : '*No name was given to this project; the line above is its opening statement.*',
    title.named ? '' : '',
    `**STATUS** — ${status}. ${STATUS_LINE[status]}`,
    `**STARTED** — ${stamp(p.createdAt)}`,
    `**LAST CHANGED** — ${stamp(p.updatedAt)}`,
    `**PROJECT ID** — ${p.id}`,
    '',
    '---',
    '',
    '## WHAT WAS SAID',
    '',
    p.statement ? `> ${p.statement}` : 'Nothing was stated to this system.',
    '',
  ];

  if (p.constraints.length) {
    md.push('## CONSTRAINTS STATED', '');
    md.push('The choices the visitor made, in the words they were offered in.', '');
    for (const c of p.constraints) {
      const h = p.history.find((e) => e.kind === 'DECISION_ACCEPTED' && e.ref === c.question);
      md.push(`- ${h ? h.note : `${c.question} — ${c.option}`}`);
    }
    md.push('');
  }

  md.push('## WHAT WAS MADE', '');
  if (!p.artifacts.length) {
    md.push('Nothing yet.', '');
  } else {
    for (const a of p.artifacts) {
      md.push(
        `### ${a.title}`,
        '',
        `- **TYPE** — ${a.kind.toUpperCase()}`,
        `- **MADE BY** — ${modeName(a.producer)}`,
        `- **MADE AT** — ${stamp(a.createdAt)}`,
        ...(a.sourceIds.length
          ? [`- **MADE FROM** — ${a.sourceIds.length} earlier result${a.sourceIds.length === 1 ? '' : 's'}`]
          : []),
        `- **CANNOT TELL YOU** — ${a.limits}`,
        '',
      );
      if (a.text) {
        md.push('<details>', '<summary>The document itself</summary>', '', a.text, '', '</details>', '');
      }
    }
  }

  md.push('## WHAT IS STILL UNKNOWN', '');
  if (unknowns.length) for (const u of unknowns) md.push(`- ${u}`);
  else md.push('- Nothing beyond the limits each result states for itself, above.');
  md.push('');

  md.push('## HOW IT GOT HERE', '');
  for (const h of p.history) md.push(`- \`${stamp(h.at)}\` **${h.kind}** — ${h.note}`);
  md.push('');

  md.push(
    '## WHAT THIS FILE IS NOT',
    '',
    '- It contains no image. The Matter Engine hands its PNG straight to the browser and keeps nothing, so there is no picture here and none is claimed — the recipe that reproduces it is.',
    '- It was never uploaded. This project lived in one browser, was saved in that browser only, and this file is the only copy that has ever left it.',
    '- It is not an audit, a forecast, a quote or a plan. Every result above states its own limits and those limits are the document’s limits too.',
    '',
    '---',
    '',
    `**EXPORTED** — ${stamp(Date.now())}  `,
    `**SCHEMA** — ${SCHEMA_VERSION}  `,
    `**CANONICAL SOURCE** — ${CANONICAL_SOURCE.commit}  `,
    '',
  );

  const json = {
    schemaVersion: SCHEMA_VERSION,
    exported: stamp(Date.now()),
    canonicalSource: CANONICAL_SOURCE.commit,
    storage: 'LOCAL — this project was saved in one browser and never uploaded',
    binary: 'NONE — no image is retained by this product, so none is embedded here',
    project: {
      id: p.id,
      title: p.title,
      derivedTitle: title.named ? null : title.text,
      status,
      createdAt: stamp(p.createdAt),
      updatedAt: stamp(p.updatedAt),
      statement: p.statement,
    },
    constraints: p.constraints.map((c) => ({
      question: c.question,
      option: c.option,
      stated: p.history.find((e) => e.kind === 'DECISION_ACCEPTED' && e.ref === c.question)?.note ?? null,
      at: stamp(c.at),
    })),
    artifacts: p.artifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      producer: a.producer,
      producerName: modeName(a.producer),
      createdAt: stamp(a.createdAt),
      madeFrom: a.sourceIds,
      limits: a.limits,
      document: a.text ?? null,
      data: a.data ?? null,
    })),
    unknowns,
    history: p.history.map((h: HistoryEntry) => ({ at: stamp(h.at), kind: h.kind, note: h.note, ref: h.ref ?? null })),
  };

  return {
    markdown: md.filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n'),
    json,
    name: title.named ? title.text : `Hi Anzy Project ${p.id}`,
  };
}
