import { useEffect, useState } from 'react';
import { engine, type Extracts, type LoadedExtract } from '../engine';
import { NeedsDatabase, NeedsEngine } from '../EngineLine';
import { useTask } from '../useTask';
import { Progress } from '../Progress';
import { count, isReady, when, type DeskProps } from '../link';

/**
 * I11 · EXTRACTS — THE MAPS KEPT ON THIS MACHINE, ANSWERING FIRST.
 *
 * The engine keeps open bulk data in its own database: OpenStreetMap's
 * regional files from Geofabrik (checked against Geofabrik's MD5 before they
 * are read) and Overture's monthly places for a region. Inside what they
 * cover, a search is answered from them in place of the live service — until
 * they are older than the engine allows, when the live service is asked again.
 * This desk shows what is held, how old it is, and whether it answers; and it
 * asks the engine to load or refresh one, as a task the engine runs.
 *
 * Nothing here is invented: every date, count and state is the engine's. A
 * file not yet on the engine's machine is downloaded by the engine first, and
 * the desk says so before the button is pressed.
 */

const SOURCE_NAMES: Record<string, string> = {
  overpass: 'OPENSTREETMAP',
  overture_places: 'OVERTURE',
};

type Loaded = {
  extracts: Extracts | null;
  categories: { value: string; places: number }[];
  brands: { value: string; places: number }[];
  problem: string | null;
};

async function read(signal: AbortSignal): Promise<Loaded> {
  const [extracts, categories, brands] = await Promise.all([
    engine.extracts(signal),
    engine.extractsTop('categories', 15, signal),
    engine.extractsTop('brand', 15, signal),
  ]);
  return {
    extracts: extracts.ok ? extracts.value : null,
    categories: categories.ok ? categories.value : [],
    brands: brands.ok ? brands.value : [],
    problem: extracts.ok ? null : extracts.problem,
  };
}

function megabytes(bytes: number | null | undefined): string {
  return typeof bytes === 'number' ? `${count(Math.round(bytes / 1e6))} MB` : '—';
}

export default function ExtractsDesk({ engineState, signal, go }: DeskProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const { task, problem, running, start } = useTask<{ loaded: LoadedExtract[] }>(signal);
  // the extracts live in the engine's database: without it there is nothing to read
  const ready = isReady(engineState) && engineState.health.local_knowledge;

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void (async () => {
      const got = await read(signal);
      if (live && !signal.aborted) setLoaded(got);
    })();
    return () => {
      live = false;
    };
  }, [ready, signal]);

  // a load that finishes changes what is held: read it again
  const finished = task?.status === 'done' || task?.status === 'failed';
  useEffect(() => {
    if (!finished) return;
    let live = true;
    void (async () => {
      const got = await read(signal);
      if (live && !signal.aborted) setLoaded(got);
    })();
    return () => {
      live = false;
    };
  }, [finished, signal]);

  const refresh = async () => {
    setBusy(true);
    const got = await read(signal);
    if (signal.aborted) return;
    setLoaded(got);
    setBusy(false);
  };

  const load = (body: { kind: 'osm' | 'overture' | 'all'; key?: string }) => {
    if (!ready || running) return;
    void start(() => engine.loadExtract({ ...body, download: true }, signal));
  };

  const x = loaded?.extracts ?? null;
  const held = new Map((x?.datasets ?? []).map((d) => [d.id, d]));
  const underway = x?.loads.find((t) => t.status === 'queued' || t.status === 'running') ?? null;
  return (
    <>
      <NeedsEngine state={engineState} />
      <NeedsDatabase state={engineState} />
      {ready && (
        <p className="sv-actions">
          <button type="button" className="sv-btn" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'READING…' : 'READ AGAIN'}
          </button>
          {x && (
            <button
              type="button"
              className="sv-btn"
              disabled={running || underway !== null}
              onClick={() => load({ kind: 'all' })}
            >
              LOAD OR REFRESH EVERYTHING
            </button>
          )}
        </p>
      )}
      {loaded?.problem && loaded.problem !== 'cancelled' && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {loaded.problem.toUpperCase()}
        </p>
      )}
      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}
      {task && <Progress task={task} />}
      {!task && underway && (
        <p className="t-mono t-mono-xs t-dim" role="status">
          A LOAD IS UNDER WAY ON THE ENGINE · {underway.title} · {underway.progress.at(-1) ?? underway.status.toUpperCase()}
        </p>
      )}

      {x && (
        <section className="sv-answer" aria-label="What is held">
          <dl className="sv-counts">
            {Object.entries(x.totals.sources).map(([source, t]) => (
              <div key={source}>
                <dt>{SOURCE_NAMES[source] ?? source.toUpperCase()}</dt>
                <dd>{count(t.places)}</dd>
              </div>
            ))}
            <div>
              <dt>STATES</dt>
              <dd>{count(x.totals.regions.region1)}</dd>
            </div>
            <div>
              <dt>DISTRICTS</dt>
              <dd>{count(x.totals.regions.region2)}</dd>
            </div>
          </dl>
          {Object.entries(x.totals.sources).map(([source, t]) => (
            <p key={source} className="t-mono t-mono-xs t-dim">
              {SOURCE_NAMES[source] ?? source.toUpperCase()}: {count(t.businesses)} BUSINESSES · {count(t.branded)} WITH A
              BRAND’S WIKIDATA ID · {count(t.filed)} FILED UNDER A STATE
            </p>
          ))}

          <div className="sv-scroll">
            <table className="sv-table">
              <caption className="t-mono t-mono-xs">EXTRACTS</caption>
              <thead>
                <tr>
                  <th scope="col">EXTRACT</th>
                  <th scope="col">DATA AS OF</th>
                  <th scope="col">PLACES</th>
                  <th scope="col">REGIONS</th>
                  <th scope="col">READ</th>
                  <th scope="col">STATE</th>
                  <th scope="col">
                    <span className="sv-visually-hidden">LOAD</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {x.available.map((a) => {
                  const d = held.get(a.dataset_id);
                  return (
                    <tr key={a.dataset_id}>
                      <th scope="row">
                        {a.title}
                        <span className="t-mono t-mono-xs t-faint"> · {d?.snapshot ?? a.file ?? (a.kind === 'osm' ? 'not on the engine’s machine yet' : 'read from Overture’s S3 bucket')}</span>
                      </th>
                      <td className="t-mono t-mono-xs">{d ? when(d.data_as_of).toUpperCase() : '—'}</td>
                      <td className="t-mono">{d ? count(d.places) : '—'}</td>
                      <td className="t-mono">{d ? count(d.regions) : '—'}</td>
                      <td className="t-mono t-mono-xs">{d ? megabytes(d.bytes_read) : a.file ? megabytes(a.file_bytes) : '—'}</td>
                      <td className="t-mono t-mono-xs">
                        {!d ? 'NOT LOADED' : d.status === 'loading' ? 'LOADING' : d.answers ? 'ANSWERS' : 'TOO OLD TO ANSWER'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="sv-link t-mono t-mono-xs"
                          disabled={running || underway !== null}
                          onClick={() => load({ kind: a.kind, key: a.key })}
                          aria-label={`${d ? 'Refresh' : 'Load'} ${a.title}`}
                        >
                          {d ? 'REFRESH' : a.kind === 'osm' && !a.file ? 'DOWNLOAD AND LOAD' : 'LOAD'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="t-body-s t-dim">
            An OpenStreetMap file not yet on the engine’s machine is downloaded by the engine from Geofabrik (a zone of
            India is some hundreds of megabytes) and checked against Geofabrik’s MD5 before it is read. Overture is read
            row group by row group from its public bucket and written straight into the database.
          </p>
          {x.datasets.map((d) =>
            d.notes.length > 0 ? (
              <p key={d.id} className="t-mono t-mono-xs t-dim">
                {d.title.toUpperCase()}: {d.notes.join(' · ')}
              </p>
            ) : null,
          )}
        </section>
      )}

      {loaded && (loaded.categories.length > 0 || loaded.brands.length > 0) && (
        <section className="sv-answer sv-sections" aria-label="What is held most">
          <div className="sv-section">
            <h2 className="t-mono t-mono-xs sv-take__title">KINDS OF BUSINESS HELD MOST</h2>
            <ol className="sv-table-list">
              {loaded.categories.map((c) => (
                <li key={c.value}>
                  <p>
                    <button type="button" className="sv-link" onClick={() => go('atlas', { category: c.value })}>
                      {c.value.replaceAll('_', ' ')}
                    </button>
                    <span className="t-mono t-mono-xs t-dim"> · {count(c.places)}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <div className="sv-section">
            <h2 className="t-mono t-mono-xs sv-take__title">BRANDS HELD MOST</h2>
            <ol className="sv-table-list">
              {loaded.brands.map((b) => (
                <li key={b.value}>
                  <p>
                    <button type="button" className="sv-link" onClick={() => go('atlas', { brand: b.value })}>
                      {b.value}
                    </button>
                    <span className="t-mono t-mono-xs t-dim"> · {count(b.places)}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </>
  );
}
