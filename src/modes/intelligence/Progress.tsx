import type { Task } from './engine';

/** A task as it goes: its state, then every step the engine has said it took. */
export function Progress<R>({ task }: { task: Task<R> }) {
  const running = task.status === 'queued' || task.status === 'running';
  return (
    <section className="sv-run" aria-live="polite" aria-label="Progress">
      <p className="t-mono t-mono-xs sv-run__line">
        <span className={running ? 't-signal' : undefined}>{task.status.toUpperCase()}</span>
        <span className="t-faint"> · </span>
        <span>{task.title}</span>
        {task.status === 'failed' && task.error && (
          <>
            <span className="t-faint"> · </span>
            <span className="sv-problem">{task.error}</span>
          </>
        )}
      </p>
      {task.progress.length > 0 && (
        <ol className="t-mono t-mono-xs t-dim sv-steps">
          {task.progress.slice(-8).map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
