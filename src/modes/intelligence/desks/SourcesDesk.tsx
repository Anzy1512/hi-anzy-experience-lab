import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { engine, type EngineSource, type RegistrySummary, type RegistryTool } from '../engine';
import { NeedsEngine } from '../EngineLine';
import { count, isReady, type DeskProps } from '../link';

/**
 * I9 · SOURCES — EVERY SOURCE, AND THE REGISTRY BEHIND THEM.
 *
 * What the engine asks and whether each source may be used right now (and if
 * not, the reason it gives), under which licence; then the registry of tools
 * reviewed to build it — every decision, including the ones that say no and
 * why. Nothing here is a recommendation of a tool; it is the record of what
 * was decided.
 */

const STATUS_MEANING: Record<string, string> = {
  INTEGRATE_NOW: 'integrated: an adapter in the engine',
  INTEGRATE_LATER: 'planned: an adapter after the core',
  REFERENCE_ONLY: 'studied, or for manual use; no adapter',
  OPTIONAL_PAID: 'usable once a key is configured; off by default',
  NOT_RELEVANT: 'outside commercial intelligence',
  REJECT: 'excluded: privacy, offensive use, legality or terms',
};

const PAGE = 50;

export default function SourcesDesk({ engineState, signal }: DeskProps) {
  const ready = isReady(engineState);
  const sources: EngineSource[] = ready ? engineState.sources : [];
  const [summary, setSummary] = useState<RegistrySummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void (async () => {
      const got = await engine.registry(signal);
      if (!live) return;
      if (got.ok) setSummary(got.value);
      else if (got.problem !== 'cancelled') setProblem(got.problem);
    })();
    return () => {
      live = false;
    };
  }, [ready, signal]);

  const roles: [string, EngineSource[]][] = [
    ['FIND BUSINESSES', sources.filter((s) => (s.role ?? 'discovery') === 'discovery')],
    ['LOOK CLOSER', sources.filter((s) => s.role === 'closer look')],
    ['ON REQUEST', sources.filter((s) => s.role === 'research')],
  ];

  return (
    <>
      <NeedsEngine state={engineState} />
      {ready && (
        <section className="sv-answer" aria-label="Installed sources">
          {roles
            .filter(([, list]) => list.length > 0)
            .map(([label, list]) => (
              <div key={label} className="sv-panel">
                <h2 className="t-mono t-mono-xs sv-take__title">{label}</h2>
                <ol className="sv-table-list">
                  {list.map((s) => {
                    const usable = (s.usable ?? !s.problem) && s.available;
                    return (
                      <li key={s.id}>
                        <p className="sv-entity">
                          <span className="sv-entity__name">{s.name}</span>
                          <span className={`t-mono t-mono-xs ${usable ? '' : 'sv-problem'}`}>
                            {' '}
                            · {usable ? 'READY' : `OFF — ${(s.problem ?? (s.available ? s.status : 'not answering lately') ?? '').toUpperCase()}`}
                          </span>
                        </p>
                        <p className="t-mono t-mono-xs t-dim">
                          {s.id}
                          {s.registry ? ` · REGISTRY ${s.registry}` : ''}
                          {s.licence ? ` · ${s.licence}` : ''} · {s.capabilities.join(', ')}
                        </p>
                        {s.coverage_note && <p className="t-body-s t-dim">{s.coverage_note}</p>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
        </section>
      )}

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}

      {summary && (
        <section className="sv-answer" aria-label="The tool registry">
          <h2 className="t-mono t-mono-xs sv-take__title">THE REGISTRY</h2>
          <p className="t-body-s sv-lead">
            {count(summary.tools)} tools reviewed to build the engine, {count(summary.reviewed_individually)} of them one by
            one; {summary.installed.length} are installed here.
          </p>
          <dl className="sv-facts">
            {Object.entries(summary.by_status).map(([status, n]) => (
              <div key={status}>
                <dt>{status.replace(/_/g, ' ')}</dt>
                <dd>
                  {count(n)} <span className="t-faint">· {STATUS_MEANING[status] ?? ''}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="t-body-s t-dim">
            Never integrated, whatever the tool: {summary.restricted.map((c) => c.toLowerCase().replace(/_/g, ' ')).join(', ')}.
          </p>

          <details className="sv-done">
            <summary className="t-mono t-mono-xs">WHO DOES WHAT · {summary.coverage.length} CAPABILITIES</summary>
            <dl className="sv-facts">
              {summary.coverage.map((c) => (
                <div key={c.capability}>
                  <dt>{c.capability.replace(/_/g, ' ')}</dt>
                  <dd>
                    {c.tools.map((t) => (
                      <span key={t.id} className="sv-fact">
                        {t.installed ? <span>● </span> : <span className="t-faint">○ </span>}
                        {t.name}
                        <span className="t-faint"> · {t.status.replace(/_/g, ' ').toLowerCase()}</span>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="t-mono t-mono-xs t-faint">● INSTALLED HERE · ○ NOT INSTALLED</p>
          </details>

          <Browser summary={summary} signal={signal} />
        </section>
      )}
    </>
  );
}

/* ---- the registry, searched ------------------------------------------------ */

function Browser({ summary, signal }: { summary: RegistrySummary; signal: AbortSignal }) {
  const [status, setStatus] = useState('');
  const [capability, setCapability] = useState('');
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ total: number; items: RegistryTool[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const read = useCallback(
    async (offset: number) => {
      setBusy(true);
      setProblem(null);
      const got = await engine.registryTools({ status, capability, q: text.trim(), offset, limit: PAGE }, signal);
      setBusy(false);
      if (!got.ok) {
        if (got.problem !== 'cancelled') setProblem(got.problem);
        return;
      }
      setFound((prev) => ({
        total: got.value.total,
        items: offset === 0 || !prev ? got.value.items : [...prev.items, ...got.value.items],
      }));
    },
    [capability, signal, status, text],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void read(0);
  };

  return (
    <div className="sv-panel">
      <h2 className="t-mono t-mono-xs sv-take__title">SEARCH THE REGISTRY</h2>
      <form className="sv-ask__row" onSubmit={submit} aria-label="Search the registry">
        <label className="t-mono t-mono-xs sv-field">
          DECISION
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ANY</option>
            {Object.keys(summary.by_status).map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="t-mono t-mono-xs sv-field">
          CAPABILITY
          <select value={capability} onChange={(e) => setCapability(e.target.value)}>
            <option value="">ANY</option>
            {summary.coverage.map((c) => (
              <option key={c.capability} value={c.capability}>
                {c.capability.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="t-mono t-mono-xs sv-field">
          WORDS
          <input className="sv-field__wide" type="text" value={text} placeholder="ANY" onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="sv-btn sv-btn--signal" disabled={busy}>
          {busy ? 'READING…' : 'SEARCH'}
        </button>
      </form>
      {problem && <p className="t-mono t-mono-xs sv-problem">{problem.toUpperCase()}</p>}
      {found && (
        <>
          <p className="t-mono t-mono-xs t-dim">{count(found.total)} TOOL(S)</p>
          <ol className="sv-table-list">
            {found.items.map((t) => (
              <li key={t.id}>
                <p className="sv-entity">
                  {t.installed && <span>● </span>}
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="sv-entity__name">
                    {t.name}
                  </a>
                  <span className="t-mono t-mono-xs t-dim"> · {t.status.replace(/_/g, ' ')}</span>
                </p>
                <p className="t-body-s">{t.reason}</p>
                <p className="t-mono t-mono-xs t-faint">
                  {t.capabilities.join(', ')}
                  {t.licence ? ` · ${t.licence}` : ''} · {t.pricing.toUpperCase()}
                  {t.api_key_required ? ' · KEY REQUIRED' : ''} · PRIVACY RISK {t.privacy_risk.toUpperCase()} · REVIEWED{' '}
                  {t.last_reviewed}
                </p>
              </li>
            ))}
          </ol>
          {found.items.length < found.total && (
            <button type="button" className="sv-btn" disabled={busy} onClick={() => void read(found.items.length)}>
              READ {PAGE} MORE
            </button>
          )}
        </>
      )}
    </div>
  );
}
