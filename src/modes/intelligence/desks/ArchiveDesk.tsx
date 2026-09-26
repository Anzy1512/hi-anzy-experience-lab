import { useEffect, useState } from 'react';
import { engine, type Knowledge, type SearchStatus } from '../engine';
import { NeedsEngine } from '../EngineLine';
import { count, isReady, when, type DeskProps } from '../link';

/**
 * I8 · ARCHIVE — WHAT THE ENGINE ALREADY KNOWS.
 *
 * Local knowledge, when the engine has its database: how much it holds, and
 * the searches it has run — reopened on the SURVEY desk exactly as they were
 * saved, never re-run behind the visitor's back. Without the database the
 * engine remembers only this session's searches, and the desk says so.
 */

const LIMIT = 60;

type Loaded = { knowledge: Knowledge | null; searches: SearchStatus[]; problem: string | null };

/** What local knowledge holds and the searches the engine remembers, read together. */
async function load(signal: AbortSignal): Promise<Loaded> {
  const [knowledge, searches] = await Promise.all([engine.knowledge(signal), engine.searches(LIMIT, signal)]);
  return {
    knowledge: knowledge.ok ? knowledge.value : null,
    searches: searches.ok ? searches.value : [],
    problem: !knowledge.ok ? knowledge.problem : !searches.ok ? searches.problem : null,
  };
}

export default function ArchiveDesk({ engineState, signal, go }: DeskProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = isReady(engineState);

  // read once the engine answers (the state arrives with the engine's reply)
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void (async () => {
      const got = await load(signal);
      if (live && !signal.aborted) setLoaded(got);
    })();
    return () => {
      live = false;
    };
  }, [ready, signal]);

  const refresh = async () => {
    setBusy(true);
    const got = await load(signal);
    if (signal.aborted) return;
    setLoaded(got);
    setBusy(false);
  };

  const k = loaded?.knowledge ?? null;
  return (
    <>
      <NeedsEngine state={engineState} />
      {ready && (
        <p className="sv-actions">
          <button type="button" className="sv-btn" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'READING…' : 'READ AGAIN'}
          </button>
        </p>
      )}
      {loaded?.problem && loaded.problem !== 'cancelled' && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {loaded.problem.toUpperCase()}
        </p>
      )}

      {k && (
        <section className="sv-answer" aria-label="Local knowledge">
          {k.on ? (
            <>
              <dl className="sv-counts">
                <div>
                  <dt>BUSINESSES</dt>
                  <dd>{count(k.businesses)}</dd>
                </div>
                <div>
                  <dt>RECORDS</dt>
                  <dd>{count(k.records)}</dd>
                </div>
                <div>
                  <dt>SEARCHES</dt>
                  <dd>{count(k.searches)}</dd>
                </div>
                <div>
                  <dt>JUDGEMENTS</dt>
                  <dd>{count(k.judgements)}</dd>
                </div>
              </dl>
              <p className="t-mono t-mono-xs t-dim">
                {count(k.observations)} OBSERVATIONS · {count(k.record_versions)} RECORD VERSIONS · {count(k.merged_businesses)}{' '}
                BUSINESSES MERGED INTO OTHERS · {count(k.source_runs)} SOURCE RUNS
                {k.unfinished_searches ? ` · ${count(k.unfinished_searches)} SEARCH(ES) UNFINISHED` : ''}
              </p>
              <p className="t-mono t-mono-xs t-dim">
                FIRST SEARCH {when(k.oldest_search).toUpperCase()} · LATEST {when(k.newest_search).toUpperCase()}
              </p>
            </>
          ) : (
            <p className="t-body-s sv-lead">
              Local knowledge is off{k.reason ? ` — ${k.reason}` : ''}. Only this session’s searches are remembered, and
              only until the engine stops.
            </p>
          )}
        </section>
      )}

      {loaded && (
        <section className="sv-answer" aria-label="Searches">
          <h2 className="t-mono t-mono-xs sv-take__title">SEARCHES · THE LATEST {LIMIT}</h2>
          {loaded.searches.length === 0 ? (
            <p className="t-body-s t-dim sv-empty">The engine has run no search it remembers.</p>
          ) : (
            <ol className="sv-rows">
              {loaded.searches.map((s, i) => (
                <li key={s.id}>
                  <div className="sv-row sv-row--static">
                    <span className="t-mono t-mono-xs sv-row__n">{String(i + 1).padStart(3, '0')}</span>
                    <span className="sv-row__name">
                      <button type="button" className="sv-link" onClick={() => go('survey', { searchId: s.id })}>
                        {s.query ?? s.id}
                      </button>
                    </span>
                    <span className="t-mono t-mono-xs sv-row__kind">
                      {when(s.created_at).toUpperCase()}
                      {/* a verdict with no business is absent from the tally: it is zero, not unknown */}
                      {Object.keys(s.counts).length > 0 &&
                        ` · ${count(s.counts.true ?? 0)} MATCHED · ${count(s.counts.unknown ?? 0)} UNDETERMINED · ${count(s.counts.false ?? 0)} EXCLUDED`}
                      {s.error ? ` · ${s.error}` : ''}
                    </span>
                    <span className="t-mono t-mono-xs sv-row__far">{s.status.toUpperCase()}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
