import { useCallback } from 'react';
import { useExperience } from '../../experience/context';
import { findMode } from '../../content/lab';
import { setPointerIntent } from '../../core/pointer';
import { leaveWork, useActiveWork } from '../../system/work';
import './work-strip.css';

/**
 * THE WORK YOU ARE FOLLOWING — carried in the mode host's chrome band.
 *
 * ── WHY IT IS NOT A PANEL ───────────────────────────────────────────────────
 *
 * This was twice a floating panel before it was this, and both times it printed
 * over the product underneath. Pinned below the EXIT control it covered AGENCY
 * SIMULATOR's own headline and standfirst. Moved to the onward-moves corner it
 * covered the REPUTATION cluster in the same mode's system view, because that
 * corner is only clear in the modes whose bottom band is chrome — the
 * Simulator's right column is a scrolling document that runs the full height.
 *
 * There is no free rectangle. Every reality here is full-bleed by design. The
 * only region all sixteen have been built to keep clear is the host's own
 * chrome band, because the way out has lived there since Phase 1 — so that is
 * where this goes, in that band's own scale and weight, between the mode's
 * number and EXIT.
 *
 * ── AND IT SAYS ALMOST NOTHING ──────────────────────────────────────────────
 *
 * An earlier version listed what came in, what this product does and what
 * leaves with you. Three of those are the products' own job: X-RAY names the
 * page that arrived, DIRECTOR names the document it is working from, and every
 * artifact bar says what leaves. What no product can know is which piece of
 * work it is standing inside — so that is all this says, plus the next door and
 * the way off the route.
 *
 * ── NOT A WIZARD ────────────────────────────────────────────────────────────
 *
 * No step counter and no progress bar: the count is of artifacts that exist,
 * read off the project. NEXT is a door rather than a transition — nothing
 * advances when it is pressed. STOP is always present and always adjacent,
 * because a guided path a visitor cannot step off is a funnel, and every
 * product under it was built to be entered directly.
 *
 * It renders nothing at all when no work is being followed.
 */
export function WorkStrip() {
  const { activeMode, enterMode } = useExperience();
  const work = useActiveWork();

  const go = useCallback(
    (product: string) => {
      setPointerIntent('default');
      enterMode(product);
    },
    [enterMode],
  );

  if (!work || !activeMode) return null;

  const next = work.next;
  const nextMode = next ? findMode(next.step.product) : null;
  const onward = next && nextMode && next.step.product !== activeMode.id ? nextMode : null;

  return (
    <div className="ws" role="group" aria-label="The work you are following">
      <p className="ws__work t-mono t-mono-xs">
        <span className="ws__mark" aria-hidden="true" />
        <span className="ws__title">{work.definition.title}</span>
        <span className="t-dim ws__count">
          · {work.doneCount} OF {work.gateCount} MADE
        </span>
      </p>

      {onward && next && (
        <button
          type="button"
          className="ws__btn ws__btn--go t-mono t-mono-xs"
          onClick={() => go(next.step.product)}
          onPointerEnter={() => setPointerIntent('enter')}
          onPointerLeave={() => setPointerIntent('scan')}
          title={next.step.gets}
        >
          NEXT · {onward.title}
        </button>
      )}

      {/* Only when there is genuinely nothing left. Standing inside the one
          optional step that has not been taken is not "finished", whatever the
          required steps say. */}
      {work.status === 'COMPLETE' && !work.next && (
        <span className="ws__done t-mono t-mono-xs">NOTHING LEFT TO MAKE</span>
      )}

      <button
        type="button"
        className="ws__btn t-mono t-mono-xs"
        onClick={leaveWork}
        onPointerEnter={() => setPointerIntent('enter')}
        onPointerLeave={() => setPointerIntent('scan')}
      >
        STOP
      </button>
    </div>
  );
}
