import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { EXPORT_FORMATS, datasetExportUrl, engine, type DatasetRow, type DatasetSummary } from '../engine';
import { Plate, type Mark } from '../Plate';
import { NeedsEngine } from '../EngineLine';
import { useTask } from '../useTask';
import { Progress } from '../Progress';
import { count, isReady, type DeskProps } from '../link';

/**
 * I7 · DATASETS — MANY QUESTIONS, ONE TABLE.
 *
 * A marketing list is rarely one question. Each line here is asked as a
 * search of its own — saved like any other when the engine has its database —
 * and every business is kept once, with every question that found it and what
 * each concluded. The table is the engine's, and so are the files: CSV, a
 * workbook with what each question did, GeoJSON, JSON.
 */

const PAGE = 100;
const DEPTHS = ['', 'quick', 'standard', 'deep', 'exhaustive'] as const;

export default function DatasetsDesk({ engineState, signal, go, receive, take }: DeskProps) {
  const [text, setText] = useState(() => (take('datasets')?.questions ?? []).join('\n'));
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]>('');
  const [checks, setChecks] = useState('');
  const [fresh, setFresh] = useState(false);
  const [rows, setRows] = useState<{ id: string; total: number; items: DatasetRow[] } | null>(null);
  const [rowsProblem, setRowsProblem] = useState<string | null>(null);
  const { task, problem, running, start } = useTask<DatasetSummary>(signal);
  const ready = isReady(engineState);

  useEffect(
    () =>
      receive('datasets', (h) => {
        if (!h.questions?.length) return;
        setText((prev) => {
          const have = prev.split('\n').map((l) => l.trim()).filter(Boolean);
          const add = h.questions!.filter((q) => !have.includes(q));
          return [...have, ...add].join('\n');
        });
      }),
    [receive],
  );

  const questions = useMemo(
    () => [...new Set(text.split('\n').map((l) => l.trim()).filter((l) => l.length >= 3))],
    [text],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || questions.length === 0) return;
    const n = Number.parseInt(checks, 10);
    void start(() =>
      engine.dataset(
        {
          questions,
          matched_only: matchedOnly,
          fresh,
          ...(depth ? { depth } : {}),
          ...(Number.isFinite(n) && n >= 0 ? { checks: n } : {}),
        },
        signal,
      ),
    );
  };

  const summary = task?.status === 'done' ? (task.result ?? null) : null;
  const datasetId = summary && task ? task.id : null;

  // the first page of rows, once the dataset is done (the rows arrive with the engine's answer)
  useEffect(() => {
    if (!datasetId) return;
    let live = true;
    void (async () => {
      const got = await engine.datasetRows(datasetId, 0, PAGE, signal);
      if (!live) return;
      if (got.ok) setRows({ id: datasetId, total: got.value.total, items: got.value.items });
      else if (got.problem !== 'cancelled') setRowsProblem(got.problem);
    })();
    return () => {
      live = false;
    };
  }, [datasetId, signal]);

  const more = async () => {
    if (!datasetId || !rows || rows.id !== datasetId) return;
    const got = await engine.datasetRows(datasetId, rows.items.length, PAGE, signal);
    if (got.ok) setRows({ id: datasetId, total: got.value.total, items: [...rows.items, ...got.value.items] });
    else if (got.problem !== 'cancelled') setRowsProblem(got.problem);
  };

  const shown = rows && rows.id === datasetId ? rows : null;
  const marks = useMemo<Mark[]>(
    () =>
      (shown?.items ?? [])
        .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
        .map((r, i) => ({
          id: String(r.entity_id ?? i),
          lat: r.latitude as number,
          lon: r.longitude as number,
          open: r.verdict !== 'match',
        })),
    [shown],
  );

  return (
    <>
      <NeedsEngine state={engineState} />
      <form className="sv-ask" onSubmit={submit} aria-label="Build a dataset">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-questions">
          QUESTIONS · ONE PER LINE
        </label>
        <textarea
          id="sv-questions"
          className="sv-textarea"
          rows={Math.min(10, Math.max(4, questions.length + 1))}
          value={text}
          spellCheck={false}
          placeholder={'all the hotels in manali\nall the homestays in manali\nresorts with a pool in kullu'}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="t-mono t-mono-xs t-dim">
          {questions.length} QUESTION(S){questions.length > 50 ? ' · THE ENGINE TAKES 50 AT MOST' : ''}
        </p>
        <div className="sv-ask__row">
          <label className="t-mono t-mono-xs sv-field">
            DEPTH
            <select value={depth} onChange={(e) => setDepth(e.target.value as (typeof DEPTHS)[number])}>
              {DEPTHS.map((d) => (
                <option key={d || 'each'} value={d}>
                  {d ? d.toUpperCase() : 'AS EACH ASKS'}
                </option>
              ))}
            </select>
          </label>
          <label className="t-mono t-mono-xs sv-field">
            SITES TO READ
            <input
              type="number"
              min={0}
              max={10000}
              inputMode="numeric"
              placeholder="BY DEPTH"
              value={checks}
              onChange={(e) => setChecks(e.target.value)}
            />
          </label>
          <label className="t-mono t-mono-xs sv-check">
            <input type="checkbox" checked={matchedOnly} onChange={(e) => setMatchedOnly(e.target.checked)} />
            MATCHED ONLY
          </label>
          <label className="t-mono t-mono-xs sv-check">
            <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} />
            ASK EVERY SOURCE AGAIN
          </label>
          <button
            type="submit"
            className="sv-btn sv-btn--signal"
            disabled={!ready || questions.length === 0 || questions.length > 50 || running}
          >
            {running ? 'BUILDING…' : 'BUILD THE DATASET'}
          </button>
        </div>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}
      {task && <Progress task={task} />}

      {summary && datasetId && (
        <section className="sv-answer" aria-label="The dataset">
          <dl className="sv-counts">
            <div>
              <dt>BUSINESSES</dt>
              <dd>{count(summary.rows)}</dd>
            </div>
            <div>
              <dt>MATCHING</dt>
              <dd>{count(summary.matching)}</dd>
            </div>
            <div>
              <dt>UNDETERMINED</dt>
              <dd>{count(summary.undetermined)}</dd>
            </div>
            <div>
              <dt>PLACED</dt>
              <dd>{count(summary.located)}</dd>
            </div>
          </dl>

          <div className="sv-scroll">
            <table className="sv-table">
              <caption className="t-mono t-mono-xs">WHAT EACH QUESTION DID</caption>
              <thead>
                <tr>
                  <th scope="col">QUESTION</th>
                  <th scope="col">AREA</th>
                  <th scope="col">MATCHED</th>
                  <th scope="col">UNDETERMINED</th>
                  <th scope="col">NEW</th>
                  <th scope="col">ALREADY FOUND</th>
                  <th scope="col">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody>
                {summary.questions.map((q) => (
                  <tr key={q.question}>
                    <th scope="row">
                      {q.search_id ? (
                        <button type="button" className="sv-link" onClick={() => go('survey', { searchId: q.search_id })}>
                          {q.question}
                        </button>
                      ) : (
                        q.question
                      )}
                      {q.error && <span className="t-mono t-mono-xs sv-problem"> · {q.error}</span>}
                    </th>
                    <td>{q.area ?? '—'}</td>
                    <td>{count(q.matched)}</td>
                    <td>{count(q.undetermined)}</td>
                    <td>{count(q.new)}</td>
                    <td>{count(q.already_found)}</td>
                    <td>{q.confidence ? q.confidence.toUpperCase() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rowsProblem && <p className="t-mono t-mono-xs sv-problem">{rowsProblem.toUpperCase()}</p>}
          {shown && (
            <div className="sv-grid">
              <div>
                <ol className="sv-rows">
                  {shown.items.map((r, i) => (
                    <li key={String(r.entity_id ?? i)}>
                      <div className="sv-row sv-row--static">
                        <span className="t-mono t-mono-xs sv-row__n">{String(i + 1).padStart(3, '0')}</span>
                        <span className="sv-row__name">{String(r.name ?? '(unnamed)')}</span>
                        <span className="t-mono t-mono-xs sv-row__kind">
                          {[r.categories, r.city ?? r.locality, String(r.phones ?? '').split('; ')[0], r.website]
                            .filter((v) => v !== null && v !== undefined && v !== '')
                            .join(' · ')}
                        </span>
                        <span className="t-mono t-mono-xs sv-row__far">{String(r.verdict ?? '').toUpperCase()}</span>
                        <span className="t-mono t-mono-xs t-faint sv-row__found">FOUND BY · {String(r.found_by ?? '')}</span>
                      </div>
                    </li>
                  ))}
                </ol>
                {shown.items.length < shown.total && (
                  <button type="button" className="sv-btn" onClick={() => void more()}>
                    READ {PAGE} MORE OF {count(shown.total)}
                  </button>
                )}
              </div>
              <div className="sv-side">
                <Plate area={null} marks={marks} label="the dataset" legend="SOLID MATCHING · OPEN UNDETERMINED" />
              </div>
            </div>
          )}

          <section className="sv-take" aria-label="Take it away">
            <h2 className="t-mono t-mono-xs sv-take__title">THE DATASET — AS THE ENGINE WRITES IT</h2>
            <p className="sv-take__links">
              {EXPORT_FORMATS.map((f) => (
                <a key={f} className="sv-btn" href={datasetExportUrl(datasetId, f)} download>
                  {f.toUpperCase()}
                </a>
              ))}
            </p>
            {summary.attribution.length > 0 && (
              <p className="t-mono t-mono-xs t-faint sv-attribution">DATA · {summary.attribution.join(' · ')}</p>
            )}
            <p className="t-body-s t-dim">
              The engine keeps a finished dataset in memory for a while; its searches are kept with local knowledge.
            </p>
          </section>
        </section>
      )}
    </>
  );
}
