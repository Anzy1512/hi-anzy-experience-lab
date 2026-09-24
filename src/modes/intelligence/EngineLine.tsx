import { ENGINE_BASE } from './engine';
import type { EngineState } from './link';

/** Whether the engine is there, as the reality last found it — and how to start it when not. */
export function EngineLine({ state, onRetry }: { state: EngineState; onRetry: () => void }) {
  if (state.kind === 'checking') {
    return <p className="t-mono t-mono-xs sv-engine">ENGINE · LOOKING AT {ENGINE_BASE}</p>;
  }
  if (state.kind === 'unreachable') {
    return (
      <div className="sv-engine sv-engine--off" role="status">
        <p className="t-mono t-mono-xs">
          ENGINE · NOT REACHABLE AT {ENGINE_BASE} · {state.problem.toUpperCase()}
        </p>
        <p className="t-body-s">Start it on this machine, in the commercial-intelligence folder, and look again:</p>
        <pre className="t-mono t-mono-xs sv-code">uv run comintel serve</pre>
        <button type="button" className="sv-btn" onClick={onRetry}>
          LOOK AGAIN
        </button>
      </div>
    );
  }
  const ready = state.sources.filter((s) => (s.usable ?? !s.problem) && s.available).length;
  return (
    <p className="t-mono t-mono-xs sv-engine">
      <span className="t-signal">ENGINE</span> · V{state.health.version} · LOCAL KNOWLEDGE{' '}
      {state.health.local_knowledge ? 'ON' : 'OFF'} · SOURCES READY {ready} OF {state.sources.length}
    </p>
  );
}

/** A desk's own "not until the engine answers" line, for desks that need it. */
export function NeedsEngine({ state }: { state: EngineState }) {
  if (state.kind === 'ready') return null;
  return (
    <p className="t-mono t-mono-xs t-faint sv-needs">
      {state.kind === 'checking' ? 'WAITING FOR THE ENGINE TO ANSWER' : 'NOTHING TO SHOW UNTIL THE ENGINE IS RUNNING'}
    </p>
  );
}
