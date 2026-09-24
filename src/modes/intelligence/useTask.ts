import { useCallback, useRef, useState } from 'react';
import { engine, pause, type Answer, type Task } from './engine';
import { POLL_MS } from './link';

/**
 * A task the engine runs in the background — a store locator read, a domain
 * looked up, a dataset built — started from an event, then followed until it
 * finishes. Starting another retires the one before it; leaving the reality
 * aborts `signal`, which ends the wait between looks at once.
 */
export function useTask<R>(signal: AbortSignal) {
  const [task, setTask] = useState<Task<R> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const runId = useRef(0);

  const start = useCallback(
    async (begin: () => Promise<Answer<Task<R>>>) => {
      runId.current += 1;
      const run = runId.current;
      setProblem(null);
      setTask(null);
      const begun = await begin();
      if (run !== runId.current) return;
      if (!begun.ok) {
        if (begun.problem !== 'cancelled') setProblem(begun.problem);
        return;
      }
      let current = begun.value;
      setTask(current);
      while (current.status === 'queued' || current.status === 'running') {
        await pause(POLL_MS, signal);
        if (signal.aborted || run !== runId.current) return;
        const next = await engine.task<R>(current.id, signal);
        if (signal.aborted || run !== runId.current) return;
        if (!next.ok) {
          if (next.problem !== 'cancelled') setProblem(`the task could not be followed: ${next.problem}`);
          return;
        }
        current = next.value;
        setTask(current);
      }
    },
    [signal],
  );

  const running = task !== null && (task.status === 'queued' || task.status === 'running');
  return { task, problem, running, start };
}
