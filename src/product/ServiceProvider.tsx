import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { AuditClient, DEFAULT_BASE, type Reach } from './client.ts';
import { ServiceContext, type ServiceState } from './state.ts';

/**
 * THE ONE COMPONENT THAT KNOWS WHETHER THERE IS A SERVICE.
 *
 * It probes once on mount and again whenever the key or the address changes,
 * and it holds the answer as one of five named states. Nothing below it has to
 * decide what "no data" means: either the service answered and there is an
 * answer, or it did not and the reason is here.
 *
 * The probe is abortable, because a reader who pastes a key, sees it refused,
 * and pastes another should not have two requests racing to set the state.
 */
export function ServiceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [base, setBaseState] = useState(DEFAULT_BASE);
  const [key, setKeyState] = useState(() => AuditClient.rememberedKey());
  const [nonce, setNonce] = useState(0);
  /** The last probe, and which configuration it was a probe OF. */
  const [probe, setProbe] = useState<{ of: string; reach: Reach } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const client = useMemo(() => new AuditClient(base, key), [base, key]);
  const configuration = `${base}|${key}|${nonce}`;

  useEffect(() => {
    if (key === '') return undefined;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let live = true;

    void client.reach(controller.signal).then((r) => {
      if (live && !controller.signal.aborted) setProbe({ of: configuration, reach: r });
    });

    return () => {
      live = false;
      controller.abort();
    };
  }, [client, key, configuration]);

  const setKey = useCallback((next: string, remember: boolean) => {
    /* Stored before the state change so the next client carries it, and so a
       reader who ticked "remember" does not have to press anything else. */
    new AuditClient(DEFAULT_BASE, next).setKey(next, remember);
    setKeyState(next);
  }, []);

  /*
   * `reach` is derived during render rather than written by the effect.
   *
   * The obvious version sets PROBING at the top of the effect and the result in
   * its callback: two renders, a state write React has to chase, and a window
   * in which a stale answer from an address the reader has already changed can
   * appear and then be corrected. Deriving it means a probe whose configuration
   * no longer matches is simply never shown.
   *
   * It is derived INSIDE this memo because the placeholder states are fresh
   * objects each render, and computing them outside would make every render a
   * new context value and re-render every consumer.
   */
  const value: ServiceState = useMemo(() => {
    const reach: Reach =
      key === ''
        ? { state: 'UNCONFIGURED', detail: 'No key has been entered, so nothing has been asked of the service.' }
        : probe !== null && probe.of === configuration
          ? probe.reach
          : { state: 'PROBING', detail: `asking ${base}` };

    return {
      client,
      reach,
      refresh: () => setNonce((n) => n + 1),
      setKey,
      setBase: setBaseState,
    };
  }, [client, key, base, probe, configuration, setKey]);

  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}
