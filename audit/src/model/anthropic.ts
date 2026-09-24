import { config, modelPrices } from '../config.ts';
import {
  priceOf,
  renderPrompt,
  type CallableClass,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
} from './types.ts';

/**
 * THE MESSAGES API, OVER FETCH.
 *
 * ── WHY NO SDK ──────────────────────────────────────────────────────────────
 *
 * The surface used here is one POST with three headers. An SDK would add a
 * dependency tree to this service in exchange for retry logic that the crawl
 * layer already has its own version of, and streaming that a batch research
 * engine does not want. The rule in this repository is that a dependency needs
 * a stated purpose; "it is the official one" is not a purpose when the whole
 * integration is forty lines.
 *
 * ── HOW STRUCTURED OUTPUT IS ENFORCED ───────────────────────────────────────
 *
 * Through a tool. The schema is declared as a tool's `input_schema` and
 * `tool_choice` forces it, so the answer arrives as a validated object rather
 * than as prose that has to be parsed back into one. Asking for JSON in the
 * prompt and hoping is the version of this that fails silently at 3am on a
 * page with an unescaped quote in it.
 *
 * ── AND WHAT IS NOT SENT ────────────────────────────────────────────────────
 *
 * No API key ever reaches a log line, no crawled page reaches the system
 * prompt, and no tool the model could call back into this service is declared.
 * The only tool is the answer shape.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';
const ANSWER_TOOL = 'record_answer';

interface MessagesResponse {
  content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
  error?: { type?: string; message?: string };
}

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly available: boolean;
  readonly unavailableReason: string | null;
  private readonly key: string | undefined;

  constructor(key: string | undefined = config.ANTHROPIC_API_KEY) {
    this.key = key;
    this.available = key !== undefined && key.length > 0;
    this.unavailableReason = this.available ? null : 'ANTHROPIC_API_KEY is not set';
  }

  modelFor(cls: CallableClass): string {
    return cls === 'SMALL_MODEL' ? config.MODEL_SMALL : config.MODEL_REASONING;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const model = this.modelFor(req.modelClass);
    const started = performance.now();
    const fail = (error: string, tokensIn = 0, tokensOut = 0): ModelResponse => ({
      ok: false,
      provider: this.name,
      model,
      text: '',
      parsed: null,
      tokensIn,
      tokensOut,
      tokensEstimated: false,
      costMicros: priceOf(modelPrices, model, tokensIn, tokensOut),
      durationMs: Math.round(performance.now() - started),
      error,
    });

    if (this.key === undefined) return fail('ANTHROPIC_API_KEY is not set');

    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: renderPrompt(req) }],
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.schema !== undefined
        ? {
            tools: [
              {
                name: ANSWER_TOOL,
                description: 'Record the answer. This is the only way to answer.',
                input_schema: req.schema,
              },
            ],
            tool_choice: { type: 'tool', name: ANSWER_TOOL },
          }
        : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.MODEL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': VERSION,
          'x-api-key': this.key,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      /* The message is reported, never the request — the body carries evidence
         and the headers carry the key. */
      return fail(err instanceof Error ? `request failed: ${err.message}` : 'request failed');
    } finally {
      clearTimeout(timer);
    }

    let json: MessagesResponse;
    try {
      json = (await res.json()) as MessagesResponse;
    } catch {
      return fail(`HTTP ${res.status} with a body that is not JSON`);
    }

    const tokensIn = json.usage?.input_tokens ?? 0;
    const tokensOut = json.usage?.output_tokens ?? 0;

    if (!res.ok) {
      return fail(`HTTP ${res.status}: ${json.error?.type ?? 'error'} ${json.error?.message ?? ''}`.trim(), tokensIn, tokensOut);
    }

    const parts = json.content ?? [];
    const text = parts
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('\n')
      .trim();
    const toolUse = parts.find((p) => p.type === 'tool_use' && p.name === ANSWER_TOOL);

    if (req.schema !== undefined && toolUse === undefined) {
      /* Forced tool use that produced no tool call is a real failure, most
         often a truncated response. Reported rather than salvaged, because
         salvaging it means parsing prose into the shape that was supposed to
         guarantee the shape. */
      return fail(`no structured answer returned (stop_reason: ${json.stop_reason ?? 'unknown'})`, tokensIn, tokensOut);
    }

    return {
      ok: true,
      provider: this.name,
      model,
      text,
      parsed: toolUse?.input ?? null,
      tokensIn,
      tokensOut,
      tokensEstimated: false,
      costMicros: priceOf(modelPrices, model, tokensIn, tokensOut),
      durationMs: Math.round(performance.now() - started),
      error: null,
    };
  }
}
