import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { engine, type Atlas, type AtlasRow, type Region } from '../engine';
import { NeedsDatabase, NeedsEngine } from '../EngineLine';
import { count, countriesOf, isReady, when, type DeskProps } from '../link';

/**
 * I10 · ATLAS — WHERE A BRAND TRADES, OR A KIND OF BUSINESS IS.
 *
 * Counted from the maps the engine keeps on its own machine (the EXTRACTS
 * desk): a brand's outlets, or every business of a kind, region by region —
 * states first, then a state's districts. Two maps are two counts, printed
 * side by side and never added together: the same shop is often on both, and
 * telling which are the same is a search's work, not a count's.
 *
 * A brand's places are read the way a search reads them. Its outlets are
 * counted; its offices, works, the sellers of its goods and the places merely
 * named after it are counted apart, so a corporate office is never a store.
 * Every number is the engine's; a region the extracts do not cover is absent,
 * not zero.
 */

const SOURCES: [string, string][] = [
  ['overpass', 'OPENSTREETMAP'],
  ['overture_places', 'OVERTURE'],
];

const APART: Record<string, string> = {
  office: 'OFFICES',
  facility: 'WORKS',
  seller: 'SELLERS',
  reference: 'NAMED AFTER IT',
};

type Ask = { mode: 'brand' | 'category'; words: string; level: 1 | 2; within: string };

/** The level-1 regions (states) a count can stay inside; empty until the engine answers. */
async function readStates(signal: AbortSignal): Promise<Region[]> {
  const got = await engine.regions(1, null, signal);
  return got.ok ? got.value : [];
}

function apartText(apart: Record<string, number>): string {
  return Object.entries(apart)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${count(n)} ${APART[k] ?? k.toUpperCase()}`)
    .join(' · ');
}

export default function AtlasDesk({ engineState, signal, go, receive, take }: DeskProps) {
  const [ask, setAsk] = useState<Ask>(() => {
    const handed = take('atlas');
    if (handed?.category) return { mode: 'category', words: handed.category, level: 1, within: '' };
    return { mode: 'brand', words: handed?.brand ?? '', level: 1, within: '' };
  });
  const [countries, setCountries] = useState('');
  const [states, setStates] = useState<Region[]>([]);
  const [busy, setBusy] = useState(false);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // the extracts live in the engine's database: without it there is nothing to read
  const ready = isReady(engineState) && engineState.health.local_knowledge;

  useEffect(
    () =>
      receive('atlas', (h) => {
        if (h.brand) setAsk((a) => ({ ...a, mode: 'brand', words: h.brand ?? '' }));
        else if (h.category) setAsk((a) => ({ ...a, mode: 'category', words: h.category ?? '' }));
      }),
    [receive],
  );

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void (async () => {
      const found = await readStates(signal);
      if (live && !signal.aborted) setStates(found);
    })();
    return () => {
      live = false;
    };
  }, [ready, signal]);

  const run = async (next: Ask) => {
    const words = next.words.trim();
    if (!ready || words.length < 2) return;
    setAsk(next);
    setBusy(true);
    setProblem(null);
    const got = await engine.atlas(
      {
        ...(next.mode === 'brand' ? { brand: words } : { category: words }),
        level: next.level,
        within: next.within || null,
      },
      countriesOf(countries),
      signal,
    );
    if (signal.aborted) return;
    setBusy(false);
    if (got.ok) setAtlas(got.value);
    else if (got.problem !== 'cancelled') setProblem(got.problem);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(ask);
  };

  const stateName = (id: string | null) => states.find((s) => s.id === id)?.name ?? null;
  const within = atlas?.within ? stateName(atlas.within) ?? atlas.within : null;
  const shown = atlas?.rows ?? [];
  const most = Math.max(1, ...shown.flatMap((r) => Object.values(r.counts)));
  const heldBy = SOURCES.filter(([id]) => atlas?.datasets.some((d) => d.source_id === id));
  const surveyed = (row: AtlasRow) => {
    if (!atlas || !row.name) return;
    const subject = atlas.kind === 'brand' ? `all the ${atlas.asked} stores` : `all the ${atlas.subject[0] ?? atlas.asked}`;
    go('survey', { question: `${subject} in ${row.name}` });
  };

  return (
    <>
      <NeedsEngine state={engineState} />
      <NeedsDatabase state={engineState} />
      <form className="sv-ask" onSubmit={submit} aria-label="Count by region">
        <div className="sv-views sv-views--flush" role="radiogroup" aria-label="What to count">
          {(['brand', 'category'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={ask.mode === m}
              className="t-mono t-mono-xs sv-tab"
              onClick={() => setAsk((a) => ({ ...a, mode: m }))}
            >
              {m === 'brand' ? 'A BRAND’S OUTLETS' : 'A KIND OF BUSINESS'}
            </button>
          ))}
        </div>
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-atlas-words">
          {ask.mode === 'brand' ? 'BRAND' : 'KIND OF BUSINESS'}
        </label>
        <input
          id="sv-atlas-words"
          className="sv-question"
          type="text"
          value={ask.words}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          placeholder={ask.mode === 'brand' ? 'haldiram’s' : 'cafe'}
          onChange={(e) => setAsk((a) => ({ ...a, words: e.target.value }))}
        />
        <div className="sv-ask__row">
          <label className="t-mono t-mono-xs sv-field">
            BY
            <select
              value={ask.level}
              onChange={(e) => setAsk((a) => ({ ...a, level: e.target.value === '2' ? 2 : 1 }))}
            >
              <option value={1}>STATE</option>
              <option value={2}>DISTRICT</option>
            </select>
          </label>
          <label className="t-mono t-mono-xs sv-field">
            WITHIN
            <select value={ask.within} onChange={(e) => setAsk((a) => ({ ...a, within: e.target.value }))}>
              <option value="">ALL THAT IS HELD</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {ask.mode === 'brand' && (
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
          )}
          <button type="submit" className="sv-btn sv-btn--signal" disabled={!ready || ask.words.trim().length < 2 || busy}>
            {busy ? 'COUNTING…' : 'COUNT'}
          </button>
        </div>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}

      {atlas && (
        <section className="sv-answer" aria-label="Counts by region" aria-busy={busy}>
          {atlas.notes.map((n) => (
            <p key={n} className="t-body-s sv-lead">
              {n}
            </p>
          ))}
          {atlas.subject.length > 0 && (
            <>
              <p className="t-body-s sv-lead">
                {atlas.kind === 'brand' ? 'Outlets of ' : ''}
                {atlas.subject.slice(0, 6).join(', ')}
                {atlas.subject.length > 6 ? ` and ${atlas.subject.length - 6} more` : ''}
                {within ? `, in ${within}` : ''}, {atlas.level === 1 ? 'by state' : 'by district'}.
              </p>
              <dl className="sv-counts">
                {heldBy.map(([id, label]) => (
                  <div key={id}>
                    <dt>{label}</dt>
                    <dd>{count(atlas.totals[id] ?? 0)}</dd>
                  </div>
                ))}
              </dl>
              {atlas.kind === 'brand' &&
                Object.entries(atlas.apart).map(([source, kinds]) => (
                  <p key={source} className="t-mono t-mono-xs t-dim">
                    ALSO BEARING THE NAME, NOT COUNTED ({SOURCES.find(([id]) => id === source)?.[1] ?? source}):{' '}
                    {apartText(kinds)}
                  </p>
                ))}
              <p className="t-body-s t-dim">
                Each map’s count stands on its own — the same shop is often on both, so they are never added.
              </p>
            </>
          )}

          {shown.length > 0 && (
            <div className="sv-scroll">
              <table className="sv-table sv-atlas">
                <caption className="t-mono t-mono-xs">
                  {atlas.level === 1 ? 'STATES' : 'DISTRICTS'} · {shown.length} WITH PLACES HELD
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{atlas.level === 1 ? 'STATE' : 'DISTRICT'}</th>
                    {heldBy.map(([id, label]) => (
                      <th key={id} scope="col">
                        {label}
                      </th>
                    ))}
                    {atlas.kind === 'brand' && <th scope="col">SET APART</th>}
                    <th scope="col">
                      <span className="sv-visually-hidden">GO ON</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.region_id ?? 'unfiled'}>
                      <th scope="row">{r.name ?? <span className="t-dim">Not inside any region held</span>}</th>
                      {heldBy.map(([id]) => {
                        const n = r.counts[id] ?? 0;
                        return (
                          <td key={id} className="t-mono sv-atlas__n">
                            {count(n)}
                            <span
                              className="sv-bar"
                              aria-hidden="true"
                              style={{ '--share': n / most } as CSSProperties}
                            />
                          </td>
                        );
                      })}
                      {atlas.kind === 'brand' && <td className="t-mono t-mono-xs t-dim">{apartText(r.apart) || '—'}</td>}
                      <td className="sv-atlas__go">
                        {r.region_id && atlas.level === 1 && (
                          <button
                            type="button"
                            className="sv-link t-mono t-mono-xs"
                            onClick={() => void run({ ...ask, words: atlas.asked, mode: atlas.kind, level: 2, within: r.region_id ?? '' })}
                          >
                            DISTRICTS
                          </button>
                        )}
                        {r.name && (
                          <button type="button" className="sv-link t-mono t-mono-xs" onClick={() => surveyed(r)}>
                            SURVEY
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {atlas.subject.length > 0 && shown.length === 0 && (
            <p className="t-body-s t-dim sv-empty">The extracts hold no such place{within ? ` in ${within}` : ''}.</p>
          )}

          {atlas.datasets.length > 0 ? (
            <ul className="t-mono t-mono-xs t-dim sv-sources">
              {atlas.datasets.map((d) => (
                <li key={d.id}>
                  {d.title.toUpperCase()} · DATA AS OF {when(d.data_as_of).toUpperCase()} · {d.licence ?? ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body-s sv-lead">
              Nothing is loaded on the engine yet — the EXTRACTS desk loads the maps this desk counts from.{' '}
              <button type="button" className="sv-link" onClick={() => go('extracts')}>
                Open EXTRACTS
              </button>
            </p>
          )}
        </section>
      )}
    </>
  );
}
