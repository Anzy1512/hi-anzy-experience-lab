import { useCallback } from 'react';
import { useExperience } from '../../experience/context';
import { findMode } from '../../content/lab';
import { useProject } from '../../system/project';
import {
  OPEN_WORK,
  WORK,
  activeWorkId,
  leaveWork,
  progressOf,
  startWork,
  useActiveWork,
} from '../../system/work';
import './work-band.css';

/**
 * WHAT DO YOU WANT TO DO — the decision before the catalogue.
 *
 * ── WHY IT SITS ON THE INDEX ────────────────────────────────────────────────
 *
 * The Lab's front door offers a curated route and the full index, and both of
 * those are ways of LOOKING. A founder arriving with a problem was met by
 * sixteen rows and had to work out for themselves that AGENCY SIMULATOR was the
 * one that would help — which is the same failure the index grouping fixed one
 * level up, one level further out.
 *
 * This is the missing question, asked before the catalogue rather than instead
 * of it: three jobs with an outcome, one open route for people who would rather
 * drive, and the whole index still underneath. Nobody is funnelled; the band is
 * a suggestion sitting above a map.
 *
 * ── IT IS QUIETER THAN THE WORK ─────────────────────────────────────────────
 *
 * Orchestration chrome must never out-shout the products. So this is a ruled
 * band in the system voice — no cards, no progress bars, no step counters. The
 * only thing that is ever emphasised is a piece of work already underway, and
 * then only by a mark and a count of what actually exists.
 */
export function WorkBand() {
  const { enterMode } = useExperience();
  const project = useProject();
  const active = useActiveWork();

  const begin = useCallback(
    (id: string, product: string) => {
      startWork(id);
      enterMode(product);
    },
    [enterMode],
  );

  const openSystem = useCallback(() => {
    /* The open route is not a piece of work and must not leave a half-finished
       one selected behind it — a visitor who chose to drive should not find a
       guided strip following them around. */
    leaveWork();
    enterMode(OPEN_WORK.product);
  }, [enterMode]);

  return (
    <section className="wb" aria-labelledby="wb-head">
      <header className="wb__head">
        <h2 className="t-mono t-mono-s wb__label" id="wb-head">
          WHAT DO YOU WANT TO DO?
        </h2>
        <p className="t-mono t-mono-xs t-dim wb__note">
          Three jobs with something at the end of them. The whole index is below.
        </p>
      </header>

      <ul className="wb__list">
        {WORK.map((w) => {
          /* Read rather than tracked: a visitor who ran the Simulator on their
             own has already done step one, and this says so without anybody
             having pressed a start button. */
          const p = progressOf(w, project);
          const chosen = activeWorkId() === w.id;
          const first = w.steps[0];
          return (
            <li key={w.id} className="wb__item" data-status={p.status.toLowerCase()}>
              <button
                type="button"
                className="wb__hit"
                onClick={() => begin(w.id, (p.next ?? p.steps[0]).step.product)}
              >
                <span className="wb__mark" aria-hidden="true" />
                <span className="wb__body">
                  <span className="t-display t-display-s wb__title">{w.title}</span>
                  <span className="t-body-s wb__purpose">{w.purpose}</span>
                  <span className="t-mono t-mono-xs wb__state">
                    {p.status === 'COMPLETE'
                      ? p.optionalOpen
                        ? /* Everything it needs exists, and one step it does not
                             need is still there to take. Saying FINISHED here
                             would quietly retire a tool the visitor may well
                             want. */
                          /* The product name is wrapped so a narrow column
                             cannot break X-RAY across two lines at its own
                             hyphen. */
                          <>
                            EVERYTHING REQUIRED EXISTS · {p.doneCount} OF {p.gateCount} MADE ·{' '}
                            <span className="wb__nobr">
                              {findMode(p.optionalOpen.step.product)?.title ?? 'ONE STEP'}
                            </span>{' '}
                            IS STILL OPEN
                          </>
                        : `FINISHED · ${p.doneCount} OF ${p.gateCount} MADE`
                      : p.status === 'ACTIVE'
                        ? `UNDER WAY · ${p.doneCount} OF ${p.gateCount} MADE · NEXT, ${
                            p.next?.step.gets.split('.')[0] ?? 'CONTINUE'
                          }`
                        : `STARTS WITH ${first.gives}`}
                    {chosen ? ' · FOLLOWING THIS' : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}

        {/* The expert route. Deliberately last and deliberately plainer: it is
            not a lesser choice, it is a different one, and dressing it as a
            fourth job would misdescribe it. */}
        <li className="wb__item wb__item--open">
          <button type="button" className="wb__hit" onClick={openSystem}>
            <span className="wb__mark" aria-hidden="true" />
            <span className="wb__body">
              <span className="t-display t-display-s wb__title">{OPEN_WORK.title}</span>
              <span className="t-body-s wb__purpose">{OPEN_WORK.purpose}</span>
            </span>
          </button>
        </li>
      </ul>

      {active && (
        <p className="t-mono t-mono-xs wb__following" role="status">
          FOLLOWING {active.definition.title} ·{' '}
          {active.doneCount} OF {active.gateCount} MADE
          <button type="button" className="wb__leave" onClick={leaveWork}>
            STOP FOLLOWING
          </button>
        </p>
      )}
    </section>
  );
}
