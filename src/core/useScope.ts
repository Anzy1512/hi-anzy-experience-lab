import { useEffect } from 'react';
import { CleanupScope } from './cleanup';
import { useLatest } from './hooks';

/**
 * A CleanupScope tied to one effect run.
 *
 * This is the pattern components should use. React 19 StrictMode mounts, tears
 * down and re-mounts effects in development; a scope created per effect run is
 * disposed by that same run's cleanup, so nothing can register twice. The
 * mode-level scope handed down by the engine stays as the emergency net for
 * anything that must outlive an individual effect.
 *
 *   useScopedEffect((scope) => {
 *     scope.listen(window, 'resize', onResize);
 *     scope.frame(tick);
 *   }, [deps]);
 */
export function useScopedEffect(
  setup: (scope: CleanupScope) => void,
  deps: React.DependencyList,
  label = 'effect',
): void {
  const setupRef = useLatest(setup);

  useEffect(() => {
    const scope = new CleanupScope(label);
    try {
      setupRef.current(scope);
    } catch (err) {
      // A throwing setup must still leave a disposable scope behind.
      console.error(`[lab] scoped effect "${label}" threw during setup`, err);
      scope.dispose();
      throw err;
    }
    return () => scope.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
