import type { Driver } from '../db/client.ts';
import { normalizeName } from './normalize.ts';
import { compareEntities, findCandidates, loadFacts, recordJudgement, type EntityFacts } from './resolve.ts';

/**
 * WHO SUPPLIES WHOM, WHERE A PAGE ACTUALLY SAYS SO.
 *
 * ── THE ONE COMMERCIAL RELATIONSHIP THAT IS EVER PUBLISHED ──────────────────
 *
 * Almost no trading relationship appears on the open web. The exception is the
 * one businesses have a reason to publish: a stockist list, a "supplied by"
 * line, a "find us at" page. That is a narrow seam and this reads only that
 * seam — a fixed table of phrasings, each anchored on a verb, each yielding the
 * sentence it matched as evidence.
 *
 * ── THE BAR A MENTION HAS TO CLEAR ──────────────────────────────────────────
 *
 * A named business becomes an EDGE only when its normalised name matches a
 * known business EXACTLY and the resolver finds nothing that blocks the pair.
 * Anything less — a near name, a conflicting domain, a different place —
 * records a judgement and creates nothing.
 *
 * That is not the same bar as a merge, deliberately. The resolver returns
 * AMBIGUOUS for an exact name with no corroborating identifier, which is right
 * for merging two entities and wrong here: a mention is a sentence naming a
 * company, and a name is all it will ever give. So this accepts the exact-name
 * case that a merge refuses, and the asymmetry is the justification — a wrong
 * SUPPLIES edge is visible, citable and deletable, where a wrong merge folds
 * two companies' evidence together in a way nothing downstream can unpick.
 *
 * The edge still says what it rests on: its evidence is the sentence, and its
 * extraction method names the phrasing that produced it.
 *
 * Nothing here creates an entity. A stockist page naming forty shops that are
 * not in the corpus produces forty judgements and no rows — the mentions are
 * still in the indexed text, and a later crawl that resolves one of them can be
 * re-run over this.
 */

export const TRADE_RULE_VERSION = 'l3-trade-1';

/** Which way round the edge goes, from the subject of the page. */
type Direction = 'INBOUND' | 'OUTBOUND';

interface Pattern {
  re: RegExp;
  /** The edge type, read from the subject's point of view. */
  type: 'SUPPLIES' | 'SELLS' | 'DISTRIBUTES';
  /**
   * INBOUND: the NAMED party is the `from` — "we are supplied by X" is
   * X SUPPLIES us. OUTBOUND: the subject is the `from` — "we stock X" is
   * us SELLS X. Getting this backwards would invert every commercial
   * relationship in the graph while looking entirely plausible.
   */
  direction: Direction;
  label: string;
}

/**
 * The phrasings, each requiring a verb and a capitalised name.
 *
 * The capital is doing real work: "supplied by local farms" is not a business
 * and must not become one. A company that writes its own name in lower case
 * will be missed, which is the right way round to be wrong.
 */
const NAME = "([A-Z][\\w&'.-]*(?:\\s+(?:&|and|of|the|de|van|von)?\\s*[A-Z][\\w&'.-]*){0,4})";

/*
 * The verb's first letter is a class, not an `i` flag.
 *
 * These phrasings start sentences — "We stock…", "Supplied by…" — so the verb
 * has to match either case. The NAME must not: `[A-Z]` is what stops "supplied
 * by local farms" becoming a company, and an `i` flag over the whole pattern
 * would quietly remove that. Found by the test, which used a sentence that
 * began with the verb.
 */
const PATTERNS: Pattern[] = [
  { re: new RegExp(`\\b[Ss]upplied by\\s+${NAME}`, 'g'), type: 'SUPPLIES', direction: 'INBOUND', label: 'supplied by' },
  {
    re: new RegExp(`\\b[Ss]upplier[s]? (?:is|are|include[s]?)\\s+${NAME}`, 'g'),
    type: 'SUPPLIES',
    direction: 'INBOUND',
    label: 'supplier is',
  },
  {
    re: new RegExp(`\\b[Dd]istributed by\\s+${NAME}`, 'g'),
    type: 'DISTRIBUTES',
    direction: 'INBOUND',
    label: 'distributed by',
  },
  { re: new RegExp(`\\b[Ww]e (?:stock|sell|carry)\\s+${NAME}`, 'g'), type: 'SELLS', direction: 'OUTBOUND', label: 'we stock' },
  { re: new RegExp(`\\b[Ss]tockist[s]? (?:of|for)\\s+${NAME}`, 'g'), type: 'SELLS', direction: 'OUTBOUND', label: 'stockist of' },
  { re: new RegExp(`\\b[Aa]vailable (?:at|from)\\s+${NAME}`, 'g'), type: 'SELLS', direction: 'INBOUND', label: 'available at' },
  { re: new RegExp(`\\b[Ww]e supply\\s+${NAME}`, 'g'), type: 'SUPPLIES', direction: 'OUTBOUND', label: 'we supply' },
];

/** Words that follow the verb and are never a company. */
const NOT_A_BUSINESS = new Set([
  'We', 'Our', 'Us', 'The', 'This', 'These', 'Those', 'All', 'Local', 'British', 'English', 'Scottish',
  'Welsh', 'Irish', 'European', 'Independent', 'Family', 'Small', 'Many', 'Most', 'Several', 'Other',
]);

export interface TradeMention {
  /** The business named in the text, exactly as written. */
  name: string;
  type: Pattern['type'];
  direction: Direction;
  /** The sentence it was found in. Copied, because the page will change. */
  quote: string;
  label: string;
}

/**
 * Find trade statements in a page's text.
 *
 * Exported separately from the write path so it can be tested on a string, and
 * so a caller can see what was found before anything is stored.
 */
export function findTradeMentions(text: string): TradeMention[] {
  const out: TradeMention[] = [];
  const seen = new Set<string>();

  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      /*
       * Cut at the sentence boundary the greedy capture ran through.
       *
       * "supplied by Eastfield Supply Co. We stock…" captures "Eastfield Supply
       * Co. We", because a company name legitimately contains a full stop and
       * the word after one is legitimately capitalised. Nothing in a single
       * regex can tell those apart; a period followed by a space can, and it is
       * a rule somebody can read.
       */
      const captured = (m[1] ?? '').trim();
      const cut = captured.search(/\.\s/);
      const raw = (cut === -1 ? captured : captured.slice(0, cut + 1)).trim().replace(/[.,;:]+$/, '');
      const head = raw.split(/\s+/)[0] ?? '';
      if (raw.length < 3 || NOT_A_BUSINESS.has(head)) continue;

      /* The sentence around the match, so the evidence reads as a statement
         rather than as two words with no context. */
      const at = m.index ?? 0;
      const start = Math.max(0, text.lastIndexOf('.', at) + 1);
      const endDot = text.indexOf('.', at + (m[0]?.length ?? 0));
      const quote = text.slice(start, endDot === -1 ? Math.min(text.length, at + 200) : endDot + 1).trim();

      const key = `${p.type}:${p.direction}:${raw.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: raw, type: p.type, direction: p.direction, quote: quote.slice(0, 500), label: p.label });
    }
  }
  return out;
}

export interface TradeResult {
  mentions: number;
  edges: number;
  /** Named, found, and not confidently the same business. No edge was made. */
  refused: Array<{ name: string; decision: string; reason: string }>;
  /** Named and not in the corpus at all. */
  unknown: string[];
}

/**
 * Resolve the mentions on one document into edges, or into refusals.
 *
 * `subjectId` is the entity the document is about. A mention only becomes an
 * edge when the named business resolves to exactly one existing entity with a
 * SAME_ENTITY decision.
 */
export async function ingestTradeRelationships(
  d: Driver,
  subjectId: string,
  documentId: string,
  text: string,
): Promise<TradeResult> {
  const mentions = findTradeMentions(text);
  const result: TradeResult = { mentions: mentions.length, edges: 0, refused: [], unknown: [] };

  for (const m of mentions) {
    const name = normalizeName(m.name);
    if (name.normalized === '') continue;

    const candidates = await findCandidates(d, { type: 'ORGANIZATION', name, identifiers: [] });
    const others = candidates.filter((id) => id !== subjectId);
    if (others.length === 0) {
      result.unknown.push(m.name);
      continue;
    }

    /*
     * Compared against a FACT SET built from the name alone, because a mention
     * is all the page gave us. That is weak evidence on purpose: the resolver
     * will only return SAME_ENTITY for an exact normalised name, which is the
     * bar a claim about two companies' commercial relationship should clear.
     */
    const mine: EntityFacts = {
      id: subjectId,
      type: 'ORGANIZATION',
      canonicalName: m.name,
      name,
      /* Nothing but the name, because a mention gave nothing but the name. */
      identifiers: [],
      locations: [],
    };
    let best: { id: string; decision: string; reason: string } | null = null;
    let matched: string | null = null;

    for (const candidateId of others) {
      const theirs = await loadFacts(d, candidateId);
      if (theirs === null) continue;
      const r = compareEntities({ ...mine, id: candidateId }, theirs);
      await recordJudgement(d, subjectId, candidateId, r);
      best ??= { id: candidateId, decision: r.decision, reason: r.reason };

      /* Exact normalised name, nothing blocking. See the note at the top. */
      const acceptable =
        r.decision === 'SAME_ENTITY' ||
        (r.features.sameNormalizedName && r.features.blockers.length === 0);
      if (acceptable) {
        best = { id: candidateId, decision: r.decision, reason: r.reason };
        matched = candidateId;
        break;
      }
    }

    if (matched === null) {
      result.refused.push({
        name: m.name,
        decision: best?.decision ?? 'NO_COMPARISON',
        reason: best?.reason ?? 'nothing comparable',
      });
      continue;
    }

    const from = m.direction === 'INBOUND' ? matched : subjectId;
    const to = m.direction === 'INBOUND' ? subjectId : matched;
    if (from === to) continue;

    const rows = await d.query<{ id: string }>(
      `insert into relationship (from_entity_id, to_entity_id, type, status)
       values ($1,$2,$3,'SOURCED')
       on conflict (from_entity_id, to_entity_id, type) do update set
         last_seen_at = now(), source_count = relationship.source_count + 1
       returning id`,
      [from, to, m.type],
    );
    const id = rows[0]?.id;
    if (id === undefined) continue;

    /*
     * The mention IS an observation, and the edge cites it.
     *
     * `relationship_evidence` points at observations, which is the right shape
     * and not an obstacle: "this page said Eastfield supplies us" is exactly an
     * observation — a document, a field, a raw value, a method, a timestamp and
     * the sentence it came from. Writing it as one reuses the whole layer 3
     * provenance chain instead of standing up a parallel one beside it, and the
     * sentence is copied rather than referenced because a stockist page is
     * edited often and the evidence should not change when it does.
     */
    const obs = await d.query<{ id: string }>(
      `insert into observation
         (document_id, entity_id, field, raw_value, normalized_value, extraction_method, confidence, evidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (document_id, field, raw_value, extraction_method, document_version) do update
         set observed_at = now()
       returning id`,
      [documentId, subjectId, `trade:${m.type}`, m.name, name.normalized, `text:${m.label}`, 0.5, m.quote],
    );
    const observationId = obs[0]?.id;
    if (observationId !== undefined) {
      await d.query(
        `insert into relationship_evidence (relationship_id, observation_id) values ($1,$2)
         on conflict do nothing`,
        [id, observationId],
      );
    }
    result.edges += 1;
  }

  return result;
}

/**
 * Reconsider every mention now that the corpus knows more than it did.
 *
 * A stockist page crawled on Monday names a supplier that is crawled on
 * Tuesday. On Monday the mention resolved to nothing and correctly produced no
 * edge; on Tuesday the business exists and the sentence has not changed. This
 * re-reads the stored text of documents that already have a subject and makes
 * the edges that are now makeable.
 *
 * It is a separate pass rather than something the crawl does, because doing it
 * per document would re-read the whole corpus on every page — O(n²) for a
 * result that only changes when an entity is created.
 */
export async function backfillTradeRelationships(
  d: Driver,
  limit = 200,
): Promise<{ documents: number; edges: number; refused: number }> {
  const rows = await d.query<{ document_id: string; entity_id: string; text: string | null }>(
    `select distinct on (o.document_id) o.document_id, o.entity_id, doc.text
       from observation o
       join document doc on doc.id = o.document_id
      where o.entity_id is not null and doc.text is not null
      order by o.document_id, o.observed_at desc
      limit $1`,
    [limit],
  );

  let edges = 0;
  let refused = 0;
  for (const r of rows) {
    if (r.text === null) continue;
    const t = await ingestTradeRelationships(d, r.entity_id, r.document_id, r.text);
    edges += t.edges;
    refused += t.refused.length;
  }
  return { documents: rows.length, edges, refused };
}
