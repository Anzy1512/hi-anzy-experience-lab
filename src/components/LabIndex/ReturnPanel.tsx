import { useEffect, useState } from 'react';
import { RETURN_COPY } from '../../content/brand';
import { useExperience } from '../../experience/context';
import { leavePath } from '../../experience/journey';
import { emit } from '../../analytics/events';
import { setPointerIntent } from '../../core/pointer';

/**
 * THE END OF THE ROUTE.
 *
 * Shown once, on the Index, after the last stop of the curated path has been
 * entered and left. Not an overlay, not a modal, not a thing that arrives while
 * a reality is still playing: it is a panel at the top of the map, in the place
 * the visitor was going to look anyway.
 *
 * ── WHY IT IS NOT A CALL TO ACTION ──────────────────────────────────────────
 *
 * Because the twenty minutes before it were not an advertisement, and ending
 * them with one would retroactively make them into one. The Lab's whole claim
 * is that this company thinks in public; a hard ask at the end reads as the
 * moment the thinking stops and the selling starts, and the visitor reinterprets
 * everything behind it.
 *
 * So it offers three moves and ranks none of them. One stays in the Lab, one
 * goes back to the business, one dismisses the panel and leaves the map alone.
 * There is no urgency, no scarcity, no count of what was seen, and nothing that
 * claims a result. `KEEP EXPLORING` is a real option, not a dark-pattern decline.
 *
 * ── WHERE "TALK TO HI ANZY" GOES ────────────────────────────────────────────
 *
 * `VITE_COMMERCIAL_URL`, defaulting to `/`. In the deployed arrangement the Lab
 * is mounted at `/lab/` on the commercial origin, so `/` is the site — a plain
 * document navigation out of the Lab and back to Reality 0, which is also what
 * makes it a real exit: nothing of the Lab's runtime survives it.
 */
const COMMERCIAL_HOME = import.meta.env.VITE_COMMERCIAL_URL || '/';

export function ReturnPanel() {
  const { enterMode } = useExperience();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    emit('commercial_return');
  }, []);

  if (dismissed) return null;

  return (
    <section className="index__return" aria-labelledby="return-line">
      <p className="t-mono t-mono-xs t-signal index__return-eyebrow">{RETURN_COPY.eyebrow}</p>
      <p className="t-display t-display-s index__return-line" id="return-line">
        {RETURN_COPY.line}
      </p>
      <p className="t-body index__return-sub">{RETURN_COPY.sub}</p>

      <div className="index__return-moves">
        <button
          type="button"
          className="index__return-btn t-mono t-mono-xs"
          data-weight="signal"
          onClick={() => {
            leavePath();
            enterMode('agency-simulator');
          }}
          onPointerEnter={() => setPointerIntent('enter')}
          onPointerLeave={() => setPointerIntent('default')}
        >
          <span className="index__return-btn-label">{RETURN_COPY.simulate}</span>
          <span className="index__return-btn-note">{RETURN_COPY.simulateNote}</span>
        </button>

        <a
          className="index__return-btn t-mono t-mono-xs"
          href={COMMERCIAL_HOME}
          onClick={() => {
            emit('contact_after_lab');
            emit('lab_exit');
          }}
          onPointerEnter={() => setPointerIntent('enter')}
          onPointerLeave={() => setPointerIntent('default')}
        >
          <span className="index__return-btn-label">{RETURN_COPY.commercial}</span>
          <span className="index__return-btn-note">{RETURN_COPY.commercialNote}</span>
        </a>

        <button
          type="button"
          className="index__return-btn t-mono t-mono-xs"
          onClick={() => {
            leavePath();
            setDismissed(true);
          }}
          onPointerEnter={() => setPointerIntent('enter')}
          onPointerLeave={() => setPointerIntent('default')}
        >
          <span className="index__return-btn-label">{RETURN_COPY.stay}</span>
          <span className="index__return-btn-note">{RETURN_COPY.stayNote}</span>
        </button>
      </div>
    </section>
  );
}
