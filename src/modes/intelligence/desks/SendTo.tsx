import { useEffect, useState } from 'react';
import { engine, type PushOutcome, type PushTarget } from '../engine';
import { useTask } from '../useTask';

/**
 * SEND TO — where a survey's matched businesses can go next.
 *
 * The engine names its targets and says, of each, whether it is configured
 * (D-070: Mautic, companies only, one way, disabled until the engine is given
 * an address and credentials). This desk asks once, prints what the engine
 * said in the instrument's voice, and offers the two actions the engine has:
 * a preview, which changes nothing anywhere, and the send. Nothing is invented
 * here — a target without credentials is shown as exactly that, and the
 * outcome printed afterwards is the engine's own count of what it created,
 * updated, left alone, skipped and failed.
 */
export default function SendTo({ searchId, signal }: { searchId: string; signal: AbortSignal }) {
  const [targets, setTargets] = useState<PushTarget[] | null>(null);
  const { task, problem, running, start } = useTask<PushOutcome>(signal);

  useEffect(() => {
    let live = true;
    void engine.pushTargets(signal).then((got) => {
      if (live && got.ok) setTargets(got.value);
    });
    return () => {
      live = false;
    };
  }, [signal]);

  if (!targets || targets.length === 0) return null;
  const outcome = task?.status === 'done' ? (task.result ?? null) : null;

  return (
    <section className="sv-sendto" aria-label="Send the answer on">
      <h3 className="t-mono t-mono-xs">SEND TO</h3>
      {targets.map((t) => (
        <div key={t.id} className="sv-sendto__target">
          <p className="t-mono t-mono-xs sv-run__line">
            <span>{t.name.toUpperCase()}</span>
            <span className="t-faint"> · </span>
            <span>{t.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</span>
            <span className="t-faint"> · </span>
            <span className="t-faint">{t.detail.toUpperCase()}</span>
          </p>
          {t.configured ? (
            <p className="sv-actions sv-actions--tight">
              <button
                type="button"
                className="sv-btn"
                disabled={running}
                onClick={() =>
                  void start(() => engine.push(searchId, { target: t.id, verdict: 'matched', dry_run: true }, signal))
                }
              >
                PREVIEW
              </button>
              <button
                type="button"
                className="sv-btn"
                disabled={running}
                onClick={() => void start(() => engine.push(searchId, { target: t.id, verdict: 'matched' }, signal))}
              >
                SEND THE MATCHED
              </button>
            </p>
          ) : (
            <p className="t-mono t-mono-xs t-faint sv-hint">SET {t.set_by.join(', ').toUpperCase()} ON THE ENGINE TO ENABLE IT</p>
          )}
        </div>
      ))}
      {running && task && (
        <p className="t-mono t-mono-xs sv-hint">
          {task.status.toUpperCase()}
          {task.progress.length > 0 ? ` · ${task.progress[task.progress.length - 1]}` : ''}
        </p>
      )}
      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}
      {task?.status === 'failed' && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {(task.error ?? 'the push failed').toUpperCase()}
        </p>
      )}
      {outcome && (
        <dl className="sv-counts sv-counts--push">
          <div>
            <dt>{outcome.dry_run ? 'PREVIEWED' : 'CONSIDERED'}</dt>
            <dd>{outcome.considered}</dd>
          </div>
          <div>
            <dt>CREATED</dt>
            <dd>{outcome.created}</dd>
          </div>
          <div>
            <dt>UPDATED</dt>
            <dd>{outcome.updated}</dd>
          </div>
          <div>
            <dt>UNCHANGED</dt>
            <dd>{outcome.unchanged}</dd>
          </div>
          <div>
            <dt>ALREADY THERE</dt>
            <dd>{outcome.matched_existing}</dd>
          </div>
          <div>
            <dt>SKIPPED</dt>
            <dd>{outcome.skipped.length}</dd>
          </div>
          <div>
            <dt>FAILED</dt>
            <dd>{outcome.failed.length}</dd>
          </div>
        </dl>
      )}
      {outcome && outcome.previews.length > 0 && (
        <ul className="sv-evidence">
          {outcome.previews.slice(0, 12).map((p) => (
            <li key={p.entity_id} className="t-mono t-mono-xs">
              {p.action.toUpperCase()} · {p.fields.companyname ?? p.entity_id}
              {p.fields.companycity ? ` · ${p.fields.companycity}` : ''}
            </li>
          ))}
          {outcome.previews.length > 12 && (
            <li className="t-mono t-mono-xs t-faint">AND {outcome.previews.length - 12} MORE</li>
          )}
        </ul>
      )}
      {outcome && outcome.failed.length > 0 && (
        <ul className="sv-evidence">
          {outcome.failed.slice(0, 6).map((f) => (
            <li key={f.entity_id} className="t-mono t-mono-xs sv-problem">
              {f.entity_id} · {f.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
