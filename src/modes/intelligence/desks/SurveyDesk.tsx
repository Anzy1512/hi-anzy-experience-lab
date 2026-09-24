import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArtifactBar } from '../../../artifacts/ArtifactBar';
import { toMarkdown } from '../../../artifacts/artifact';
import {
  EXPORT_FORMATS,
  STAGES,
  engine,
  exportUrl,
  pause,
  values,
  type Graph,
  type Judgement,
  type ResultItem,
  type ReviewPair,
  type SearchStatus,
  type Verdict,
} from '../engine';
import { Plate, type Mark } from '../Plate';
import { NeedsEngine } from '../EngineLine';
import { POLL_MS, domainOf, isReady, when, type DeskProps, type Handover } from '../link';

/**
 * I1 · SURVEY — EVERY BUSINESS OF A KIND, IN A PLACE.
 *
 * A question in the visitor's words goes to the engine, which asks public
 * sources for the businesses it names and comes back with every business it
 * found, the evidence behind each, and how far the answer can be trusted. The
 * answer is read three ways: the LEDGER (each business, and what each source
 * said about it), RELATIONS (what the businesses share — a brand, an operator,
 * a website, a phone), and REVIEW (records the engine found alike but would not
 * join without a person saying so).
 *
 * A saved search from the ARCHIVE opens here as it was saved; a place handed
 * over from AREAS or LOCATORS is added to the next question when it is not
 * already named in it.
 */

const PAGE = 100;
const EXAMPLES = [
  'all the properties in himachal with a pool',
  'all the reliance stores in noida',
  'cafés without a website within 2 km of connaught place',
];
const DEPTHS = ['quick', 'standard', 'deep', 'exhaustive'] as const;

type View = 'ledger' | 'relations' | 'review';

interface Pages {
  matched: ResultItem[];
  undetermined: ResultItem[];
  excluded: ResultItem[];
  more: Record<Verdict, boolean>;
}

const EMPTY: Pages = {
  matched: [],
  undetermined: [],
  excluded: [],
  more: { matched: false, undetermined: false, excluded: false },
};

const VERDICTS: Verdict[] = ['matched', 'undetermined', 'excluded'];

/** Which of a brand's places a business is (D-056): what the search read, else what its condition saw. */
function placeKind(item: ResultItem): { kind: string; evidence: string | null } | null {
  const said = item.search?.['meta.place_kind']?.values?.[0];
  const how = item.search?.['meta.place_kind_evidence']?.values?.[0];
  if (typeof said === 'string') return { kind: said, evidence: typeof how === 'string' ? how : null };
  const seen = item.conditions?.find((c) => c.field === 'meta.place_kind')?.values?.[0];
  return typeof seen === 'string' ? { kind: seen, evidence: null } : null;
}

const PLACE_KINDS: Record<string, string> = {
  outlet: 'an outlet of the brand',
  office: 'an office, not an outlet',
  facility: 'works — a factory, warehouse or depot — not an outlet',
  seller: 'a seller of the brand’s goods, not its outlet',
  reference: 'named after the brand, not its own place',
};

/** The same, as the ledger's short label. */
const PLACE_LABELS: Record<string, string> = {
  office: 'OFFICE',
  facility: 'WORKS',
  seller: 'SELLER',
  reference: 'NAMED AFTER IT',
};

/** Why a condition kept a business out, in words — the engine's own reason where it gives one. */
function whyNot(item: ResultItem, c: { field: string; reason: string | null }): [string, string] {
  if (c.field === 'meta.place_kind') {
    const kind = placeKind(item)?.kind;
    return ['NOT AN OUTLET', kind ? (PLACE_KINDS[kind] ?? kind) : 'not one of the brand’s outlets'];
  }
  if (c.field === 'meta.brand') return ['NOT THE BRAND', c.reason ?? 'nothing on its record shows the brand'];
  return [c.field, c.reason ?? 'the condition was not met'];
}

export default function SurveyDesk({ engineState, signal, go, receive, take }: DeskProps) {
  const [initial] = useState<Handover | undefined>(() => take('survey'));
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [place, setPlace] = useState<string | null>(initial?.place ?? null);
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]>('standard');
  const [checks, setChecks] = useState('');
  // the engine's reading of a question, kept with the words it read
  const [reading, setReading] = useState<{ q: string; text: string } | null>(null);
  const [search, setSearch] = useState<SearchStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pages, setPages] = useState<Pages>(EMPTY);
  const [tab, setTab] = useState<Verdict>('matched');
  const [view, setView] = useState<View>('ledger');
  const [selected, setSelected] = useState<string | null>(null);
  const runId = useRef(0); // a new question retires the previous one's polling
  const input = useRef<HTMLInputElement>(null);
  // a question handed over puts the caret at its end, where the visitor finishes it
  const [focusAsk, setFocusAsk] = useState(() => (initial?.question !== undefined ? 1 : 0));
  const ready = isReady(engineState);

  /* ---- how the engine reads the question, as it is typed ------------------ */
  const asked = withPlace(question.trim(), place);
  useEffect(() => {
    if (!ready || asked.length < 3) return;
    const id = window.setTimeout(() => {
      void (async () => {
        const parsed = await engine.parse(asked, signal);
        if (!parsed.ok) return;
        setReading({ q: asked, text: describe(parsed.value.specification, parsed.value.error) });
      })();
    }, 450);
    return () => window.clearTimeout(id);
  }, [asked, signal, ready]);

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
        if (status.value.status === 'done' || status.value.status === 'saved') {
          await Promise.all(VERDICTS.map((v) => loadPage(id, v, 0)));
          return;
        }
        if (status.value.status === 'failed' || status.value.status === 'unfinished') return;
        await pause(POLL_MS, signal);
      }
    },
    [loadPage, signal],
  );

  const reset = useCallback(() => {
    runId.current += 1;
    setProblem(null);
    setPages(EMPTY);
    setSelected(null);
    setTab('matched');
    setView('ledger');
    setSearch(null);
    setElapsed(0);
    return runId.current;
  }, []);

  /** A search the engine already has — finished in memory, or saved in local knowledge. */
  const open = useCallback(
    (id: string) => {
      const run = reset();
      void follow(id, run, performance.now());
    },
    [follow, reset],
  );

  const submit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      if (!ready || asked.length < 3) return;
      const run = reset();
      const started = performance.now();
      void (async () => {
        const n = Number.parseInt(checks, 10);
        const begun = await engine.start(
          { query: asked, depth, ...(Number.isFinite(n) && n >= 0 ? { checks: n } : {}) },
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
    [asked, checks, depth, follow, ready, reset, signal],
  );

  /* ---- what other desks hand this one ------------------------------------- */
  // a search handed over before this desk existed: followed from here (its first
  // state arrives with the engine's answer, not before)
  useEffect(() => {
    if (!initial?.searchId) return;
    runId.current += 1;
    void follow(initial.searchId, runId.current, performance.now());
  }, [follow, initial]);

  useEffect(
    () =>
      receive('survey', (h) => {
        if (h.question !== undefined) {
          setQuestion(h.question);
          setPlace(h.place ?? null);
          setFocusAsk((n) => n + 1);
        } else if (h.place !== undefined) {
          setPlace(h.place);
        }
        if (h.searchId) open(h.searchId);
      }),
    [open, receive],
  );

  // after the render that shows this desk: a hidden input cannot take focus
  useEffect(() => {
    if (!focusAsk) return;
    const el = input.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusAsk]);

  /* ---- derived ------------------------------------------------------------ */
  const finished = search?.status === 'done' || search?.status === 'saved';
  const report = finished ? (search?.report ?? null) : null;
  const rows = pages[tab];
  const chosen = useMemo(
    () => [...pages.matched, ...pages.undetermined, ...pages.excluded].find((r) => r.id === selected) ?? null,
    [pages, selected],
  );
  const reasons = useMemo(
    () => new Map((report?.undetermined_by_field ?? []).map((u) => [u.field, u.reason])),
    [report],
  );
  const marks = useMemo<Mark[]>(
    () => [
      ...pages.undetermined.filter((r) => r.location).map((r) => ({ id: r.id, lat: r.location!.lat, lon: r.location!.lon, open: true })),
      ...pages.matched.filter((r) => r.location).map((r) => ({ id: r.id, lat: r.location!.lat, lon: r.location!.lon })),
    ],
    [pages],
  );
  const running = search !== null && (search.status === 'queued' || search.status === 'running');
  const readAs = ready && reading !== null && reading.q === asked ? reading.text : null;

  const buildSummary = useCallback(() => {
    const matched = pages.matched;
    const text = toMarkdown({
      title: `SURVEY — ${search?.query ?? asked}`,
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
        ENGINE: isReady(engineState) ? `v${engineState.health.version}` : 'NOT REACHED',
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
        question: search?.query ?? asked,
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
  }, [asked, engineState, pages.matched, report, search]);

  return (
    <>
      <NeedsEngine state={engineState} />
      <form className="sv-ask" onSubmit={submit} aria-label="Ask the engine">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-question">
          QUESTION
        </label>
        <input
          id="sv-question"
          ref={input}
          className="sv-question"
          type="text"
          value={question}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          placeholder={place ? `what to look for in ${place}` : EXAMPLES[0]}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {place && (
          <p className="t-mono t-mono-xs sv-place">
            <span className="t-faint">PLACE · </span>
            {place.toUpperCase()}
            <span className="t-faint"> — ADDED AS “IN {place.toUpperCase()}” WHEN THE QUESTION DOES NOT NAME IT · </span>
            <button type="button" className="sv-link" onClick={() => setPlace(null)}>
              DROP IT
            </button>
          </p>
        )}
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
          <button type="submit" className="sv-btn sv-btn--signal" disabled={!ready || asked.length < 3 || running}>
            {running ? 'SURVEYING…' : 'SURVEY'}
          </button>
          <button
            type="button"
            className="sv-btn"
            disabled={asked.length < 3}
            onClick={() => go('datasets', { questions: [asked] })}
          >
            ADD TO A DATASET
          </button>
        </div>
        <ul className="sv-examples" aria-label="Example questions">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                className="sv-example t-body-s"
                onClick={() => {
                  setQuestion(ex);
                  setPlace(null);
                }}
              >
                {ex}
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
          {search.status === 'saved' || search.status === 'unfinished' ? (
            <p className="t-mono t-mono-xs sv-run__line">
              <span>{search.status === 'saved' ? 'SAVED' : 'UNFINISHED'}</span>
              <span className="t-faint"> · </span>
              <span>{when(search.finished_at ?? search.created_at).toUpperCase()}</span>
              <span className="t-faint"> · </span>
              <span className="sv-run__q">{search.query}</span>
              {search.status === 'unfinished' && search.error && (
                <>
                  <span className="t-faint"> · </span>
                  <span className="sv-problem">{search.error}</span>
                </>
              )}
            </p>
          ) : (
            <>
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
            </>
          )}
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

          <div className="sv-views" role="tablist" aria-label="Read the answer as">
            {(
              [
                ['ledger', 'LEDGER'],
                ['relations', 'RELATIONS'],
                ['review', 'POSSIBLE DUPLICATES'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className="t-mono t-mono-xs sv-tab"
                onClick={() => setView(v)}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'ledger' && (
            <div className="sv-grid">
              <div className="sv-ledger">
                <div className="sv-tabs" role="tablist" aria-label="Results">
                  {VERDICTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={tab === v}
                      className="t-mono t-mono-xs sv-tab"
                      onClick={() => setTab(v)}
                    >
                      {v.toUpperCase()} · {report.results[v]}
                    </button>
                  ))}
                </div>
                {rows.length === 0 ? (
                  <p className="t-body-s t-dim sv-empty">
                    {tab === 'matched'
                      ? 'No business matched every condition.'
                      : tab === 'undetermined'
                        ? 'No business was left undetermined.'
                        : 'No business was excluded.'}
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
                          <span className="t-mono t-mono-xs sv-row__kind">
                            {[PLACE_LABELS[placeKind(r)?.kind ?? ''] ?? null, ...values(r, 'category')]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          <span className="t-mono t-mono-xs sv-row__far">
                            {r.distance_m !== null ? `${(r.distance_m / 1000).toFixed(1)} KM` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                {pages.more[tab] && (
                  <button type="button" className="sv-btn" onClick={() => void loadPage(search.id, tab, rows.length)}>
                    READ {PAGE} MORE
                  </button>
                )}
              </div>

              <div className="sv-side">
                <Plate
                  area={search.area?.geojson ?? null}
                  marks={marks}
                  selected={selected}
                  label={search.area?.description ?? 'the area'}
                  legend="SOLID MATCHED · OPEN UNDETERMINED"
                />
                {chosen ? (
                  <Detail item={chosen} reasons={reasons} go={go} />
                ) : (
                  <p className="t-body-s t-dim sv-hint">Choose a business to see what each source said about it.</p>
                )}
              </div>
            </div>
          )}

          {view === 'relations' && <Relations searchId={search.id} signal={signal} onPick={(id) => {
            setSelected(id);
            setView('ledger');
          }} />}
          {view === 'review' && <Review searchId={search.id} signal={signal} />}

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
              {EXPORT_FORMATS.map((f) => (
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
    </>
  );
}

/* ---- the ledger's detail -------------------------------------------------- */

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

function Detail({
  item,
  reasons,
  go,
}: {
  item: ResultItem;
  reasons: Map<string, string>;
  go: DeskProps['go'];
}) {
  const said = (path: string) =>
    (item.fields[path]?.values ?? []).map((v) => ({
      text: typeof v.value === 'boolean' ? (v.value ? 'yes' : 'no') : String(v.value),
      sources: v.sources ?? [],
    }));
  const site = values(item, 'website')[0];
  const domain = site ? domainOf(site) : null;
  const kind = placeKind(item);
  const against = (item.conditions ?? []).filter((c) => c.result === 'false');
  return (
    <article className="sv-detail" aria-label={`What the sources said about ${item.name ?? 'this business'}`}>
      <h2 className="t-display-s sv-detail__name">{item.name ?? '(unnamed)'}</h2>
      {item.verdict === 'false' && against.length > 0 && (
        <div className="sv-undecided">
          <h3 className="t-mono t-mono-xs">WHY IT IS NOT COUNTED</h3>
          {against.map((c) => {
            const [head, why] = whyNot(item, c);
            return (
              <p key={`${c.field}-${c.op}`} className="t-body-s">
                <span className="t-mono t-mono-xs">{head}</span> — {why}
              </p>
            );
          })}
        </div>
      )}
      <dl className="sv-facts">
        {kind && (
          <div>
            <dt>WHICH OF THE BRAND’S PLACES</dt>
            <dd>
              {PLACE_KINDS[kind.kind] ?? kind.kind}
              {kind.evidence && <span className="t-faint"> · {kind.evidence}</span>}
            </dd>
          </div>
        )}
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
      {site && (
        <p className="sv-actions">
          <button type="button" className="sv-btn" onClick={() => go('sites', { url: site })}>
            READ ITS SITE
          </button>
          {domain && (
            <button type="button" className="sv-btn" onClick={() => go('domains', { domain })}>
              LOOK UP ITS DOMAIN
            </button>
          )}
        </p>
      )}
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

/* ---- relations: what the businesses share -------------------------------- */

function Relations({ searchId, signal, onPick }: { searchId: string; signal: AbortSignal; onPick: (id: string) => void }) {
  const [graph, setGraph] = useState<{ id: string; graph: Graph } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const got = await engine.graph(searchId, signal);
      if (!live) return;
      if (got.ok) setGraph({ id: searchId, graph: got.value });
      else if (got.problem !== 'cancelled') setProblem(got.problem);
    })();
    return () => {
      live = false;
    };
  }, [searchId, signal]);

  if (problem) return <p className="t-mono t-mono-xs sv-problem">{problem.toUpperCase()}</p>;
  if (!graph || graph.id !== searchId) return <p className="t-mono t-mono-xs t-faint sv-hint">READING WHAT THEY SHARE…</p>;
  const g = graph.graph;
  const names = new Map(g.nodes.filter((n) => n.type === 'business').map((n) => [n.id, n.label]));
  const shared = g.nodes.filter((n): n is Extract<Graph['nodes'][number], { type: 'shared' }> => n.type === 'shared');
  const members = (id: string) => g.links.filter((l) => l.shared === id);
  return (
    <section className="sv-relations" aria-label="What the businesses share">
      <p className="t-mono t-mono-xs sv-relations__sum">
        {g.summary.linked} OF {g.summary.businesses} BUSINESSES SHARE SOMETHING ·{' '}
        {Object.entries(g.summary.shared)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n} ${k.toUpperCase()}`)
          .join(' · ') || 'NOTHING SHARED'}
      </p>
      {shared.length === 0 ? (
        <p className="t-body-s t-dim sv-empty">No two businesses in this answer share a brand, an operator, a site, a phone or a profile.</p>
      ) : (
        <ol className="sv-shared">
          {shared.map((s) => (
            <li key={s.id}>
              <p className="sv-shared__head">
                <span className="t-mono t-mono-xs sv-shared__kind">{s.kind.toUpperCase()}</span>
                <span className="sv-shared__label">{s.label}</span>
                <span className="t-mono t-mono-xs t-dim">{s.businesses} BUSINESSES</span>
              </p>
              <ul className="sv-shared__members">
                {members(s.id).map((m) => (
                  <li key={m.business}>
                    <button type="button" className="sv-link" onClick={() => onPick(m.business)}>
                      {names.get(m.business) ?? m.business}
                    </button>
                    <span className="t-mono t-mono-xs t-faint"> · {m.relation} · {m.sources.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---- review: records alike, not joined ------------------------------------ */

function Review({ searchId, signal }: { searchId: string; signal: AbortSignal }) {
  const [data, setData] = useState<{ id: string; pairs: ReviewPair[]; judged: number; canJudge: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [done, setDone] = useState<Record<number, string>>({});

  useEffect(() => {
    let live = true;
    void (async () => {
      const got = await engine.review(searchId, signal);
      if (!live) return;
      if (got.ok) setData({ id: searchId, pairs: got.value.pairs, judged: got.value.judged, canJudge: got.value.can_judge });
      else if (got.problem !== 'cancelled') setProblem(got.problem);
    })();
    return () => {
      live = false;
    };
  }, [searchId, signal]);

  const judge = async (i: number, pair: ReviewPair, judgement: Judgement) => {
    const reason = (reasons[i] ?? '').trim();
    if (!reason) return;
    const said = await engine.judge(
      {
        left: { source: pair.left.source, record: pair.left.record },
        right: { source: pair.right.source, record: pair.right.record },
        judgement,
        reason,
      },
      signal,
    );
    if (said.ok) setDone((prev) => ({ ...prev, [i]: `RECORDED · ${JUDGED[judgement]}` }));
    else if (said.problem !== 'cancelled') setDone((prev) => ({ ...prev, [i]: `NOT RECORDED · ${said.problem.toUpperCase()}` }));
  };

  if (problem) return <p className="t-mono t-mono-xs sv-problem">{problem.toUpperCase()}</p>;
  if (!data || data.id !== searchId) return <p className="t-mono t-mono-xs t-faint sv-hint">READING THE PAIRS…</p>;
  return (
    <section className="sv-review" aria-label="Possible duplicates">
      <p className="t-body-s sv-review__note">
        Records the engine found alike but not alike enough to join on its own. A judgement is kept in local
        knowledge and used by every later search.
        {data.judged > 0 && ` ${data.judged} pair(s) in this answer were judged already.`}
      </p>
      {!data.canJudge && (
        <p className="t-mono t-mono-xs t-faint">JUDGEMENTS ARE KEPT IN LOCAL KNOWLEDGE, WHICH IS OFF — THE PAIRS CAN BE READ, NOT JUDGED</p>
      )}
      {data.pairs.length === 0 ? (
        <p className="t-body-s t-dim sv-empty">No pair in this answer is waiting for a person.</p>
      ) : (
        <ol className="sv-pairs">
          {data.pairs.map((p, i) => (
            <li key={`${p.left.source}:${p.left.record}|${p.right.source}:${p.right.record}`} className="sv-pair">
              <p className="sv-pair__sides">
                <span>{p.left.name ?? p.left.record}</span>
                <span className="t-mono t-mono-xs t-faint"> {p.left.source} · {p.left.record}</span>
              </p>
              <p className="sv-pair__sides">
                <span>{p.right.name ?? p.right.record}</span>
                <span className="t-mono t-mono-xs t-faint"> {p.right.source} · {p.right.record}</span>
              </p>
              <p className="t-mono t-mono-xs t-dim">ALIKE · {p.score.toFixed(2)} — {p.evidence.join(' · ')}</p>
              {data.canJudge &&
                (done[i] ? (
                  <p className="t-mono t-mono-xs sv-pair__done">{done[i]}</p>
                ) : (
                  <div className="sv-pair__judge">
                    <label className="t-mono t-mono-xs sv-field">
                      WHY
                      <input
                        type="text"
                        maxLength={1000}
                        placeholder="what you know"
                        value={reasons[i] ?? ''}
                        onChange={(e) => setReasons((prev) => ({ ...prev, [i]: e.target.value }))}
                      />
                    </label>
                    {(['positive', 'negative', 'unsure'] as const).map((j) => (
                      <button
                        key={j}
                        type="button"
                        className="sv-btn"
                        disabled={!(reasons[i] ?? '').trim()}
                        onClick={() => void judge(i, p, j)}
                      >
                        {JUDGED[j]}
                      </button>
                    ))}
                  </div>
                ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const JUDGED: Record<Judgement, string> = {
  positive: 'SAME BUSINESS',
  negative: 'DIFFERENT BUSINESSES',
  unsure: 'CANNOT TELL',
};

/* ---- helpers --------------------------------------------------------------- */

/** The question with the handed-over place added, when the question does not name it. */
function withPlace(question: string, place: string | null): string {
  if (!place || question.toLowerCase().includes(place.toLowerCase())) return question;
  return question ? `${question} in ${place}` : '';
}

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
    ((spec[key] as { raw?: string; taxonomy_id?: string }[] | undefined) ?? []).map((t) => t.taxonomy_id ?? t.raw ?? '');
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
