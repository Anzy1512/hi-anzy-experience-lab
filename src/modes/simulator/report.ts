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

/**
 * The visitor's constraint choices, carrying the question they answered.
 *
 * These used to read `AUDIT: AN IDEA` — a stage name, a colon, and a label
 * lifted out of the only context that gave it meaning. Somebody handed the
 * finished brief has no way to know what question "AN IDEA" was the answer to,
 * and it is the first thing in the document they meet. The prompt costs a line
 * and makes every one of them legible.
 */
export function chosenLabels(answers: Answers): string[] {
  const out: string[] = [];
  for (const q of QUESTIONS) {
    const chosen = q.options.find((o) => o.id === answers[q.id]);
    if (chosen) out.push(`${q.prompt} — ${chosen.label}`);
  }
  return out;
}

export function buildRun(
  frame: Frame,
  reading: SystemReading,
  answers: Answers,
): ReportStage[] {
  const constraints = chosenLabels(answers);

  /*
   * Disciplines are named as kinds, never as people. `NETWORK_CAPABILITIES` is
   * a taxonomy; the roster it belongs to lives on the commercial backend and is
   * deliberately not in this product.
   *
   * ── TWO TAXONOMIES, AND NO BRIDGE BETWEEN THEM ──────────────────────────
   *
   * This lookup silently produced almost nothing and nobody noticed, because
   * the failure printed as a plausible sentence. `frame.areas` are DIAGNOSTIC
   * areas — Business, Customer, Sales, Data, Operations — and
   * `NETWORK_CAPABILITIES` is keyed by NETWORK DISCIPLINES — Strategy, Design,
   * Performance, Media, Production. They overlap on exactly three names, so a
   * problem about checkout and reporting matched none of them and the brief
   * said "no discipline mapped" as though that were a finding about the
   * company rather than a key mismatch.
   *
   * Building a bridge would mean asserting that Hi Anzy routes customer
   * problems to Design, which is a claim about how the company works and not
   * one this product is in a position to make. So the honest version is the one
   * below: report the overlap where it genuinely exists, and where it does not,
   * say precisely why rather than implying the network is empty.
   */
  const disciplines = frame.areas
    .filter((a) => NETWORK_CAPABILITIES[a]?.length)
    .map((a) => `${a} — ${NETWORK_CAPABILITIES[a].join(', ')}`);

  /* Groups with nothing in them are dropped rather than printed as a heading
     over a blank — a hollow heading reads as a broken document, and a stage
     that genuinely has nothing for a block is better off not claiming it. */
  const g = (head: string, lines: ReportLine[], note?: string) =>
    lines.length ? [{ head, note, lines }] : [];

  /*
   * Deliverables are named once, in BUILD.
   *
   * They used to appear twice in the exported document — as LIKELY OUTPUTS near
   * the top and again as twelve "Deliverable —" lines in BUILD — which is the
   * single largest reason the brief read as padded.
   */
  const deliverables = [...new Set(frame.sequence.flatMap((m) => m.outputs))];

  /*
   * The build order the dependency graph actually implies.
   *
   * `reading.sequence` has been computed since the constraint model was written
   * and was never printed: BUILD opened instead with the four method stages
   * restated, which a reader has already seen under RECOMMENDED SEQUENCE. Waves
   * are the one thing in this document that answers "what do I do first".
   */
  const waves = reading.sequence
    .filter((w) => w.length)
    .map((w, i) => D(`Wave ${i + 1} — ${w.join(', ')}`));

  return [
    {
      label: 'AUDIT',
      title: "See what's really happening.",
      groups: [
        ...g('THE SITUATION, AS STATED', [F(`“${frame.statement}”`)]),
        ...g(
          'WHAT YOU TOLD US',
          constraints.map((c) => F(c)),
          'Your own choices, in the words they were offered in. Facts about this brief, not findings about the business.',
        ),
        ...g(
          'WHAT THE WORDS POINT AT',
          frame.areas.map((a) =>
            D(`${a} — selected by the word${frame.matched[a].length > 1 ? 's' : ''} ${frame.matched[a].join(', ')}`),
          ),
          'Matched term by term, so the reading can be checked rather than trusted.',
        ),
        /*
         * Promoted out of SCALE.
         *
         * These are the only lines in the document produced by noticing that
         * two of the visitor's own answers disagree, and they were printed
         * two thirds of the way down the last stage among a dozen others.
         * A contradiction the reader has not spotted themselves is the most
         * valuable thing a first conversation can offer.
         */
        ...g(
          'TENSIONS IN WHAT YOU SAID',
          reading.openQuestions.map((q) => U(q)),
          'Not errors. Two things you said that pull against each other, and which somebody has to decide between.',
        ),
        ...g(
          'NOT ESTABLISHED',
          [
            ...frame.evidence.map((e) => U(e)),
            U('Whether the stated problem is the cause or a symptom of another one.'),
          ],
          'What an audit would go and find. Nothing here has been assumed either way.',
        ),
      ],
    },
    {
      label: 'ARCHITECT',
      title: 'Turn the mess into a map.',
      groups: [
        ...g(
          'WHAT IS PULLING HARDEST',
          reading.priorities.map((p) => D(`${p.label} — weighted ${p.value} by your answers`)),
          'Derived from the five choices, strongest first. A weight is a count of how often your answers touched that axis, not a score of the business.',
        ),
        ...g(
          'THE SYSTEM THIS IMPLIES',
          frame.services.map((sv) => D(`${sv.title} — ${sv.copy}`)),
          'Hi Anzy’s own service categories, selected by the areas above.',
        ),
        ...g(
          'WHAT LEADS',
          reading.clusters.filter((c) => c.band === 'lead').map((c) => D(c.cluster.name)),
          'The capability clusters carrying the most weight. Everything else supports these.',
        ),
        ...g(
          'ORDER FORCED BY DEPENDENCY',
          reading.dependencies.length
            ? reading.dependencies.map((d) => D(`${d.from} must be in place before ${d.to}`))
            : [U('No dependency between the selected areas could be derived from five answers.')],
        ),
      ],
    },
    {
      label: 'BUILD',
      title: 'Make the plan real.',
      groups: [
        ...g(
          'BUILD ORDER',
          waves.length ? waves : [U('No order could be derived from the selected areas.')],
          'Each wave can run in parallel. A wave cannot start until the one above it is in place.',
        ),
        ...g(
          'WHAT COMES OUT',
          deliverables.map((o) => D(o)),
          'The outputs of the stages this problem runs through.',
        ),
        ...g('WHO OWNS IT', [
          U('Who inside the business owns this problem, and what they are able to change.'),
          U('Scope, budget and internal capacity. None of these is known here.'),
        ]),
      ],
    },
    {
      label: 'CONNECT',
      title: 'Bring the right minds into the room.',
      groups: [
        /*
         * One answer, not two.
         *
         * This block used to print "UNKNOWN — No discipline mapped to the areas
         * above" and then immediately list eight mapped capabilities, which
         * reads as a broken document. The disciplines and the capabilities are
         * two views of the same mapping, so the fallback belongs to the pair.
         */
        ...g(
          'DISCIPLINES THESE AREAS NEED',
          disciplines.length
            ? disciplines.map((d) => D(d))
            : [
                U(
                  `Hi Anzy’s network is organised by discipline — Strategy, Design, Technology, Production and the rest — and this problem was read into diagnostic areas: ${frame.areas.join(', ')}. Those are two different taxonomies, and this product does not claim to map one onto the other. Which disciplines carry this is a question for the conversation.`,
                ),
              ],
        ),
        ...g(
          'CAPABILITIES REQUIRED',
          frame.capabilities.slice(0, 8).map((c) => D(c)),
        ),
        ...g('NOT NAMED HERE', [
          F('Specific people, partners and venues are not named by this product.'),
          U('Who is available, at what cost, and on what timeline.'),
        ]),
      ],
    },
    {
      label: 'SCALE',
      title: "Keep what works. Improve what doesn't.",
      groups: [
        ...g('WHAT SHOULD NOT SCALE YET', [
          R('All of it. Nothing above has been established, so nothing below AUDIT can be committed to.'),
        ]),
        ...g('WHAT WOULD HAVE TO BE MEASURED', [
          U('What success would be measured by, and whether that measure is trusted today.'),
          U('Whether the numbers the business already has are believed by the people who act on them.'),
        ]),
        ...g(
          'QUESTIONS TO TAKE INTO THE ROOM',
          frame.questions.map((q) => R(q)),
          'Bring these rather than answering them here.',
        ),
        ...g('THE NEXT ACTION', [
          R('Take this brief to a conversation. Every gap in it is a thing to bring, not a thing to answer in advance.'),
        ]),
      ],
    },
  ];
}

/** Counts per provenance, for the honest proportions line on screen. */
export function tally(stages: ReportStage[]): Record<string, number> {
  const out: Record<string, number> = { FACT: 0, DERIVED: 0, UNKNOWN: 0, RECOMMENDATION: 0 };
  for (const s of stages) for (const grp of s.groups) for (const l of grp.lines) out[l.p] += 1;
  return out;
}
