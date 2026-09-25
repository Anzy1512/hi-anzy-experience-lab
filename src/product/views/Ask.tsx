import { useState } from 'react';

import type { AnswerBody } from '../client.ts';
import { FindingItem, Limitations, Measure, Notice, ServiceGate } from '../components.tsx';
import { formatCost, formatDuration, useService } from '../state.ts';

/**
 * ONE QUESTION.
 *
 * ── THE PLAN IS SHOWN BEFORE THE ANSWER ─────────────────────────────────────
 *
 * Not as a progress indicator — the answer arrives in one response — but
 * because how a conclusion was reached is part of whether to believe it. A
 * reader who can see that every step was a database query, and that no model
 * was called, knows something about the answer that no confidence score could
 * tell them.
 *
 * ── AND A REFUSAL IS A RESULT ───────────────────────────────────────────────
 *
 * An ambiguous question comes back with both readings named and nothing
 * researched. That is rendered as an answer, not as an error, because it is
 * one: the service declined to guess, and saying which two readings it was torn
 * between is more useful than a plausible answer to one of them.
 */
export function Ask(): React.JSX.Element {
  const { client } = useService();
  const [question, setQuestion] = useState('');
  const [entityName, setEntityName] = useState('');
  const [domain, setDomain] = useState('');
  const [maxModelCalls, setMaxModelCalls] = useState(0);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AnswerBody | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const ask = async (): Promise<void> => {
    setBusy(true);
    setRefusal(null);
    setAnswer(null);
    const res = await client.post<AnswerBody>('/v1/answer', {
      question,
      ...(entityName.trim() !== '' ? { entityName: entityName.trim() } : {}),
      ...(domain.trim() !== '' ? { domain: domain.trim() } : {}),
      maxModelCalls,
    });
    if (res.ok) setAnswer(res.data);
    else setRefusal(res.detail);
    setBusy(false);
  };

  return (
    <ServiceGate>
      <section className="section">
        <h2 className="section__title">The question</h2>
        <div className="field">
          <label className="field__label" htmlFor="q">
            What do you want to know
          </label>
          <textarea
            id="q"
            className="field__area"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Tell me about …"
          />
        </div>
        <div className="audit__row">
          <div className="field">
            <label className="field__label" htmlFor="name">
              Business name (optional)
            </label>
            <input
              id="name"
              className="field__input"
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="domain">
              Domain (optional)
            </label>
            <input id="domain" className="field__input" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="mmc">
              Model calls allowed
            </label>
            <input
              id="mmc"
              className="field__input"
              type="number"
              min={0}
              max={4}
              value={maxModelCalls}
              onChange={(e) => setMaxModelCalls(Math.max(0, Math.min(4, Number(e.target.value))))}
            />
          </div>
          <button
            type="button"
            className="button"
            onClick={() => void ask()}
            disabled={busy || question.trim().length < 3}
          >
            {busy ? 'Asking' : 'Ask'}
          </button>
        </div>
        <p className="prose dim">
          Zero is the normal setting. Most questions here are answered by a database query: exact, instant and free.
        </p>
      </section>

      {refusal !== null ? (
        <Notice title="Not answered" refused>
          <p className="notice__body">{refusal}</p>
        </Notice>
      ) : null}

      {answer === null ? null : <AnswerSheet answer={answer} />}
    </ServiceGate>
  );
}

function AnswerSheet({ answer }: { answer: AnswerBody }): React.JSX.Element {
  const evidence = new Map(answer.evidence.map((e) => [e.id, e]));
  const groups: Array<[string, typeof answer.findings.established]> = [
    ['Established', answer.findings.established],
    ['Sources disagree', answer.findings.conflicts],
    ['Not established', answer.findings.gaps],
  ];

  return (
    <>
      {answer.intent === 'UNKNOWN_INTENT' ? (
        <Notice title="The question was not researched">
          <p className="notice__body">
            The question reads as more than one kind of request. Ask one thing at a time, or name the intent.
          </p>
        </Notice>
      ) : null}

      <section className="section">
        <h2 className="section__title">How it was answered</h2>
        <p className="prose">
          <span className="value">{answer.intent}</span>
          {answer.plan.deterministicOnly ? ' — answered without a model.' : ' — a model was permitted.'}
        </p>
        <ol className="graph">
          {answer.plan.steps.map((s) => (
            <li className="graph__task" key={s.id}>
              <span className="graph__key">{s.description}</span>
              <span className="graph__state" data-state={s.skipped === undefined ? 'DONE' : 'SKIPPED'}>
                {s.source}
                {s.modelClass === 'NO_MODEL' ? '' : ` · ${s.modelClass}`}
              </span>
              <p className="graph__why">{s.skipped?.reason ?? s.rationale}</p>
            </li>
          ))}
        </ol>
      </section>

      {answer.summary !== null ? (
        <section className="section">
          <h2 className="section__title">In short</h2>
          <p className="prose">{answer.summary}</p>
          <p className="finding__meta">
            <span>
              written by {answer.summarySource === 'MODEL' ? 'a model, checked against the evidence' : 'the rules'}
            </span>
          </p>
        </section>
      ) : null}

      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <section className="section" key={title}>
            <h2 className="section__title">{title}</h2>
            {list.map((f, i) => (
              <FindingItem
                key={`${f.type}-${i}`}
                finding={f}
                citations={f.citations
                  .map((id) => evidence.get(id))
                  .filter((e): e is NonNullable<typeof e> => e !== undefined)
                  .map((e) => ({ quote: e.text, url: e.url ?? e.label }))}
              />
            ))}
          </section>
        ),
      )}

      {answer.findings.recommendations.length > 0 ? (
        <section className="section">
          <h2 className="section__title">What to do about it</h2>
          {/* Advice, kept in its own section because it has no evidence — it is
              about something that has not happened. */}
          <p className="prose dim">
            Advice, not findings. Nothing was measured to produce these, so they carry no citations.
          </p>
          {answer.findings.recommendations.map((f, i) => (
            <FindingItem key={`rec-${i}`} finding={f} />
          ))}
        </section>
      ) : null}

      <section className="section">
        <h2 className="section__title">What it cost</h2>
        <p className="finding__meta">
          <Measure label="model calls" value={answer.cost.modelCalls} />
          <Measure label="tokens" value={`${answer.cost.tokensIn}/${answer.cost.tokensOut}`} />
          <Measure label="cost" value={formatCost(answer.cost.costMicros)} />
          <Measure label="evidence" value={`${answer.cost.evidenceUsed} of ${answer.cost.evidenceConsidered}`} />
          <Measure label="took" value={formatDuration(answer.cost.durationMs)} />
          <Measure label="coverage" value={answer.coverage.verdict} />
          {answer.findings.withheldCount > 0 ? (
            <Measure label="statements withheld" value={answer.findings.withheldCount} />
          ) : null}
        </p>
        {answer.findings.withheldCount > 0 ? (
          <p className="prose dim">
            {answer.findings.withheldCount} generated statement
            {answer.findings.withheldCount === 1 ? ' was' : 's were'} rejected before rendering: the cited evidence did
            not support them. Kept in the record so the rate stays countable.
          </p>
        ) : null}
      </section>

      <Limitations lines={answer.limitations} />
    </>
  );
}
