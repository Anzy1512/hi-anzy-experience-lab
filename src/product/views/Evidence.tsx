import { useCallback, useEffect, useState } from 'react';

import type { JobFindings, JobSummary } from '../client.ts';
import { FindingItem, Measure, Notice, ServiceGate } from '../components.tsx';
import { useService } from '../state.ts';

/**
 * HOW DO YOU KNOW THAT.
 *
 * ── THE QUOTATION IS THE POINT ──────────────────────────────────────────────
 *
 * Every rendered conclusion here sits directly above the passage it rests on
 * and the address that passage was read from. Not behind a disclosure control,
 * not in a tooltip, not on another screen: a conclusion whose evidence takes a
 * click to see is a conclusion most readers will take on trust, and the whole
 * argument of this service is that they should not have to.
 *
 * ── AND THE REFUSALS ARE COUNTED IN PUBLIC ──────────────────────────────────
 *
 * Statements the verifier rejected are reported as a number and never as text.
 * The number is the honest measure of how often generation goes wrong; the text
 * is exactly what must not reach a reader.
 */
interface EntityRow {
  id: string;
  canonicalName: string;
  type: string;
}

interface Chain {
  claims: Array<{
    field: string;
    value: string;
    status: string;
    temporal: string;
    sourceCount: number;
    evidence: Array<{ url: string; method: string; observedAt: string; excerpt: string | null }>;
  }>;
}

export function Evidence(): React.JSX.Element {
  const { client } = useService();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobId, setJobId] = useState('');
  const [findings, setFindings] = useState<JobFindings | null>(null);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [entityId, setEntityId] = useState('');
  const [chain, setChain] = useState<Chain | null>(null);

  useEffect(() => {
    void (async () => {
      const j = await client.get<{ jobs: JobSummary[] }>('/v1/jobs?limit=25');
      if (j.ok) setJobs(j.data.jobs);
      const e = await client.get<{ entities: EntityRow[] }>('/v1/entities?type=ORGANIZATION&limit=50');
      if (e.ok) setEntities(e.data.entities);
    })();
  }, [client]);

  const loadFindings = useCallback(
    async (id: string) => {
      setJobId(id);
      setFindings(null);
      if (id === '') return;
      const res = await client.get<JobFindings>(`/v1/jobs/${id}/findings`);
      if (res.ok) setFindings(res.data);
    },
    [client],
  );

  const loadChain = useCallback(
    async (id: string) => {
      setEntityId(id);
      setChain(null);
      if (id === '') return;
      const res = await client.get<Chain>(`/v1/entities/${id}/evidence`);
      if (res.ok) setChain(res.data);
    },
    [client],
  );

  return (
    <ServiceGate>
      <section className="section">
        <h2 className="section__title">A job's findings</h2>
        <div className="field">
          <label className="field__label" htmlFor="job-pick">
            Which piece of research
          </label>
          <select
            id="job-pick"
            className="field__input"
            value={jobId}
            onChange={(e) => void loadFindings(e.target.value)}
          >
            <option value="">—</option>
            {jobs.map((j) => (
              <option value={j.id} key={j.id}>
                {j.question} · {j.state}
              </option>
            ))}
          </select>
        </div>

        {findings === null ? null : findings.findings.length === 0 ? (
          <Notice title="Nothing was established">
            <p className="notice__body">
              This job produced no findings that survived verification. That is a result, not a blank screen: the
              research ran and could not establish anything it was willing to state.
            </p>
          </Notice>
        ) : (
          <>
            <p className="finding__meta">
              <Measure label="findings" value={findings.findings.length} />
              {findings.withheldCount > 0 ? <Measure label="withheld" value={findings.withheldCount} /> : null}
            </p>
            {findings.findings.map((f) => (
              <FindingItem
                key={f.id}
                finding={{
                  statement: f.statement,
                  status: f.status,
                  type: f.finding_type,
                  reasoning: f.reasoning_type,
                  rule: f.rule_id,
                  limitations: f.limitations ?? '',
                }}
                citations={f.citations}
              />
            ))}
          </>
        )}
      </section>

      <section className="section">
        <h2 className="section__title">A business, claim by claim</h2>
        <div className="field">
          <label className="field__label" htmlFor="entity-pick">
            Which business
          </label>
          <select
            id="entity-pick"
            className="field__input"
            value={entityId}
            onChange={(e) => void loadChain(e.target.value)}
          >
            <option value="">—</option>
            {entities.map((e) => (
              <option value={e.id} key={e.id}>
                {e.canonicalName}
              </option>
            ))}
          </select>
        </div>

        {chain === null
          ? null
          : chain.claims.map((c) => (
              <article className="finding" key={`${c.field}-${c.value}`}>
                <p className="finding__statement">
                  <span className="value">{c.field}</span> {c.value}
                </p>
                <p className="finding__meta">
                  <span data-status={c.temporal}>{c.status}</span>
                  <span data-status={c.temporal}>{c.temporal}</span>
                  <span>
                    {c.sourceCount} source{c.sourceCount === 1 ? '' : 's'}
                  </span>
                </p>
                {c.evidence.map((e, i) => (
                  <blockquote className="citation" key={`${e.url}-${i}`}>
                    <p className="citation__quote">{e.excerpt ?? '(no excerpt was stored for this observation)'}</p>
                    <cite className="citation__source">
                      {e.url} · {e.method} · read {e.observedAt.slice(0, 10)}
                    </cite>
                  </blockquote>
                ))}
                {c.evidence.length === 0 ? (
                  <p className="finding__limits">
                    {c.value === 'UNKNOWN'
                      ? /* Normal, and the reason the store has an UNKNOWN state at
                           all: something looked for this and has nothing. */
                        'Nothing has established this. The field is held as unknown rather than left out, so the gap is visible.'
                      : /* A value with no observation behind it should not exist.
                           Shown rather than hidden, because a provenance system
                           that quietly tolerates one has stopped being one. */
                        'This value is held with no observation behind it. That should not happen, and is shown rather than hidden.'}
                  </p>
                ) : null}
              </article>
            ))}
      </section>
    </ServiceGate>
  );
}
