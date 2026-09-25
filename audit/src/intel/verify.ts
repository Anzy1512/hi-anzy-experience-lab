import { SUPPORT_FLOOR, supportRatio, type Citation } from '../provenance/claim.ts';
import { FENCE_CLOSE, FENCE_OPEN } from '../model/types.ts';
import { itemById, type EvidencePacket } from './evidence.ts';
import type { Finding } from './findings.ts';

/**
 * THE GATE BETWEEN WHAT A MODEL SAID AND WHAT THIS SERVICE REPORTS.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 *
 * A model-authored statement is reported only if the evidence it cites is in
 * the packet and actually contains what the statement is made of. Not "usually
 * contains", not "seems related to" — checked, mechanically, before rendering.
 *
 * Everything that fails is kept, marked REJECTED and stored. Deleting it would
 * make the failure rate unmeasurable, and the failure rate is the number that
 * says whether any of this works.
 *
 * ── AND THE CHECKS THEMSELVES ───────────────────────────────────────────────
 *
 * Each one exists because of a specific failure mode, and they run from most
 * specific to least:
 *
 *   injection    the model repeating instructions it found on a crawled page
 *   resolve      a citation pointing at nothing — a fabricated reference
 *   cited        a fluent sentence with no reference at all
 *   numbers      the most damaging fabrication, because numbers get quoted on
 *   absence      "does not have" where the evidence only supports "not observed"
 *   authority    the model answering a question the rules already answered
 *   support      a fluent sentence attached to passages about something else
 *
 * The order is the point. Every one of these statements also fails the generic
 * lexical-overlap check, so running that first would label every rejection
 * "unsupported" and make an injection echo indistinguishable from a paraphrase
 * of the wrong page. The reason has to name the actual defect, or the stored
 * rejections are a count with no diagnosis — and an attack that succeeded in
 * reaching the model would never be visible as one.
 *
 * None of them establish truth. They establish that the sentence is made of the
 * evidence, which is the most a mechanical check can do and considerably more
 * than a confidence score does.
 */

export type RejectionCode =
  | 'CITATION_NOT_IN_PACKET'
  | 'NO_CITATION'
  | 'UNSUPPORTED_BY_CITATION'
  | 'UNGROUNDED_NUMBER'
  | 'OVERSTATED_ABSENCE'
  | 'ECHOED_INJECTED_INSTRUCTION'
  | 'CONTRADICTS_DETERMINISTIC_FINDING';

export interface VerificationOutcome {
  findings: Finding[];
  accepted: number;
  rejected: number;
  /** One line per rejection, for the run report and for the reader. */
  notes: string[];
}

/** Language that asserts absence rather than non-observation. */
const ABSOLUTE_ABSENCE =
  /\b(?:does ?n[o']?t (?:have|sell|offer|exist)|has no\b|have no\b|there (?:is|are) no\b|never (?:had|has)|lacks?\b|without any\b)/i;

/**
 * Phrases that only appear in a model's output if they came from the page it
 * was reading. A crawled page has no business addressing the reader as an
 * assistant, so their presence is evidence of injection rather than of style.
 */
const INJECTION_ECHO = [
  /ignore (?:all |any )?(?:previous|prior|above) instructions/i,
  /disregard (?:the |your )?(?:previous|system|above)/i,
  /you are (?:now|actually) (?:a|an|the)\b/i,
  /system prompt/i,
  /\bas an ai\b/i,
  new RegExp(FENCE_OPEN.replace(/[<>]/g, '\\$&')),
  new RegExp(FENCE_CLOSE.replace(/[<>]/g, '\\$&')),
];

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Verify a set of model-authored findings against the packet and against what
 * the rules already established.
 *
 * `ruleFindings` is passed separately and is never re-checked: it was produced
 * deterministically from stored evidence, so checking it against that same
 * evidence proves nothing. What it is used for is authority — a model may not
 * answer a question a rule has already answered.
 */
export function verifyFindings(
  modelFindings: Finding[],
  packet: EvidencePacket,
  ruleFindings: Finding[] = [],
): VerificationOutcome {
  const answeredByRule = new Set(ruleFindings.map((f) => f.key));
  const out: Finding[] = [];
  const notes: string[] = [];
  let accepted = 0;
  let rejected = 0;

  for (const f of modelFindings) {
    const failure = check(f, packet, answeredByRule);
    if (failure === null) {
      out.push({ ...f, verification: 'VERIFIED', verificationReason: null });
      accepted += 1;
      continue;
    }
    out.push({
      ...f,
      /* Kept, marked, stored, not shown. `renderable()` refuses both of these
         independently, so a later edit to one does not open the gate. */
      status: 'UNSUPPORTED',
      verification: 'REJECTED',
      verificationReason: `${failure.code}: ${failure.detail}`,
    });
    notes.push(`rejected "${truncate(f.statement)}" — ${failure.code}: ${failure.detail}`);
    rejected += 1;
  }

  return { findings: out, accepted, rejected, notes };
}

function check(
  f: Finding,
  packet: EvidencePacket,
  answeredByRule: Set<string>,
): { code: RejectionCode; detail: string } | null {
  /* First, always. A statement carrying an injected instruction is a security
     event whatever else is wrong with it, and it is also the one rejection that
     says something about the SOURCE rather than about the model. */
  const echoed = injectionCheck(f);
  if (echoed !== null) return echoed;

  /* A recommendation cites nothing by design, so none of the evidence checks
     below apply to it. */
  if (f.status === 'RECOMMENDATION') return null;

  for (const id of f.citations) {
    if (itemById(packet, id) === null) {
      return {
        code: 'CITATION_NOT_IN_PACKET',
        detail: `cited [${id}], which is not one of the ${packet.items.length} evidence items supplied`,
      };
    }
  }

  if (f.citations.length === 0) {
    return { code: 'NO_CITATION', detail: 'no evidence was cited, and nothing in the packet was claimed to support it' };
  }

  const cited: Citation[] = f.citations.map((id) => {
    const item = itemById(packet, id);
    return {
      chunkId: item?.kind === 'chunk' ? item.refId : null,
      quote: item?.text ?? '',
      url: item?.url ?? '',
      retrievedAt: item?.observedAt ?? new Date(),
    };
  });

  const haystack = cited.map((c) => c.quote).join(' ').replace(/,/g, '');
  NUMBER.lastIndex = 0;
  for (const m of f.statement.matchAll(NUMBER)) {
    const raw = m[0];
    const n = raw.replace(/,/g, '');
    /*
     * A number that QUANTIFIES something is a claim, whatever its size.
     *
     * This used to exempt anything under three digits, on the reasoning that a
     * small number in prose is incidental. A live-model validation found what
     * that costs: "Harrow Lane Coffee Roasters has 14 employees", cited to
     * evidence that mentions no employees at all, passed every check. The
     * figure was two digits so the number check skipped it, and the sentence
     * shared enough words with the evidence to clear the lexical floor — so a
     * fabricated commercial fact arrived with a citation attached.
     *
     * A bare small number really can be incidental, so that exemption stays.
     * What ends it is a unit or a noun after the digits: "14 employees",
     * "3 branches", "20%" are all assertions about the world and all have to be
     * in the evidence. The cost of being wrong here is a rejected sentence a
     * person can read in the record; the cost of being wrong the other way is
     * an invented number in front of a client.
     */
    const after = f.statement.slice((m.index ?? 0) + raw.length);
    const quantifies = /^\s*(?:%|per ?cent\b|[a-z]{3,})/i.test(after);
    if (n.length < 3 && !quantifies) continue;
    if (!haystack.includes(n)) {
      return { code: 'UNGROUNDED_NUMBER', detail: `the figure ${raw} does not appear in any cited evidence` };
    }
  }

  const absence = ABSOLUTE_ABSENCE.exec(f.statement);
  if (absence !== null) {
    return {
      code: 'OVERSTATED_ABSENCE',
      detail:
        `says "${absence[0]}", which asserts absence. This service can establish that something was ` +
        'not observed in the sources checked, never that it does not exist',
    };
  }

  if (answeredByRule.has(f.key)) {
    return {
      code: 'CONTRADICTS_DETERMINISTIC_FINDING',
      detail: `"${f.key}" was already settled by a rule against the same evidence; a generated answer does not override it`,
    };
  }

  /* Last: the catch-all. Everything specific has had its say, so a failure
     here genuinely means "this sentence is about something other than what it
     points at" rather than standing in for a defect with a better name. */
  const support = supportRatio(f.statement, cited);
  if (support < SUPPORT_FLOOR) {
    return {
      code: 'UNSUPPORTED_BY_CITATION',
      detail: `only ${Math.round(support * 100)}% of its content words appear in what it cites (floor is ${Math.round(SUPPORT_FLOOR * 100)}%)`,
    };
  }

  return null;
}

function injectionCheck(f: Finding): { code: RejectionCode; detail: string } | null {
  for (const re of INJECTION_ECHO) {
    const m = re.exec(f.statement);
    if (m !== null) {
      return {
        code: 'ECHOED_INJECTED_INSTRUCTION',
        detail: `contains "${truncate(m[0], 60)}", which reads as an instruction from the source material rather than a finding about it`,
      };
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* THE CONTRADICTION ENGINE                                                    */
/* -------------------------------------------------------------------------- */

export interface Contradiction {
  key: string;
  statements: string[];
  findingKeys: string[];
}

/**
 * Findings that cannot both be right.
 *
 * Distinct from the conflicts the packet carries: those are two SOURCES
 * disagreeing about a field, which is a property of the world. These are two
 * FINDINGS disagreeing, which is a property of this pipeline and means
 * something is wrong here rather than out there.
 *
 * Both are reported; neither is resolved. Picking a winner would require
 * knowing which source is more current, and nothing in the record says.
 */
export function findContradictions(findings: Finding[]): Contradiction[] {
  const byKey = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.status === 'RECOMMENDATION' || f.status === 'UNSUPPORTED') continue;
    const list = byKey.get(f.key) ?? [];
    list.push(f);
    byKey.set(f.key, list);
  }

  const out: Contradiction[] = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    const types = new Set(group.map((f) => f.findingType));
    if (types.size < 2) continue;
    out.push({
      key,
      statements: group.map((f) => f.statement),
      findingKeys: group.map((f) => `${f.findingType}(${f.reasoningType})`),
    });
  }
  return out;
}

function truncate(s: string, n = 90): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
