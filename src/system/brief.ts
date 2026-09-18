import { useSyncExternalStore } from 'react';
import { toMarkdown } from '../artifacts/artifact';
import { CANONICAL_SOURCE, POSITION } from '../content/canonical';
import { DISCLAIMER, frame, type Frame } from './diagnose';

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

/**
 * Where a line in the brief came from.
 *
 * The single most important distinction in this document, and the reason it can
 * be handed to somebody who was not in the room. A brief that mixes what the
 * visitor said with what a lookup table produced and what nobody knows yet is
 * indistinguishable from an audit, which is exactly the claim this product must
 * not make. Every line carries one of these, in the export as well as on screen.
 */
export type Provenance = 'FACT' | 'DERIVED' | 'UNKNOWN' | 'RECOMMENDATION';

export interface ReportLine {
  p: Provenance;
  text: string;
}

/**
 * A named block inside a stage.
 *
 * ── WHY STAGES GAINED STRUCTURE ─────────────────────────────────────────────
 *
 * A stage used to be a flat `ReportLine[]`, and the document that produced was
 * sixty equal lines under five headings. Read as a founder would read it, the
 * substance was there and the hierarchy was not: BUILD opened with the four
 * method stages restated as "deliverables", ARCHITECT began "Priority —
 * IDENTITY" with nothing saying what that meant, and the sharpest line in the
 * whole brief — that a fixed date and a systems rebuild are pulling against
 * each other — sat two thirds of the way down SCALE among twelve others.
 *
 * A group is a question the block answers. That is the entire change, and it is
 * what turns a list into something somebody can take to a meeting.
 */
export interface ReportGroup {
  head: string;
  /** One line on what this block is for, where the heading is not enough. */
  note?: string;
  lines: ReportLine[];
}

/** One method stage, as the simulator works through it. */
export interface ReportStage {
  label: string;
  title: string;
  groups: ReportGroup[];
}

/** Every line in a stage, in order. Groups are presentation, not content. */
export function stageLines(stage: ReportStage): ReportLine[] {
  return stage.groups.flatMap((g) => g.lines);
}

export interface BriefState {
  /** The framed problem, if one has been made this session. */
  frame: Frame | null;
  /** Constraints the visitor chose, in their own words. */
  selected: string[];
  /** Where the frame came from, so SYSTEM.app can say so rather than imply. */
  origin: 'terminal' | 'simulator' | null;
  /**
   * The five-stage working, when a run has produced one.
   *
   * Optional because the Terminal's `diagnose` legitimately stops at the frame:
   * it is a lookup, not a run, and printing five empty stages after it would
   * dress a one-line answer up as a piece of work.
   */
  stages?: ReportStage[];
}

let state: BriefState = { frame: null, selected: [], origin: null };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function getBrief(): BriefState {
  return state;
}

export function setFrame(frame: Frame, origin: 'terminal' | 'simulator'): void {
  /* A new statement invalidates the previous run's working. Keeping stale
     stages under a fresh problem would be the worst failure this file has: a
     document that looks assembled and describes something else. */
  state = { ...state, frame, origin, stages: undefined };
  emit();
}

export function setRun(frame: Frame, stages: ReportStage[], selected: string[]): void {
  state = { frame, stages, selected, origin: 'simulator' };
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

/**
 * REBUILD THE FRAME FROM WHAT THE PROJECT KEPT.
 *
 * ── WHY THIS IS NOT A DESERIALISER ──────────────────────────────────────────
 *
 * A resumed project does not carry a stored frame. It carries the SENTENCE, and
 * `frame()` is a deterministic lookup over canonical data with no clock and no
 * randomness in it — so the frame is recomputed here by the code that is
 * running now. If the lexicon is corrected between one visit and the next, the
 * visitor's reading is corrected with it, rather than being a replay of an
 * answer this build no longer stands behind.
 *
 * The five-stage working is NOT rebuilt here, and deliberately so: `buildRun`
 * lives in the Simulator's own lazily loaded chunk, and dragging it into the
 * shared brief chunk to service a resume would put a report builder in front of
 * every visitor who never opens the Simulator. It comes back in two ways
 * instead — the Simulator rebuilds it the moment it is opened with the stored
 * answers, and SYSTEM.app reads the stages off the brief artifact that is
 * already in the ledger.
 */
export function rehydrateBrief(statement: string | null, origin: BriefState['origin']): void {
  if (!statement) return;
  const f = frame(statement);
  if (f.empty) return;
  state = { frame: f, selected: state.selected, origin, stages: undefined };
  emit();
}

export function subscribeBrief(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Read the brief in a component.
 *
 * `useSyncExternalStore` rather than a `useState` mirror and an effect: the
 * Terminal writes the frame from inside a command, which is not a React event
 * this component knows about, and a mirror would render one frame behind it.
 * `getBrief` returns the same object until something actually changes, which is
 * the identity contract this hook needs.
 */
export function useBrief(): BriefState {
  return useSyncExternalStore(subscribeBrief, getBrief, getBrief);
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
      /*
       * ── SAID ONCE ───────────────────────────────────────────────────────
       *
       * Everything below this point used to be printed twice. A finished brief
       * carried LIKELY OUTPUTS and then the same twelve lines again inside
       * BUILD; RELEVANT CAPABILITIES and then eight of the same inside CONNECT;
       * EVIDENCE STILL REQUIRED after AUDIT had already listed it; OPEN
       * QUESTIONS after SCALE had already asked them; STATED CONSTRAINTS before
       * AUDIT restated each one as a FACT. Read end to end it was roughly a
       * third padding, and padding in a document whose whole claim is candour
       * costs more than length.
       *
       * So when there is a run, the run is the document: the stages carry the
       * outputs, the capabilities, the evidence and the questions, each in the
       * stage that actually produced them. The standalone sections remain for
       * the case where there is a frame and no run — the Terminal's `diagnose`
       * legitimately stops at the frame, and that reader still needs them.
       */
      ...(s.stages?.length
        ? []
        : [
            {
              head: 'LIKELY OUTPUTS',
              items: f ? [...new Set(f.sequence.flatMap((m) => m.outputs))] : [],
            },
            { head: 'RELEVANT CAPABILITIES', items: f ? f.capabilities : [] },
            {
              head: 'EVIDENCE STILL REQUIRED',
              body: f
                ? 'None of the following has been established. They are what an audit would go and find.'
                : undefined,
              items: f ? f.evidence : [],
            },
            { head: 'OPEN QUESTIONS', items: f ? f.questions : [] },
            {
              head: 'NEXT ACTION',
              body: f
                ? 'Take this brief to a conversation. Every gap above is a thing to bring, not a thing to answer in advance.'
                : undefined,
            },
          ]),
      /*
       * The run, when there was one. Each line keeps its provenance label in
       * the file as well as on screen: a document travels, and by the time
       * somebody forwards this the interface that colour-coded it is gone.
       *
       * Groups become sub-headings, so the exported file has the same shape the
       * reader saw rather than collapsing back into one list per stage.
       */
      ...(s.stages ?? []).flatMap((st) => [
        { head: `${st.label} — ${st.title}` },
        ...st.groups.map((grp) => ({
          head: `${st.label} · ${grp.head}`,
          body: grp.note,
          items: grp.lines.map((l) => `**${l.p}** — ${l.text}`),
        })),
      ]),
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
    /* Groups are carried into the JSON too. A consumer that only wants the
       lines can flatten them; one that wants the document's shape — which is
       what makes it readable — cannot put it back if it was thrown away. */
    stages: (s.stages ?? []).map((st) => ({
      stage: st.label,
      title: st.title,
      groups: st.groups.map((grp) => ({
        head: grp.head,
        note: grp.note,
        lines: grp.lines.map((l) => ({ provenance: l.p, text: l.text })),
      })),
    })),
    evidenceRequired: f?.evidence ?? [],
    openQuestions: f?.questions ?? [],
  };
}
