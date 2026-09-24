import { useId, useState } from 'react';

import { Ask } from './views/Ask.tsx';
import { Evidence } from './views/Evidence.tsx';
import { Jobs } from './views/Jobs.tsx';
import { MapView } from './views/MapView.tsx';
import { Pilot } from './views/Pilot.tsx';
import { Review } from './views/Review.tsx';
import { useService, VIEWS, VIEW_DESCRIPTION, VIEW_LABEL, type View } from './state.ts';

/**
 * THE AUDIT SURFACE.
 *
 * ── ONE SURFACE, TWO PLACES IT RUNS ─────────────────────────────────────────
 *
 * As a reality inside the Lab, and as its own page at `product.html`. The two
 * differ by one thing — who owns the skip link and the outer frame — so that
 * is a prop, not a second copy. A fork here would drift within a week and the
 * Lab would end up showing an older audit than the standalone build.
 *
 * ── THE SERVICE LINE COMES FIRST ────────────────────────────────────────────
 *
 * Whether anything is answering sits at the top rather than in a corner. This
 * is a window onto a separate process; every number below it means nothing if
 * that process is absent, and finding that out at the bottom of a blank screen
 * is the wrong order.
 *
 * ── AND THE KEY FIELD IS PART OF THE DOCUMENT ───────────────────────────────
 *
 * Not a modal, not a settings screen. The service holds a credential that can
 * spend money, the surface refuses to carry it in its build, and the
 * consequence — that a reader has to supply it — is stated where it happens.
 */
export function Surface({ standalone = false }: { standalone?: boolean }): React.JSX.Element {
  const [view, setView] = useState<View>('ask');
  const { reach, setKey, setBase, client, refresh } = useService();
  const keyId = useId();
  const baseId = useId();
  const [draftKey, setDraftKey] = useState('');
  const [remember, setRemember] = useState(false);

  return (
    /*
     * The frame this surface is inside, declared so the stylesheet can answer
     * it. As a page, the document scrolls and the surface is the whole of it.
     * Inside the Lab the mode host is a fixed, non-scrolling box with a chrome
     * band across the top, so the surface has to bring its own scroll and get
     * out from under that band.
     */
    <div className="audit" data-frame={standalone ? 'page' : 'lab'}>
      {/* The Lab prints its own skip link above the mode host; a second one
          here would put two identical targets in the tab order. */}
      {standalone ? (
        <a className="audit__skip" href="#audit-main">
          Skip to content
        </a>
      ) : null}

      <header className="masthead">
        <div className="masthead__line">
          <h1 className="masthead__name">
            Hi Anzy <span>Commercial Audit</span>
          </h1>
          <p className="reach">
            <span className="reach__state" data-state={reach.state}>
              {reach.state === 'ONLINE' ? 'SERVICE ONLINE' : reach.state}
            </span>
            <span className="reach__detail">{reach.detail}</span>
            {reach.state === 'ONLINE' ? (
              <span className="reach__detail">
                {reach.capabilities.model.available ? 'model available' : 'no model'}
                {reach.capabilities.search.configured ? ' · discovery on' : ' · no search'}
                {reach.capabilities.geography?.ok === true ? ' · geocoder on' : ' · no geocoder'}
              </span>
            ) : null}
          </p>
        </div>

        {reach.state === 'ONLINE' && client.hasKey() ? null : (
          <div className="audit__row">
            <div className="field">
              <label className="field__label" htmlFor={baseId}>
                Service address
              </label>
              <input
                id={baseId}
                className="field__input"
                defaultValue={client.base}
                onBlur={(e) => setBase(e.target.value.trim())}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={keyId}>
                API key — stays in this tab
              </label>
              <input
                id={keyId}
                className="field__input"
                type="password"
                autoComplete="off"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
              />
            </div>
            {/* The label IS the hit target, so the control clears the 32px
                floor rather than being a 13px square beside a caption. */}
            <label className="check" htmlFor={`${keyId}-remember`}>
              <input
                id={`${keyId}-remember`}
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Keep for this tab
            </label>
            <button
              type="button"
              className="button"
              onClick={() => setKey(draftKey.trim(), remember)}
              disabled={draftKey.trim() === ''}
            >
              Connect
            </button>
            <button type="button" className="button button--quiet" onClick={refresh}>
              Retry
            </button>
          </div>
        )}

        <nav className="tabs" aria-label="Sections">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className="tabs__item"
              aria-selected={view === v}
              role="tab"
              onClick={() => setView(v)}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </nav>
      </header>

      <main className="audit__sheet audit__sheet--wide" id="audit-main" tabIndex={-1}>
        <p className="prose dim">{VIEW_DESCRIPTION[view]}</p>
        {view === 'ask' ? <Ask /> : null}
        {view === 'pilot' ? <Pilot /> : null}
        {view === 'jobs' ? <Jobs /> : null}
        {view === 'evidence' ? <Evidence /> : null}
        {view === 'map' ? <MapView /> : null}
        {view === 'review' ? <Review /> : null}
      </main>

      <footer className="colophon">
        <span>HI ANZY</span>
        <span>Every conclusion carries the passage it rests on.</span>
        <span>NOT_OBSERVED means a crawl looked and did not find. It is not absence.</span>
      </footer>
    </div>
  );
}
