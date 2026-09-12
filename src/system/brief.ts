import { toMarkdown } from '../artifacts/artifact';
import { CANONICAL_SOURCE, POSITION } from '../content/canonical';
import { DISCLAIMER, type Frame } from './diagnose';

/**
 * THE SESSION BRIEF — the one thing tools hand to each other.
 *
 * ── WHY A STORE AND NOT A PROP ──────────────────────────────────────────────
 *
 * The Terminal's `diagnose` and the Agency Simulator's run both produce a
 * problem frame, and SYSTEM.app has to be able to include whichever one the
 * visitor made — across a mode exit, because those are three different
 * realities and the visitor walks between them. A prop cannot cross that gap
 * and a context provider spanning the whole Lab to carry one optional object
 * would be a global state monster for a single field.
 *
 * So it is the same shape `experience/visited.ts` already uses and for the same
 * reasons: module state, a listener set, and **no storage of any kind**. Nothing
 * here survives a reload. PERFORMANCE reports `STORAGE — NONE` and that has to
 * keep being true; a brief that came back tomorrow would make the Lab's own
 * instrument a liar, and it would also mean a stranger's problem statement was
 * sitting on the machine after they left.
 */

export interface BriefState {
  /** The framed problem, if one has been made this session. */
  frame: Frame | null;
  /** Capabilities the visitor selected in TECHNOLOGY.app, if any. */
  selected: string[];
  /** Where the frame came from, so SYSTEM.app can say so rather than imply. */
  origin: 'terminal' | 'simulator' | null;
}

let state: BriefState = { frame: null, selected: [], origin: null };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function getBrief(): BriefState {
  return state;
}

export function setFrame(frame: Frame, origin: 'terminal' | 'simulator'): void {
  state = { ...state, frame, origin };
  emit();
}

export function setSelected(selected: string[]): void {
  state = { ...state, selected };
  emit();
}

export function resetBrief(): void {
  state = { frame: null, selected: [], origin: null };
  emit();
}

export function subscribeBrief(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* -------------------------------------------------------------------------- */
/* THE DOCUMENT                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Compose the brief as markdown.
 *
 * One composer for every surface that offers a download, so the Terminal's
 * `export brief` and SYSTEM.app's DOWNLOAD .MD cannot produce two different
 * documents from the same state. The disclaimer is a section rather than a
 * footnote because a document travels: by the time somebody forwards this to a
 * colleague, the screen that qualified it is long gone.
 */
export function briefMarkdown(s: BriefState = state): string {
  const f = s.frame;
  return toMarkdown({
    title: 'HI ANZY — PROBLEM BRIEF',
    standfirst: DISCLAIMER,
    sections: [
      {
        head: 'STATED PROBLEM',
        body: f ? `> ${f.statement}` : 'Nothing has been stated yet.',
      },
      {
        head: 'INTERPRETED SYSTEM AREAS',
        body: f && !f.empty
          ? 'Matched from the words in the statement above. The terms that selected each area are shown, so the mapping can be checked rather than trusted.'
          : undefined,
        items: f && !f.empty
          ? f.areas.map((a) => `**${a}** — matched on: ${f.matched[a].join(', ')}`)
          : [],
      },
      {
        head: 'RELEVANT HI ANZY CATEGORIES',
        items: f ? f.services.map((sv) => `**${sv.title}** — ${sv.copy} (typical: ${sv.typical})`) : [],
      },
      {
        head: 'RECOMMENDED SEQUENCE',
        body: f && f.sequence.length ? 'The method stages these categories belong to, in the order the method runs them.' : undefined,
        items: f ? f.sequence.map((m, i) => `**${String(i + 1).padStart(2, '0')} ${m.label}** — ${m.title} (${m.duration})`) : [],
      },
      {
        head: 'LIKELY OUTPUTS',
        items: f ? [...new Set(f.sequence.flatMap((m) => m.outputs))] : [],
      },
      {
        head: 'RELEVANT CAPABILITIES',
        items: f ? f.capabilities : [],
      },
      {
        head: 'SELECTED SYSTEMS',
        items: s.selected,
      },
      {
        head: 'EVIDENCE STILL REQUIRED',
        body: f ? 'None of the following has been established. They are what an audit would go and find.' : undefined,
        items: f ? f.evidence : [],
      },
      {
        head: 'OPEN QUESTIONS',
        items: f ? f.questions : [],
      },
      {
        head: 'NEXT ACTION',
        body: f
          ? 'Take this brief to a conversation. Every gap above is a thing to bring, not a thing to answer in advance.'
          : undefined,
      },
      {
        /*
         * Named categories and timings above come from the company's own
         * content file. Nothing here quotes a price: the canonical `PACKAGES`
         * export carries pricing language, and a document a visitor can
         * download and forward is the last place a number should appear
         * without a person attached to it.
         */
        head: 'WHAT THIS IS NOT',
        body: `${DISCLAIMER} Nothing above is a quotation, a commitment, or a finding. Hi Anzy’s own statement of itself is “${POSITION.statement}”`,
      },
    ],
    footer: {
      GENERATED: new Date().toISOString(),
      ORIGIN: s.origin ? s.origin.toUpperCase() : 'NONE',
      'CANONICAL SOURCE': CANONICAL_SOURCE.commit,
      STORAGE: 'NONE — nothing was written to this device',
    },
  });
}

/** The same brief as data, for DOWNLOAD .JSON. */
export function briefJson(s: BriefState = state): unknown {
  const f = s.frame;
  return {
    generated: new Date().toISOString(),
    origin: s.origin,
    disclaimer: DISCLAIMER,
    canonicalSource: CANONICAL_SOURCE.commit,
    storage: 'NONE',
    statement: f?.statement ?? null,
    areas: f?.areas ?? [],
    matchedTerms: f?.matched ?? {},
    categories: f?.services.map((sv) => ({ slug: sv.slug, title: sv.title, stage: sv.stage, typical: sv.typical })) ?? [],
    sequence: f?.sequence ?? [],
    capabilities: f?.capabilities ?? [],
    selected: s.selected,
    evidenceRequired: f?.evidence ?? [],
    openQuestions: f?.questions ?? [],
  };
}
