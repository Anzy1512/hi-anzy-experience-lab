import type { Driver } from '../db/client.ts';
import { getCapability, getCoverage, getEntity, getEntityEvidence, getRelationships } from '../entity/query.ts';
import { retrieve } from '../retrieve/hybrid.ts';
import { estimateTokens, type EvidenceBlock } from '../model/types.ts';

/**
 * WHAT THE ANSWER IS ALLOWED TO REST ON.
 *
 * ── AN EVIDENCE PACKET IS A CLOSED SET ──────────────────────────────────────
 *
 * Everything downstream — the rules, the model, the verifier, the citations —
 * works from this object and nothing else. That is what makes "every finding
 * has a citation" enforceable rather than aspirational: a citation is a
 * reference to an item in the packet, and a statement that cites nothing in the
 * packet has nothing behind it by construction.
 *
 * ── AND THE OMISSIONS ARE PART OF IT ────────────────────────────────────────
 *
 * `dropped` is not diagnostics. A finding that comes back UNKNOWN means
 * something different depending on whether the supporting evidence was never
 * retrieved or was retrieved and cut by the token budget, and after the fact
 * those two are indistinguishable unless the cut was written down. Every drop
 * carries the reason, and the reasons are stored on `evidence_selection`.
 */

export type EvidenceKind = 'claim' | 'observation' | 'relationship' | 'chunk' | 'capability';

export interface EvidenceItem {
  /** The handle a citation uses. Short, because the model has to repeat it. */
  id: string;
  kind: EvidenceKind;
  /** The row this came from, for the stored selection record. */
  refId: string | null;
  entityId: string | null;
  /** Where it came from, shown to the model and to the reader. */
  label: string;
  text: string;
  url: string | null;
  /**
   * How to cite this when it has no URL of its own.
   *
   * A capability state is a conclusion the store reached across several pages;
   * there is no single row and no single address to point at. A urn built from
   * the entity and the capability is stable across runs and says plainly that
   * the anchor is a record rather than a page — where the evidence item's own
   * id would be a number that means nothing an hour later.
   */
  citationUrn?: string;
  observedAt: Date | null;
  /** Ranking only. Never presented as a confidence. */
  score: number;
  tokenLen: number;
}

export interface Conflict {
  field: string;
  values: string[];
  /**
   * Every id on every side, including the observations under each claim.
   *
   * Used to protect the whole disagreement from the token budget: dropping the
   * evidence under one value turns a contradiction back into a fact.
   */
  itemIds: string[];
  /**
   * One id per distinct value — what a finding should actually cite.
   *
   * A page listing seventy security advisories produces seventy "phone" claims
   * and a hundred and fifty observations, and citing all of them makes a
   * finding nobody can read attached to a record nobody can audit. The claim
   * rows are the sides of the argument; the observations are how each side got
   * there, and they remain reachable through the claim.
   */
  claimItemIds: string[];
}

export interface EvidencePacket {
  subjectIds: string[];
  items: EvidenceItem[];
  dropped: Array<{ id: string; kind: EvidenceKind; refId: string | null; reason: string; score: number; tokenLen: number }>;
  tokensUsed: number;
  tokenBudget: number;
  conflicts: Conflict[];
  /** Fields that are stored as UNKNOWN. Reported, never quietly omitted. */
  unresolvedFields: string[];
  sourceUrls: string[];
  /** True when nothing at all was found. The engine turns this into a refusal. */
  empty: boolean;
}

export interface PacketOptions {
  tokenBudget?: number;
  /** At most this many items from one URL, so one verbose page cannot fill the packet. */
  maxPerUrl?: number;
  /** Fields the caller asked for; these are kept even when they score low. */
  requiredFields?: string[];
}

/* -------------------------------------------------------------------------- */
/* BUILDING                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything known about one business, as citable items.
 *
 * Claims come first because they carry provenance already; the observations
 * under them come next as the quotable material; relationships and capability
 * states follow. A capability item is included even when the state is
 * NOT_OBSERVED or UNKNOWN — that is the whole point of having those states, and
 * dropping them would leave the model to infer absence from silence.
 */
export async function packetForEntity(
  d: Driver,
  entityId: string,
  capabilities: string[] = [],
  opts: PacketOptions = {},
): Promise<EvidencePacket> {
  const entity = await getEntity(d, entityId);
  if (entity === null) return emptyPacket([entityId], opts);

  const items: EvidenceItem[] = [];
  const conflicts: Conflict[] = [];
  let n = 0;
  const id = (p: string) => `${p}${++n}`;

  const chain = await getEntityEvidence(d, entityId);
  const unresolved: string[] = [];
  /*
   * Conflicts live across claim ROWS, not inside one.
   *
   * Two sources giving two different emails produce two `claim` rows for the
   * same field, each marked CONFLICTING and each carrying only its own
   * evidence. Looking for disagreement inside a single claim's observations
   * finds none — they all support that one value — so the field is what has to
   * be grouped, and the two claim items are the two sides to cite.
   */
  const byField = new Map<string, { values: Set<string>; itemIds: string[]; claimItemIds: string[]; flagged: boolean }>();

  for (const c of chain) {
    if (c.value === 'UNKNOWN') {
      unresolved.push(c.field);
      continue;
    }
    const claimId = id('c');
    items.push({
      id: claimId,
      kind: 'claim',
      refId: c.claimId,
      entityId,
      label: `${entity.canonicalName} — ${c.field} (${c.status}, ${c.temporal}, ${c.sourceCount} source(s))`,
      text: `${c.field}: ${c.value}`,
      url: c.evidence[0]?.url ?? null,
      observedAt: c.evidence[0]?.observedAt ?? null,
      /* More independent sources ranks higher. This is a sort key, not a
         probability, and is never shown as one. */
      score: 1 + Math.min(c.sourceCount, 5) / 5,
      tokenLen: estimateTokens(`${c.field}: ${c.value}`),
    });

    const sideIds: string[] = [claimId];
    for (const e of c.evidence.slice(0, 3)) {
      const text = e.excerpt !== null && e.excerpt.trim() !== '' ? e.excerpt : e.rawValue;
      const obsId = id('o');
      sideIds.push(obsId);
      items.push({
        id: obsId,
        kind: 'observation',
        refId: e.observationId,
        entityId,
        label: `${e.url} — ${e.method}, observed ${e.observedAt.toISOString().slice(0, 10)}`,
        text,
        url: e.url,
        observedAt: e.observedAt,
        score: 1,
        tokenLen: estimateTokens(text),
      });
    }

    const seenField = byField.get(c.field) ?? { values: new Set<string>(), itemIds: [], claimItemIds: [], flagged: false };
    seenField.values.add(c.value);
    seenField.itemIds.push(...sideIds);
    seenField.claimItemIds.push(claimId);
    seenField.flagged = seenField.flagged || c.temporal === 'CONFLICTING';
    byField.set(c.field, seenField);
  }

  for (const [field, f] of byField) {
    /* Two surviving values for one field IS the conflict. The store's own
       CONFLICTING flag is kept alongside rather than required, because a claim
       written before that flag existed would otherwise go unreported. */
    if (f.values.size < 2) continue;
    conflicts.push({ field, values: [...f.values], itemIds: f.itemIds, claimItemIds: f.claimItemIds });
  }

  for (const r of await getRelationships(d, entityId)) {
    const text =
      r.direction === 'out'
        ? `${entity.canonicalName} ${r.type} ${r.otherName}`
        : `${r.otherName} ${r.type} ${entity.canonicalName}`;
    items.push({
      id: id('r'),
      kind: 'relationship',
      refId: r.id,
      entityId,
      label: `relationship, ${r.sourceCount} source(s), ${r.evidenceCount} evidence row(s)`,
      text,
      url: null,
      observedAt: null,
      score: 1 + Math.min(r.sourceCount, 3) / 3,
      tokenLen: estimateTokens(text),
    });
  }

  for (const cap of capabilities) {
    const a = await getCapability(d, entityId, cap);
    const text = `capability ${cap}: ${a.state} — ${a.reason}`;
    items.push({
      id: id('p'),
      kind: 'capability',
      refId: null,
      entityId,
      label: `${entity.canonicalName} — ${cap} probe`,
      text,
      url: null,
      citationUrn: `urn:audit:capability/${entityId}/${cap}`,
      observedAt: null,
      /* NOT_OBSERVED outranks UNKNOWN: one is a result, the other is a gap. */
      score: a.state === 'CONFIRMED' ? 2 : a.state === 'PROBABLE' ? 1.6 : a.state === 'NOT_OBSERVED' ? 1.4 : 0.6,
      tokenLen: estimateTokens(text),
    });
  }

  const coverage = await getCoverage(d, entityId);
  for (const f of coverage.unresolvedFields) if (!unresolved.includes(f)) unresolved.push(f);

  /*
   * The per-URL cap is loosened here, and the default is wrong for this shape.
   *
   * Three items per URL is right for a retrieval packet, where one verbose page
   * would otherwise crowd out the second source that makes a claim
   * corroborated. An entity packet is already scoped to one business, and
   * nearly all of its evidence legitimately comes from that business's own
   * site — so the retrieval default silently discards most of what is known
   * about it, including one side of a contradiction. Found by running it: a
   * subject with 79 claims arrived as a packet of fourteen items.
   */
  return budget(items, [entityId], conflicts, unresolved, { maxPerUrl: 12, ...opts });
}

/** Passages for an open question, through the hybrid retriever. */
export async function packetForQuestion(
  d: Driver,
  question: string,
  opts: PacketOptions & { subjectId?: string | null; limit?: number } = {},
): Promise<EvidencePacket> {
  const tokenBudget = opts.tokenBudget ?? 6_000;
  const report = await retrieve(d, question, {
    limit: opts.limit ?? 10,
    tokenBudget,
    ...(opts.subjectId !== undefined ? { subjectId: opts.subjectId } : {}),
  });

  const items: EvidenceItem[] = report.returned.map((c, i) => ({
    id: `k${i + 1}`,
    kind: 'chunk' as const,
    refId: c.chunkId,
    entityId: null,
    label: `${c.url}${c.headingPath !== null ? ` § ${c.headingPath}` : ''}${c.fetchedAt !== null ? `, fetched ${c.fetchedAt.toISOString().slice(0, 10)}` : ''}`,
    text: c.text,
    url: c.url,
    observedAt: c.fetchedAt,
    score: c.scoreFused,
    tokenLen: c.tokenLen,
  }));

  return budget(items, [], [], [], { ...opts, tokenBudget });
}

function emptyPacket(subjectIds: string[], opts: PacketOptions): EvidencePacket {
  return {
    subjectIds,
    items: [],
    dropped: [],
    tokensUsed: 0,
    tokenBudget: opts.tokenBudget ?? 6_000,
    conflicts: [],
    unresolvedFields: [],
    sourceUrls: [],
    empty: true,
  };
}

/* -------------------------------------------------------------------------- */
/* BUDGETING                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Fit the evidence into the context, and record what would not fit.
 *
 * Three passes, in this order and for this reason:
 *
 *   1. drop exact duplicates, because paying twice for the same sentence is
 *      the cheapest thing to fix and the easiest to miss;
 *   2. cap per URL, because one long page will otherwise crowd out the second
 *      source that makes a claim corroborated rather than single-sourced;
 *   3. fill by score until the ceiling.
 *
 * Doing the diversity cap after the budget would produce packets that are full
 * and single-sourced, which is exactly the failure this system is supposed to
 * make visible.
 */
export function budget(
  all: EvidenceItem[],
  subjectIds: string[],
  conflicts: Conflict[],
  unresolvedFields: string[],
  opts: PacketOptions = {},
): EvidencePacket {
  const tokenBudget = opts.tokenBudget ?? 6_000;
  const maxPerUrl = opts.maxPerUrl ?? 3;
  const required = new Set(opts.requiredFields ?? []);

  const dropped: EvidencePacket['dropped'] = [];
  const drop = (it: EvidenceItem, reason: string) =>
    dropped.push({ id: it.id, kind: it.kind, refId: it.refId, reason, score: it.score, tokenLen: it.tokenLen });

  /* 1. duplicates */
  const seen = new Map<string, string>();
  const deduped: EvidenceItem[] = [];
  for (const it of all) {
    const key = `${it.kind}:${it.text.trim().toLowerCase()}`;
    const first = seen.get(key);
    if (first !== undefined) {
      drop(it, `duplicate: identical text already included as ${first}`);
      continue;
    }
    seen.set(key, it.id);
    deduped.push(it);
  }

  /*
   * Two things outrank score, and both for the same reason: dropping them
   * changes the answer rather than shortening it.
   *
   * A field the caller explicitly asked about cannot be budgeted out of its own
   * answer. And a contradiction needs BOTH sides or it stops being reportable —
   * half a conflict is indistinguishable from a settled fact, which is the one
   * way this system could turn a disagreement into a confident wrong answer.
   */
  const protectedIds = new Set(conflicts.flatMap((c) => c.itemIds));
  const weight = (it: EvidenceItem) =>
    (protectedIds.has(it.id) ? 200 : 0) +
    (required.size > 0 && [...required].some((f) => it.text.startsWith(`${f}:`)) ? 100 : 0) +
    it.score;
  const ordered = [...deduped].sort((a, b) => weight(b) - weight(a));

  /* 2. per-URL cap */
  const perUrl = new Map<string, number>();
  const diverse: EvidenceItem[] = [];
  for (const it of ordered) {
    if (it.url === null || protectedIds.has(it.id)) {
      diverse.push(it);
      continue;
    }
    const used = perUrl.get(it.url) ?? 0;
    if (used >= maxPerUrl) {
      drop(it, `diversity: ${maxPerUrl} item(s) from ${it.url} are already included`);
      continue;
    }
    perUrl.set(it.url, used + 1);
    diverse.push(it);
  }

  /* 3. the ceiling */
  const items: EvidenceItem[] = [];
  let tokensUsed = 0;
  for (const it of diverse) {
    if (tokensUsed + it.tokenLen > tokenBudget) {
      drop(it, `budget: ${tokensUsed}/${tokenBudget} tokens used, this item needs ${it.tokenLen}`);
      continue;
    }
    items.push(it);
    tokensUsed += it.tokenLen;
  }

  const kept = new Set(items.map((i) => i.id));
  return {
    subjectIds,
    items,
    dropped,
    tokensUsed,
    tokenBudget,
    /* A conflict whose evidence was cut is no longer showable, so it is no
       longer reported as one. It reappears as an unresolved field instead. */
    conflicts: conflicts
      .filter((c) => c.itemIds.filter((i) => kept.has(i)).length >= 2)
      .map((c) => ({ ...c, claimItemIds: c.claimItemIds.filter((i) => kept.has(i)) })),
    unresolvedFields: [
      ...unresolvedFields,
      ...conflicts.filter((c) => c.itemIds.filter((i) => kept.has(i)).length < 2).map((c) => c.field),
    ],
    sourceUrls: [...new Set(items.map((i) => i.url).filter((u): u is string => u !== null))],
    empty: items.length === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* USING AND RECORDING                                                         */
/* -------------------------------------------------------------------------- */

/** The packet as the model receives it. Text only; scores are not sent. */
export function toBlocks(packet: EvidencePacket): EvidenceBlock[] {
  return packet.items.map((i) => ({ id: i.id, label: i.label, text: i.text }));
}

export function itemById(packet: EvidencePacket, id: string): EvidenceItem | null {
  return packet.items.find((i) => i.id === id) ?? null;
}

/** Persist the selection, kept and dropped alike. */
export async function recordSelection(d: Driver, auditRunId: string, packet: EvidencePacket): Promise<number> {
  let written = 0;
  for (const it of packet.items) {
    await d.query(
      `insert into evidence_selection (audit_run_id, entity_id, kind, ref_id, included, reason, score, token_len)
       values ($1,$2,$3,$4,1,$5,$6,$7)`,
      [auditRunId, it.entityId, it.kind, it.refId, 'selected', it.score, it.tokenLen],
    );
    written += 1;
  }
  for (const it of packet.dropped) {
    await d.query(
      `insert into evidence_selection (audit_run_id, entity_id, kind, ref_id, included, reason, score, token_len)
       values ($1,$2,$3,$4,0,$5,$6,$7)`,
      [auditRunId, packet.subjectIds[0] ?? null, it.kind, it.refId, it.reason, it.score, it.tokenLen],
    );
    written += 1;
  }
  return written;
}
