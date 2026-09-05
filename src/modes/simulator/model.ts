import {
  AXIS_LABEL,
  CLUSTERS,
  QUESTIONS,
  type Axis,
  type Cluster,
  type Weights,
} from '../../content/simulator';

/**
 * THE SIMULATION.
 *
 * Fixed rules over a small set of axes. **This is deterministic logic and is
 * labelled as such everywhere it surfaces** — it is not machine intelligence,
 * it does not learn, and calling conditional arithmetic "AI" would be the exact
 * kind of claim this project refuses to make.
 *
 * What it does do is real: the same brief always produces the same system, and
 * materially different briefs produce materially different systems, because the
 * axes actually disagree with each other. Weak or contradictory signals surface
 * as open questions rather than being smoothed away, which is the honest
 * behaviour for a model that has only been told five things.
 */

export type Answers = Record<string, string>;

export interface Scored {
  cluster: Cluster;
  score: number;
  /** LEAD / SUPPORTING / WATCH — how strongly the model is pointing here. */
  band: 'lead' | 'supporting' | 'watch';
}

export interface SystemReading {
  axes: Record<Axis, number>;
  /** Axes ordered strongest-first, for the priority reading. */
  priorities: Array<{ axis: Axis; label: string; value: number }>;
  clusters: Scored[];
  /** Dependency edges among the selected clusters. */
  dependencies: Array<{ from: string; to: string }>;
  /** A possible order of work, derived from the dependency graph. */
  sequence: string[][];
  openQuestions: string[];
  /** Living World districts this reading touches. */
  districts: string[];
}

const AXES: Axis[] = [
  'ambiguity',
  'urgency',
  'identity',
  'infrastructure',
  'reach',
  'presence',
  'proof',
];

function addWeights(target: Record<Axis, number>, w: Weights) {
  for (const k of Object.keys(w) as Axis[]) target[k] += w[k] ?? 0;
}

export function emptyAxes(): Record<Axis, number> {
  return AXES.reduce<Record<Axis, number>>(
    (acc, a) => {
      acc[a] = 0;
      return acc;
    },
    {} as Record<Axis, number>,
  );
}

export function run(answers: Answers): SystemReading {
  const axes = emptyAxes();

  for (const q of QUESTIONS) {
    const chosen = q.options.find((o) => o.id === answers[q.id]);
    if (chosen) addWeights(axes, chosen.weights);
  }

  /*
   * Every axis is now a straight demand signal: higher means more of that thing
   * is needed. `ambiguity` included — a high score means the problem has not
   * been named yet, which is precisely when STRATEGY leads.
   */
  const scored: Scored[] = CLUSTERS.map((cluster) => {
    let score = 0;
    for (const a of AXES) {
      const affinity = cluster.affinity[a] ?? 0;
      if (affinity === 0) continue;
      score += affinity * axes[a];
    }
    return { cluster, score, band: 'watch' as const };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0]?.score ?? 1;
  const banded: Scored[] = scored
    .filter((s) => s.score > 0)
    .map((s): Scored => ({
      ...s,
      band: s.score >= top * 0.72 ? 'lead' : s.score >= top * 0.4 ? 'supporting' : 'watch',
    }))
    .slice(0, 6);

  const chosenIds = new Set(banded.map((s) => s.cluster.id));

  // Dependencies are only interesting between clusters that are both in play.
  const dependencies: Array<{ from: string; to: string }> = [];
  for (const s of banded) {
    for (const need of s.cluster.needs) {
      if (chosenIds.has(need)) dependencies.push({ from: need, to: s.cluster.id });
    }
  }

  // A possible order: repeatedly take everything whose dependencies are met.
  const sequence: string[][] = [];
  const placed = new Set<string>();
  let guard = 0;
  while (placed.size < banded.length && guard++ < 10) {
    const wave = banded
      .filter((s) => !placed.has(s.cluster.id))
      .filter((s) => s.cluster.needs.every((n) => !chosenIds.has(n) || placed.has(n)))
      .map((s) => s.cluster.id);
    if (wave.length === 0) break;
    wave.forEach((id) => placed.add(id));
    sequence.push(wave);
  }
  // Anything left is circular; say so rather than inventing an order.
  const leftover = banded.filter((s) => !placed.has(s.cluster.id)).map((s) => s.cluster.id);
  if (leftover.length) sequence.push(leftover);

  const priorities = AXES.map((axis) => ({ axis, label: AXIS_LABEL[axis], value: axes[axis] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  /* ---- open questions: where the model knows it is guessing --------------- */
  const openQuestions: string[] = [];
  if (axes.ambiguity >= 5) {
    openQuestions.push(
      'The problem is not yet named. The first work is agreeing what it actually is.',
    );
  }
  if (axes.urgency >= 3 && axes.infrastructure >= 3) {
    openQuestions.push(
      'A fixed date and a systems rebuild are pulling against each other. Which one is genuinely immovable?',
    );
  }
  if (axes.proof >= 3 && axes.reach >= 3) {
    openQuestions.push(
      'Reach before evidence tends to amplify the doubt. Is there anything to point at yet?',
    );
  }
  if (axes.presence >= 3 && axes.infrastructure <= 0) {
    openQuestions.push(
      'Rooms full of people produce demand the current systems may not be able to absorb.',
    );
  }
  if (banded.length && banded[0].score < 4) {
    openQuestions.push(
      'The signals here are weak. This reading needs a conversation before it means much.',
    );
  }
  if (openQuestions.length === 0) {
    openQuestions.push('What would have to be true in six months for this to have been worth it?');
  }

  const districts = [...new Set(banded.map((s) => s.cluster.district).filter(Boolean))] as string[];

  return { axes, priorities, clusters: banded, dependencies, sequence, openQuestions, districts };
}

/** Every fragment word currently on the table, in answer order. */
export function fragmentsFor(answers: Answers): Array<{ id: string; word: string; qid: string }> {
  const out: Array<{ id: string; word: string; qid: string }> = [];
  for (const q of QUESTIONS) {
    const chosen = q.options.find((o) => o.id === answers[q.id]);
    if (!chosen) continue;
    chosen.fragments.forEach((word, i) => {
      out.push({ id: `${q.id}-${chosen.id}-${i}`, word, qid: q.id });
    });
  }
  return out;
}
