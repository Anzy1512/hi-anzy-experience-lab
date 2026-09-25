import {
  estimateTokens,
  renderPrompt,
  type CallableClass,
  type JsonSchema,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
} from './types.ts';

/**
 * PROVIDERS THAT NEED NO KEY, NO NETWORK AND NO MONEY.
 *
 * ── WHY THERE ARE TWO, AND WHY NEITHER IS A DEFAULT ─────────────────────────
 *
 * `EchoProvider` answers by quoting the evidence it was handed and nothing
 * else. It is a real, useful, offline synthesiser for development, and it makes
 * the whole pipeline runnable with no account — but it is a stub, so the router
 * will never select it silently. A system that quietly substitutes a stub for a
 * model is a system that reports findings nobody generated.
 *
 * `ScriptedProvider` returns exactly what a test tells it to, including answers
 * that cite nothing, invent a fact, or ignore the schema. That is the point:
 * the citation enforcement and the hallucination gate can only be tested by a
 * model that actually misbehaves, and asking a real one to misbehave on cue is
 * neither reliable nor cheap.
 */

const FIRST_SENTENCE = /^[\s\S]{1,400}?(?:[.!?](?:\s|$)|$)/;

export class EchoProvider implements ModelProvider {
  readonly name = 'echo';
  readonly available = true;
  readonly unavailableReason = null;

  modelFor(cls: CallableClass): string {
    return `echo-${cls === 'SMALL_MODEL' ? 'small' : 'reasoning'}`;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const started = performance.now();
    const prompt = renderPrompt(req);

    const text =
      req.evidence.length === 0
        ? 'There is no evidence in the request, so there is nothing to report.'
        : req.evidence
            .map((b) => `${(FIRST_SENTENCE.exec(b.text.trim())?.[0] ?? b.text).trim()} [${b.id}]`)
            .join(' ');

    const parsed = req.schema === undefined ? null : fillFromEvidence(req.schema, req, text);

    return {
      ok: true,
      provider: this.name,
      model: this.modelFor(req.modelClass),
      text,
      parsed,
      tokensIn: estimateTokens(req.system + prompt),
      tokensOut: estimateTokens(text),
      tokensEstimated: true,
      costMicros: 0,
      durationMs: Math.round(performance.now() - started),
      error: null,
    };
  }
}

export interface ScriptedTurn {
  /** Raw text the "model" returns. */
  text?: string;
  /** Structured answer, when the request carried a schema. */
  parsed?: unknown;
  /** Set to fail the call outright, the way a provider outage does. */
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** Null stands for an unpriced model, which the run must report as UNKNOWN. */
  costMicros?: number | null;
}

export class ScriptedProvider implements ModelProvider {
  readonly name = 'scripted';
  readonly available = true;
  readonly unavailableReason = null;

  /** Every call made, so a test can assert what was sent as well as received. */
  readonly calls: ModelRequest[] = [];
  private readonly turns: ScriptedTurn[];
  private index = 0;

  constructor(turns: ScriptedTurn[]) {
    this.turns = turns;
  }

  modelFor(cls: CallableClass): string {
    return `scripted-${cls === 'SMALL_MODEL' ? 'small' : 'reasoning'}`;
  }

  /** What the provider was actually sent, rendered exactly as a real one sees it. */
  lastPrompt(): string | null {
    const last = this.calls[this.calls.length - 1];
    return last === undefined ? null : renderPrompt(last);
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.calls.push(req);
    const turn = this.turns[this.index++];
    const base = {
      provider: this.name,
      model: this.modelFor(req.modelClass),
      tokensIn: turn?.tokensIn ?? estimateTokens(renderPrompt(req)),
      tokensOut: turn?.tokensOut ?? estimateTokens(turn?.text ?? ''),
      tokensEstimated: true,
      costMicros: turn?.costMicros === undefined ? 0 : turn.costMicros,
      durationMs: 0,
    };

    if (turn === undefined) {
      return { ...base, ok: false, text: '', parsed: null, error: 'the script ran out of turns' };
    }
    if (turn.error !== undefined) {
      return { ...base, ok: false, text: '', parsed: null, error: turn.error };
    }
    return {
      ...base,
      ok: true,
      text: turn.text ?? '',
      parsed: turn.parsed ?? null,
      error: null,
    };
  }
}

/**
 * A provider that exists only to say why there is no provider.
 *
 * Returned by the router when no key is configured. It is not an error state —
 * the deterministic half of the engine runs perfectly without a model — so it
 * has to be representable rather than thrown.
 */
export class UnavailableProvider implements ModelProvider {
  readonly name = 'none';
  readonly available = false;
  readonly unavailableReason: string;

  constructor(reason: string) {
    this.unavailableReason = reason;
  }

  modelFor(): string {
    return 'none';
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    return {
      ok: false,
      provider: this.name,
      model: 'none',
      text: '',
      parsed: null,
      tokensIn: 0,
      tokensOut: 0,
      tokensEstimated: false,
      costMicros: null,
      durationMs: 0,
      error: `${this.unavailableReason} (purpose was: ${req.purpose})`,
    };
  }
}

/**
 * Build an object that satisfies the schema using only what is in the request.
 *
 * Every string is a quotation, every list is a list of evidence ids, every
 * count is a count of evidence. Nothing is invented, so the echo provider can
 * be run against the same citation enforcement as a real model and pass it.
 */
function fillFromEvidence(schema: JsonSchema, req: ModelRequest, text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ids = req.evidence.map((b) => b.id);

  for (const [key, raw] of Object.entries(schema.properties)) {
    const spec = raw as { type?: string; items?: { type?: string } };
    switch (spec.type) {
      case 'array':
        out[key] = spec.items?.type === 'string' ? ids : [];
        break;
      case 'number':
      case 'integer':
        out[key] = req.evidence.length;
        break;
      case 'boolean':
        out[key] = false;
        break;
      default:
        out[key] = /citation|source|evidence/i.test(key) ? ids.join(', ') : text;
    }
  }
  return out;
}
