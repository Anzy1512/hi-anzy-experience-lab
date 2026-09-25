import type { Driver } from '../db/client.ts';
import type { EvidencePacket } from './evidence.ts';
import { itemById } from './evidence.ts';

/**
 * WHAT A FINDING IS, AND WHAT IT IS NOT ALLOWED TO BE.
 *
 * ── STATUS IS NOT CONFIDENCE ────────────────────────────────────────────────
 *
 * A single number cannot tell "a source states this" from "we inferred it" from
 * "two sources disagree" from "nothing supports it". Those need different
 * handling, not different weights: the first is quotable, the second must name
 * its inference, the third must show both sides, and the fourth must not be
 * shown at all. So the status is the type, and there is no confidence score to
 * launder an unsupported claim into a plausible-looking one.
 *
 * ── UNSUPPORTED IS A VALUE, NOT AN ERROR ────────────────────────────────────
 *
 * The pipeline can produce an unsupported finding — a model can write a
 * sentence nothing in the packet says. That row is created, stored and refused
 * rendering. Discarding it at the point of creation would make the hallucination
 * rate unmeasurable, which is the one number this system most needs to keep.
 *
 * ── AND A RECOMMENDATION IS NEVER A FINDING ─────────────────────────────────
 *
 * "No storefront was observed" is evidence. "Build a storefront" is advice. They
 * are separated at the type level and rendered in different sections, because a
 * reader who cannot tell which is which has no way to check either.
 */

export type FindingStatus = 'FACT' | 'DERIVED' | 'UNKNOWN' | 'UNSUPPORTED' | 'CONFLICTING' | 'RECOMMENDATION';
export type ReasoningType = 'RULE' | 'RETRIEVAL' | 'MODEL' | 'HUMAN';
export type Verification = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';

export interface Finding {
  /** Stable within a run, so the verifier can refer to one without an id round-trip. */
  key: string;
  entityId: string | null;
  /** A machine-readable type, e.g. ECOMMERCE_NOT_OBSERVED. Not prose. */
  findingType: string;
  /** The conclusion, plainly. This is the sentence a reader sees. */
  statement: string;
  status: FindingStatus;
  reasoningType: ReasoningType;
  ruleId: string | null;
  ruleVersion: string | null;
  modelUsed: string | null;
  /** Evidence ids from the packet. A FACT with none of these cannot exist. */
  citations: string[];
  /** For DERIVED: the step from evidence to conclusion, named. */
  inference: string | null;
  /** What this finding cannot tell you. Rarely empty and never decorative. */
  limitations: string;
  verification: Verification;
  verificationReason: string | null;
  /** Canonical diagnostic area, when the finding is about the business. */
  area: string | null;
  outcome: string | null;
}

interface Init {
  key: string;
  findingType: string;
  statement: string;
  entityId?: string | null;
  citations?: string[];
  limitations?: string;
  ruleId?: string | null;
  ruleVersion?: string | null;
  modelUsed?: string | null;
  inference?: string | null;
  area?: string | null;
  outcome?: string | null;
  reasoningType?: ReasoningType;
}

const base = (i: Init, status: FindingStatus, reasoning: ReasoningType): Finding => ({
  key: i.key,
  entityId: i.entityId ?? null,
  findingType: i.findingType,
  statement: i.statement,
  status,
  reasoningType: i.reasoningType ?? reasoning,
  ruleId: i.ruleId ?? null,
  ruleVersion: i.ruleVersion ?? null,
  modelUsed: i.modelUsed ?? null,
  citations: i.citations ?? [],
  inference: i.inference ?? null,
  limitations: i.limitations ?? '',
  verification: 'UNVERIFIED',
  verificationReason: null,
  area: i.area ?? null,
  outcome: i.outcome ?? null,
});

/** A source says so, and the citation proves it. */
export const fact = (i: Init): Finding => base(i, 'FACT', 'RULE');
/** Follows from the evidence by a named step. The step is not optional. */
export const derived = (i: Init & { inference: string }): Finding => base(i, 'DERIVED', 'RULE');
/** Nobody looked, or nothing was found. Reported rather than omitted. */
export const unknown = (i: Init): Finding => base(i, 'UNKNOWN', 'RULE');
/** Sources disagree. Both sides are cited; neither is picked. */
export const conflicting = (i: Init): Finding => base(i, 'CONFLICTING', 'RULE');
/** Produced, stored, and refused rendering. */
export const unsupported = (i: Init): Finding => base(i, 'UNSUPPORTED', 'MODEL');
/** Advice. Kept apart from everything above. */
export const recommendation = (i: Init): Finding => base(i, 'RECOMMENDATION', 'RULE');

/**
 * May this be shown?
 *
 * UNSUPPORTED never renders and REJECTED never renders, whatever else is true
 * of them. A FACT with no citations is a contradiction in terms and is treated
 * as unsupported here rather than trusted — the constructor cannot enforce it,
 * so the renderer does.
 */
export function renderable(f: Finding): boolean {
  if (f.status === 'UNSUPPORTED') return false;
  if (f.verification === 'REJECTED') return false;
  if ((f.status === 'FACT' || f.status === 'DERIVED' || f.status === 'CONFLICTING') && f.citations.length === 0) return false;
  return true;
}

/**
 * The plain conclusion, which is what the surface prints.
 *
 * No bracketed markers, no hedging adverbs, no confidence percentage. The
 * citations are not dropped — they are stored on every finding and served
 * beside it — but they do not clutter the sentence. That is the whole
 * arrangement: plain on the surface, complete in the record.
 */
export function plain(f: Finding): string {
  return f.statement.trim();
}

/** Findings grouped the way a reader needs them: evidence, then gaps, then advice. */
export function partitionFindings(findings: Finding[]): {
  established: Finding[];
  gaps: Finding[];
  conflicts: Finding[];
  recommendations: Finding[];
  withheld: Finding[];
} {
  const visible = findings.filter(renderable);
  return {
    established: visible.filter((f) => f.status === 'FACT' || f.status === 'DERIVED'),
    gaps: visible.filter((f) => f.status === 'UNKNOWN'),
    conflicts: visible.filter((f) => f.status === 'CONFLICTING'),
    recommendations: visible.filter((f) => f.status === 'RECOMMENDATION'),
    withheld: findings.filter((f) => !renderable(f)),
  };
}

/* -------------------------------------------------------------------------- */
/* PERSISTENCE                                                                 */
/* -------------------------------------------------------------------------- */

/** `basis`, from layer 1, derived from the layer 4 status rather than set twice. */
function basisOf(f: Finding): 'sourced' | 'derived' | 'unsupported' {
  if (f.status === 'FACT' || f.status === 'CONFLICTING') return 'sourced';
  if (f.status === 'DERIVED' || f.status === 'RECOMMENDATION') return 'derived';
  return 'unsupported';
}

/**
 * Write the findings and their citations.
 *
 * Everything is written, including what will not render. The stored record is
 * the audit trail; the rendered answer is a view of part of it, and the part
 * that was withheld is the part most worth being able to count later.
 */
export async function persistFindings(
  d: Driver,
  auditRunId: string,
  findings: Finding[],
  packet: EvidencePacket,
): Promise<{ findings: number; citations: number }> {
  let citations = 0;

  for (const [ord, f] of findings.entries()) {
    const rows = await d.query<{ id: string }>(
      `insert into finding
         (audit_run_id, area, outcome, statement, basis, inference, entity_id, finding_type,
          status, reasoning_type, rule_id, rule_version, model_used, limitations,
          verification, verification_reason, ord)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning id`,
      [
        auditRunId,
        f.area,
        f.outcome,
        f.statement,
        basisOf(f),
        f.inference,
        f.entityId,
        f.findingType,
        f.status,
        f.reasoningType,
        f.ruleId,
        f.ruleVersion,
        f.modelUsed,
        f.limitations === '' ? null : f.limitations,
        f.verification,
        f.verificationReason,
        ord,
      ],
    );
    const findingId = rows[0]?.id;
    if (findingId === undefined) continue;

    for (const cid of f.citations) {
      const item = itemById(packet, cid);
      if (item === null) continue;
      await d.query(
        `insert into finding_citation (finding_id, chunk_id, observation_id, claim_id, quote, url, retrieved_at)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          findingId,
          item.kind === 'chunk' ? item.refId : null,
          item.kind === 'observation' ? item.refId : null,
          item.kind === 'claim' ? item.refId : null,
          item.text.slice(0, 2000),
          /*
           * A relationship or a capability probe has no URL of its own — it is
           * a conclusion the store reached from observations that do. The urn
           * says that plainly rather than borrowing a page's address and
           * implying the page states it.
           *
           * The item's own id is the last resort and a poor one: it is
           * allocated per run, so a citation anchored to it means nothing once
           * the run is over. Anything without a stable handle should be given a
           * `citationUrn` rather than falling through to here.
           */
          item.url ?? item.citationUrn ?? `urn:audit:${item.kind}/${item.refId ?? item.id}`,
          item.observedAt ?? new Date(),
        ],
      );
      citations += 1;
    }
  }

  return { findings: findings.length, citations };
}
