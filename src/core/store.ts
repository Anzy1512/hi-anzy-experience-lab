import { useSyncExternalStore } from 'react';

/**
 * A ~40 line external store.
 *
 * Why not a state library: the only genuinely shared state in Phase 1 is the
 * experience lifecycle and the X-Ray layer set. Both are small, both are read by
 * a handful of components, and the highest-frequency signal in the product (the
 * pointer) must never touch React at all. A dependency here would buy nothing.
 *
 * Contract: selectors passed to `useStoreValue` MUST return a primitive or a
 * referentially stable value. Returning a fresh object each call will loop.
 */
export interface Store<T> {
  get: () => T;
  set: (patch: Partial<T> | ((prev: T) => Partial<T>)) => void;
  /** Detached and passed straight to useSyncExternalStore — never bound. */
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  // Declared as arrow properties, not shorthand methods: `subscribe` is handed
  // straight to useSyncExternalStore, and an unbound shorthand method invites a
  // `this` mistake the moment anyone adds one. Nothing here uses `this`.
  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(next) as (keyof T)[]) {
        if (!Object.is(state[k], next[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...next };
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStoreValue<T extends object, S>(store: Store<T>, select: (s: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}
