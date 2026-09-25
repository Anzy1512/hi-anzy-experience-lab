import { useEffect, useState } from 'react';

import type { PendingFinding, ReviewMetrics, ReviewQueue } from '../client.ts';
import { Limitations, Measure, Notice, ServiceGate } from '../components.tsx';
import { useService } from '../state.ts';

/**
 * A PERSON, READING ONE FINDING AGAINST THE PASSAGE IT CITES.
 *
 * ── THE QUOTE IS NOT OPTIONAL FURNITURE ─────────────────────────────────────
 *
 * A review form that shows a sentence and six radio buttons collects opinions
 * about prose. The reviewer has to be able to see what was cited, open the page
 * it came from, and say whether the one supports the other — so the citation is
 * rendered above the controls, with the URL as a link, on every card.
 *
 * ── AND WHY "UNSUPPORTED" AND "INCORRECT" ARE BOTH HERE ─────────────────────
 *
 * They are different failures and they need different fixes. A true statement
 * citing the wrong passage is a retrieval or attribution bug; a false statement
 * citing the right one is a reasoning bug. A single "wrong" button would merge
 * them and the resulting corpus could never tell them apart again — which is
 * exactly the distinction a later evaluation most needs.
 *
 * `STALE` is the third: it was right, the page has moved on, and nothing is
 * broken. Scoring that as a failure would train the system to distrust its own
 * correct work.
 */
export function Review(): React.JSX.Element {
  const { client } = useService();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [metrics, setMetrics] = useState<ReviewMetrics | null>(null);
  const [includeReviewed, setIncludeReviewed] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});

  /*
   * Read inside the effect rather than through a named helper, which is the
   * pattern the other views use: the lint rule that forbids setState in an
   * effect body is load-bearing here, and an async IIFE is the shape that
   * satisfies it without a disable comment.
   */
  useEffect(() => {
    void (async () => {
      const [q, m] = await Promise.all([
        client.get<ReviewQueue>(`/v1/reviews/pending?limit=25&includeReviewed=${includeReviewed ? 'true' : 'false'}`),
        client.get<ReviewMetrics>('/v1/reviews/metrics'),
      ]);
      if (q.ok) setQueue(q.data);
      if (m.ok) setMetrics(m.data);
    })();
  }, [client, includeReviewed]);

  /** The same read, after a write. Called from a handler, never from an effect. */
  const reload = async (): Promise<void> => {
    const [q, m] = await Promise.all([
      client.get<ReviewQueue>(`/v1/reviews/pending?limit=25&includeReviewed=${includeReviewed ? 'true' : 'false'}`),
      client.get<ReviewMetrics>('/v1/reviews/metrics'),
    ]);
    if (q.ok) setQueue(q.data);
    if (m.ok) setMetrics(m.data);
  };

  return (
    <ServiceGate>
      {metrics === null ? null : (
        <section className="section">
          <h2 className="section__title">What people have said so far</h2>
          <p className="finding__meta">
            <Measure label="reviews" value={metrics.reviews} />
            <Measure label="findings reviewed" value={metrics.findingsReviewed} />
            <Measure label="reviewers" value={metrics.reviewers} />
            <Measure label="with a correction" value={metrics.withCorrection} />
            <Measure
              label="agreed with the verifier"
              value={
                metrics.verifierAgreement.rate === null
                  ? 'NOT ASSESSED'
                  : `${Math.round(metrics.verifierAgreement.rate * 100)}% of ${
                      metrics.verifierAgreement.agreed + metrics.verifierAgreement.disagreed
                    }`
              }
            />
          </p>
          {Object.keys(metrics.byVerdict).length > 0 ? (
            <p className="finding__meta">
              <span className="dim">verdicts</span>
              {Object.entries(metrics.byVerdict).map(([k, v]) => (
                <Measure key={k} label={k} value={v} />
              ))}
            </p>
          ) : null}
          {metrics.falseMerges + metrics.missedMerges + metrics.correctlyAmbiguous > 0 ? (
            <p className="finding__meta">
              <Measure label="false merges" value={metrics.falseMerges} />
              <Measure label="missed merges" value={metrics.missedMerges} />
              <Measure label="correctly left ambiguous" value={metrics.correctlyAmbiguous} />
            </p>
          ) : null}
          <p className="prose dim">{metrics.note}</p>
        </section>
      )}

      {queue === null ? (
        <p className="prose dim">Reading…</p>
      ) : (
        <>
          <section className="section">
            <h2 className="section__title">Before you judge</h2>
            <ul className="limits__list">
              {queue.readThisFirst.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <label className="check" htmlFor="include-reviewed">
              <input
                id="include-reviewed"
                type="checkbox"
                checked={includeReviewed}
                onChange={(e) => setIncludeReviewed(e.target.checked)}
              />
              Also show findings someone has already reviewed
            </label>
          </section>

          {queue.findings.length === 0 ? (
            <Notice title="Nothing waiting">
              <p className="notice__body">
                Every finding here has been reviewed at least once. Run a pilot, or tick the box above to read them again.
                A second reviewer disagreeing is data, not a conflict.
              </p>
            </Notice>
          ) : (
            queue.findings.map((f) => (
              <ReviewCard
                key={f.id}
                finding={f}
                submitted={done[f.id]}
                onSubmit={async (body) => {
                  const res = await client.post<{ reviewId: string }>('/v1/reviews', { ...body, findingId: f.id });
                  setDone((prev) => ({ ...prev, [f.id]: res.ok ? 'recorded' : res.detail }));
                  if (res.ok) await reload();
                }}
              />
            ))
          )}

          <Limitations
            lines={[
              'A review is added. The finding is never changed: the pair — what the system said, and what you said about it — is the record.',
              'Two reviewers may disagree about the same finding. Both are kept.',
              'The rule and engine versions are stored with your verdict, so a label cannot drift onto later code.',
            ]}
          />
        </>
      )}
    </ServiceGate>
  );
}

interface Draft {
  verdict: string;
  citationValidity?: string;
  retrievalQuality?: string;
  entityResolution?: string;
  recommendationQuality?: string;
  note?: string;
  sourceCoverageNote?: string;
  correction?: string;
  reviewer: string;
  verifierAgreed?: boolean;
}

function ReviewCard({
  finding,
  submitted,
  onSubmit,
}: {
  finding: PendingFinding;
  submitted: string | undefined;
  onSubmit: (body: Draft) => Promise<void>;
}): React.JSX.Element {
  const [verdict, setVerdict] = useState('');
  const [citationValidity, setCitationValidity] = useState('');
  const [retrievalQuality, setRetrievalQuality] = useState('');
  const [entityResolution, setEntityResolution] = useState('');
  const [note, setNote] = useState('');
  const [correction, setCorrection] = useState('');
  const [coverage, setCoverage] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (): Promise<void> => {
    setBusy(true);
    await onSubmit({
      verdict,
      reviewer: reviewer.trim(),
      ...(citationValidity !== '' ? { citationValidity } : {}),
      ...(retrievalQuality !== '' ? { retrievalQuality } : {}),
      ...(entityResolution !== '' ? { entityResolution } : {}),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
      ...(correction.trim() !== '' ? { correction: correction.trim() } : {}),
      ...(coverage.trim() !== '' ? { sourceCoverageNote: coverage.trim() } : {}),
    });
    setBusy(false);
  };

  const id = (part: string): string => `r-${finding.id}-${part}`;

  return (
    <article className="finding">
      <p className="finding__statement">{finding.statement}</p>
      <p className="finding__meta">
        <span data-status={finding.verification === 'REJECTED' ? 'CONFLICTING' : undefined}>{finding.verification}</span>
        <span>{finding.status ?? '—'}</span>
        <span>{finding.ruleId !== null ? `rule ${finding.ruleId}` : (finding.reasoningType ?? '').toLowerCase()}</span>
        {finding.entityName !== null ? <span>{finding.entityName}</span> : null}
        {finding.reviews > 0 ? <Measure label="existing reviews" value={finding.reviews} /> : null}
      </p>
      {finding.verificationReason !== null ? <p className="finding__limits">{finding.verificationReason}</p> : null}
      {finding.limitations !== null && finding.limitations !== '' ? (
        <p className="finding__limits">{finding.limitations}</p>
      ) : null}

      {finding.citations.length === 0 ? (
        <p className="finding__limits">
          This finding cites nothing. If it is the kind of statement that should rest on a passage, record that.
        </p>
      ) : (
        finding.citations.map((c, i) => (
          <blockquote className="citation" key={`${c.url ?? 'none'}-${i}`}>
            <p className="citation__quote">{c.quote}</p>
            <cite className="citation__source">
              {c.url === null ? (
                'no URL recorded'
              ) : (
                /* Opened in a new tab and with no referrer: the reviewer is
                   about to visit a business's site and does not need this
                   surface's address travelling with them. */
                <a href={c.url} target="_blank" rel="noreferrer noopener">
                  {c.url}
                </a>
              )}
              {c.retrievedAt !== null ? ` · read ${c.retrievedAt.slice(0, 10)}` : ''}
            </cite>
          </blockquote>
        ))
      )}

      {submitted !== undefined ? (
        <p className="finding__meta">
          <span data-status={submitted === 'recorded' ? undefined : 'CONFLICTING'}>
            {submitted === 'recorded' ? 'REVIEW RECORDED' : submitted}
          </span>
        </p>
      ) : (
        <>
          <div className="audit__row">
            <div className="field">
              <label className="field__label" htmlFor={id('verdict')}>
                Does it hold?
              </label>
              <select id={id('verdict')} className="field__input" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
                <option value="">choose…</option>
                <option value="SUPPORTED">SUPPORTED — the passage says it</option>
                <option value="PARTIALLY_SUPPORTED">PARTIALLY_SUPPORTED — some of it</option>
                <option value="UNSUPPORTED">UNSUPPORTED — the passage does not say it</option>
                <option value="INCORRECT">INCORRECT — it is not true</option>
                <option value="STALE">STALE — it was true; the page has moved on</option>
                <option value="AMBIGUOUS">AMBIGUOUS — cannot be decided</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor={id('cite')}>
                The citation
              </label>
              <select
                id={id('cite')}
                className="field__input"
                value={citationValidity}
                onChange={(e) => setCitationValidity(e.target.value)}
              >
                <option value="">not assessed</option>
                <option value="VALID">VALID</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="INVALID">INVALID</option>
                <option value="NO_CITATION">NO_CITATION</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor={id('retr')}>
                What was retrieved
              </label>
              <select
                id={id('retr')}
                className="field__input"
                value={retrievalQuality}
                onChange={(e) => setRetrievalQuality(e.target.value)}
              >
                <option value="">not assessed</option>
                <option value="GOOD">GOOD</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="POOR">POOR</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor={id('ent')}>
                The business identified
              </label>
              <select
                id={id('ent')}
                className="field__input"
                value={entityResolution}
                onChange={(e) => setEntityResolution(e.target.value)}
              >
                <option value="">not assessed</option>
                <option value="CORRECT">CORRECT</option>
                <option value="FALSE_MERGE">FALSE_MERGE — two businesses treated as one</option>
                <option value="MISSED_MERGE">MISSED_MERGE — one business kept as two</option>
                <option value="CORRECTLY_AMBIGUOUS">CORRECTLY_AMBIGUOUS — right to refuse</option>
                <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor={id('correction')}>
              What it should have said
            </label>
            <input
              id={id('correction')}
              className="field__input"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
            />
          </div>
          <div className="audit__row">
            <div className="field">
              <label className="field__label" htmlFor={id('note')}>
                Note
              </label>
              <input id={id('note')} className="field__input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={id('coverage')}>
                What was not looked at
              </label>
              <input
                id={id('coverage')}
                className="field__input"
                value={coverage}
                onChange={(e) => setCoverage(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={id('who')}>
                Your name
              </label>
              <input id={id('who')} className="field__input" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
            </div>
            <button
              type="button"
              className="button"
              onClick={() => void send()}
              disabled={busy || verdict === '' || reviewer.trim() === ''}
            >
              {busy ? 'Recording' : 'Record review'}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
