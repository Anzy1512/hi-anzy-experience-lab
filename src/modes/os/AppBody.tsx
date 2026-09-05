import { APP_BODY, FUTURE_PROCESSES, type AppId } from '../../content/os';
import { MODES } from '../../content/lab';
import { STATUS_LABEL } from '../../experience/types';
import type { OsLine } from './commands';

/**
 * APPLICATION CONTENT.
 *
 * Every resident process shows the consultancy's own service language. Nothing
 * here reports a client, an award, a metric, a testimonial or a result — the
 * OS describes what the company *does*, never what it claims to have achieved.
 *
 * SYSTEM.app is the exception in kind: it reports values this session actually
 * measured, which is the only reason it is allowed to speak in mono.
 */

export function CapabilityBody({
  profile,
  webgl,
  viewport,
  sheets,
}: {
  profile: string;
  webgl: boolean;
  viewport: { w: number; h: number };
  sheets: number;
}) {
  const online = MODES.filter((m) => m.status === 'online');
  return (
    <div className="os-app">
      <p className="t-mono t-mono-xs t-faint os-app__note">
        MEASURED IN THIS SESSION. NOTHING BELOW IS STORED OR SENT.
      </p>
      <dl className="os-kv">
        <Row k="RENDER PROFILE" v={profile.toUpperCase()} />
        <Row k="WEBGL" v={webgl ? 'AVAILABLE' : 'UNAVAILABLE'} />
        <Row k="VIEWPORT" v={`${viewport.w} × ${viewport.h}`} />
        <Row k="SHEETS OPEN" v={String(sheets)} />
        <Row k="NETWORK" v="NONE" />
        <Row k="STORAGE" v="NONE" />
      </dl>

      <h4 className="os-app__h t-mono t-mono-xs">REALITIES</h4>
      <ul className="os-list">
        {MODES.map((m) => (
          <li key={m.id} data-on={m.status === 'online' ? 'true' : 'false'}>
            <span className="t-mono t-mono-xs os-list__n">{m.index}</span>
            <span className="t-mono t-mono-s os-list__name">{m.title}</span>
            <span className="t-mono t-mono-xs os-list__status">{STATUS_LABEL[m.status]}</span>
          </li>
        ))}
      </ul>
      <p className="t-body-s t-dim os-app__foot">
        {online.length === MODES.length
          ? `All ${MODES.length} realities are enterable from this shell.`
          : `${online.length} of ${MODES.length} realities are enterable. The rest are roadmap entries, not software — this OS will not pretend to launch them.`}
      </p>

      <h4 className="os-app__h t-mono t-mono-xs">NOT RUNNING</h4>
      <p className="t-body-s t-dim">
        {FUTURE_PROCESSES.join(' · ')} are named in the plan and are not built.
      </p>
    </div>
  );
}

export function ServiceBody({ id }: { id: Exclude<AppId, 'terminal' | 'system'> }) {
  const rows = APP_BODY[id];
  return (
    <div className="os-app">
      <ol className="os-groups">
        {rows.map(([k, v], i) => (
          <li key={k}>
            <span className="t-mono t-mono-xs os-groups__n">{String(i + 1).padStart(2, '0')}</span>
            <span className="t-mono t-mono-s os-groups__k">{k}</span>
            <span className="t-body-s os-groups__v">{v}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TerminalBody({ lines }: { lines: OsLine[] }) {
  return (
    <div className="os-term">
      {lines.length === 0 ? (
        <p className="t-mono t-mono-xs t-faint">
          NO OUTPUT YET. TYPE <span className="t-signal">help</span> BELOW.
        </p>
      ) : (
        lines.map((l) => (
          <p key={l.id} className="os-term__line t-mono t-mono-xs" data-kind={l.kind}>
            {l.kind === 'in' && <span className="os-term__caret">{'\u203a'} </span>}
            {l.text || '\u00a0'}
          </p>
        ))
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="os-kv__row">
      <dt className="t-mono t-mono-xs">{k}</dt>
      <dd className="t-mono t-mono-xs">{v}</dd>
    </div>
  );
}
