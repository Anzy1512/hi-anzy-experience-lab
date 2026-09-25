/**
 * KNOWING WHEN TO STOP LOOKING.
 *
 * ── SATURATION IS A MEASUREMENT, NOT A FEELING ──────────────────────────────
 *
 * A research loop needs a stopping rule that is not "the budget ran out", or
 * every job costs its full allowance whether or not there was anything left to
 * find. The rule here is boring and checkable: count what each turn ADDED —
 * new observations, new entities, new findings — and stop when consecutive
 * turns add nothing.
 *
 * ── WHY IT COUNTS ADDITIONS AND NOT SIMILARITY ──────────────────────────────
 *
 * The tempting version compares each new page against what is already held and
 * stops when they look alike. That needs a similarity threshold nobody can
 * justify, and it fails in the expensive direction: two pages about different
 * businesses in the same trade look extremely alike. Counting what actually
 * reached the store cannot be fooled that way, because a page that produced a
 * new observation produced one whatever it looked like.
 *
 * ── AND STOPPING IS REPORTED, NOT HIDDEN ────────────────────────────────────
 *
 * `SATURATED` is a distinct termination from `COMPLETE` and from
 * `BUDGET_EXHAUSTED`. "It stopped because two more attempts found nothing new"
 * is a different fact about the world from "it stopped because you capped it at
 * twenty pages", and a job that reports them as the same thing is lying about
 * how much is out there.
 */

export interface Turn {
  newObservations: number;
  newEntities: number;
  newFindings: number;
  /** A failed attempt is not evidence of saturation; it is evidence of failure. */
  ok: boolean;
  /**
   * Could this turn have added anything at all?
   *
   * Reads cannot. Looking in the index, listing known entities or asking a
   * provider for URLs all return zero new observations by construction, and
   * counting them as barren turns makes a researcher declare saturation before
   * it has fetched a single page — which is what happened the first time this
   * ran. Only acquisition can be evidence that there is nothing left to
   * acquire.
   */
  acquisitive: boolean;
}

export interface SaturationState {
  turns: Turn[];
  /** Consecutive productive-but-empty turns. */
  barren: number;
}

export interface SaturationVerdict {
  saturated: boolean;
  /** A sentence for the job's limitations, or null while it is still learning. */
  reason: string | null;
  totalAdded: number;
}

export class Saturation {
  readonly state: SaturationState = { turns: [], barren: 0 };

  /**
   * How many consecutive empty turns before stopping.
   *
   * Two, not one. A single empty turn is ordinary: a stockist page that names
   * only businesses already known adds nothing and the next page is where the
   * new one is. Two in a row is a pattern. Higher than two buys very little and
   * costs a page every time.
   */
  constructor(private readonly patience = 2) {}

  record(turn: Turn): void {
    this.state.turns.push(turn);
    if (!turn.acquisitive) return;
    if (!turn.ok) {
      /* A refusal or an error says nothing about whether more exists. It does
         not count towards saturation in either direction. */
      return;
    }
    const added = turn.newObservations + turn.newEntities + turn.newFindings;
    if (added === 0) this.state.barren += 1;
    else this.state.barren = 0;
  }

  verdict(): SaturationVerdict {
    const attempts = this.state.turns.filter((t) => t.acquisitive).length;
    const totalAdded = this.state.turns.reduce(
      (n, t) => n + t.newObservations + t.newEntities + t.newFindings,
      0,
    );
    if (this.state.barren < this.patience) return { saturated: false, reason: null, totalAdded };

    return {
      saturated: true,
      reason:
        `Stopped after ${this.state.barren} consecutive attempts that added nothing new to the store, ` +
        `having added ${totalAdded} item(s) in ${attempts} attempt(s). ` +
        'That means this line of research stopped producing, not that nothing further exists.',
      totalAdded,
    };
  }
}

/**
 * The other stopping rule: a loop that keeps re-queueing the same work.
 *
 * The verifier can ask for more research, and more research can leave the
 * verifier unsatisfied again. That is a legitimate loop and it needs a bound
 * that is not a timeout — a timeout turns a logic error into a slow job. The
 * bound is per subject: the same entity may be sent back for more research a
 * fixed number of times, after which what is known about it is what there is.
 */
export class LoopControl {
  private readonly rounds = new Map<string, number>();

  constructor(private readonly maxRounds = 2) {}

  /** May this subject be researched again? */
  mayRepeat(subject: string): boolean {
    return (this.rounds.get(subject) ?? 0) < this.maxRounds;
  }

  record(subject: string): number {
    const n = (this.rounds.get(subject) ?? 0) + 1;
    this.rounds.set(subject, n);
    return n;
  }

  /** Subjects that hit the ceiling, for the job's limitations. */
  exhausted(): string[] {
    return [...this.rounds.entries()].filter(([, n]) => n >= this.maxRounds).map(([k]) => k);
  }
}
