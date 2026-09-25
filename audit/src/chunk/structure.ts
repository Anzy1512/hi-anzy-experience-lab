import { createHash } from 'node:crypto';

import type { Block } from '../extract/html.ts';

/**
 * CHUNKING THAT FOLLOWS THE DOCUMENT RATHER THAN A RULER.
 *
 * ── WHY NOT A FIXED TOKEN WINDOW ────────────────────────────────────────────
 *
 * A sliding 512-token window is easy and it cuts sentences in half. The damage
 * is not aesthetic: an embedding of half a sentence sits somewhere between the
 * two meanings it straddles, which is a place no query lands, so the passage
 * becomes quietly unretrievable. Worse, it is unretrievable in a way that
 * looks exactly like "the corpus does not contain that" — the failure is
 * invisible from the outside.
 *
 * So the primary boundary is the document's own: a heading starts a section,
 * paragraphs accumulate inside it, and a chunk ends when the next paragraph
 * would take it past the target. Fixed windows appear in exactly one place —
 * a single paragraph longer than the hard maximum — and there the split is on
 * sentence boundaries, which is the least bad option rather than a good one.
 *
 * ── THE HEADING TRAIL TRAVELS WITH THE CHUNK ────────────────────────────────
 *
 * "Under £2m" means nothing. "Pricing > Retainers > Under £2m" is a fact. The
 * trail is prepended to the embedded text for that reason and stored
 * separately so a citation can show it — the same words serving retrieval and
 * provenance, which is why chunking sits between them.
 */

export interface Chunk {
  ord: number;
  kind: Block['kind'];
  headingPath: string;
  /** The passage itself, without the heading trail. What a citation quotes. */
  text: string;
  /** What is actually embedded: the trail, then the passage. */
  embedText: string;
  charStart: number;
  charEnd: number;
  /** sha256 of `text`. Identical passages are never re-embedded. */
  hash: string;
  tokenLen: number;
}

export interface ChunkOptions {
  /** Aim for this many tokens. Chunks end at the first paragraph that passes it. */
  targetTokens?: number;
  /** A chunk is never allowed past this. Only reached by one huge paragraph. */
  maxTokens?: number;
  /** Below this, a chunk is merged forward rather than stored alone. */
  minTokens?: number;
}

/**
 * Tokens, estimated rather than counted.
 *
 * A real tokenizer is a dependency and a model-specific one, and this number
 * is used for budgeting rather than for billing. Four characters per token is
 * close enough for English prose that the chunk sizes land where intended;
 * where it matters exactly — what a synthesis prompt actually costs — the
 * provider reports the real figure and `audit_run` records that instead.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sentences(text: string): string[] {
  /* Split after terminal punctuation followed by a space and a capital or a
     quote. Abbreviations still fool it; the consequence is a slightly long or
     short fragment rather than a lost one. */
  const parts = text.split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/);
  return parts.filter((p) => p.trim() !== '');
}

/** Split one oversized paragraph on sentence boundaries. The last resort. */
function splitLong(block: Block, maxTokens: number): Array<{ text: string; charStart: number; charEnd: number }> {
  const out: Array<{ text: string; charStart: number; charEnd: number }> = [];
  let buffer = '';
  let start = block.charStart;
  let cursor = block.charStart;

  for (const sentence of sentences(block.text)) {
    const candidate = buffer === '' ? sentence : `${buffer} ${sentence}`;
    if (buffer !== '' && estimateTokens(candidate) > maxTokens) {
      out.push({ text: buffer, charStart: start, charEnd: cursor });
      buffer = sentence;
      start = cursor;
    } else {
      buffer = candidate;
    }
    cursor += sentence.length + 1;
  }
  if (buffer !== '') out.push({ text: buffer, charStart: start, charEnd: block.charEnd });
  return out;
}

export function chunkBlocks(blocks: Block[], opts: ChunkOptions = {}): Chunk[] {
  const target = opts.targetTokens ?? 320;
  const max = opts.maxTokens ?? 512;
  const min = opts.minTokens ?? 24;

  interface Pending {
    kind: Block['kind'];
    headingPath: string;
    texts: string[];
    charStart: number;
    charEnd: number;
  }

  const chunks: Chunk[] = [];
  let pending: Pending | null = null;

  const flush = () => {
    if (pending === null) return;
    const text = pending.texts.join('\n\n').trim();
    if (text === '') {
      pending = null;
      return;
    }
    const embedText = pending.headingPath === '' ? text : `${pending.headingPath}\n\n${text}`;
    chunks.push({
      ord: chunks.length,
      kind: pending.kind,
      headingPath: pending.headingPath,
      text,
      embedText,
      charStart: pending.charStart,
      charEnd: pending.charEnd,
      hash: createHash('sha256').update(text).digest('hex'),
      tokenLen: estimateTokens(embedText),
    });
    pending = null;
  };

  for (const block of blocks) {
    /*
     * A heading is not a chunk of its own. On its own it is three words with
     * no content, which embeds to nothing useful and clutters every result
     * list. It becomes the trail for what follows, and it closes whatever was
     * open — which is the actual section boundary.
     */
    if (block.kind === 'section') {
      flush();
      continue;
    }

    const blockTokens = estimateTokens(block.text);

    if (blockTokens > max) {
      flush();
      for (const piece of splitLong(block, max)) {
        pending = {
          kind: block.kind,
          headingPath: block.headingPath,
          texts: [piece.text],
          charStart: piece.charStart,
          charEnd: piece.charEnd,
        };
        flush();
      }
      continue;
    }

    /* A change of heading trail is a change of subject, whatever the size. */
    if (pending !== null && pending.headingPath !== block.headingPath) flush();

    if (pending === null) {
      pending = {
        kind: block.kind,
        headingPath: block.headingPath,
        texts: [block.text],
        charStart: block.charStart,
        charEnd: block.charEnd,
      };
    } else {
      pending.texts.push(block.text);
      pending.charEnd = block.charEnd;
      if (pending.kind !== block.kind) pending.kind = 'section';
    }

    if (estimateTokens(pending.texts.join(' ')) >= target) flush();
  }
  flush();

  /*
   * Merge the runts.
   *
   * A trailing two-word paragraph becomes a chunk that is retrievable and
   * useless, and one of those in a result set displaces something that would
   * have helped. Merging forward keeps the heading trail of the chunk it joins,
   * which is correct — it was under that heading already.
   */
  const merged: Chunk[] = [];
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (
      previous !== undefined &&
      chunk.tokenLen < min &&
      previous.headingPath === chunk.headingPath &&
      previous.tokenLen + chunk.tokenLen <= max
    ) {
      const text = `${previous.text}\n\n${chunk.text}`;
      merged[merged.length - 1] = {
        ...previous,
        text,
        embedText: previous.headingPath === '' ? text : `${previous.headingPath}\n\n${text}`,
        charEnd: chunk.charEnd,
        hash: createHash('sha256').update(text).digest('hex'),
        tokenLen: estimateTokens(text),
      };
      continue;
    }
    merged.push(chunk);
  }

  return merged.map((c, i) => ({ ...c, ord: i }));
}
