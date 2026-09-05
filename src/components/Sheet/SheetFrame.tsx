import { useEffect, useRef } from 'react';
import { LAB } from '../../content/brand';
import './sheet.css';

/**
 * THE SHEET FURNITURE.
 *
 * Every printed sheet carries instrumentation in its trim area: corner trim
 * marks, a registration target, a plate identifier. It is functional apparatus
 * that happens to look extraordinary, and it is the language this whole product
 * is built in — see docs/EXPERIENCE_LAB_REFERENCES.md §9.
 *
 * It persists across every stage, so the Lab always reads as one continuous
 * physical object being handled, rather than a sequence of pages.
 */

interface Props {
  /** Right-hand readout. The launcher shows status; the index shows a count. */
  readout?: string;
  /** Corner marks are suppressed inside X-Ray, which draws its own. */
  marks?: boolean;
}

export function SheetFrame({ readout, marks = true }: Props) {
  const clockRef = useRef<HTMLSpanElement>(null);

  // A real, slowly-updating value. Mono is the instrument's voice and must not
  // be used to print decorative gibberish, so this is an actual clock.
  useEffect(() => {
    const el = clockRef.current;
    if (!el) return;
    const write = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    write();
    const id = window.setInterval(write, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="sheet" aria-hidden="true">
      {marks && (
        <>
          <span className="sheet__mark sheet__mark--tl" />
          <span className="sheet__mark sheet__mark--tr" />
          <span className="sheet__mark sheet__mark--bl" />
          <span className="sheet__mark sheet__mark--br" />
        </>
      )}

      <div className="sheet__band sheet__band--top">
        <span className="t-mono t-mono-s sheet__id">
          {LAB.system}
          <span className="t-faint"> / </span>
          {LAB.sheet}
        </span>
        <span className="t-mono t-mono-xs t-dim sheet__readout">
          {readout ? `${readout} · ` : ''}
          <span ref={clockRef}>--:--:--</span>
        </span>
      </div>
    </div>
  );
}
