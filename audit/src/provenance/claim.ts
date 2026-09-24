/**
 * THE TRUTH MODEL, ENFORCED IN CODE RATHER THAN OBSERVED IN REVIEW.
 *
 * Six kinds of statement, from the Lab's own vocabulary:
 *
 *   SOURCED         a source says this. A citation exists and the quote
 *                   contains it.
 *   MEASURED        this service measured it — a count, a hash, a timing.
 *                   Not read from a page; produced by running something.
 *   FACT            true independently of any one source. Reserved, and
 *                   deliberately almost never used: most things that feel
 *                   like facts are SOURCED with one source.
 *   DERIVED         inferred across sources. Legitimate, and the inference
 *                   must be recorded alongside it.
 *   UNKNOWN         asked and not answerable from what is held. A result.
 *   RECOMMENDATION  what someone should do. Never evidence, and never
 *                   permitted to masquerade as an observation.
 *
 * ── WHAT THIS FILE ACTUALLY STOPS ───────────────────────────────────────────
 *
 * The failure it exists to prevent is specific and it is not exotic: a model
 * is handed eight passages, writes a fluent paragraph, and one sentence in it
 * is about something none of the passages mention. That sentence is
 * indistinguishable from the others in tone, in confidence and in the
 * database — unless something refuses to let it be stored as SOURCED.
 *
 * `classify()` is that refusal, and it is mechanical. It does not ask a model
 * whether a claim is supported; it checks whether a citation exists and
 * whether the cited quote actually contains overlapping content. A statement
 * that fails drops to UNSUPPORTED, and `renderable()` will not print it.
 *
 * ── PLAIN PROSE, AUDITABLE UNDERNEATH ───────────────────────────────────────
 *
 * The reader sees sentences, not tags. That was the instruction and it is a
 * good one. What makes it safe is that the tags still exist in the row: the
 * prose is the presentation, the classification is the record, and the second
 * one is what a person checking the work reads.
 */

export type ClaimKind = 'SOURCED' | 'MEASURED' | 'FACT' | 'DERIVED' | 'UNKNOWN' | 'RECOMMENDATION';

/** The database's narrower vocabulary. `finding.basis` stores one of these. */
export type FindingBasis = 'sourced' | 'derived' | 'unsupported';

export interface Citation {
  /** The chunk this came from, when it came from the corpus. */
  chunkId: string | null;
  /** Copied, not referenced: the page changes, the evidence should not. */
  quote: string;
  url: string;
  retrievedAt: Date;
}

export interface Claim {
  statement: string;
  kind: ClaimKind;
  citations: Citation[];
  /** Required when `kind` is DERIVED: the inference, named. */
  inference?: string | null;
}

export interface Classification {
  kind: ClaimKind;
  basis: FindingBasis;
  /** Whether this may be shown to a reader at all. */
  renderable: boolean;
  reason: string;
  /** 0..1 — how much of the statement's content words appear in its citations. */
  support: number;
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those', 'as', 'at', 'by',
  'from', 'has', 'have', 'had', 'not', 'their', 'they', 'which', 'than', 'then', 'also', 'more',
]);

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9£$%.+-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * How much of a statement is actually present in what it cites.
 *
 * A blunt lexical overlap, on purpose. It is not trying to judge whether the
 * claim is TRUE — nothing mechanical can — only whether the words it is made
 * of appear in the evidence it points at. That catches the case that matters:
 * a fluent sentence attached to passages that are about something else.
 *
 * It is deliberately generous to paraphrase within a topic and harsh on a
 * change of subject, which is the right direction for the error it prevents.
 */
export function supportRatio(statement: string, citations: Citation[]): number {
  const words = contentWords(statement);
  if (words.length === 0) return 0;
  const haystack = new Set(citations.flatMap((c) => contentWords(c.quote)));
  if (haystack.size === 0) return 0;
  let hits = 0;
  for (const w of words) if (haystack.has(w)) hits += 1;
  return hits / words.length;
}

/** Below this, a statement is not treated as supported by what it cites. */
export const SUPPORT_FLOOR = 0.35;

export function classify(claim: Claim): Classification {
  const support = supportRatio(claim.statement, claim.citations);
  const hasCitation = claim.citations.length > 0;

  /* A recommendation is an act, not an observation. It needs no citation and
     may never be recorded as though a source stated it. */
  if (claim.kind === 'RECOMMENDATION') {
    return {
      kind: 'RECOMMENDATION',
      basis: 'derived',
      renderable: true,
      reason: 'a recommendation; not evidence and not stored as sourced',
      support,
    };
  }

  /* UNKNOWN is a result. It is the honest end of a run with nothing behind it
     and must stay available, or the pipeline will reach for something else. */
  if (claim.kind === 'UNKNOWN') {
    return { kind: 'UNKNOWN', basis: 'unsupported', renderable: true, reason: 'nothing in the corpus answers this', support };
  }

  /* MEASURED comes from running something here, so it owes no citation — and
     correspondingly may never be produced by a model reading a page. */
  if (claim.kind === 'MEASURED') {
    return { kind: 'MEASURED', basis: 'sourced', renderable: true, reason: 'measured by this service', support };
  }

  if (!hasCitation) {
    return {
      kind: 'UNKNOWN',
      basis: 'unsupported',
      renderable: false,
      reason: 'no citation: a statement with no evidence cannot be a sourced conclusion',
      support: 0,
    };
  }

  if (claim.kind === 'DERIVED') {
    if (claim.inference == null || claim.inference.trim() === '') {
      return {
        kind: 'UNKNOWN',
        basis: 'unsupported',
        renderable: false,
        reason: 'derived without a recorded inference; an unexplained leap is not a derivation',
        support,
      };
    }
    return { kind: 'DERIVED', basis: 'derived', renderable: true, reason: 'inferred across cited sources', support };
  }

  if (support < SUPPORT_FLOOR) {
    return {
      kind: 'UNKNOWN',
      basis: 'unsupported',
      renderable: false,
      reason: `only ${Math.round(support * 100)}% of the statement's content words appear in its citations (floor ${Math.round(
        SUPPORT_FLOOR * 100,
      )}%)`,
      support,
    };
  }

  return {
    kind: claim.kind === 'FACT' ? 'FACT' : 'SOURCED',
    basis: 'sourced',
    renderable: true,
    reason: `${Math.round(support * 100)}% of content words are present in the cited evidence`,
    support,
  };
}

/** May this reach a reader? The single question the rendering layer asks. */
export function renderable(claim: Claim): boolean {
  return classify(claim).renderable;
}

/**
 * Partition a set of claims into what may be shown and what may not.
 *
 * Returned together rather than filtered silently, because the refused ones
 * are the interesting output: they are where the pipeline tried to say
 * something it could not support, and a run that produces many of them is
 * telling you about its retrieval rather than about the company.
 */
export function partition(claims: Claim[]): {
  shown: Array<{ claim: Claim; classification: Classification }>;
  withheld: Array<{ claim: Claim; classification: Classification }>;
} {
  const shown: Array<{ claim: Claim; classification: Classification }> = [];
  const withheld: Array<{ claim: Claim; classification: Classification }> = [];
  for (const claim of claims) {
    const classification = classify(claim);
    (classification.renderable ? shown : withheld).push({ claim, classification });
  }
  return { shown, withheld };
}
