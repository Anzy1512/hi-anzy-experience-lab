import { useCallback, useEffect, useState } from 'react';

import type { JobDetail, JobSummary, JobTrace } from '../client.ts';
import { Limitations, Measure, Notice, ServiceGate } from '../components.tsx';
import { formatCost, formatDuration, useService } from '../state.ts';

/**
 * RESEARCH THAT TAKES A WHILE.
 *
 * ── PROGRESS IS THE GRAPH, NOT A BAR ────────────────────────────────────────
 *
 * A bar says how far along; it cannot say what is happening or why. The task
 * list carries the reason each task exists, which is the thing a reader
 * actually wants when a job is taking longer than expected — and the thing
 * that makes an agent's behaviour arguable rather than mysterious.
 *
 * ── POLLING STOPS WHEN THE JOB DOES ─────────────────────────────────────────
 *
 * The interval is cleared on unmount and when the job reaches a terminal
 * state. A surface that keeps asking a finished service every two seconds for
 * the rest of the afternoon is a surface nobody left open.
 */
export function Jobs(): React.JSX.Element {
  const { client } = useService();
  const [question, setQuestion] = useState('');
  const [projectId, setProjectId] = useState('');
  const [maxPages, setMaxPages] = useState(5);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const path = `/v1/jobs${projectId.trim() === '' ? '' : `?projectId=${encodeURIComponent(projectId.trim())}`}`;

  const loadJobs = useCallback(async () => {
    const res = await client.get<{ jobs: JobSummary[] }>(path);
    if (res.ok) setJobs(res.data.jobs);
  }, [client, path]);

  useEffect(() => {
    /* Inline rather than calling `loadJobs`, and abandoned if the project
       filter changes while it is in flight — otherwise a slow response for one
       project can land after a fast one for another and win. */
    let live = true;
    void (async () => {
      const res = await client.get<{ jobs: JobSummary[] }>(path);
      if (live && res.ok) setJobs(res.data.jobs);
    })();
    return () => {
      live = false;
    };
  }, [client, path]);

  const start = async (): Promise<void> => {
    setBusy(true);
    setRefusal(null);
    const res = await client.post<{ jobId: string }>('/v1/jobs', {
      question,
      maxPages,
      maxSearches: maxPages > 0 ? 2 : 0,
      maxModelCalls: 0,
      ...(projectId.trim() !== '' ? { projectId: projectId.trim() } : {}),
    });
    if (res.ok) {
      setSelected(res.data.jobId);
      await loadJobs();
    } else {
      setRefusal([res.detail]);
    }
    setBusy(false);
  };

  return (
    <ServiceGate>
      <section className="section">
        <h2 className="section__title">Start research</h2>
        <div className="field">
          <label className="field__label" htmlFor="jq">
            The question
          </label>
          <textarea id="jq" className="field__area" value={question} onChange={(e) => setQuestion(e.target.value)} />
        </div>
        <div className="audit__row">
          <div className="field">
            <label className="field__label" htmlFor="proj">
              Project (optional)
            </label>
            <input
              id="proj"
              className="field__input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pages">
              Pages it may fetch
            </label>
            <input
              id="pages"
              className="field__input"
              type="number"
              min={0}
              max={50}
              value={maxPages}
              onChange={(e) => setMaxPages(Math.max(0, Math.min(50, Number(e.target.value))))}
            />
          </div>
          <button
            type="button"
            className="button"
            onClick={() => void start()}
            disabled={busy || question.trim().length < 3}
          >
            {busy ? 'Starting' : 'Start'}
          </button>
        </div>
        <p className="prose dim">
          Fetching costs somebody else&rsquo;s bandwidth. You set the limit; the job stops at it and says so.
        </p>
      </section>

      {refusal !== null ? (
        <Notice title="This question cannot be researched as asked" refused>
          {refusal.map((r) => (
            <p className="notice__body" key={r}>
              {r}
            </p>
          ))}
        </Notice>
      ) : null}

      <section className="section">
        <h2 className="section__title">Jobs{projectId.trim() === '' ? '' : ` in ${projectId.trim()}`}</h2>
        {jobs.length === 0 ? (
          <p className="prose dim">No research has been run here yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  <th scope="col">State</th>
                  <th scope="col">Ended</th>
                  <th scope="col">Pages</th>
                  <th scope="col">Model</th>
                  <th scope="col">Cost</th>
                  <th scope="col"> </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.question}</td>
                    <td data-state={j.state}>{j.state}</td>
                    <td>{j.termination ?? '—'}</td>
                    <td>{j.pages_crawled}</td>
                    <td>{j.model_calls}</td>
                    <td>{formatCost(j.cost_micros)}</td>
                    <td>
                      <button
                        type="button"
                        className="button button--quiet"
                        onClick={() => setSelected(j.id)}
                        aria-pressed={selected === j.id}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected === null ? null : <JobSheet jobId={selected} />}
    </ServiceGate>
  );
}

const TERMINAL = new Set(['COMPLETE', 'PARTIAL', 'FAILED', 'CANCELLED']);

function JobSheet({ jobId }: { jobId: string }): React.JSX.Element {
  const { client } = useService();
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [trace, setTrace] = useState<JobTrace | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (): Promise<void> => {
      const d = await client.get<JobDetail>(`/v1/jobs/${jobId}`);
      if (!live) return;
      if (d.ok) {
        setDetail(d.data);
        const t = await client.get<JobTrace>(`/v1/jobs/${jobId}/trace`);
        if (live && t.ok) setTrace(t.data);
        /* Stop asking once there is nothing left to change. */
        if (!TERMINAL.has(d.data.job.state)) timer = setTimeout(() => void tick(), 2000);
      }
    };

    void tick();
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [client, jobId]);

  const download = async (): Promise<void> => {
    const res = await client.get<unknown>(`/v1/jobs/${jobId}/handoff`);
    if (!res.ok) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hi-anzy-handoff-${jobId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (detail === null) return <p className="prose dim">Reading the job…</p>;

  return (
    <>
      <section className="section">
        <h2 className="section__title">{detail.job.question}</h2>
        <p className="finding__meta">
          <Measure label="state" value={detail.job.state} />
          <Measure label="ended" value={detail.job.termination ?? 'running'} />
          <Measure label="tasks" value={`${detail.progress.done}/${detail.progress.total}`} />
          <Measure label="iterations" value={detail.job.iterations} />
          <Measure label="pages" value={detail.job.pages_crawled} />
          <Measure label="tools" value={detail.job.tool_calls} />
          <Measure label="model" value={detail.job.model_calls} />
          <Measure label="cost" value={formatCost(detail.job.cost_micros)} />
        </p>
        <p>
          <button type="button" className="button button--quiet" onClick={() => void download()}>
            Download handoff
          </button>
        </p>
      </section>

      <section className="section">
        <h2 className="section__title">The graph</h2>
        <ol className="graph">
          {detail.tasks.map((t) => (
            <li className="graph__task" key={t.key}>
              <span className="graph__key">
                {t.key}
                {t.dependsOn.length > 0 ? <span className="dim"> ← {t.dependsOn.join(', ')}</span> : null}
              </span>
              <span className="graph__state" data-state={t.state}>
                {t.agent} · {t.state}
                {t.attempts > 1 ? ` · ${t.attempts} attempts` : ''}
              </span>
              <p className="graph__why">{t.error ?? t.rationale}</p>
            </li>
          ))}
        </ol>
      </section>

      {trace === null || trace.steps.length === 0 ? null : (
        <section className="section section--wide">
          <h2 className="section__title">What the agents did</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Turn</th>
                  <th scope="col">Purpose</th>
                  <th scope="col">Added</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {trace.steps.map((s, i) => (
                  <tr key={`${s.task}-${s.turn}-${i}`}>
                    <td>{s.task}</td>
                    <td>{s.agent}</td>
                    <td>{s.turn}</td>
                    <td>{s.purpose}</td>
                    <td>{s.new_observations + s.new_entities + s.new_findings}</td>
                    <td>{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {trace === null || trace.toolCalls.length === 0 ? null : (
        <section className="section section--wide">
          <h2 className="section__title">Every tool call</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Tool</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Took</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {trace.toolCalls.map((c, i) => (
                  <tr key={`${c.tool}-${i}`}>
                    <td>{c.agent}</td>
                    <td>{c.tool}</td>
                    {/* -1 is a refusal: the contract or the budget said no. It is
                      shown, because an agent repeatedly reaching for something
                      it does not have is worth seeing. */}
                    <td data-outcome={c.outcome}>{c.outcome === 1 ? 'ok' : c.outcome === 0 ? 'failed' : 'refused'}</td>
                    <td>{formatDuration(c.duration_ms)}</td>
                    <td>{c.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Limitations lines={detail.job.limitations} />
    </>
  );
}
