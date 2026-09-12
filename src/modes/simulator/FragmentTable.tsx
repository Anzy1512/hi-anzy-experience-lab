import { useMemo } from 'react';
import { QUESTIONS, SIM_COPY } from '../../content/simulator';
import type { SystemReading } from './model';

/**
 * THE WORKING TABLE.
 *
 * Not a decorative field with words on it — a **strategist's working surface**,
 * ruled into the five registers of the method. Every choice puts material onto
 * the surface, and it lands *in the register of the stage that produced it*, so
 * the method is spatial before it is ever explained:
 *
 *   ABSORB      what you said
 *   CLARIFY     what it implies
 *   BLUEPRINT   what has to be decided
 *   ASSEMBLE    who does it
 *   SUSTAIN     what keeps it alive
 *
 * Three things make this an argument rather than an ornament:
 *
 *  1. **Registers fill in order.** An untouched register is drawn but empty, so
 *     the surface shows how much of the method is still ahead of you. The blank
 *     space is composed rather than absent.
 *  2. **Fragments from one answer are tied together** by a drawn rule. A brief
 *     is not a list of words; it is words with consequences between them.
 *  3. **On completion the whole surface reorganises** into the clusters the
 *     model chose. Ambiguity visibly becomes structure — which is the one thing
 *     this reality exists to demonstrate.
 *
 * POSITION IS RENDERED, NOT ANIMATED-TO. React writes each fragment's target as
 * inline style and a CSS transition carries it there. An earlier version tweened
 * opacity with GSAP and the table went invisible whenever the frame budget
 * stalled. A fragment's presence must never depend on an animation running;
 * only its travel may.
 */

interface Frag {
  id: string;
  word: string;
  qid: string;
}

interface Props {
  fragments: Frag[];
  reading: SystemReading | null;
  phase: 'brief' | 'state' | 'asking' | 'system' | 'report';
  reduced: boolean;
}

/** The five registers, in order. Taken from the deck's own method. */
const REGISTERS = SIM_COPY.stages;

/** Which register a fragment belongs to, via the question that produced it. */
const STAGE_OF_QUESTION = new Map(QUESTIONS.map((q) => [q.id, q.stage]));

function registerIndex(qid: string): number {
  const stage = STAGE_OF_QUESTION.get(qid);
  const i = stage ? (REGISTERS as readonly string[]).indexOf(stage) : -1;
  return i >= 0 ? i : 0;
}

/** Stable pseudo-random in [0,1) from a string. Same fragment, same place. */
function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Left margin, in table percent, that the register labels live in. */
const MARGIN = 10;

interface Placed {
  x: number;
  y: number;
  r: number;
  d: number;
  lead: boolean;
}

export function FragmentTable({ fragments, reading, phase, reduced }: Props) {
  const sorted = (phase === 'system' || phase === 'report') && !!reading;

  /** How far through the method the table has been filled. */
  const reached = useMemo(() => {
    if (sorted) return REGISTERS.length - 1;
    return fragments.reduce((max, f) => Math.max(max, registerIndex(f.qid)), -1);
  }, [fragments, sorted]);

  const positions = useMemo(() => {
    const map = new Map<string, Placed>();
    const bandTop = 11;
    const bandHeight = (100 - bandTop - 6) / REGISTERS.length;

    // Group by question so fragments from one answer sit together and can be
    // tied by a rule — the consequence, drawn.
    const byQuestion = new Map<string, Frag[]>();
    for (const f of fragments) {
      const list = byQuestion.get(f.qid) ?? [];
      list.push(f);
      byQuestion.set(f.qid, list);
    }

    if (sorted && reading) {
      const cols = Math.max(1, reading.clusters.length);
      const rows = Math.max(1, Math.ceil(fragments.length / cols));
      // The sorted block occupies the surface rather than hugging the top: the
      // rows spread through the working area so the result reads as a finished
      // arrangement, not as a list that ran out.
      const top = 22;
      const span = 58;
      const step = rows > 1 ? span / (rows - 1) : 0;
      fragments.forEach((f, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        map.set(f.id, {
          x: MARGIN + (col + 0.5) * ((100 - MARGIN - 6) / cols),
          y: top + row * Math.min(14, step || 12),
          r: 0,
          d: hash01(f.id, 4) * 0.45,
          lead: false,
        });
      });
      return map;
    }

    // Lay each register out as a row of material rather than a pile. Answers
    // that land in the same register are given their own column of the row, and
    // a question's fragments step across and down from it — so nothing overlaps
    // and the reading order is the order the answers were given.
    const byBand = new Map<number, string[]>();
    for (const qid of byQuestion.keys()) {
      const band = registerIndex(qid);
      const list = byBand.get(band) ?? [];
      list.push(qid);
      byBand.set(band, list);
    }

    for (const [band, qids] of byBand) {
      const slots = Math.max(1, qids.length);
      qids.forEach((qid, slot) => {
        const list = byQuestion.get(qid) ?? [];
        // The register's usable width, divided between the answers in it.
        const slotW = 84 / slots;
        const slotX = MARGIN + slot * slotW;
        list.forEach((f, n) => {
          const perRow = Math.max(1, Math.floor(slotW / 20));
          const col = n % perRow;
          const row = Math.floor(n / perRow);
          map.set(f.id, {
            x: slotX + 2 + col * (slotW / perRow) + hash01(f.id, 1) * 2,
            y:
              bandTop +
              band * bandHeight +
              bandHeight * (0.26 + row * 0.24 + hash01(f.id, 2) * 0.06),
            r: (hash01(f.id, 3) - 0.5) * 5,
            d: n * 0.06,
            // The first fragment of an answer is the answer itself; the rest
            // are what it implies. Weight says which is which.
            lead: n === 0,
          });
        });
      });
    }
    return map;
  }, [fragments, reading, sorted]);

  /** Rules tying each answer's fragments together. */
  const ties = useMemo(() => {
    if (sorted) return [];
    const out: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    const byQuestion = new Map<string, Frag[]>();
    for (const f of fragments) {
      const list = byQuestion.get(f.qid) ?? [];
      list.push(f);
      byQuestion.set(f.qid, list);
    }
    for (const [qid, list] of byQuestion) {
      for (let i = 1; i < list.length; i++) {
        const a = positions.get(list[i - 1].id);
        const b = positions.get(list[i].id);
        if (a && b) out.push({ id: `${qid}-${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
    return out;
  }, [fragments, positions, sorted]);

  return (
    <div className="sim-table" data-sorted={sorted ? 'true' : 'false'} aria-hidden="true">
      {/* The registers. Drawn whether or not they hold anything yet — the
          surface shows how much method is still ahead. */}
      {!sorted && (
        <div className="sim-registers">
          {REGISTERS.map((name, i) => (
            <div
              className="sim-register"
              key={name}
              data-reached={i <= reached ? 'true' : 'false'}
              data-now={i === reached ? 'true' : 'false'}
            >
              <span className="sim-register__rule" />
              <span className="t-mono sim-register__name">
                <span className="sim-register__n">{String(i + 1).padStart(2, '0')}</span>
                {name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Consequences, drawn. One answer's material is tied together. */}
      {ties.length > 0 && (
        <svg className="sim-ties" viewBox="0 0 100 100" preserveAspectRatio="none">
          {ties.map((t) => (
            <line key={t.id} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}

      {fragments.map((f) => {
        const p = positions.get(f.id);
        return (
          <span
            className="sim-frag"
            key={f.id}
            data-q={f.qid}
            data-lead={p?.lead ? 'true' : 'false'}
            style={{
              left: `${p?.x ?? 50}%`,
              top: `${p?.y ?? 50}%`,
              transform: `translate(-50%, -50%) rotate(${p?.r ?? 0}deg)`,
              transitionDelay: reduced ? '0ms' : `${(p?.d ?? 0).toFixed(2)}s`,
            }}
          >
            {f.word}
          </span>
        );
      })}

      {sorted && reading && (
        <div className="sim-table__cols">
          {reading.clusters.map((c) => (
            <span className="sim-col t-mono t-mono-xs" key={c.cluster.id} data-band={c.band}>
              {c.cluster.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
