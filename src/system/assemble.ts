import { findMode } from '../content/lab';
import { getBrief, stageLines, type Provenance } from './brief';
import type { Project } from './project';

/**
 * THE ASSEMBLED PROJECT — the whole session read back in one place.
 *
 * ── WHY A LEDGER WAS NOT ENOUGH ─────────────────────────────────────────────
 *
 * SYSTEM.app already listed what had been made: six rows, each with its
 * producer, its time and its limits. Accurate, and not an answer to anything a
 * person actually arrives with. Somebody who has spent twenty minutes moving
 * between four products is not asking "what files do I have"; they are asking
 * some version of:
 *
 *     what did I tell you            · the statement, in their words
 *     what did you work out          · what the system derived from it
 *     what did we make               · the ledger, which already existed
 *     what is still unknown          · the gaps, named rather than implied
 *     what do you recommend          · the RECOMMENDATION lines, gathered
 *     what can I do next             · doors, chosen from what exists
 *
 * This composes five of those six out of what the session already holds. It
 * invents nothing and asserts nothing: every line either came from the visitor,
 * was derived by a lookup that shows its working, or is an absence.
 *
 * "What did we make" is deliberately NOT one of them. The ledger beside this
 * already answers it, and answers it better — with the time each thing was
 * made, what it was developed from, and what it refuses to tell you. A second
 * flattened copy of the same list would be the panel disagreeing with itself
 * about how many things exist.
 *
 * ── EVERYTHING IS DERIVED ───────────────────────────────────────────────────
 *
 * Nothing here is stored. The reading is a pure function of the project and the
 * session brief, which means it is never stale, a declined handoff cannot
 * corrupt it, and NEW PROJECT empties it without a single field having to be
 * cleared. The same decision `system/work.ts` makes about progress, for the
 * same reason.
 */

/**
 * One register more than the brief has.
 *
 * `Provenance` is the vocabulary of a document the Simulator writes, where
 * nothing was ever measured. This panel also reads X-RAY, which measures things
 * in the browser that is running right now — a different claim from a FACT out
 * of committed source, and one the design system already has a register for
 * (`--prov-measured`, set in the photographic grey rather than in the company's
 * ink, so an instrument's reading never looks like the company speaking).
 */
export type Register = Provenance | 'MEASURED';

export interface AssembledLine {
  /** Present where the line's standing needs marking; absent for plain prose. */
  p?: Register;
  text: string;
}

export interface AssembledSection {
  /** A question, asked the way a person would ask it. */
  head: string;
  /** What to say when the section has nothing in it. Never left blank. */
  empty: string;
  lines: AssembledLine[];
}

/** A door, not a step. Named by what it would do, not by where it sits. */
export interface NextDoor {
  product: string;
  title: string;
  because: string;
}

export interface Assembled {
  /** Exactly what the visitor typed, or null when they have not said anything. */
  statement: string | null;
  /** Where the statement was typed, so the panel can say rather than imply. */
  origin: 'terminal' | 'simulator' | null;
  sections: AssembledSection[];
  doors: NextDoor[];
}

function modeTitle(id: string): string {
  return findMode(id)?.title ?? id.toUpperCase();
}

/** `14:32` — a time, not a date. A project is read on the day it is opened. */
function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The reading.
 *
 * `project` is passed in rather than read, so a component can subscribe to the
 * store and hand the snapshot down; the brief is read here because it has no
 * React binding of its own and nothing else in this file needs one.
 */
export function assemble(project: Project): Assembled {
  const brief = getBrief();
  const frame = brief.frame;
  const kinds = new Set(project.artifacts.map((a) => a.kind));
  const statement = project.statement ?? frame?.statement ?? null;

  /* ---- 1 · what you told us ---------------------------------------------- */
  /*
   * Their words, wherever they typed them.
   *
   * The statement is the obvious one. A phrase typed into MATTER ENGINE is the
   * other: it is not a problem and must never be promoted to one, but it is
   * something the visitor said, and a panel that answered "nothing yet" to
   * somebody who had just set their own sentence in a hundred thousand
   * particles would be plainly wrong.
   */
  const told: AssembledLine[] = [];
  if (statement) told.push({ p: 'FACT', text: statement });
  for (const s of brief.selected) told.push({ p: 'FACT', text: s });
  for (const a of project.artifacts) {
    if (a.kind !== 'recipe' || typeof a.data !== 'object' || a.data === null) continue;
    const phrase = (a.data as { phrase?: unknown }).phrase;
    if (typeof phrase === 'string' && phrase.trim()) {
      told.push({ p: 'FACT', text: `“${phrase.trim()}” — set in the particle field.` });
    }
  }

  /* ---- 2 · what this worked out ------------------------------------------ */
  const worked: AssembledLine[] = [];
  if (frame && !frame.empty) {
    worked.push({
      p: 'DERIVED',
      text: `Matched to ${frame.areas.length} of the diagnostic areas this company audits: ${frame.areas.join(', ')}.`,
    });
    for (const area of frame.areas) {
      worked.push({ p: 'DERIVED', text: `${area} — on the words ${frame.matched[area].join(', ')}.` });
    }
    if (frame.services.length) {
      worked.push({
        p: 'DERIVED',
        text: `Service categories that speak to those areas: ${frame.services.map((s) => s.title).join(', ')}.`,
      });
    }
    if (frame.sequence.length) {
      worked.push({
        p: 'DERIVED',
        text: `The method stages that would be run, in order: ${frame.sequence.map((m) => m.label).join(' → ')}.`,
      });
    }
  }
  /* Readings from the other half of the Lab — a page taken apart, a field
     rendered — are work on this project too, and the panel that only counted
     the brief was quietly saying they were not. */
  for (const a of project.artifacts) {
    if (a.kind === 'manifest') {
      worked.push({ p: 'FACT', text: `${a.title} — read from the page's own committed source.` });
    }
    if (a.kind === 'specimen') {
      worked.push({ p: 'MEASURED', text: `${a.title} — measured in this browser, at this viewport.` });
    }
    if (a.kind === 'recipe') {
      worked.push({
        p: 'DERIVED',
        text: `${a.title} — the settings that reproduce that formation exactly, because the field is sampled deterministically.`,
      });
    }
    if (a.kind === 'treatment') {
      const subject =
        typeof a.data === 'object' && a.data !== null
          ? (a.data as { subject?: unknown }).subject
          : null;
      worked.push({
        p: 'DERIVED',
        text:
          typeof subject === 'string' && subject.trim()
            ? `A film was written about “${subject.trim()}” — fourteen shots, each with a stated reason for existing.`
            : `${a.title} — a sequence with a stated reason for every shot in it.`,
      });
    }
    if (a.kind === 'delivery') {
      worked.push({
        p: 'FACT',
        text: 'Everything above was packaged. The package is local: nothing was uploaded, hosted or sent.',
      });
    }
  }

  /* ---- 4 · what is still unknown ------------------------------------------ */
  /*
   * A READING, NOT A REPRINT.
   *
   * The first version of this listed every UNKNOWN line the brief holds, and
   * on a real run that is more than twenty of them — SYSTEM.app turned into a
   * second, worse copy of a document the visitor already has, and the three
   * gaps that belong to the SESSION rather than to the brief were lost in the
   * middle of it.
   *
   * So the brief's own unknowns are counted and pointed at, where they are
   * already set under the stage that raised them. What is stated in full here
   * is what nothing else says: the open questions the frame itself could not
   * answer, and the absences that follow from which tools were and were not
   * run.
   */
  const unknown: AssembledLine[] = [];
  if (frame && !frame.empty) {
    for (const q of frame.questions) unknown.push({ p: 'UNKNOWN', text: q });
    /* With no run behind it there is no document to point at, so the evidence
       the frame asked for is stated here instead of being counted. The
       Terminal's `diagnose` legitimately stops at the frame. */
    if (!brief.stages) for (const e of frame.evidence) unknown.push({ p: 'UNKNOWN', text: e });
  }
  if (brief.stages) {
    const counted = brief.stages
      .map((stage) => ({
        label: stage.label,
        n: stageLines(stage).filter((l) => l.p === 'UNKNOWN').length,
      }))
      .filter((x) => x.n > 0);
    const total = counted.reduce((n, x) => n + x.n, 0);
    if (total > 0) {
      unknown.push({
        p: 'UNKNOWN',
        text: `The brief names ${total} more, each set under the stage that raised it: ${counted
          .map((x) => `${x.label} ${x.n}`)
          .join(', ')}.`,
      });
    }
  }
  /*
   * The absence that follows from what is present.
   *
   * Reading a page's source and measuring a page in a browser are two different
   * claims, and a session holding only the first one looks — to anybody who was
   * not here — like a page that was examined. Skipping the instrument is
   * legitimate. It just has to be said out loud.
   */
  if (kinds.has('manifest') && !kinds.has('specimen')) {
    unknown.push({
      p: 'UNKNOWN',
      text: 'Live measurement was not performed. The page was read from its source only — nothing in this session reports what a browser actually did with it.',
    });
  }
  if (kinds.has('specimen') && !kinds.has('manifest')) {
    unknown.push({
      p: 'UNKNOWN',
      text: 'The measurements here came off one browser at one viewport. What the page is built from was not read.',
    });
  }
  if (!statement) {
    unknown.push({
      p: 'UNKNOWN',
      text: 'Nothing has been stated to this system, so nothing it holds is a response to a situation.',
    });
  }

  /* ---- 5 · what is recommended -------------------------------------------- */
  const recommended: AssembledLine[] = [];
  if (brief.stages) {
    for (const stage of brief.stages) {
      for (const line of stageLines(stage)) {
        if (line.p === 'RECOMMENDATION') {
          recommended.push({ p: 'RECOMMENDATION', text: `${stage.label} — ${line.text}` });
        }
      }
    }
  }

  /* ---- 6 · doors ---------------------------------------------------------- */
  const doors: NextDoor[] = [];
  if (!statement) {
    doors.push({
      product: 'agency-simulator',
      title: modeTitle('agency-simulator'),
      because: 'Describe what is wrong in your own words and it becomes a five-stage brief.',
    });
  }
  if (kinds.has('manifest') && !kinds.has('specimen')) {
    doors.push({
      product: 'x-ray',
      title: modeTitle('x-ray'),
      because: 'Measure the same page in this browser, so the two readings can disagree usefully.',
    });
  }
  if ((kinds.has('brief') || kinds.has('recipe')) && !kinds.has('treatment')) {
    doors.push({
      product: 'director',
      title: modeTitle('director'),
      because: kinds.has('brief')
        ? 'Turn the brief into a creative treatment, and a film that performs it.'
        : 'Make the phrase you put into the field the subject of a film.',
    });
  }
  if (project.artifacts.length > 0 && !kinds.has('delivery')) {
    doors.push({
      product: 'portal',
      title: modeTitle('portal'),
      because: 'Package everything this session holds, with what it carries and what it does not.',
    });
  }

  /* ---- 6 · how it got here ------------------------------------------------ */
  /*
   * The history, trimmed to what explains the current state.
   *
   * Every entry is kept in the project and every one is in the export; this is
   * the panel's reading of it, and a panel that printed forty lines of log
   * would be the same mistake the UNKNOWN section made before it was cut down.
   * The most recent dozen, newest last, because the question is "how did we get
   * here" and here is the end of the list.
   */
  const story: AssembledLine[] = project.history
    .slice(-12)
    .map((h) => ({ p: 'FACT', text: `${clock(h.at)} · ${h.note}` }));

  const sections: AssembledSection[] = [
    {
      head: 'WHAT YOU TOLD US',
      empty: 'Nothing yet. Describe a situation in the Terminal or in the Agency Simulator and it will be here, in your words.',
      lines: told,
    },
    {
      head: 'WHAT THIS WORKED OUT',
      empty: 'Nothing yet. This fills in as tools read what you gave them.',
      lines: worked,
    },
    {
      head: 'WHAT IS STILL UNKNOWN',
      empty: 'Nothing has been claimed yet, so nothing is outstanding.',
      lines: unknown,
    },
    {
      head: 'HOW IT GOT HERE',
      empty: 'Nothing has happened to this project yet.',
      lines: story,
    },
    {
      head: 'WHAT IS RECOMMENDED',
      empty: 'Nothing. Recommendations come out of a full run in the Agency Simulator, and this session has not done one.',
      lines: recommended,
    },
  ];

  return { statement, origin: brief.origin, sections, doors };
}
