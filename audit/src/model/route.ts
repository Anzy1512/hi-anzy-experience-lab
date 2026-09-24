import { config } from '../config.ts';
import type { ModelClass, PlanStep } from '../intel/contract.ts';
import { AnthropicProvider } from './anthropic.ts';
import { UnavailableProvider } from './local.ts';
import type { ModelProvider } from './types.ts';

/**
 * WHICH TIER OF COMPUTE, AND WHY THAT ONE.
 *
 * ── ROUTING IS A COST DECISION THAT LOOKS LIKE A QUALITY DECISION ───────────
 *
 * Every task can be sent to the largest model, and every output will look
 * fine. The difference shows up only on the invoice, which is why routing has
 * to be a rule with a written reason rather than a judgement made per call.
 *
 * The rule: the plan states the tier the task was designed for, and this
 * function may move it DOWN freely and UP only for a stated, checkable
 * condition — contradictory evidence, or more material than a small model can
 * hold. Both are properties of the input, so the same request routes the same
 * way twice, which is what makes a cost regression findable afterwards.
 */

/** Above this much evidence, a small model is being asked to hold too much. */
const ESCALATE_TOKENS = 6_000;
/** Below this, a reasoning model is being paid for nothing. */
const DOWNGRADE_TOKENS = 800;

export interface RoutingContext {
  /** Tokens of evidence the step will be given. */
  evidenceTokens: number;
  /** Claims in the evidence that disagree with each other. */
  conflicts: number;
  /** Entities the step must hold at once. */
  subjects: number;
}

export interface Route {
  modelClass: ModelClass;
  /** Recorded on `model_call.purpose` alongside the step's own description. */
  reason: string;
  changed: boolean;
}

export function routeFor(step: PlanStep, ctx: RoutingContext): Route {
  const declared = step.modelClass;
  if (declared === 'NO_MODEL') {
    return { modelClass: 'NO_MODEL', reason: 'the step is answerable without a model', changed: false };
  }

  if (declared === 'SMALL_MODEL') {
    if (ctx.conflicts > 0) {
      return {
        modelClass: 'REASONING_MODEL',
        reason: `${ctx.conflicts} contradictory claim(s) in the evidence — resolving which source to believe is the reasoning case`,
        changed: true,
      };
    }
    if (ctx.evidenceTokens > ESCALATE_TOKENS) {
      return {
        modelClass: 'REASONING_MODEL',
        reason: `${ctx.evidenceTokens} tokens of evidence exceeds the ${ESCALATE_TOKENS}-token small-model budget`,
        changed: true,
      };
    }
    return { modelClass: 'SMALL_MODEL', reason: 'as planned; no escalation condition met', changed: false };
  }

  /* REASONING_MODEL, which is allowed to come down. */
  if (ctx.conflicts === 0 && ctx.subjects <= 1 && ctx.evidenceTokens < DOWNGRADE_TOKENS) {
    return {
      modelClass: 'SMALL_MODEL',
      reason: `one subject, no conflicts and only ${ctx.evidenceTokens} tokens of evidence — the reasoning tier would be paid for nothing`,
      changed: true,
    };
  }
  return { modelClass: 'REASONING_MODEL', reason: 'as planned', changed: false };
}

/**
 * The provider this deployment actually has.
 *
 * There is deliberately no fallback to the offline echo provider. A stub that
 * stands in for a model without saying so produces findings attributed to
 * reasoning that never happened — the router returns something that reports
 * its own absence instead, and the engine plans around it.
 */
export function createProvider(): ModelProvider {
  const anthropic = new AnthropicProvider();
  if (anthropic.available) return anthropic;
  return new UnavailableProvider(
    `no model provider is configured (${anthropic.unavailableReason ?? 'unknown reason'}). ` +
      'Deterministic findings are unaffected; synthesis will be reported as not performed.',
  );
}

/** For the run header: what a caller can expect before spending anything. */
export function providerSummary(p: ModelProvider): string {
  if (!p.available) return `MODEL — UNAVAILABLE (${p.unavailableReason ?? 'no reason given'})`;
  return `MODEL — ${p.name}: ${p.modelFor('SMALL_MODEL')} / ${p.modelFor('REASONING_MODEL')}, timeout ${config.MODEL_TIMEOUT_MS}ms`;
}
