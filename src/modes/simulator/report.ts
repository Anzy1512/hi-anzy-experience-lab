import { NETWORK_CAPABILITIES } from '../../content/canonical';
import { QUESTIONS } from '../../content/simulator';
import type { ReportLine, ReportStage } from '../../system/brief';
import type { Frame } from '../../system/diagnose';
import type { Answers, SystemReading } from './model';

/**
 * THE RUN — one problem, walked through the company's own five stages.
 *
 * ── IT ADDS NO SECOND ENGINE ────────────────────────────────────────────────
 *
 * Everything below is composition. The interpretation of the visitor's sentence
 * belongs to `system/diagnose.ts`, exactly as the Terminal's does, so the two
 * realities cannot produce two different readings of the same words. The
 * constraint model in `model.ts` keeps its own job — it turns five deliberate
 * choices into priorities and dependencies, which is a different question from
 * "what is this sentence about" and was always answered separately.
 *
 * What this file does is arrange both of those into AUDIT → ARCHITECT → BUILD →
 * CONNECT → SCALE, and label every single line with where it came from.
 *
 * ── WHY THE LABELS ARE THE POINT ────────────────────────────────────────────
 *
 * A document that mixes what the visitor said, what a lookup table returned and
 * what nobody knows yet is indistinguishable from an audit — and an audit is the
 * one thing this must never be mistaken for. So:
 *
 *   FACT            the visitor said it, or chose it. Nothing inferred.
 *   DERIVED         a canonical table produced it from a FACT above.
 *   UNKNOWN         it has not been established and this cannot establish it.
 *   RECOMMENDATION  a next action, offered as an opinion and marked as one.
 *
 * The proportions matter more than any individual line: a finished run is mostly
 * DERIVED and UNKNOWN, which is the honest shape of knowing one sentence about
 * somebody's business.
 */

const F = (text: string): ReportLine => ({ p: 'FACT', text });
const D = (text: string): ReportLine => ({ p: 'DERIVED', text });
const U = (text: string): ReportLine => ({ p: 'UNKNOWN', text });
const R = (text: string): ReportLine => ({ p: 'RECOMMENDATION', text });

/** The visitor's constraint choices, in the words they were offered in. */
export function chosenLabels(answers: Answers): string[] {
  const out: string[] = [];
  for (const q of QUESTIONS) {
    const chosen = q.options.find((o) => o.id === answers[q.id]);
    if (chosen) out.push(`${q.stage}: ${chosen.label}`);
  }
  return out;
}

export function buildRun(
  frame: Frame,
  reading: SystemReading,
  answers: Answers,
): ReportStage[] {
  const constraints = chosenLabels(answers);

  /* Disciplines are named as kinds, never as people. `NETWORK_CAPABILITIES` is
     a taxonomy; the roster it belongs to lives on the commercial backend and is
     deliberately not in this product. */
  const disciplines = frame.areas
    .filter((a) => NETWORK_CAPABILITIES[a]?.length)
    .map((a) => `${a} — ${NETWORK_CAPABILITIES[a].join(', ')}`);

  return [
    {
      label: 'AUDIT',
      title: "See what's really happening.",
      lines: [
        F(`Stated: “${frame.statement}”`),
        ...constraints.map((c) => F(c)),
        ...frame.areas.map((a) =>
          D(`${a} — selected by the word${frame.matched[a].length > 1 ? 's' : ''} ${frame.matched[a].join(', ')}`),
        ),
        ...frame.evidence.map((e) => U(e)),
        U('Whether the stated problem is the cause or a symptom of another one.'),
      ],
    },
    {
      label: 'ARCHITECT',
      title: 'Turn the mess into a map.',
      lines: [
        ...reading.priorities.map((p) => D(`Priority — ${p.label}`)),
        ...frame.services.map((sv) => D(`${sv.title} — ${sv.copy}`)),
        ...reading.clusters
          .filter((c) => c.band === 'lead')
          .map((c) => D(`Leading: ${c.cluster.name}`)),
        ...(reading.dependencies.length
          ? reading.dependencies.map((d) => D(`${d.from} must be in place before ${d.to}`))
          : [U('No dependency between the selected areas could be derived from five answers.')]),
      ],
    },
    {
      label: 'BUILD',
      title: 'Make the plan real.',
      lines: [
        ...(frame.sequence.length
          ? frame.sequence.map((m) => D(`${m.label} — ${m.title} (typically ${m.duration})`))
          : [U('No stage could be selected.')]),
        ...[...new Set(frame.sequence.flatMap((m) => m.outputs))].map((o) => D(`Deliverable — ${o}`)),
        U('Scope, budget and internal capacity. None of these is known here.'),
      ],
    },
    {
      label: 'CONNECT',
      title: 'Bring the right minds into the room.',
      lines: [
        ...(disciplines.length
          ? disciplines.map((d) => D(d))
          : [U('No discipline mapped to the areas above.')]),
        ...frame.capabilities.slice(0, 8).map((c) => D(`Capability — ${c}`)),
        U('Who is available, at what cost, and on what timeline.'),
        F('Specific people, partners and venues are not named by this product.'),
      ],
    },
    {
      label: 'SCALE',
      title: "Keep what works. Improve what doesn't.",
      lines: [
        R('Start at AUDIT. Nothing above has been established, so nothing below it can be committed to.'),
        ...frame.questions.map((q) => R(`Ask — ${q}`)),
        ...reading.openQuestions.map((q) => U(q)),
        U('What success would be measured by, and whether that measure is trusted today.'),
        R('Take this brief to a conversation. Every gap is a thing to bring, not a thing to answer in advance.'),
      ],
    },
  ];
}

/** Counts per provenance, for the honest proportions line on screen. */
export function tally(stages: ReportStage[]): Record<string, number> {
  const out: Record<string, number> = { FACT: 0, DERIVED: 0, UNKNOWN: 0, RECOMMENDATION: 0 };
  for (const s of stages) for (const l of s.lines) out[l.p] += 1;
  return out;
}
