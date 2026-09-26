import { useEffect, useState, type FormEvent } from 'react';
import { engine, type SiteReading, type SiteSignals } from '../engine';
import { NeedsEngine } from '../EngineLine';
import { domainOf, isReady, type DeskProps } from '../link';

/**
 * I5 · SITES — WHAT ONE WEBSITE IS BUILT AND MARKETED WITH.
 *
 * One site's home page, read once by the engine under the same rules as a
 * search (the host guard, robots.txt, pacing, today's cache): what it is built
 * on, the marketing and analytics accounts it reports to, how it takes
 * payment, the contacts and profiles it states. What the page does not show is
 * not said to be absent — only one page is read.
 */

export default function SitesDesk({ engineState, signal, go, receive, take }: DeskProps) {
  const [url, setUrl] = useState(() => take('sites')?.url ?? '');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<SiteReading | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = isReady(engineState);

  useEffect(
    () =>
      receive('sites', (h) => {
        if (h.url) setUrl(h.url);
      }),
    [receive],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = url.trim();
    if (!ready || address.length < 4) return;
    setBusy(true);
    setProblem(null);
    const got = await engine.site(address, signal);
    setBusy(false);
    if (got.ok) setReading(got.value);
    else if (got.problem !== 'cancelled') setProblem(got.problem);
  };

  const p = reading?.profile ?? null;
  const domain = p ? domainOf(p.final_url || p.url) : null;
  return (
    <>
      <NeedsEngine state={engineState} />
      <form className="sv-ask" onSubmit={(e) => void submit(e)} aria-label="Read a website">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-site">
          WEBSITE
        </label>
        <input
          id="sv-site"
          className="sv-question"
          type="text"
          value={url}
          maxLength={2000}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://www.example.com"
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="sv-ask__row">
          <button type="submit" className="sv-btn sv-btn--signal" disabled={!ready || url.trim().length < 4 || busy}>
            {busy ? 'READING…' : 'READ THE SITE'}
          </button>
        </div>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}

      {reading?.failure && (
        <p className="t-mono t-mono-xs sv-problem" role="status">
          NOT READ · {reading.failure.kind.toUpperCase()} · {reading.failure.detail}
          {reading.failure.status ? ` · HTTP ${reading.failure.status}` : ''}
        </p>
      )}

      {p && (
        <section className="sv-answer" aria-label="What the site shows">
          <h2 className="t-display-s sv-block__name">{p.title || p.final_url}</h2>
          {p.description && <p className="t-body-s">{p.description}</p>}
          <p className="t-mono t-mono-xs t-dim">
            <a href={p.final_url} target="_blank" rel="noopener noreferrer">
              {p.final_url}
            </a>{' '}
            · HTTP {p.status}
            {p.from_cache ? ' · READ EARLIER TODAY' : ''}
          </p>
          {p.parked.length > 0 && (
            <p className="t-mono t-mono-xs sv-problem">A PARKED DOMAIN · {p.parked.join(' · ').toUpperCase()}</p>
          )}
          <dl className="sv-facts">
            <List label="SHOP PLATFORM" items={p.platforms} />
            {p.technologies.length > 0 && (
              <div>
                <dt>BUILT WITH</dt>
                <dd>
                  {p.technologies.map((t) => (
                    <span key={t.slug} className="sv-fact">
                      {t.name}
                      <span className="t-faint">
                        {' '}
                        · {t.categories.join(', ')}
                        {t.confidence < 100 ? ` · ${t.confidence}%` : ''}
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {p.trackers.length > 0 && (
              <div>
                <dt>REPORTS TO</dt>
                <dd>
                  {p.trackers.map((t) => (
                    <span key={`${t.id}:${t.value}`} className="sv-fact">
                      {t.name} <span className="t-mono t-mono-xs">{t.value}</span>
                      <span className="t-faint"> · {t.kind}</span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <List label="PAYMENTS" items={p.payments} />
            <List label="CART" items={p.cart_signals} />
            {p.product_offers > 0 && (
              <div>
                <dt>PRODUCTS MARKED UP</dt>
                <dd>
                  {p.product_offers}
                  {p.product_names.length > 0 && <span className="t-faint"> · {p.product_names.slice(0, 8).join(' · ')}</span>}
                </dd>
              </div>
            )}
            <List label="PHONES" items={p.phones} />
            <List label="E-MAILS" items={p.emails} />
            {p.profiles.length > 0 && (
              <div>
                <dt>PROFILES</dt>
                <dd>
                  {p.profiles.map((x) => (
                    <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer">
                      {x.network}: {x.url}
                    </a>
                  ))}
                </dd>
              </div>
            )}
            {p.listings.length > 0 && (
              <div>
                <dt>LISTED ON</dt>
                <dd>
                  {p.listings.map((x) => (
                    <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer">
                      {x.platform}: {x.url}
                    </a>
                  ))}
                </dd>
              </div>
            )}
            {p.amenities.length > 0 && (
              <div>
                <dt>STATES IT OFFERS</dt>
                <dd>
                  {p.amenities.map((a) => (
                    <span key={`${a.field}:${String(a.value)}`} className="sv-fact">
                      {a.field.replace(/^attr\./, '').replace(/_/g, ' ')}: {a.value === true ? 'yes' : a.value === false ? 'no' : String(a.value)}
                      <span className="t-faint"> · {a.read_from}</span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {p.signals && <Signals s={p.signals} />}
          <p className="t-body-s t-dim">Only this page was read. Something it does not show is not said to be absent.</p>
          {domain && (
            <p className="sv-actions">
              <button type="button" className="sv-btn" onClick={() => go('domains', { domain })}>
                LOOK UP {domain.toUpperCase()}
              </button>
            </p>
          )}
        </section>
      )}
    </>
  );
}

/**
 * FOUND AND READ — what the page shows about being found by a search engine and read by a
 * visitor (the engine's D-069). Measured values in the instrument's voice; the engine's own
 * observations under them. They describe the page. None of them is a verdict on the business.
 */
function Signals({ s }: { s: SiteSignals }) {
  const yes = (v: boolean | null) => (v === null ? '—' : v ? 'YES' : 'NO');
  const facts: [string, string][] = [
    ['HTTPS', s.https ? 'YES' : 'NO'],
    ['REDIRECTS', String(s.redirects.length)],
    ['CANONICAL', s.canonical ? (s.canonical_is_self ? 'THIS PAGE' : 'ANOTHER PAGE') : 'NONE'],
    ['INDEXABLE', s.noindex ? 'ASKS NOT TO BE' : 'NOT REFUSED'],
    ['TITLE', `${s.title_chars} CHARS`],
    ['DESCRIPTION', `${s.description_chars} CHARS`],
    ['H1', String(s.h1_count)],
    ['LANGUAGE', s.lang ? s.lang.toUpperCase() : 'NONE'],
    ['VIEWPORT', yes(s.viewport)],
    ['STRUCTURED DATA', s.structured_data_types.length > 0 ? s.structured_data_types.join(', ') : 'NONE'],
    ['ROBOTS.TXT', s.robots_txt.toUpperCase()],
    [
      'SITEMAP',
      s.sitemap === 'reachable'
        ? `REACHABLE${s.sitemap_entries !== null ? ` · ${s.sitemap_entries} ENTRIES` : ''}`
        : (s.sitemap ?? 'NOT CHECKED').toUpperCase().replace('_', ' '),
    ],
    ['PAGE WEIGHT', `${(s.html_bytes / 1024).toFixed(0)} KB`],
    ...(s.response_ms !== null ? ([['ANSWERED IN', `${(s.response_ms / 1000).toFixed(2)} S`]] as [string, string][]) : []),
  ];
  return (
    <section className="sv-signals" aria-label="Found and read">
      <h3 className="t-mono t-mono-xs sv-label">FOUND AND READ</h3>
      <dl className="sv-signals__grid">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="t-mono t-mono-xs">{v}</dd>
          </div>
        ))}
      </dl>
      {s.observations.length > 0 && (
        <ul className="sv-signals__notes t-body-s">
          {s.observations.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{items.join(' · ')}</dd>
    </div>
  );
}
