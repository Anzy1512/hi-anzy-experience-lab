import { useMemo } from 'react';
import type { SystemReading } from './model';

/**
 * THE TABLE.
 *
 * Every choice puts words on this surface. They land scattered and stay
 * scattered — accumulating, overlapping, unordered — for as long as the problem
 * is unresolved. When the last question is answered they **sort themselves into
 * the clusters the model chose**, and the ambiguity visibly becomes structure.
 *
 * This is the whole argument against the mode being a questionnaire: the answers
 * are not consumed by a form, they are material, and the visitor watches the
 * material get organised.
 *
 * POSITION IS RENDERED, NOT ANIMATED-TO. React writes each fragment's target
 * coordinates as inline style and a CSS transition carries it there. An earlier
 * version tweened `opacity` from 0 with GSAP and the entire table was invisible
 * whenever the frame budget stalled — the same failure Phase 1 hit with the
 * Reality Index. A fragment's presence must never depend on an animation
 * running; only its *travel* may.
 *
 * Positions are deterministic from the fragment id, so the same brief always
 * produces the same table.
 */

interface Props {
  fragments: Array<{ id: string; word: string; qid: string }>;
  reading: SystemReading | null;
  phase: 'brief' | 'asking' | 'system';
  reduced: boolean;
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

export function FragmentTable({ fragments, reading, phase, reduced }: Props) {
  const sorted = phase === 'system' && reading;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; r: number; d: number }>();
    const cols = reading ? Math.max(1, reading.clusters.length) : 1;

    fragments.forEach((f, i) => {
      if (sorted) {
        // Sorted: one column per cluster, filling downward.
        const col = i % cols;
        const row = Math.floor(i / cols);
        map.set(f.id, {
          x: (col + 0.5) * (92 / cols) + 4,
          y: 18 + row * 6.4,
          r: 0,
          d: hash01(f.id, 4) * 0.4,
        });
      } else {
        // Scattered: unresolved material, lying where it fell.
        map.set(f.id, {
          x: 8 + hash01(f.id, 1) * 74,
          y: 12 + hash01(f.id, 2) * 72,
          r: (hash01(f.id, 3) - 0.5) * 15,
          d: 0,
        });
      }
    });
    return map;
  }, [fragments, reading, sorted]);

  return (
    <div className="sim-table" data-sorted={sorted ? 'true' : 'false'} aria-hidden="true">
      <span className="sim-table__rule sim-table__rule--h" />
      <span className="sim-table__rule sim-table__rule--v" />

      {fragments.map((f) => {
        const p = positions.get(f.id);
        return (
          <span
            className="sim-frag"
            key={f.id}
            data-q={f.qid}
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
