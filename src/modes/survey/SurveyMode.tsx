import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useReducedMotion } from '../../core/hooks';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { toMarkdown } from '../../artifacts/artifact';
import {
  ENGINE_BASE,
  STAGES,
  engine,
  exportUrl,
  values,
  type EngineHealth,
  type EngineSource,
  type ResultItem,
  type SearchStatus,
  type Verdict,
} from './engine';
import { SurveyPlate } from './SurveyPlate';
import './survey.css';

/**
 * SURVEY — EVERY BUSINESS OF A KIND, IN A PLACE.
 *
 * The Lab's front end for the Commercial Intelligence Engine: a question in your
 * own words goes to the engine running on this machine, which asks public
 * sources for the businesses it names, and comes back with every business it
 * found, the evidence behind each, and how far the answer can be trusted.
 *
 * Three rules from the rest of the Lab hold here:
 *
 *  1. **Nothing is invented.** Every name, count and reason on this page is the
 *     engine's; when the engine is not running the page says so and shows
 *     nothing in its place.
 *  2. **Undetermined is a finding.** A business nothing states the answer for
 *     is listed as undetermined with the engine's reason, never as a "no".
 *  3. **Nothing is kept here.** No storage; every request is cancelled when you
 *     leave, and polling stops with it.
 */

const POLL_MS = 1200;
const PAGE = 100;
const EXAMPLES = [
  'all the properties in himachal with a pool',
  'all the reliance stores in noida',
  'cafés without a website within 2 km of connaught place',
];
const DEPTHS = ['quick', 'standard', 'deep', 'exhaustive'] as const;

type EngineState =
  | { kind: 'checking' }
  | { kind: 'ready'; health: EngineHealth; sources: EngineSource[] }
  | { kind: 'unreachable'; problem: string };

interface Pages {
  matched: ResultItem[];
  undetermined: ResultItem[];
  more: Record<Verdict, boolean>;
}

const EMPTY: Pages = { matched: [], undetermined: [], more: { matched: false, undetermined: false } };

export default function SurveyMode({ onReady, scope }: ModeViewProps) {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<EngineState>({ kind: 'checking' });
  const [question, setQuestion] = useState('');
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]>('standard');
  const [checks, setChecks] = useState('');
  // the engine's reading of a question, kept with the words it read
  const [reading, setReading] = useState<{ q: string; text: string } | null>(null);
  const [search, setSearch] = useState<SearchStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pages, setPages] = useState<Pages>(EMPTY);
  const [tab, setTab] = useState<Verdict>('matched');
  const [selected, setSelected] = useState<string | null>(null);

  /* One controller for the life of the mode: leaving cancels every request. */
  const controller = useRef<AbortController | null>(null);
  if (controller.current === null) controller.current = new AbortController();
  const signal = controller.current.signal;
  const runId = useRef(0); // a new question retires the previous one's polling

  useEffect(() => {
    const ac = controller.current;
    scope.add(() => ac?.abort());
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady(); // never waits on the engine: an absent engine is a state, not a hang
      },
      reduced ? 120 : 360,
    );
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- is the engine there? ---------------------------------------------- */
  const probe = useCallback(async () => {
    const health = await engine.health(signal);
    if (!health.ok) {
      if (health.problem !== 'cancelled') setState({ kind: 'unreachable', problem: health.problem });
      return;
    }
    const sources = await engine.sources(signal);
    setState({ kind: 'ready', health: health.value, sources: sources.ok ? sources.value : [] });
  }, [signal]);

  useEffect(() => {
    void probe(); // the first state is already CHECKING
  }, [probe]);

  const check = useCallback(() => {
    setState({ kind: 'checking' });
    void probe();
  }, [probe]);

  /* ---- how the engine reads the question, as it is typed ------------------ */
  useEffect(() => {
    const q = question.trim();
    if (state.kind !== 'ready' || q.length < 3) return;
    const id = window.setTimeout(() => {
      void (async () => {
        const parsed = await engine.parse(q, signal);
        if (!parsed.ok) return;
        setReading({ q, text: describe(parsed.value.specification, parsed.value.error) });
      })();
    }, 450);
    return () => window.clearTimeout(id);
  }, [question, signal, state.kind]);

  /* ---- a search: start, follow, read -------------------------------------- */
  const loadPage = useCallback(
    async (id: string, verdict: Verdict, offset: number) => {
      const page = await engine.results(id, verdict, offset, PAGE, signal);
      if (!page.ok) {
        if (page.problem !== 'cancelled') setProblem(`results could not be read: ${page.problem}`);
        return;
      }
      const items = page.value.items;
      setPages((prev) => ({
        ...prev,
        [verdict]: offset === 0 ? items : [...prev[verdict], ...items],
        more: { ...prev.more, [verdict]: items.length === PAGE },
      }));
    },
    [signal],
  );

  const follow = useCallback(
    async (id: string, run: number, started: number) => {
      for (;;) {
        if (signal.aborted || run !== runId.current) return;
        const status = await engine.status(id, signal);
        if (signal.aborted || run !== runId.current) return;
        setElapsed(performance.now() - started);
        if (!status.ok) {
          if (status.problem !== 'cancelled') setProblem(`the search could not be followed: ${status.problem}`);
          return;
        }
        setSearch(status.value);
        if (status.value.status === 'done') {
          await Promise.all([loadPage(id, 'matched', 0), loadPage(id, 'undetermined', 0)]);
          return;
        }
        if (status.value.status === 'failed') return;
        // the wait between looks ends early when the visitor leaves (the signal)
        await new Promise<void>((resolve) => {
          const done = () => {
            window.clearTimeout(t);
            signal.removeEventListener('abort', done);
            resolve();
          };
          const t = window.setTimeout(done, POLL_MS);
          signal.addEventListener('abort', done, { once: true });
        });
      }
    },
    [loadPage, signal],
  );

  const submit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const q = question.trim();
      if (state.kind !== 'ready' || q.length < 3) return;
      runId.current += 1;
      const run = runId.current;
      setProblem(null);
      setPages(EMPTY);
      setSelected(null);
      setTab('matched');
      setSearch(null);
      setElapsed(0);
      const started = performance.now();
      void (async () => {
        const n = Number.parseInt(checks, 10);
        const begun = await engine.start(
          { query: q, depth, ...(Number.isFinite(n) && n >= 0 ? { checks: n } : {}) },
          signal,
        );
        if (run !== runId.current) return;
        if (!begun.ok) {
          if (begun.problem !== 'cancelled') setProblem(begun.problem);
          return;
        }
        setSearch(begun.value);
        await follow(begun.value.id, run, started);
      })();
    },
    [checks, depth, follow, question, signal, state.kind],
  );

  /* ---- derived ------------------------------------------------------------ */
  const report = search?.status === 'done' ? (search.report ?? null) : null;
  const rows = tab === 'matched' ? pages.matched : pages.undetermined;
  const chosen = useMemo(
    () => [...pages.matched, ...pages.undetermined].find((r) => r.id === selected) ?? null,
    [pages, selected],
  );
  const reasons = useMemo(
    () => new Map((report?.undetermined_by_field ?? []).map((u) => [u.field, u.reason])),
    [report],
  );
  const running = search !== null && (search.status === 'queued' || search.status === 'running');
  const readAs =
    state.kind === 'ready' && reading !== null && reading.q === question.trim() ? reading.text : null;

  const buildSummary = useCallback(() => {
    const matched = pages.matched;
    const text = toMarkdown({
      title: `SURVEY — ${search?.query ?? question}`,
      standfirst:
        'What the Commercial Intelligence Engine found, as it reported it. Every business is the engine’s; an undetermined one is a business nothing stated the answer for, not a “no”. The whole dataset is the engine’s own export.',
      sections: [
        {
          head: 'THE ANSWER',
          items: report
            ? [
                `**MATCHED** — ${report.results.matched}`,
                `**UNDETERMINED** — ${report.results.undetermined}`,
                `**EXCLUDED** — ${report.results.excluded}`,
                `**DISCOVERY CONFIDENCE** — ${report.discovery_confidence.toUpperCase()}`,
                ...report.confidence_reasons.map((r) => `WHY — ${r}`),
              ]
            : ['NO ANSWER YET — no search has finished in this session.'],
        },
        {
          head: `MATCHED (${matched.length} READ OF ${report?.results.matched ?? 0})`,
          items: matched.map((r) =>
            [r.name ?? '(unnamed)', values(r, 'category').join(', '), values(r, 'phone')[0], values(r, 'website')[0]]
              .filter(Boolean)
              .join(' — '),
          ),
        },
        { head: 'WHAT WAS DONE', items: report?.statements ?? [] },
        { head: 'LIMITATIONS', items: report?.limitations ?? [] },
      ],
      footer: {
        SEARCH: search?.id ?? 'NONE',
        ENGINE: state.kind === 'ready' ? `v${state.health.version}` : 'NOT REACHED',
        GENERATED: new Date().toISOString(),
        DATA: (search?.attribution ?? []).join('; ') || 'as the engine attributes it',
        STORAGE: 'NONE — nothing was written to this device',
      },
    });
    return {
      name: 'survey',
      text,
      data: {
        search: search?.id ?? null,
        question: search?.query ?? question,
        report: report ?? null,
        matched: matched.map((r) => ({
          name: r.name,
          categories: values(r, 'category'),
          phones: values(r, 'phone'),
          websites: values(r, 'website'),
          location: r.location,
          sources: r.sources,
        })),
        attribution: search?.attribution ?? [],
        storage: 'NONE',
      },
    };
  }, [pages.matched, question, report, search, state]);

  return (
    <div className="sv" data-armed={armed ? 'true' : 'false'}>
      <header className="sv-head">
        <h1 className="t-mono t-mono-xs sv-head__title">
          <span className="t-signal">SURVEY</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">EVERY BUSINESS OF A KIND, IN A PLACE.</span>
        </h1>
        <p className="t-body-s sv-head__note">
          Ask the way you would say it. The question goes to the Commercial Intelligence Engine on
          this machine, which asks public sources under their usage policies — the map, Overture’s
          places, brands’ own store locators, businesses’ own sites — and answers with the evidence
          and how far to trust it. The Lab keeps nothing.
        </p>
        <EngineLine state={state} onRetry={check} />
      </header>

      <form className="sv-ask" onSubmit={submit} aria-label="Ask the engine">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-question">
          QUESTION
        </label>
        <input
          id="sv-question"
          className="sv-question"
          type="text"
          value={question}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          placeholder={EXAMPLES[0]}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <p className="t-mono t-mono-xs sv-reading" aria-live="polite">
          {readAs ? (
            <>
              <span className="t-faint">READ AS · </span>
              {readAs}
            </>
          ) : (
            <span className="t-faint">READ AS · —</span>
          )}
        </p>
        <div className="sv-ask__row">
          <label className="t-mono t-mono-xs sv-field">
            DEPTH
            <select value={depth} onChange={(e) => setDepth(e.target.value as (typeof DEPTHS)[number])}>
              {DEPTHS.map((d) => (
                <option key={d} value={d}>
                  {d.toUpperCase()}
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
          <button
            type="submit"
            className="sv-btn sv-btn--signal"
            disabled={state.kind !== 'ready' || question.trim().length < 3 || running}
          >
            {running ? 'SURVEYING…' : 'SURVEY'}
          </button>
        </div>
        <ul className="sv-examples" aria-label="Example questions">
          {EXAMPLES.map((q) => (
            <li key={q}>
              <button type="button" className="sv-example t-body-s" onClick={() => setQuestion(q)}>
                {q}
              </button>
            </li>
          ))}
        </ul>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}

      {search && (
        <section className="sv-run" aria-live="polite" aria-label="Progress">
          <ol className="sv-stages">
            {STAGES.map((s) => (
              <li key={s} data-state={stageState(search, s)} className="t-mono t-mono-xs">
                {s.toUpperCase()}
              </li>
            ))}
          </ol>
          <p className="t-mono t-mono-xs sv-run__line">
            <span>{search.status.toUpperCase()}</span>
            <span className="t-faint"> · </span>
            <span>{(elapsed / 1000).toFixed(1)} S</span>
            {search.status === 'failed' && search.error && (
              <>
                <span className="t-faint"> · </span>
                <span className="sv-problem">{search.error}</span>
              </>
            )}
          </p>
        </section>
      )}

      {report && search && (
        <section className="sv-answer" aria-label="The answer">
          <dl className="sv-counts">
            <div>
              <dt>MATCHED</dt>
              <dd>{report.results.matched}</dd>
            </div>
            <div>
              <dt>UNDETERMINED</dt>
              <dd>{report.results.undetermined}</dd>
            </div>
            <div>
              <dt>EXCLUDED</dt>
              <dd>{report.results.excluded}</dd>
            </div>
            <div>
              <dt>CONFIDENCE</dt>
              <dd>{report.discovery_confidence.toUpperCase()}</dd>
            </div>
          </dl>
          {report.confidence_reasons.length > 0 && (
            <ul className="t-body-s sv-why">
              {report.confidence_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}

          <div className="sv-grid">
            <div className="sv-ledger">
              <div className="sv-tabs" role="tablist" aria-label="Results">
                {(['matched', 'undetermined'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={tab === v}
                    className="t-mono t-mono-xs sv-tab"
                    onClick={() => setTab(v)}
                  >
                    {v.toUpperCase()} · {v === 'matched' ? report.results.matched : report.results.undetermined}
                  </button>
                ))}
              </div>
              {rows.length === 0 ? (
                <p className="t-body-s t-dim sv-empty">
                  {tab === 'matched'
                    ? 'No business matched every condition.'
                    : 'No business was left undetermined.'}
                </p>
              ) : (
                <ol className="sv-rows">
                  {rows.map((r, i) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="sv-row"
                        aria-pressed={selected === r.id}
                        onClick={() => setSelected(selected === r.id ? null : r.id)}
                      >
                        <span className="t-mono t-mono-xs sv-row__n">{String(i + 1).padStart(3, '0')}</span>
                        <span className="sv-row__name">{r.name ?? '(unnamed)'}</span>
                        <span className="t-mono t-mono-xs sv-row__kind">{values(r, 'category').join(' · ')}</span>
                        <span className="t-mono t-mono-xs sv-row__far">
                          {r.distance_m !== null ? `${(r.distance_m / 1000).toFixed(1)} KM` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {pages.more[tab] && (
                <button
                  type="button"
                  className="sv-btn"
                  onClick={() => void loadPage(search.id, tab, rows.length)}
                >
                  READ {PAGE} MORE
                </button>
              )}
            </div>

            <div className="sv-side">
              <SurveyPlate
                area={search.area?.geojson ?? null}
                matched={pages.matched}
                undetermined={pages.undetermined}
                selected={selected}
                label={search.area?.description ?? 'the area'}
              />
              {chosen ? (
                <Detail item={chosen} reasons={reasons} />
              ) : (
                <p className="t-body-s t-dim sv-hint">Choose a business to see what each source said about it.</p>
              )}
            </div>
          </div>

          <details className="sv-done">
            <summary className="t-mono t-mono-xs">WHAT WAS DONE · LIMITATIONS</summary>
            <ul className="t-body-s">
              {report.statements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <ul className="t-body-s t-dim">
              {report.limitations.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>

          <section className="sv-take" aria-label="Take it away">
            <h2 className="t-mono t-mono-xs sv-take__title">THE DATASET — AS THE ENGINE EXPORTS IT</h2>
            <p className="sv-take__links">
              {(['csv', 'xlsx', 'geojson', 'json'] as const).map((f) => (
                <a key={f} className="sv-btn" href={exportUrl(search.id, f)} download>
                  {f.toUpperCase()}
                </a>
              ))}
            </p>
            <h2 className="t-mono t-mono-xs sv-take__title">THE SUMMARY</h2>
            <ArtifactBar formats={['copy', 'markdown', 'json']} build={buildSummary} />
            {(search.attribution ?? []).length > 0 && (
              <p className="t-mono t-mono-xs t-faint sv-attribution">DATA · {(search.attribution ?? []).join(' · ')}</p>
            )}
          </section>
        </section>
      )}
    </div>
  );
}

/* ---- pieces --------------------------------------------------------------- */

function EngineLine({ state, onRetry }: { state: EngineState; onRetry: () => void }) {
  if (state.kind === 'checking') {
    return <p className="t-mono t-mono-xs sv-engine">ENGINE · LOOKING AT {ENGINE_BASE}</p>;
  }
  if (state.kind === 'unreachable') {
    return (
      <div className="sv-engine sv-engine--off" role="status">
        <p className="t-mono t-mono-xs">
          ENGINE · NOT REACHABLE AT {ENGINE_BASE} · {state.problem.toUpperCase()}
        </p>
        <p className="t-body-s">
          Start it on this machine, in the commercial-intelligence folder, and look again:
        </p>
        <pre className="t-mono t-mono-xs sv-code">uv run comintel serve</pre>
        <button type="button" className="sv-btn" onClick={onRetry}>
          LOOK AGAIN
        </button>
      </div>
    );
  }
  const ready = state.sources.filter((s) => !s.problem && s.available).length;
  return (
    <p className="t-mono t-mono-xs sv-engine">
      <span className="t-signal">ENGINE</span> · V{state.health.version} · LOCAL KNOWLEDGE{' '}
      {state.health.local_knowledge ? 'ON' : 'OFF'} · SOURCES READY {ready} OF {state.sources.length}
    </p>
  );
}

const DETAIL_FIELDS: [string, string][] = [
  ['category', 'KIND'],
  ['brand', 'BRAND'],
  ['address', 'ADDRESS'],
  ['address.city', 'CITY'],
  ['address.postcode', 'POSTCODE'],
  ['phone', 'PHONE'],
  ['email', 'E-MAIL'],
  ['website', 'WEBSITE'],
  ['attr.stars', 'STARS'],
  ['opening_hours', 'HOURS'],
];

const AMENITIES: [string, string][] = [
  ['attr.swimming_pool', 'POOL'],
  ['attr.parking', 'PARKING'],
  ['attr.internet_access', 'WI-FI'],
  ['attr.air_conditioning', 'AIR CONDITIONING'],
  ['attr.spa', 'SPA'],
  ['attr.gym', 'GYM'],
  ['attr.dogs_allowed', 'PETS'],
];

function Detail({ item, reasons }: { item: ResultItem; reasons: Map<string, string> }) {
  const said = (path: string) =>
    (item.fields[path]?.values ?? []).map((v) => ({
      text: typeof v.value === 'boolean' ? (v.value ? 'yes' : 'no') : String(v.value),
      sources: v.sources ?? [],
    }));
  return (
    <article className="sv-detail" aria-label={`What the sources said about ${item.name ?? 'this business'}`}>
      <h2 className="t-display-s sv-detail__name">{item.name ?? '(unnamed)'}</h2>
      <dl className="sv-facts">
        {[...DETAIL_FIELDS, ...AMENITIES].map(([path, label]) => {
          const found = said(path);
          if (found.length === 0) return null;
          return (
            <div key={path}>
              <dt>{label}</dt>
              <dd>
                {found.map((f, i) => (
                  <span key={`${f.text}-${i}`} className="sv-fact">
                    {path === 'website' ? (
                      <a href={f.text} target="_blank" rel="noopener noreferrer">
                        {f.text}
                      </a>
                    ) : (
                      f.text
                    )}
                    <span className="t-faint"> · {f.sources.join(', ')}</span>
                  </span>
                ))}
              </dd>
            </div>
          );
        })}
      </dl>
      {(item.undetermined_fields ?? []).length > 0 && (
        <div className="sv-undecided">
          <h3 className="t-mono t-mono-xs">UNDECIDED</h3>
          {(item.undetermined_fields ?? []).map((f) => (
            <p key={f} className="t-body-s">
              <span className="t-mono t-mono-xs">{f}</span> — {reasons.get(f) ?? 'no source stated it'}
            </p>
          ))}
        </div>
      )}
      <h3 className="t-mono t-mono-xs">EVIDENCE</h3>
      <ul className="sv-evidence">
        {item.records.map((r) => (
          <li key={`${r.source}:${r.record}`} className="t-mono t-mono-xs">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.source} · {r.record}
              </a>
            ) : (
              <>
                {r.source} · {r.record}
              </>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ---- helpers --------------------------------------------------------------- */

function stageState(search: SearchStatus, stage: (typeof STAGES)[number]): 'done' | 'now' | 'todo' {
  if (search.status === 'done') return 'done';
  const current = search.stage ? STAGES.indexOf(search.stage as (typeof STAGES)[number]) : -1;
  const at = STAGES.indexOf(stage);
  if (current < 0) return 'todo';
  if (at < current) return 'done';
  return at === current ? 'now' : 'todo';
}

/** The engine's reading of a question, in one line: what, where, and the conditions. */
function describe(spec: Record<string, unknown> | null, error: string | null): string {
  if (!spec) return error ? `NOT UNDERSTOOD — ${error}` : 'NOT UNDERSTOOD';
  const terms = (key: string) =>
    ((spec[key] as { raw?: string; taxonomy_id?: string }[] | undefined) ?? []).map(
      (t) => t.taxonomy_id ?? t.raw ?? '',
    );
  const products = ((spec.products as { term?: { raw?: string; taxonomy_id?: string } }[] | undefined) ?? []).map(
    (p) => p.term?.taxonomy_id ?? p.term?.raw ?? '',
  );
  const what = [...terms('categories'), ...terms('brands'), ...terms('companies'), ...products]
    .filter(Boolean)
    .join(' + ');
  const geo = spec.geography as { place?: string; relation?: string; radius_m?: number } | undefined;
  const where = geo?.place
    ? `${geo.relation === 'within' && geo.radius_m ? `within ${geo.radius_m / 1000} km of` : 'in'} ${geo.place}`
    : 'no place named';
  const must = ((spec.conditions as { must?: { field: string; op: string; value?: unknown }[] } | undefined)?.must ?? [])
    .map((c) => `${c.field.replace(/^(attr|derived)\./, '')}${c.op === 'equals' ? ` = ${String(c.value)}` : ` ${c.op}`}`)
    .join(' · ');
  return [what || 'businesses', where, must].filter(Boolean).join(' — ').toUpperCase();
}
