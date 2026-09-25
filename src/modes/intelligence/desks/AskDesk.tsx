import { useEffect, useState, type FormEvent } from 'react';
import {
  engine,
  type AskOutcome,
  type FeedbackVerdict,
  type ImportResult,
  type Imports,
  type PassageHit,
  type ProvidersReport,
} from '../engine';
import { NeedsEngine } from '../EngineLine';
import { count, isReady, when, type DeskProps } from '../link';

/**
 * I12 · ASK — ONE QUESTION, ROUTED BY THE ENGINE.
 *
 * The engine plans the question by rule and says which rule fired: a subject
 * and a place make it a search (SURVEY's work — served from a saved search
 * when fresh enough, refreshed when stale, and handed on), anything else is
 * read from the passages local knowledge holds: pages the engine read, files
 * brought in on this desk. Every passage is printed with its source and the
 * day it was last confirmed.
 *
 * A written answer appears only when a model provider is configured on the
 * engine and the engine kept the answer — which it does only when every
 * sentence cites a passage that was shown. Otherwise the passages are the
 * answer and the reason is printed in the engine's words. The providers are
 * named by the variables that configure them, never by a value; none is the
 * usual state, and the desk says so plainly.
 *
 * A verdict on a passage or an answer is sent to the engine as reviewed
 * feedback. It is kept and read back; it retrains nothing.
 */

type Route = 'auto' | 'list' | 'explain';
type Ask = { question: string; route: Route; fresh: boolean };
type Given = Record<string, FeedbackVerdict>;

const ROUTES: [Route, string][] = [
  ['auto', 'LET THE ENGINE DECIDE'],
  ['list', 'A SEARCH'],
  ['explain', 'THE PASSAGES'],
];
const KINDS: Record<string, string> = {
  generation: 'WRITES ANSWERS',
  embeddings: 'RANKS BY MEANING',
  decisions: 'DECIDES (JEV)',
};

function sourceOf(hit: PassageHit): string {
  if (hit.source_url?.startsWith('file:')) return hit.source_url.slice(5);
  return hit.source_url ?? `${hit.source_id} · ${hit.record_key}`;
}

function shortStrategy(strategy: Record<string, unknown>): string {
  const semantic = strategy.semantic === true;
  const model = typeof strategy.embedding_model === 'string' ? ` (${strategy.embedding_model})` : '';
  const match = typeof strategy.match === 'string' ? strategy.match.toUpperCase() : '';
  const candidates = typeof strategy.candidates === 'number' ? strategy.candidates : null;
  const head = semantic ? `WORDS AND MEANING${model}` : 'WORDS ONLY';
  const tail = candidates === null ? '' : ` · ${count(candidates)} CANDIDATE${candidates === 1 ? '' : 'S'}`;
  return `${head}${match ? ` · ${match}` : ''}${tail}`;
}

export default function AskDesk({ engineState, signal, go, receive, take, active }: DeskProps) {
  const [ask, setAsk] = useState<Ask>(() => ({ question: take('ask')?.question ?? '', route: 'auto', fresh: false }));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProvidersReport | null>(null);
  const [imports, setImports] = useState<Imports | null>(null);
  const [importsProblem, setImportsProblem] = useState<string | null>(null);
  const [given, setGiven] = useState<Given>({});
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<ImportResult | null>(null);
  const [uploadProblem, setUploadProblem] = useState<string | null>(null);
  // bumped after a file is brought in, so what is held is read again
  const [held, setHeld] = useState(0);
  const ready = isReady(engineState);
  const database = ready && engineState.health.local_knowledge;

  useEffect(
    () =>
      receive('ask', (h) => {
        if (h.question) setAsk((a) => ({ ...a, question: h.question ?? '' }));
      }),
    [receive],
  );

  /* what the engine has: its model providers, and the files brought in so far */
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void (async () => {
      const [p, i] = await Promise.all([engine.providers(false, signal), engine.imports(signal)]);
      if (!live || signal.aborted) return;
      if (p.ok) setProviders(p.value);
      if (i.ok) {
        setImports(i.value);
        setImportsProblem(null);
      } else if (i.problem !== 'cancelled') {
        setImportsProblem(i.problem);
      }
    })();
    return () => {
      live = false;
    };
  }, [ready, signal, held]);

  const run = async (next: Ask) => {
    const question = next.question.trim();
    if (!ready || question.length < 3) return;
    setAsk(next);
    setBusy(true);
    setProblem(null);
    setGiven({});
    const got = await engine.ask({ question, route: next.route, fresh: next.fresh, limit: 8 }, signal);
    if (signal.aborted) return;
    setBusy(false);
    if (got.ok) setOutcome(got.value);
    else if (got.problem !== 'cancelled') setProblem(got.problem);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(ask);
  };

  const judge = async (subject: 'passage' | 'answer', id: string, verdict: FeedbackVerdict) => {
    if (!outcome) return;
    const key = `${subject}:${id}`;
    const sent = await engine.feedback(
      { subject_kind: subject, subject_id: id, verdict, query_run_id: outcome.run.id },
      signal,
    );
    if (signal.aborted) return;
    if (sent.ok) setGiven((g) => ({ ...g, [key]: verdict }));
    else if (sent.problem !== 'cancelled') setProblem(sent.problem);
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return;
    if (!form.get('name')) form.delete('name');
    if (!form.get('document')) form.delete('document');
    setUploading(true);
    setUploadProblem(null);
    setUploaded(null);
    const got = await engine.importFile(form, signal);
    if (signal.aborted) return;
    setUploading(false);
    if (got.ok) {
      setUploaded(got.value);
      event.currentTarget.reset();
      setHeld((n) => n + 1);
    } else if (got.problem !== 'cancelled') {
      setUploadProblem(got.problem);
    }
  };

  const plan = outcome?.plan;
  const answer = outcome?.answer ?? null;
  const fresh = outcome?.run.freshness ?? {};
  const servedId = typeof fresh.search_id === 'string' ? fresh.search_id : null;
  const refreshId = typeof fresh.refresh === 'string' ? fresh.refresh : null;
  const configured = providers?.providers.filter((p) => p.configured) ?? [];

  return (
    <>
      <NeedsEngine state={engineState} />
      <form className="sv-ask" onSubmit={submit} aria-label="Ask a question">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-ask-question">
          QUESTION
        </label>
        <input
          id="sv-ask-question"
          className="sv-question"
          type="text"
          value={ask.question}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          autoFocus={active && ask.question.length > 0}
          placeholder="what does the franchise page say about minimum area?"
          onChange={(e) => setAsk((a) => ({ ...a, question: e.target.value }))}
        />
        <div className="sv-ask__row">
          <div className="sv-views sv-views--flush" role="radiogroup" aria-label="How to answer">
            {ROUTES.map(([r, label]) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={ask.route === r}
                className="t-mono t-mono-xs sv-tab"
                onClick={() => setAsk((a) => ({ ...a, route: r }))}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="t-mono t-mono-xs sv-check">
            <input type="checkbox" checked={ask.fresh} onChange={(e) => setAsk((a) => ({ ...a, fresh: e.target.checked }))} />
            SEARCH AGAIN, NOT A SAVED ONE
          </label>
          <button type="submit" className="sv-btn sv-btn--signal" disabled={!ready || ask.question.trim().length < 3 || busy}>
            {busy ? 'ASKING…' : 'ASK'}
          </button>
        </div>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}

      {outcome && plan && (
        <section className="sv-answer" aria-label="The answer" aria-busy={busy}>
          <p className="t-mono t-mono-xs sv-plan">
            <span className="t-signal">{plan.route === 'list' ? 'A SEARCH' : 'THE PASSAGES'}</span>
            <span className="t-faint"> · </span>
            <span className="t-dim">{plan.reason.toUpperCase()}</span>
          </p>
          {[...plan.warnings, ...plan.parse.assumptions, ...plan.parse.warnings].map((w) => (
            <p key={w} className="t-body-s t-dim sv-lead">
              {w}
            </p>
          ))}

          {plan.route === 'list' && (
            <>
              <p className="t-body-s sv-lead">
                {servedId
                  ? `Served from a search saved ${when(fresh.finished_at)} (${fresh.age_hours ?? '—'} hours old${fresh.stale ? ', stale' : ''}).`
                  : 'Nothing saved answers these words yet.'}
                {refreshId ? ` A search was started${servedId ? ' to refresh it' : ''}; SURVEY follows it as it runs.` : ''}
              </p>
              <div className="sv-actions">
                {refreshId && (
                  <button type="button" className="sv-btn sv-btn--signal" onClick={() => go('survey', { searchId: refreshId })}>
                    FOLLOW THE SEARCH IN SURVEY
                  </button>
                )}
                {servedId && (
                  <button type="button" className="sv-btn" onClick={() => go('survey', { searchId: servedId })}>
                    OPEN THE SAVED SEARCH
                  </button>
                )}
              </div>
              {outcome.results.length > 0 && (
                <ol className="sv-list t-body-s" aria-label="Businesses">
                  {outcome.results.map((r) => (
                    <li key={r.id}>
                      <span>{r.name ?? <span className="t-dim">unnamed</span>}</span>
                      <span className="t-mono t-mono-xs t-dim"> · {r.verdict === 'true' ? 'MATCHES' : r.verdict === 'false' ? 'EXCLUDED' : 'UNDETERMINED'}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {plan.route === 'explain' && (
            <>
              {outcome.retrieval && (
                <p className="t-mono t-mono-xs t-dim sv-plan">
                  RANKED BY {shortStrategy(outcome.retrieval.strategy)}
                  {outcome.retrieval.notes.map((n) => (
                    <span key={n}>
                      <span className="t-faint"> · </span>
                      {n.replace(/^ranked by words only: /i, '').toUpperCase()}
                    </span>
                  ))}
                </p>
              )}

              {answer?.status === 'generated' && answer.text && (
                <div className="sv-written">
                  <p className="t-mono t-mono-xs sv-written__label">
                    <span className="t-signal">WRITTEN BY A MODEL</span>
                    <span className="t-faint"> · </span>
                    {answer.provider.toUpperCase()}
                    {answer.model ? ` ${answer.model.toUpperCase()}` : ''}
                    <span className="t-faint"> · </span>
                    {answer.label.toUpperCase()}
                  </p>
                  <p className="t-body sv-written__text">{answer.text}</p>
                  <div className="sv-actions">
                    {(['correct', 'incorrect'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="sv-btn"
                        aria-pressed={given[`answer:${outcome.run.id}`] === v}
                        disabled={given[`answer:${outcome.run.id}`] !== undefined}
                        onClick={() => void judge('answer', outcome.run.id, v)}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                    {given[`answer:${outcome.run.id}`] && <span className="t-mono t-mono-xs t-dim">NOTED</span>}
                  </div>
                </div>
              )}
              {answer && answer.status !== 'generated' && (
                <p className="t-body-s t-dim sv-lead">No written answer — {answer.reason}.</p>
              )}

              {outcome.passages.length > 0 ? (
                <ol className="sv-passages" aria-label="Passages">
                  {outcome.passages.map((h, i) => {
                    const key = `passage:${h.id}`;
                    return (
                      <li key={h.id} className="sv-passage">
                        <p className="t-mono t-mono-xs sv-passage__meta">
                          <span className="t-signal">[{i + 1}]</span>
                          <span className="t-faint"> · </span>
                          {h.source_url && /^https?:/.test(h.source_url) ? (
                            <a href={h.source_url} target="_blank" rel="noopener noreferrer">
                              {sourceOf(h)}
                            </a>
                          ) : (
                            <span>{sourceOf(h)}</span>
                          )}
                          {h.section && (
                            <>
                              <span className="t-faint"> · </span>
                              <span className="t-dim">{h.section}</span>
                            </>
                          )}
                          <span className="t-faint"> · </span>
                          <span className="t-dim">SEEN {when(h.last_confirmed).toUpperCase()}</span>
                        </p>
                        <p className="t-body-s sv-passage__text">{h.text}</p>
                        <div className="sv-actions sv-actions--tight">
                          {(['relevant', 'irrelevant'] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              className="sv-link t-mono t-mono-xs"
                              aria-pressed={given[key] === v}
                              disabled={given[key] !== undefined}
                              onClick={() => void judge('passage', String(h.id), v)}
                            >
                              {v.toUpperCase()}
                            </button>
                          ))}
                          {given[key] && <span className="t-mono t-mono-xs t-dim">NOTED</span>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="t-body-s t-dim sv-empty">
                  No passage local knowledge holds matches these words. Passages come from sites a survey read and
                  from files brought in below.
                </p>
              )}
            </>
          )}
          <p className="t-mono t-mono-xs t-faint">RUN {outcome.run.id}</p>
        </section>
      )}

      {ready && (
        <section className="sv-done" aria-label="Model providers">
          <p className="t-mono t-mono-xs sv-label">MODEL PROVIDERS ON THE ENGINE</p>
          {providers ? (
            <>
              <dl className="sv-facts">
                {providers.providers.map((p) => (
                  <div key={p.kind}>
                    <dt>{KINDS[p.kind] ?? p.kind.toUpperCase()}</dt>
                    <dd>
                      <span>
                        {p.configured ? (
                          <>
                            <span className="t-signal">{p.provider.toUpperCase()}</span>
                            {p.model ? ` · ${p.model}` : ''}
                          </>
                        ) : (
                          'NONE CONFIGURED'
                        )}
                      </span>
                      <span className="t-faint">{p.detail}</span>
                      <span className="t-faint">SET BY {p.env.join(', ')}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="t-body-s t-dim">
                {configured.length === 0
                  ? 'No model is configured on the engine, so answers are the passages themselves, ranked by their words. '
                  : ''}
                {providers.policy}
              </p>
            </>
          ) : (
            <p className="t-mono t-mono-xs t-faint sv-hint">READING…</p>
          )}
        </section>
      )}

      {ready && (
        <section className="sv-done" aria-label="Your own files">
          <p className="t-mono t-mono-xs sv-label">FILES BROUGHT IN</p>
          {!database && (
            <p className="t-body-s t-dim">
              Files and passages live in the engine’s database, which is off — the EXTRACTS desk says how to start it.
            </p>
          )}
          {importsProblem && database && (
            <p className="t-mono t-mono-xs sv-problem" role="alert">
              {importsProblem.toUpperCase()}
            </p>
          )}
          {imports && (
            <>
              {imports.tables.length + imports.documents.length > 0 ? (
                <ul className="t-mono t-mono-xs t-dim sv-sources">
                  {imports.tables.map((t) => (
                    <li key={t.source_id}>
                      {t.source_id.toUpperCase()} · {count(t.records)} RECORD{t.records === 1 ? '' : 'S'} · SEARCHED LIKE ANY SOURCE
                    </li>
                  ))}
                  {imports.documents.map((d) => (
                    <li key={d.source_id}>
                      DOCUMENTS · {count(d.records)} · READ AS PASSAGES
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-body-s t-dim">Nothing has been brought in yet.</p>
              )}
              <form className="sv-upload" onSubmit={upload} aria-label="Bring a file in">
                <label className="t-mono t-mono-xs sv-field">
                  FILE
                  <input type="file" name="file" accept=".csv,.tsv,.xlsx,.json,.geojson,.txt,.md,.markdown,.html,.htm" required />
                </label>
                <label className="t-mono t-mono-xs sv-field">
                  NAME
                  <input className="sv-field__wide" type="text" name="name" maxLength={80} placeholder="THE FILE'S" />
                </label>
                <label className="t-mono t-mono-xs sv-check">
                  <input type="checkbox" name="document" value="true" />
                  READ AS A DOCUMENT
                </label>
                <button type="submit" className="sv-btn" disabled={uploading}>
                  {uploading ? 'BRINGING IN…' : 'BRING IN'}
                </button>
              </form>
              <p className="t-body-s t-dim">
                A table ({imports.accepts.tables.join(', ')}) becomes a source of its own that every search reads inside
                its area; a document ({imports.accepts.documents.join(', ')}) becomes passages this desk reads. The file is
                kept on the engine, in {imports.folder}.
              </p>
              {uploaded && (
                <p className="t-mono t-mono-xs sv-plan" role="status">
                  {uploaded.kind === 'table'
                    ? `${uploaded.source_id.toUpperCase()} · ${count(uploaded.records)} RECORDS, ${count(uploaded.located)} WITH A LOCATION · COLUMNS ${Object.entries(uploaded.columns_used)
                        .map(([k, v]) => `${k}←${v}`)
                        .join(', ')}`
                    : `${uploaded.title.toUpperCase()} · ${count(uploaded.passages)} PASSAGES FROM ${count(uploaded.characters)} CHARACTERS`}
                  {uploaded.notes.map((n) => (
                    <span key={n}>
                      <span className="t-faint"> · </span>
                      {n.toUpperCase()}
                    </span>
                  ))}
                </p>
              )}
              {uploadProblem && (
                <p className="t-mono t-mono-xs sv-problem" role="alert">
                  {uploadProblem.toUpperCase()}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
