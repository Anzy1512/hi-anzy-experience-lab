import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { engine, type LocatorResult } from '../engine';
import { Plate, type Mark } from '../Plate';
import { NeedsEngine } from '../EngineLine';
import { useTask } from '../useTask';
import { Progress } from '../Progress';
import { countriesOf, isReady, type DeskProps } from '../link';

/**
 * I4 · LOCATORS — A BRAND'S OWN STORE LIST, FOR ONE PLACE.
 *
 * The brand's own store locator — found from its Wikidata locator, its
 * official websites and the store sites other sources found — read through its
 * sitemaps and each store page's own structured data, under robots.txt, one
 * request every two seconds per site. The stores it states inside the place are
 * listed with where each came from; nothing is stored.
 */

const DEPTHS = ['quick', 'standard', 'deep', 'exhaustive'] as const;

export default function LocatorsDesk({ engineState, signal, receive, take }: DeskProps) {
  const [initial] = useState(() => take('locators'));
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [place, setPlace] = useState(initial?.place ?? '');
  const [countries, setCountries] = useState('');
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]>('quick');
  const [selected, setSelected] = useState<string | null>(null);
  const { task, problem, running, start } = useTask<LocatorResult>(signal);
  const ready = isReady(engineState);

  useEffect(
    () =>
      receive('locators', (h) => {
        if (h.brand) setBrand(h.brand);
        if (h.place) setPlace(h.place);
      }),
    [receive],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || brand.trim().length < 2) return;
    setSelected(null);
    void start(() =>
      engine.locator(
        {
          brand: brand.trim(),
          ...(place.trim() ? { place: place.trim() } : {}),
          ...(countriesOf(countries) ? { country: countriesOf(countries) } : {}),
          depth,
        },
        signal,
      ),
    );
  };

  const result = task?.status === 'done' ? (task.result ?? null) : null;
  const marks = useMemo<Mark[]>(
    () =>
      (result?.inside ?? [])
        .filter((s) => s.location)
        .map((s) => ({ id: `${s.source}:${s.record}`, lat: s.location!.lat, lon: s.location!.lon })),
    [result],
  );

  return (
    <>
      <NeedsEngine state={engineState} />
      <form className="sv-ask" onSubmit={submit} aria-label="Read a store locator">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-loc-brand">
          BRAND
        </label>
        <input
          id="sv-loc-brand"
          className="sv-question"
          type="text"
          value={brand}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          placeholder="vishal mega mart"
          onChange={(e) => setBrand(e.target.value)}
        />
        <div className="sv-ask__row">
          <label className="t-mono t-mono-xs sv-field">
            PLACE
            <input
              className="sv-field__wide"
              type="text"
              value={place}
              placeholder="ALL OF IT"
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>
          <label className="t-mono t-mono-xs sv-field">
            COUNTRIES
            <input type="text" value={countries} placeholder="THE ENGINE'S" onChange={(e) => setCountries(e.target.value)} />
          </label>
          <label className="t-mono t-mono-xs sv-field">
            PAGES
            <select value={depth} onChange={(e) => setDepth(e.target.value as (typeof DEPTHS)[number])}>
              {DEPTHS.map((d) => (
                <option key={d} value={d}>
                  {d.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="sv-btn sv-btn--signal" disabled={!ready || brand.trim().length < 2 || running}>
            {running ? 'READING…' : 'READ THE LOCATOR'}
          </button>
        </div>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}
      {task && <Progress task={task} />}

      {result && (
        <section className="sv-answer" aria-label="What the locator states">
          <dl className="sv-counts">
            <div>
              <dt>INSIDE</dt>
              <dd>{result.inside.length}</dd>
            </div>
            <div>
              <dt>OUTSIDE</dt>
              <dd>{result.outside}</dd>
            </div>
            <div>
              <dt>NO COORDINATES</dt>
              <dd>{result.unplaced}</dd>
            </div>
            <div>
              <dt>REQUESTS</dt>
              <dd>{result.requests}</dd>
            </div>
          </dl>
          {result.brands.length > 0 && (
            <p className="t-mono t-mono-xs t-dim">
              BRAND{result.brands.length > 1 ? 'S' : ''} ·{' '}
              {result.brands.map((b) => `${b.name} (${b.wikidata ?? 'no Wikidata id'})`).join(' · ')}
            </p>
          )}
          <div className="sv-grid">
            <div>
              {result.inside.length === 0 ? (
                <p className="t-body-s t-dim sv-empty">The locator stated no store inside the place.</p>
              ) : (
                <ol className="sv-rows">
                  {result.inside.map((s, i) => {
                    const id = `${s.source}:${s.record}`;
                    const said = (k: string) => text(s.values[k]);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className="sv-row"
                          aria-pressed={selected === id}
                          onClick={() => setSelected(selected === id ? null : id)}
                        >
                          <span className="t-mono t-mono-xs sv-row__n">{String(i + 1).padStart(3, '0')}</span>
                          <span className="sv-row__name">{said('name') ?? '(unnamed)'}</span>
                          <span className="t-mono t-mono-xs sv-row__kind">
                            {[said('address'), said('phone'), said('attr.rating') && `rating ${said('attr.rating')}`]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          <span className="t-mono t-mono-xs sv-row__far">{s.location ? 'PLACED' : ''}</span>
                        </button>
                        {selected === id && s.url && (
                          <p className="t-mono t-mono-xs sv-row__src">
                            <a href={s.url} target="_blank" rel="noopener noreferrer">
                              {s.url}
                            </a>
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              {result.notes.length > 0 && (
                <ul className="t-body-s t-dim sv-why">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <p className="t-mono t-mono-xs t-faint sv-attribution">{result.rules.toUpperCase()}</p>
            </div>
            <div className="sv-side">
              <Plate
                area={result.area?.geojson ?? null}
                marks={marks}
                selected={selected}
                label={result.area?.description ?? 'the stores stated'}
                legend="EACH MARK A STORE THE LOCATOR STATES"
              />
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/** A value a store page stated, as text; a structure it did not flatten is not printed. */
function text(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(text).filter((v): v is string => v !== null);
    return parts.length ? parts.join(' · ') : null;
  }
  return null;
}
