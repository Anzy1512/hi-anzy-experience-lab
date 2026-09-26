import { useEffect, useState, type FormEvent } from 'react';
import { engine, type AreaReport } from '../engine';
import { Plate } from '../Plate';
import { NeedsEngine } from '../EngineLine';
import { countriesOf, count, isReady, type DeskProps } from '../link';

/**
 * I3 · AREAS — HOW A PLACE RESOLVES.
 *
 * The same resolution a search starts with, shown before any search is run:
 * the boundary a place name stands for, drawn from the engine's own geometry;
 * its size and box; whether a search can ask for it whole (an OpenStreetMap
 * boundary) or has to go cell by cell; and what else the name could have
 * meant. The assumptions the engine made are printed as it states them.
 */

export default function AreasDesk({ engineState, signal, go, receive, take }: DeskProps) {
  const [place, setPlace] = useState(() => take('areas')?.place ?? '');
  const [countries, setCountries] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AreaReport | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = isReady(engineState);

  useEffect(
    () =>
      receive('areas', (h) => {
        if (h.place) setPlace(h.place);
      }),
    [receive],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const words = place.trim();
    if (!ready || words.length < 2) return;
    setBusy(true);
    setProblem(null);
    const got = await engine.area(words, countriesOf(countries), signal);
    setBusy(false);
    if (got.ok) setReport(got.value);
    else if (got.problem !== 'cancelled') setProblem(got.problem);
  };

  const area = report?.area ?? null;
  return (
    <>
      <NeedsEngine state={engineState} />
      <form className="sv-ask" onSubmit={(e) => void submit(e)} aria-label="Resolve a place">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-place">
          PLACE
        </label>
        <input
          id="sv-place"
          className="sv-question"
          type="text"
          value={place}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          placeholder="himachal"
          onChange={(e) => setPlace(e.target.value)}
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
          <button type="submit" className="sv-btn sv-btn--signal" disabled={!ready || place.trim().length < 2 || busy}>
            {busy ? 'RESOLVING…' : 'RESOLVE'}
          </button>
        </div>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}

      {report && !area && (
        <p className="t-body-s sv-lead" role="status">
          “{report.place}” could not be placed{report.error ? `: ${report.error}` : '.'}
        </p>
      )}

      {report && area && (
        <section className="sv-answer" aria-label="How the place resolves">
          <p className="t-body-s sv-lead">
            “{report.place}” → {area.description}
          </p>
          <div className="sv-grid">
            <div>
              <dl className="sv-facts">
                <div>
                  <dt>SIZE</dt>
                  <dd>{count(Math.round(area.area_km2 * 10) / 10)} km²</dd>
                </div>
                <div>
                  <dt>CENTRE</dt>
                  <dd>
                    {area.center.lat.toFixed(5)}, {area.center.lon.toFixed(5)}
                  </dd>
                </div>
                <div>
                  <dt>BOX</dt>
                  <dd>
                    {area.bbox.map((v) => v.toFixed(4)).join(', ')}
                    <span className="t-faint"> · south, west, north, east</span>
                  </dd>
                </div>
                <div>
                  <dt>HOW A SEARCH ASKS</dt>
                  <dd>
                    {report.asked_at_once && area.osm_area
                      ? `OpenStreetMap boundary ${area.osm_area}: the whole area in one question per kind of business, cells only if an answer is capped`
                      : report.cells !== null
                        ? `not an OpenStreetMap boundary: about ${report.cells} cell(s) to start, each ~${((report.cell_m ?? 0) / 1000).toFixed(0)} km, split where answers are full`
                        : 'as the engine decides at search time'}
                  </dd>
                </div>
                {area.place && (
                  <div>
                    <dt>RESOLVED FROM</dt>
                    <dd>
                      {area.place.display_name}
                      <span className="t-faint"> · {area.place.place_type} · {area.place.source_ref}</span>
                    </dd>
                  </div>
                )}
              </dl>
              {report.assumptions.length > 0 && (
                <div className="sv-undecided">
                  <h3 className="t-mono t-mono-xs">ASSUMED</h3>
                  {report.assumptions.map((a) => (
                    <p key={a} className="t-body-s">
                      {a}
                    </p>
                  ))}
                </div>
              )}
              {report.warnings.length > 0 && (
                <div className="sv-undecided">
                  <h3 className="t-mono t-mono-xs">WARNINGS</h3>
                  {report.warnings.map((w) => (
                    <p key={w} className="t-body-s">
                      {w}
                    </p>
                  ))}
                </div>
              )}
              {report.also.length > 0 && (
                <div className="sv-undecided">
                  <h3 className="t-mono t-mono-xs">THE NAME COULD ALSO MEAN</h3>
                  {report.also.map((c) => (
                    <p key={c.source_ref} className="t-body-s">
                      {c.display_name} <span className="t-mono t-mono-xs t-faint">· {c.place_type} · {c.source_ref}</span>
                    </p>
                  ))}
                </div>
              )}
              <p className="sv-actions">
                <button type="button" className="sv-btn" onClick={() => go('survey', { place: report.place })}>
                  SURVEY THIS PLACE
                </button>
                <button type="button" className="sv-btn" onClick={() => go('locators', { place: report.place })}>
                  READ A STORE LOCATOR HERE
                </button>
              </p>
            </div>
            <div className="sv-side">
              <Plate area={area.geojson} marks={[]} label={area.description} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
