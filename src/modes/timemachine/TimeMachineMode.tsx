import { useCallback, useEffect, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useReducedMotion } from '../../core/hooks';
import { setPointerIntent } from '../../core/pointer';
import { ERAS, SOURCE, TM_COPY, type EraId } from '../../content/eras';
import './timemachine.css';

/**
 * TIME MACHINE — THE SAME INFORMATION THROUGH DIFFERENT ERAS OF THE WEB.
 *
 * Not seven colour themes. Each era changes the **interaction model**: what
 * navigation is, whether the interface has state, whether it acknowledges the
 * pointer, whether content can change without the page changing, and what the
 * machine was assumed to be able to do.
 *
 *   1995  every view is a document you navigate to. No hover, no retained state.
 *   2000  a menu beside a pane. Rollovers exist. Content swaps in one region.
 *   2007  tabs and a modal. The page stops being a page.
 *   2015  scroll is navigation. Touch targets. A hamburger.
 *   2020  sections with a tracking index, and motion preferences honoured.
 *   2026  a reality index of modes, each with its own physics. This Lab.
 *   2035  no navigation at all — you state intent and a view is assembled.
 *
 * The content exists once, in `content/eras.ts`, and every era renders the same
 * object. That is the demonstration: content persists, interfaces change.
 */

export default function TimeMachineMode({ onReady, scope }: ModeViewProps) {
  const reduced = useReducedMotion();
  const [era, setEra] = useState<EraId>('1995');
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 120 : 380,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  const current = ERAS.find((e) => e.id === era) ?? ERAS[0];
  const index = ERAS.indexOf(current);

  const step = useCallback(
    (d: number) => {
      const next = ERAS[Math.max(0, Math.min(ERAS.length - 1, index + d))];
      setEra(next.id);
    },
    [index],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  return (
    <div className="tm" data-armed={armed ? 'true' : 'false'} data-era={era}>
      <header className="tm-head">
        <h1 className="t-mono t-mono-xs tm-head__title">
          <span className="t-signal">{TM_COPY.title}</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">{TM_COPY.tagline}</span>
        </h1>
      </header>

      {/* ---- the viewport. Each era owns everything inside it. ------------- */}
      <div className="tm-screen" key={era}>
        <EraView era={era} />
      </div>

      {/* ---- the scrubber ------------------------------------------------- */}
      <nav className="tm-scrub" aria-label="Eras">
        {ERAS.map((e) => (
          <button
            key={e.id}
            type="button"
            className="tm-scrub__stop"
            data-on={e.id === era ? 'true' : 'false'}
            aria-current={e.id === era}
            onClick={() => setEra(e.id)}
          >
            <span className="tm-scrub__tick" aria-hidden="true" />
            <span className="t-mono t-mono-xs">{e.label}</span>
          </button>
        ))}
      </nav>

      {/* ---- what actually changed ---------------------------------------- */}
      <aside className="tm-notes">
        <dl className="tm-notes__list">
          <div>
            <dt>NAVIGATION</dt>
            <dd>{current.navigation}</dd>
          </div>
          <div>
            <dt>INTERACTION</dt>
            <dd>{current.interaction}</dd>
          </div>
          <div>
            <dt>LAYOUT</dt>
            <dd>{current.layout}</dd>
          </div>
          <div>
            <dt>TYPE</dt>
            <dd>{current.typography}</dd>
          </div>
        </dl>
        <p className="t-body-s t-dim tm-notes__note">{current.note}</p>
        {era === '2035' && (
          <p className="t-mono t-mono-xs tm-notes__flag">{TM_COPY.speculative}</p>
        )}
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* THE ERAS. Same content, seven interaction models.                           */
/* -------------------------------------------------------------------------- */

function EraView({ era }: { era: EraId }) {
  switch (era) {
    case '1995':
      return <Era1995 />;
    case '2000':
      return <Era2000 />;
    case '2007':
      return <Era2007 />;
    case '2015':
      return <Era2015 />;
    case '2020':
      return <Era2020 />;
    case '2026':
      return <Era2026 />;
    case '2035':
      return <Era2035 />;
  }
}

/** 1995 — every view is a document. The only control is a link and Back. */
function Era1995() {
  const [page, setPage] = useState<'home' | 'method' | 'services'>('home');
  return (
    <div className="e95">
      <h1>{SOURCE.company}</h1>
      <hr />
      {page === 'home' && (
        <>
          <p>{SOURCE.statement}</p>
          <p>{SOURCE.blurb}</p>
          <p>
            <a href="#method" onClick={(e) => { e.preventDefault(); setPage('method'); }}>Our Method</a>
            {' | '}
            <a href="#services" onClick={(e) => { e.preventDefault(); setPage('services'); }}>Services</a>
          </p>
          <hr />
          <p className="e95-small">
            This page is under construction. Best viewed at 640x480.
          </p>
        </>
      )}
      {page !== 'home' && (
        <>
          <h2>{page === 'method' ? 'Our Method' : 'Services'}</h2>
          <ul>
            {(page === 'method' ? SOURCE.method : SOURCE.services).map((m) => (
              <li key={m.name}>
                <b>{m.name}</b> — {m.line}
              </li>
            ))}
          </ul>
          <p>
            <a href="#back" onClick={(e) => { e.preventDefault(); setPage('home'); }}>
              [ Back to Main Page ]
            </a>
          </p>
        </>
      )}
    </div>
  );
}

/** 2000 — a menu beside a pane. Rollovers exist; the page does not change. */
function Era2000() {
  const [pane, setPane] = useState(0);
  const panes = [
    { name: 'WELCOME', body: [SOURCE.statement, SOURCE.blurb] },
    { name: 'METHOD', body: SOURCE.method.map((m) => `${m.name}: ${m.line}`) },
    { name: 'SERVICES', body: SOURCE.services.map((s) => `${s.name}: ${s.line}`) },
  ];
  return (
    <div className="e00">
      <div className="e00-shell">
        <div className="e00-banner">{SOURCE.company}</div>
        <div className="e00-body">
          <nav className="e00-menu">
            {panes.map((p, i) => (
              <button key={p.name} type="button" data-on={i === pane} onClick={() => setPane(i)}>
                {p.name}
              </button>
            ))}
          </nav>
          <div className="e00-pane">
            <h3>{panes[pane].name}</h3>
            {panes[pane].body.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <div className="e00-foot">Visitors since 1999: 000482 · Last updated: today</div>
      </div>
    </div>
  );
}

/** 2007 — tabs and a modal. The page stops being a page. */
function Era2007() {
  const [tab, setTab] = useState(0);
  const [modal, setModal] = useState<string | null>(null);
  const tabs = ['About', 'Method', 'Services'];
  return (
    <div className="e07">
      <div className="e07-shell">
        <div className="e07-head">
          <span className="e07-logo">{SOURCE.company}</span>
          <div className="e07-tabs">
            {tabs.map((t, i) => (
              <button key={t} type="button" data-on={i === tab} onClick={() => setTab(i)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="e07-panel">
          {tab === 0 && (
            <>
              <h2>{SOURCE.statement}</h2>
              <p>{SOURCE.blurb}</p>
            </>
          )}
          {tab === 1 &&
            SOURCE.method.map((m) => (
              <button key={m.name} type="button" className="e07-item" onClick={() => setModal(m.line)}>
                {m.name}
              </button>
            ))}
          {tab === 2 &&
            SOURCE.services.map((s) => (
              <button key={s.name} type="button" className="e07-item" onClick={() => setModal(s.line)}>
                {s.name}
              </button>
            ))}
        </div>
      </div>
      {modal && (
        <div className="e07-modal" role="dialog" aria-modal="true">
          <div className="e07-modal__box">
            <p>{modal}</p>
            <button type="button" onClick={() => setModal(null)}>
              close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 2015 — scroll is navigation. Hamburger. Cards. */
function Era2015() {
  const [menu, setMenu] = useState(false);
  return (
    <div className="e15">
      <div className="e15-bar">
        <span>{SOURCE.company}</span>
        <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
          ☰
        </button>
      </div>
      {menu && (
        <div className="e15-menu">
          {['Home', 'Method', 'Services'].map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
      <div className="e15-scroll">
        <section className="e15-hero">
          <h2>{SOURCE.statement}</h2>
          <p>{SOURCE.blurb}</p>
        </section>
        <section className="e15-cards">
          {SOURCE.services.map((s) => (
            <article key={s.name}>
              <h3>{s.name}</h3>
              <p>{s.line}</p>
            </article>
          ))}
        </section>
        <section className="e15-cards">
          {SOURCE.method.map((m) => (
            <article key={m.name}>
              <h3>{m.name}</h3>
              <p>{m.line}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

/** 2020 — sections with a tracking index; motion preferences honoured. */
function Era2020() {
  const [at, setAt] = useState(0);
  const sections = [
    { id: 'position', title: SOURCE.statement, body: [SOURCE.blurb] },
    { id: 'method', title: 'Method', body: SOURCE.method.map((m) => `${m.name} — ${m.line}`) },
    { id: 'services', title: 'Services', body: SOURCE.services.map((s) => `${s.name} — ${s.line}`) },
  ];
  return (
    <div className="e20">
      <nav className="e20-index">
        {sections.map((s, i) => (
          <button key={s.id} type="button" data-on={i === at} onClick={() => setAt(i)}>
            {String(i + 1).padStart(2, '0')} {s.id}
          </button>
        ))}
      </nav>
      <div className="e20-body">
        <h2>{sections[at].title}</h2>
        {sections[at].body.map((b) => (
          <p key={b}>{b}</p>
        ))}
      </div>
    </div>
  );
}

/** 2026 — the Lab. Modes, not pages, and the real index state. */
function Era2026() {
  return (
    <div className="e26">
      <p className="t-mono t-mono-xs t-faint">REALITY INDEX</p>
      <h2 className="t-display t-display-m">{SOURCE.statement}</h2>
      <ul className="e26-list">
        {SOURCE.realities.map((r) => (
          <li key={r.index} data-on={r.online ? 'true' : 'false'}>
            <span className="t-mono t-mono-xs">{r.index}</span>
            <span className="t-display t-display-s">{r.title}</span>
            <span className="t-mono t-mono-xs">{r.online ? 'ONLINE' : 'NOT BUILT'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 2035 — no navigation. You state intent; a view is assembled. */
function Era2035() {
  const [intent, setIntent] = useState('');
  const [asked, setAsked] = useState<string | null>(null);

  // Deliberately dumb: it matches words against the same source object and
  // composes a view. There is no model here and none is implied.
  const answer = (() => {
    if (!asked) return null;
    const q = asked.toLowerCase();
    const method = SOURCE.method.filter((m) => q.includes(m.name.toLowerCase()));
    const services = SOURCE.services.filter((s) => q.includes(s.name.toLowerCase()));
    if (method.length || services.length) return [...method, ...services];
    if (q.includes('method') || q.includes('how')) return [...SOURCE.method];
    if (q.includes('what') || q.includes('do') || q.includes('service')) return [...SOURCE.services];
    return null;
  })();

  return (
    <div className="e35">
      <form
        className="e35-intent"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(intent);
        }}
      >
        <label htmlFor="e35-in">STATE WHAT YOU NEED</label>
        <input
          id="e35-in"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="what do you actually do?"
          autoComplete="off"
        />
      </form>

      <div className="e35-out" aria-live="polite">
        {!asked && <p className="e35-idle">No page exists until it is asked for.</p>}
        {asked && answer && (
          <ul>
            {answer.map((a) => (
              <li key={a.name}>
                <strong>{a.name}</strong>
                <span>{a.line}</span>
              </li>
            ))}
          </ul>
        )}
        {asked && !answer && (
          <p className="e35-idle">
            Nothing in the source matches that. The view is empty rather than invented.
          </p>
        )}
      </div>
    </div>
  );
}
