import { ACTS, type Shot } from '../../content/director';
import { findMode } from '../../content/lab';
import { specimen } from '../../content/specimens';
import type { ArtifactRecord } from '../../system/project';

/**
 * THE TREATMENT — what the film is doing, written down before it runs.
 *
 * ── WHY DIRECTOR NEEDED ONE ─────────────────────────────────────────────────
 *
 * Director was the one product on the index honestly showing four NOT YET rows:
 * it took no input, worked from no stated context, handed back no artifact and
 * had nowhere to send one. It was a finished piece of cinema wearing a
 * product's clothes, and the index said so.
 *
 * A treatment is the thing a director actually produces. The film is the
 * preview of it. That single reordering turns the same fourteen shots from a
 * demonstration into an output: a visitor can read why each shot exists, take
 * the document away, and hand it to somebody who will never open this tab.
 *
 * ── NO MODEL, AND NOTHING INVENTED ──────────────────────────────────────────
 *
 * Every line below is composition. The shot intents are authored in
 * `content/director.ts` beside the shots they describe — written by a person,
 * checked against the cut, and the reason the audit in Phase 8.8 could be done
 * at all: a shot whose intent takes a paragraph is a weak shot, and a shot with
 * no intent should not be in the film.
 *
 * When a brief has been sent from the Simulator, the treatment names it as the
 * subject and says which statement it came from. When one has not, it says the
 * film is running on the studio's own material — which is true, and is a better
 * answer than inventing a client.
 *
 * ── THE SUBJECT IS A PHRASE, NEVER A DOCUMENT ───────────────────────────────
 *
 * Director can be handed a brief (from the Simulator) or a recipe (from Matter
 * Engine), and each of those is a whole report. A film is not about a report —
 * it is about one thing, said in one line. So the subject is **selected** out of
 * the incoming artifact: the statement from a brief, the phrase from a recipe.
 * If what comes out is still long enough to be prose, it is cut to its first
 * sentence and the treatment says it was shortened, because a visitor reading
 * “WHAT THIS FILM IS FOR” has to be able to tell their own words from ours.
 */

export interface TreatmentBlock {
  head: string;
  /** One line on what the block is for, where the heading will not carry it. */
  note?: string;
  lines: string[];
}

export interface Treatment {
  /** What the film is about, in one line. */
  subject: string;
  /** Where that subject came from, named so it can be checked. */
  source: string;
  cut: 'primary' | 'long';
  /** Seconds. */
  runtime: number;
  shotCount: number;
  blocks: TreatmentBlock[];
}

/** `1:05` */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * What each kind of shot is made of.
 *
 * Named from the Lab's own material vocabulary rather than from the renderer's
 * component names: a treatment is read by somebody deciding whether the film is
 * right, not by somebody maintaining it.
 */
const MATERIAL: Record<string, string> = {
  slate: 'Press furniture — a stamped slate, held still.',
  wordmark: 'The logotype, out of register and pulling into it.',
  statement: 'Type alone on stock. No image, no movement where it is marked still.',
  scatter: 'A field of loose marks — the problem drawn as behaviour.',
  grid: 'Drawn rules. The measure before the answer.',
  stages: 'The five method stages, set as a schedule.',
  plate: 'The resolved field — the scatter, settled.',
  roster: 'Many renderings of one system, tiled.',
  mark: 'A single registration mark.',
  specimen: 'An owned photographic plate from the company’s own library.',
  end: 'The mark, held, with nothing asked of the viewer.',
};

/** A named field read out of an artifact's `data`, which is `unknown` by
    contract — it is whatever the producing tool put there, so it is narrowed
    here rather than trusted. */
function field(record: ArtifactRecord | null, key: string): string | null {
  if (!record || typeof record.data !== 'object' || record.data === null) return null;
  const value = (record.data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * One line out of what may be several. Returns the phrase and whether cutting
 * it changed anything, so the treatment can say so rather than quietly
 * presenting an edit of somebody's sentence as their sentence.
 */
const SUBJECT_MAX = 150;
function oneLine(text: string): { phrase: string; shortened: boolean } {
  const first = text.split(/(?<=[.!?])\s+/)[0].trim() || text.trim();
  if (first.length <= SUBJECT_MAX) {
    return { phrase: first, shortened: first.length < text.trim().length };
  }
  const cut = first.slice(0, SUBJECT_MAX);
  const at = cut.lastIndexOf(' ');
  return { phrase: `${(at > 40 ? cut.slice(0, at) : cut).trim()}…`, shortened: true };
}

export function buildTreatment(
  shots: Shot[],
  runtime: number,
  cut: 'primary' | 'long',
  /** Whatever the visitor arrived with: a brief, a recipe, or nothing. */
  incoming: ArtifactRecord | null,
): Treatment {
  /*
   * The subject, selected rather than summarised.
   *
   * A brief states a problem; a recipe names a phrase somebody typed into the
   * particle field. Either is one line about one thing, which is what a film
   * can be about. Anything else that arrives is named by its title and nothing
   * is guessed from its contents.
   */
  const stated = field(incoming, 'statement') ?? field(incoming, 'phrase');
  const chosen = stated ? oneLine(stated) : null;
  const subject = chosen
    ? chosen.phrase
    : 'Hi Anzy itself — one company assembled from parts that usually never meet.';
  const source = incoming
    ? /* The product's NAME, not its id. `agency-simulator` is an internal
         handle and printing it in a document somebody takes to a meeting is
         the machinery showing through. */
      `${incoming.title}, produced by ${findMode(incoming.producer)?.title ?? incoming.producer.toUpperCase()} and carried here as an artifact.` +
      (chosen
        ? chosen.shortened
          ? ' The subject line above is the opening sentence of what was stated there, not the whole document.'
          : ' The subject line above is stated there word for word.'
        : ' It carries no single stated line, so the film runs on the studio’s own subject.')
    : 'Nothing was sent to this mode. The film is running on the studio’s own material, which is what it was written for.';

  /* Acts, with the shots that belong to each. The message hierarchy is the act
     structure — it is not invented for the document. */
  const byAct = ACTS.map((name, i) => {
    const inAct = shots.filter((s) => s.act === i);
    const seconds = inAct.reduce((n, s) => n + s.dur, 0);
    return { name, i, inAct, seconds };
  }).filter((a) => a.inAct.length > 0);

  const specimens = [...new Set(shots.filter((s) => s.specimen).map((s) => s.specimen!))];
  const kinds = [...new Set(shots.map((s) => s.kind))];

  /* A shot with no authored intent is reported as such rather than described.
     That is the audit surfacing itself: an unexplained shot in the export is a
     shot somebody has to justify or cut. */
  const unexplained = shots.filter((s) => !s.intent).length;

  const blocks: TreatmentBlock[] = [
    {
      head: 'WHAT THIS FILM IS FOR',
      lines: [subject],
    },
    {
      head: 'MESSAGE HIERARCHY',
      note: 'The acts, in order, with the time each is given. Time on screen is the argument about what matters.',
      lines: byAct.map(
        (a) =>
          `${String(a.i + 1).padStart(2, '0')} ${a.name} — ${a.inAct.length} shot${a.inAct.length === 1 ? '' : 's'}, ${clock(a.seconds)}`,
      ),
    },
    {
      head: 'VISUAL SYSTEM',
      note: 'The materials this cut is built from. Nothing here is stock footage; every frame is composed in the document at run time.',
      lines: kinds.map((k) => `${k.toUpperCase()} — ${MATERIAL[k] ?? 'Authored composition.'}`),
    },
    {
      head: 'THE SEQUENCE',
      note: 'Every shot, with what it is doing. A shot that cannot answer this in one line does not belong in the cut.',
      lines: shots.map((s, i) => {
        const n = String(i + 1).padStart(2, '0');
        const head = `${n} · ${s.kind.toUpperCase()} · ${s.dur.toFixed(1)}s`;
        const words = s.lines?.length ? ` · “${s.lines.join(' ')}”` : s.caption ? ` · “${s.caption}”` : '';
        return `${head}${words}\n    ${s.intent ?? 'NO STATED INTENT — this shot has not been justified.'}`;
      }),
    },
    {
      head: 'ASSETS REQUIRED',
      note: 'Owned Hi Anzy plates, mirrored into this product. Nothing is hotlinked and nothing is licensed from outside.',
      lines: specimens.length
        ? specimens.map((id) => {
            const spec = specimen(id);
            return spec ? `${id} — ${spec.subject}` : `${id} — NOT IN THE MIRRORED SET`;
          })
        : ['None. This cut composes entirely from type, rules and drawn fields.'],
    },
    {
      head: 'WHAT THIS TREATMENT CANNOT DO',
      lines: [
        'It does not schedule, budget or cast anything. No date, cost or availability appears in it.',
        'The film is performed by the browser from one clock. There is no video file, so there is nothing here to hand to an editor.',
        incoming
          ? `The subject came from ${incoming.title}, which states its own limits. This treatment inherits every one of them.`
          : 'Nothing was sent to this mode, so nothing here is tailored to anybody. It describes the studio’s own film.',
        ...(unexplained
          ? [`${unexplained} shot${unexplained === 1 ? '' : 's'} in this cut carry no stated intent and are marked in the sequence above.`]
          : []),
      ],
    },
  ];

  return { subject, source, cut, runtime, shotCount: shots.length, blocks };
}

/** The treatment as a document. Composed here so screen and file agree. */
export function treatmentMarkdown(t: Treatment): string {
  const out: string[] = [
    '# HI ANZY — DIRECTOR TREATMENT',
    '',
    `*${t.source}*`,
    '',
    `**CUT:** ${t.cut === 'primary' ? 'PRIMARY' : 'LONG'} · ${clock(t.runtime)} · ${t.shotCount} shots`,
    '',
  ];
  for (const b of t.blocks) {
    out.push(`## ${b.head}`, '');
    if (b.note) out.push(b.note, '');
    for (const l of b.lines) out.push(`- ${l}`);
    out.push('');
  }
  out.push(
    '---',
    '',
    '**GENERATED:** ' + new Date().toISOString() + '  ',
    '**STORAGE:** NONE — nothing was written to this device  ',
    '',
  );
  return out.join('\n');
}
