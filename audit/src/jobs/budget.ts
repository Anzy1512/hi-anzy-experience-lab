import type { IntelligenceRequest } from '../intel/contract.ts';

/**
 * WHAT THE JOB IS ALLOWED TO SPEND, ENFORCED BEFORE IT SPENDS IT.
 *
 * ── REFUSING IS CHEAPER THAN REGRETTING ─────────────────────────────────────
 *
 * The budget is checked before a tool runs, not tallied after. That ordering is
 * the whole point: a ledger that only records what happened tells you about the
 * bill after you have it. `canAfford` is the gate, `spend` is the record, and a
 * tool with no declared cost cannot be admitted to the registry at all.
 *
 * ── EVERY LIMIT IS THE CALLER'S ─────────────────────────────────────────────
 *
 * All of these come from the IntelligenceRequest, which is to say from whoever
 * asked. Nothing here has a default hidden in configuration, because "it
 * stopped because it hit the budget you set" is a far better answer than a
 * surprise — and a research engine that decides its own spending limit is one
 * nobody can safely point at the open web.
 *
 * ── AND TIME IS A BUDGET ────────────────────────────────────────────────────
 *
 * `maxSeconds` is enforced the same way as money. A job that runs for an hour
 * because each individual step was affordable is a job that failed, whatever
 * its ledger says.
 */

export type Resource = 'modelCalls' | 'tokens' | 'searches' | 'pages' | 'tasks' | 'seconds' | 'cost';

export interface Ledger {
  modelCalls: number;
  tokensIn: number;
  tokensOut: number;
  /** Null once any unpriced model has been used. Never silently zero. */
  costMicros: number | null;
  searches: number;
  pagesCrawled: number;
  toolCalls: number;
  tasks: number;
  iterations: number;
}

export interface Refusal {
  resource: Resource;
  used: number;
  limit: number;
  /**
   * True when the limit was zero — the caller excluded this entirely.
   *
   * "You allowed five pages and I wanted ten" and "you allowed none and I
   * fetched none" are different facts, and collapsing them makes a run that did
   * exactly what it was told report itself as having stopped short.
   */
  deliberate: boolean;
  /** A sentence for the job's limitations list, not a log line. */
  reason: string;
}

/** What a tool says it will cost before it is allowed to run. */
export interface ToolCost {
  modelCalls?: number;
  searches?: number;
  pages?: number;
  /** An estimate only; the real figure is recorded after the call. */
  tokens?: number;
}

export class Budget {
  readonly limits: {
    modelCalls: number;
    tokens: number;
    searches: number;
    pages: number;
    costMicros: number;
    seconds: number;
    tasks: number;
    iterations: number;
  };

  readonly ledger: Ledger = {
    modelCalls: 0,
    tokensIn: 0,
    tokensOut: 0,
    costMicros: 0,
    searches: 0,
    pagesCrawled: 0,
    toolCalls: 0,
    tasks: 0,
    iterations: 0,
  };

  /** Every refusal, so the job can say what it did not do and why. */
  readonly refusals: Refusal[] = [];
  private readonly startedAt: number;

  constructor(request: IntelligenceRequest, opts: { maxTasks?: number; maxIterations?: number; now?: number } = {}) {
    this.startedAt = opts.now ?? Date.now();
    this.limits = {
      modelCalls: request.maxModelCalls,
      tokens: request.maxTokens,
      searches: request.maxSearches,
      pages: request.maxPages,
      /* 0 means unlimited here, because a caller who sets no price cap has not
         asked for one — unlike the other four, where 0 means "none allowed". */
      costMicros: request.maxCostMicros,
      seconds: request.maxSeconds,
      /*
       * Two limits the request does not carry, because they are about runaway
       * rather than about spend. A job that queues ten thousand tasks costs
       * nothing per task and is still broken.
       */
      tasks: opts.maxTasks ?? 200,
      iterations: opts.maxIterations ?? 50,
    };
  }

  get elapsedSeconds(): number {
    return (Date.now() - this.startedAt) / 1000;
  }

  /** The resource this budget has run out of, or null while it has room. */
  exhausted(): Refusal | null {
    if (this.elapsedSeconds >= this.limits.seconds) {
      return this.refuse('seconds', Math.round(this.elapsedSeconds), this.limits.seconds);
    }
    if (this.ledger.tasks >= this.limits.tasks) {
      return this.refuse('tasks', this.ledger.tasks, this.limits.tasks);
    }
    if (this.ledger.iterations >= this.limits.iterations) {
      return this.refuse('tasks', this.ledger.iterations, this.limits.iterations);
    }
    if (this.limits.costMicros > 0 && (this.ledger.costMicros ?? 0) >= this.limits.costMicros) {
      return this.refuse('cost', this.ledger.costMicros ?? 0, this.limits.costMicros);
    }
    return null;
  }

  /**
   * May this tool run?
   *
   * Returns the refusal rather than throwing, because a refusal is an ordinary
   * outcome that the orchestrator records and works around — a researcher that
   * cannot crawl any more pages should fall back to what is already indexed,
   * not abort the job.
   */
  canAfford(cost: ToolCost): Refusal | null {
    const stopped = this.exhausted();
    if (stopped !== null) return stopped;

    if ((cost.modelCalls ?? 0) > 0 && this.ledger.modelCalls + (cost.modelCalls ?? 0) > this.limits.modelCalls) {
      return this.refuse('modelCalls', this.ledger.modelCalls, this.limits.modelCalls);
    }
    if ((cost.searches ?? 0) > 0 && this.ledger.searches + (cost.searches ?? 0) > this.limits.searches) {
      return this.refuse('searches', this.ledger.searches, this.limits.searches);
    }
    if ((cost.pages ?? 0) > 0 && this.ledger.pagesCrawled + (cost.pages ?? 0) > this.limits.pages) {
      return this.refuse('pages', this.ledger.pagesCrawled, this.limits.pages);
    }
    if ((cost.tokens ?? 0) > 0 && this.ledger.tokensIn + this.ledger.tokensOut + (cost.tokens ?? 0) > this.limits.tokens) {
      return this.refuse('tokens', this.ledger.tokensIn + this.ledger.tokensOut, this.limits.tokens);
    }
    return null;
  }

  /** Record what actually happened. Always called, including after a failure. */
  spend(actual: Partial<Ledger> & { costMicros?: number | null }): void {
    this.ledger.modelCalls += actual.modelCalls ?? 0;
    this.ledger.tokensIn += actual.tokensIn ?? 0;
    this.ledger.tokensOut += actual.tokensOut ?? 0;
    this.ledger.searches += actual.searches ?? 0;
    this.ledger.pagesCrawled += actual.pagesCrawled ?? 0;
    this.ledger.toolCalls += actual.toolCalls ?? 0;
    this.ledger.tasks += actual.tasks ?? 0;
    this.ledger.iterations += actual.iterations ?? 0;

    /*
     * One unpriced call makes the total unknown, permanently.
     *
     * Adding zero for the unpriced part and reporting the rest would produce a
     * number that is precise, wrong and low — which is the most dangerous kind
     * of cost report there is.
     */
    if (actual.costMicros === null) this.ledger.costMicros = null;
    else if (this.ledger.costMicros !== null) this.ledger.costMicros += actual.costMicros ?? 0;
  }

  private refuse(resource: Resource, used: number, limit: number): Refusal {
    const deliberate = limit === 0;
    const r: Refusal = {
      resource,
      used,
      limit,
      deliberate,
      reason: deliberate
        ? `${resource} were not permitted by the request`
        : `stopped at the ${resource} budget: ${used} of ${limit} used`,
    };
    /* Deduplicated: the same wall hit forty times is one fact about the job. */
    if (!this.refusals.some((x) => x.resource === resource)) this.refusals.push(r);
    return r;
  }

  /** Refusals that actually cut the research short, as against ones asked for. */
  get curtailed(): Refusal[] {
    return this.refusals.filter((r) => !r.deliberate);
  }

  /** The sentences a job's `limitations` should carry because of this budget. */
  limitationLines(): string[] {
    return this.refusals.map((r) =>
      r.deliberate
        ? `No ${r.resource} were permitted by this request, so none were used. Anything only obtainable that way was not looked for.`
        : `Research stopped short on ${r.resource}: ${r.used} of a permitted ${r.limit}. ` +
          'Raising that limit would let it look further; it does not mean nothing more exists.',
    );
  }
}
