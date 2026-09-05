import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { readCapability, type Capability } from './capability';

/** Subscribe to a media query without re-creating the MediaQueryList each render. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/**
 * Capability is re-read on resize and on reduced-motion change, because both
 * genuinely alter the right answer. It is not polled.
 */
export function useCapability(): Capability {
  const [cap, setCap] = useState<Capability>(() => readCapability());

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCap(readCapability()));
    };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', refresh, { passive: true });
    motion.addEventListener('change', refresh);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', refresh);
      motion.removeEventListener('change', refresh);
    };
  }, []);

  return cap;
}

/**
 * Keeps a mutable ref pointing at the latest value.
 *
 * The usual shorthand for this is `ref.current = value` in the render body, but
 * that mutates during render — unsafe once a render can be thrown away and
 * re-run, which React's concurrent renderer is free to do. Assigning in a layout
 * effect happens after the render commits and still before paint, so any handler
 * fired from an event, timer or animation frame sees the current value.
 */
export function useLatest<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Escape, wired once, with an always-current handler. */
export function useEscape(enabled: boolean, handler: () => void): void {
  const ref = useLatest(handler);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, ref]);
}

/** Traps Tab inside a container while a mode owns the viewport. */
export function useFocusTrap(enabled: boolean, containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!enabled) return;
    const node = containerRef.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const selector =
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      // Return focus where the user left it — the thing most overlays forget.
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [enabled, containerRef]);
}
