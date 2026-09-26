import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { engine, type BrandReport, type LegalReport, type NewsReport, type Parents } from '../engine';
import { NeedsEngine } from '../EngineLine';
import { countriesOf, count, isReady, when, type DeskProps } from '../link';

/**
 * I2 · BRANDS — WHAT A BRAND NAME STANDS FOR.
 *
 * The brand index (the name-suggestion-index, with Wikidata's facts) read the
 * way a question would read the name: one brand, or a family sharing its first
 * word. Then, only when asked: the legal entities whose registered names carry
 * the words (GLEIF), and what the news has said lately (GDELT). A name is not
 * ownership and a headline is not a fact about the brand; both are printed as
 * what they are.
 */

export default function BrandsDesk({ engineState, signal, go, receive, take }: DeskProps) {
  const [name, setName] = useState(() => take('brands')?.brand ?? '');
  const [countries, setCountries] = useState('');
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BrandReport | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = isReady(engineState);

  const ask = useCallback(
    async (text: string) => {
      const words = text.trim();
      if (!ready || words.length < 2) return;
      setBusy(true);
      setProblem(null);
      const got = await engine.brand(words, countriesOf(countries), !online, signal);
      setBusy(false);
      if (got.ok) setReport(got.value);
      else if (got.problem !== 'cancelled') setProblem(got.problem);
    },
    [countries, online, ready, signal],
  );

  useEffect(
    () =>
      receive('brands', (h) => {
        if (h.brand) setName(h.brand);
      }),
    [receive],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(name);
  };

  return (
    <>
      <NeedsEngine state={engineState} />
      <form className="sv-ask" onSubmit={submit} aria-label="Read a brand name">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-brand">
          BRAND
        </label>
        <input
          id="sv-brand"
          className="sv-question"
          type="text"
          value={name}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          placeholder="haldiram"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="sv-ask__row">
          <label className="t-mono t-mono-xs sv-field">
            COUNTRIES
            <input
              className="sv-field__wide"
              type="text"
              value={countries}
              placeholder="THE ENGINE'S"
              onChange={(e) => setCountries(e.target.value)}
            />
          </label>
          <label className="t-mono t-mono-xs sv-check">
            <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
            ASK ALL THE PLACES TOO
          </label>
          <button type="submit" className="sv-btn sv-btn--signal" disabled={!ready || name.trim().length < 2 || busy}>
            {busy ? 'READING…' : 'READ THE NAME'}
          </button>
        </div>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}

      {report && (
        <section className="sv-answer" aria-label="What the name stands for">
          <p className="t-body-s sv-lead">
            {report.brands.length === 0
              ? `No brand in the index is named “${report.text}”${report.countries.length ? ` in ${report.countries.join(', ')}` : ''}.`
              : report.family
                ? `“${report.text}” names a family of ${report.brands.length} brand(s) sharing the word “${report.family}”${report.countries.length ? `, in ${report.countries.join(', ')}` : ''}.`
                : `“${report.text}” names ${report.brands.length} brand(s)${report.countries.length ? ` in ${report.countries.join(', ')}` : ''}.`}
          </p>
          {report.atp_run && <p className="t-mono t-mono-xs t-dim">ALL THE PLACES · RUN {report.atp_run}</p>}
          {report.atp_problem && <p className="t-mono t-mono-xs sv-problem">{report.atp_problem.toUpperCase()}</p>}

          <ol className="sv-blocks">
            {report.brands.map((b) => (
              <li key={b.id} className="sv-block">
                <h2 className="t-display-s sv-block__name">{b.name}</h2>
                <p className="t-mono t-mono-xs t-dim sv-block__meta">
                  {b.kind.toUpperCase()} · {b.category.toUpperCase()} ·{' '}
                  {b.wikidata ? (
                    <a href={`https://www.wikidata.org/wiki/${b.wikidata}`} target="_blank" rel="noopener noreferrer">
                      {b.wikidata}
                    </a>
                  ) : (
                    'NO WIKIDATA ID'
                  )}
                </p>
                {b.description && <p className="t-body-s">{b.description}</p>}
                <dl className="sv-facts">
                  <Fact label="TRADES IN" value={b.trades_in.join(', ') || 'anywhere'} />
                  {b.excludes.length > 0 && <Fact label="NOT IN" value={b.excludes.join(', ')} />}
                  {b.names.length > 1 && <Fact label="ALSO NAMED" value={b.names.slice(1).join(' · ')} />}
                  {b.websites.length > 0 && <Links label="WEBSITES" urls={b.websites} />}
                  {b.locators.length > 0 && <Links label="STORE LOCATORS" urls={b.locators} />}
                  {Object.keys(b.social).length > 0 && (
                    <Fact
                      label="SOCIAL"
                      value={Object.entries(b.social)
                        .map(([network, handle]) => `${network}: ${handle}`)
                        .join(' · ')}
                    />
                  )}
                  {report.atp_run && b.wikidata && (
                    <Fact
                      label="ALL THE PLACES"
                      value={
                        b.spiders.length
                          ? b.spiders.map((s) => `${s.spider} (${count(s.places)} places)`).join(' · ')
                          : 'no spider holds it'
                      }
                    />
                  )}
                  {b.osm_tagged !== null && <Fact label="OPENSTREETMAP" value={`${count(b.osm_tagged)} places tagged with its id`} />}
                </dl>
                <p className="sv-actions">
                  <button type="button" className="sv-btn" onClick={() => go('survey', { question: `all the ${b.name} stores in ` })}>
                    SURVEY ITS STORES
                  </button>
                  <button type="button" className="sv-btn" onClick={() => go('locators', { brand: b.name })}>
                    READ ITS STORE LOCATOR
                  </button>
                  <button type="button" className="sv-btn" onClick={() => go('atlas', { brand: b.name })}>
                    COUNT ITS OUTLETS BY STATE
                  </button>
                  {b.websites[0] && (
                    <button type="button" className="sv-btn" onClick={() => go('sites', { url: b.websites[0] })}>
                      READ ITS SITE
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ol>
          <p className="t-mono t-mono-xs t-faint sv-attribution">{report.source.toUpperCase()}</p>
        </section>
      )}

      {ready && name.trim().length >= 2 && (
        <>
          <Legal name={name.trim()} countries={countriesOf(countries)} signal={signal} />
          <News name={name.trim()} signal={signal} />
        </>
      )}
    </>
  );
}

/* ---- legal entities (GLEIF) ------------------------------------------------ */

function Legal({ name, countries, signal }: { name: string; countries: string[] | undefined; signal: AbortSignal }) {
  const [report, setReport] = useState<LegalReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [parents, setParents] = useState<Record<string, Parents | string>>({});

  const ask = async () => {
    setBusy(true);
    setProblem(null);
    const got = await engine.legal(name, countries, signal);
    setBusy(false);
    if (got.ok) setReport(got.value);
    else if (got.problem !== 'cancelled') setProblem(got.problem);
  };

  const askParents = async (lei: string) => {
    const got = await engine.parents(lei, signal);
    if (got.ok) setParents((prev) => ({ ...prev, [lei]: got.value }));
    else if (got.problem !== 'cancelled') setParents((prev) => ({ ...prev, [lei]: got.problem }));
  };

  return (
    <section className="sv-panel" aria-label="Legal entities">
      <h2 className="t-mono t-mono-xs sv-take__title">LEGAL ENTITIES NAMED LIKE IT — GLEIF</h2>
      <p className="t-body-s t-dim">
        Companies with a Legal Entity Identifier whose registered names carry these words. A name is not ownership:
        which of them, if any, owns the brand is not decided here.
      </p>
      <p>
        <button type="button" className="sv-btn" disabled={busy} onClick={() => void ask()}>
          {busy ? 'ASKING GLEIF…' : `ASK GLEIF FOR “${name.toUpperCase()}”`}
        </button>
      </p>
      {problem && <p className="t-mono t-mono-xs sv-problem">{problem.toUpperCase()}</p>}
      {report && (
        <>
          <p className="t-mono t-mono-xs t-dim">
            {count(report.total)} RECORD(S) FOR “{report.name.toUpperCase()}”
            {report.entities.length < report.total ? ` · THE FIRST ${report.entities.length} SHOWN` : ''}
          </p>
          <ol className="sv-table-list">
            {report.entities.map((e) => {
              const p = parents[e.lei];
              return (
                <li key={e.lei}>
                  <p className="sv-entity">
                    <span className="sv-entity__name">{e.name}</span>
                    <span className="t-mono t-mono-xs t-dim">
                      {' '}
                      · {[e.city, e.country ?? e.jurisdiction].filter(Boolean).join(', ')} · {e.status ?? '—'} ·{' '}
                      {e.registration ?? '—'} ·{' '}
                      <a href={e.url} target="_blank" rel="noopener noreferrer">
                        {e.lei}
                      </a>
                    </span>
                  </p>
                  {p === undefined ? (
                    <button type="button" className="sv-link t-mono t-mono-xs" onClick={() => void askParents(e.lei)}>
                      PARENTS
                    </button>
                  ) : typeof p === 'string' ? (
                    <p className="t-mono t-mono-xs sv-problem">{p.toUpperCase()}</p>
                  ) : (
                    <p className="t-mono t-mono-xs t-dim">
                      DIRECT PARENT · {p.direct ? `${p.direct.name} (${p.direct.lei})` : 'NONE REPORTED'} · ULTIMATE PARENT ·{' '}
                      {p.ultimate ? `${p.ultimate.name} (${p.ultimate.lei})` : 'NONE REPORTED'}
                      {p.notes.length > 0 && ` · ${p.notes.join(' · ').toUpperCase()}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="t-mono t-mono-xs t-faint sv-attribution">{report.source.toUpperCase()}</p>
        </>
      )}
    </section>
  );
}

/* ---- news (GDELT) ------------------------------------------------------------ */

function News({ name, signal }: { name: string; signal: AbortSignal }) {
  const [report, setReport] = useState<NewsReport | null>(null);
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setProblem(null);
    const got = await engine.news(name, months, signal);
    setBusy(false);
    if (got.ok) setReport(got.value);
    else if (got.problem !== 'cancelled') setProblem(got.problem);
  };

  return (
    <section className="sv-panel" aria-label="In the news">
      <h2 className="t-mono t-mono-xs sv-take__title">IN THE NEWS — GDELT</h2>
      <p className="t-body-s t-dim">
        Articles GDELT has seen that mention the name. Headlines are signals about the brand, not facts the engine
        records; nothing is kept.
      </p>
      <div className="sv-ask__row">
        <label className="t-mono t-mono-xs sv-field">
          MONTHS
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="sv-btn" disabled={busy} onClick={() => void ask()}>
          {busy ? 'ASKING GDELT…' : `ASK GDELT FOR “${name.toUpperCase()}”`}
        </button>
      </div>
      {problem && <p className="t-mono t-mono-xs sv-problem">{problem.toUpperCase()}</p>}
      {report && (
        <>
          <p className="t-mono t-mono-xs t-dim">
            {report.articles.length} ARTICLE(S) NAMING “{report.query.toUpperCase()}” IN {report.months} MONTH(S)
          </p>
          {report.articles.length === 0 ? (
            <p className="t-body-s t-dim sv-empty">GDELT has seen no article naming it in that time.</p>
          ) : (
            <ol className="sv-table-list">
              {report.articles.map((a) => (
                <li key={a.url}>
                  <p className="sv-entity">
                    <a href={a.url} target="_blank" rel="noopener noreferrer">
                      {a.title}
                    </a>
                    <span className="t-mono t-mono-xs t-dim">
                      {' '}
                      · {a.domain ?? '—'} · {when(a.seen).toUpperCase()}
                      {a.country ? ` · ${a.country.toUpperCase()}` : ''}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          )}
          <p className="t-mono t-mono-xs t-faint sv-attribution">{report.source.toUpperCase()}</p>
        </>
      )}
    </section>
  );
}

/* ---- pieces --------------------------------------------------------------- */

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Links({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {urls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noopener noreferrer">
            {u}
          </a>
        ))}
      </dd>
    </div>
  );
}
