import type { ReactNode } from 'react';

import type { Finding } from './client.ts';
import { useService } from './state.ts';

/**
 * THE FEW SHAPES THIS SURFACE REPEATS.
 *
 * A notice, a finding, a citation, a limitations block. Everything else is
 * written where it is used, because four views do not justify a component
 * library and a component library is how a document becomes a dashboard.
 */

export function Notice({
  title,
  refused = false,
  children,
}: {
  title: string;
  refused?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={refused ? 'notice notice--refused' : 'notice'} role={refused ? 'alert' : 'note'}>
      <p className="notice__title">{title}</p>
      {children}
    </div>
  );
}

/**
 * What to say when there is no service.
 *
 * Five states, five different sentences, because they need five different
 * actions. The one thing this must not do is render an empty result set: a
 * surface that shows "0 businesses" when nothing answered is telling the reader
 * something false about the world rather than about itself.
 */
export function ServiceGate({ children }: { children: ReactNode }): React.JSX.Element {
  const { reach, refresh } = useService();

  if (reach.state === 'ONLINE') return <>{children}</>;

  if (reach.state === 'PROBING') {
    return (
      <Notice title="Asking">
        <p className="notice__body">{reach.detail}</p>
      </Notice>
    );
  }

  if (reach.state === 'UNCONFIGURED') {
    return (
      <Notice title="No key entered">
        <p className="notice__body">
          This surface reads a running audit service. The service holds a key that can fetch pages and spend money, so
          the key is never built into this page — enter it above and it stays in this tab only.
        </p>
      </Notice>
    );
  }

  return (
    <Notice title={reach.state === 'UNAUTHORISED' ? 'Key refused' : 'No service'} refused>
      <p className="notice__body">{reach.detail}</p>
      <p className="notice__body">
        Nothing is shown below, rather than an empty result. An empty list here would say something about the world; the
        truth is only that nothing answered.
      </p>
      <p className="notice__body">
        <button type="button" className="button button--quiet" onClick={refresh}>
          Try again
        </button>
      </p>
    </Notice>
  );
}

export function FindingItem({
  finding,
  citations,
}: {
  finding: Pick<Finding, 'statement' | 'status' | 'type' | 'reasoning' | 'rule' | 'limitations'>;
  citations?: Array<{ quote: string; url: string; retrieved_at?: string }>;
}): React.JSX.Element {
  return (
    <article className="finding">
      {/* The plain conclusion. No brackets, no hedging adverbs, no percentage. */}
      <p className="finding__statement">{finding.statement}</p>
      <p className="finding__meta">
        <span data-status={finding.status}>{finding.status}</span>
        <span>{finding.type}</span>
        <span>
          {finding.rule !== null && finding.rule !== '' ? `rule ${finding.rule}` : finding.reasoning.toLowerCase()}
        </span>
      </p>
      {finding.limitations !== '' && finding.limitations !== null ? (
        /* Part of the finding, not a disclaimer under it. */
        <p className="finding__limits">{finding.limitations}</p>
      ) : null}
      {(citations ?? []).map((c, i) => (
        <blockquote className="citation" key={`${c.url}-${i}`}>
          <p className="citation__quote">{c.quote}</p>
          <cite className="citation__source">
            {c.url}
            {c.retrieved_at !== undefined ? ` · read ${c.retrieved_at.slice(0, 10)}` : ''}
          </cite>
        </blockquote>
      ))}
    </article>
  );
}

export function Limitations({ lines }: { lines: string[] }): React.JSX.Element | null {
  if (lines.length === 0) return null;
  return (
    <section className="limits" aria-labelledby="limits-title">
      <h3 className="section__title" id="limits-title">
        What this cannot tell you
      </h3>
      <ul className="limits__list">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

/** A count that was measured, in the instrument's voice. */
export function Measure({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <span className="value">
      <span className="dim">{label} </span>
      {value}
    </span>
  );
}
