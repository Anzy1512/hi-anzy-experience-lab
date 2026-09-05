import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CleanupScope, emergencyReset, setScrollLock } from '../core/cleanup';
import { findMode } from '../content/lab';
import { isEnterable, type ModePhase } from './types';
import { markVisited } from './visited';
import { clearTransition, runTransition, transitionFor } from './transitions';
import { prefersReducedMotion } from '../core/capability';
import { ExperienceContext, type ExperienceValue, type Stage } from './context';

/**
 * THE EXPERIENCE ENGINE
 *
 * Three shell stages — launcher, index, mode — plus a mode lifecycle:
 *
 *   idle → loading → entering → active → exiting → idle
 *
 * Two rules make this safe to run forever:
 *
 *  1. Every mode gets a CleanupScope that the engine disposes on exit,
 *     whatever happened in between. A mode cannot leak past its own exit.
 *  2. Every transition has a watchdog. A mode that never reports ready, or
 *     throws while entering, is force-recovered rather than left mid-flight.
 */

const ENTER_WATCHDOG_MS = 6000;
const EXIT_DURATION_MS = 620;


/* -------------------------------------------------------------------------- */
/* location <-> stage                                                          */
/* -------------------------------------------------------------------------- */
/**
 * Hash routing rather than a router dependency. Three states do not justify a
 * routing library, and a hash keeps deep links working on any static host with
 * no rewrite rules — including `vite preview` and the Playwright runs.
 */
interface Loc {
  stage: Stage;
  modeId: string | null;
}

function readLocation(): Loc {
  const hash = window.location.hash;
  if (hash.startsWith('#/')) {
    const id = hash.slice(2);
    const mode = findMode(id);
    // A deep link to an unbuilt mode resolves to the index rather than an error.
    if (mode && isEnterable(mode)) return { stage: 'mode', modeId: id };
    return { stage: 'index', modeId: null };
  }
  if (hash === '#index') return { stage: 'index', modeId: null };
  return { stage: 'launcher', modeId: null };
}

function hashFor(stage: Stage, modeId: string | null): string {
  if (stage === 'mode' && modeId) return `#/${modeId}`;
  if (stage === 'index') return '#index';
  return '#';
}

/* -------------------------------------------------------------------------- */

export function ExperienceProvider({ children }: { children: ReactNode }) {
  // Computed once, via a lazy state initialiser rather than a ref, so nothing
  // reads mutable ref state during render.
  const [initial] = useState<Loc>(readLocation);
  const [stage, setStage] = useState<Stage>(() => initial.stage);
  const [activeId, setActiveId] = useState<string | null>(() => initial.modeId);
  const [phase, setPhase] = useState<ModePhase>(() => (initial.modeId ? 'loading' : 'idle'));
  const [error, setError] = useState<string | null>(null);

  /**
   * The mode's CleanupScope is mirrored in state as well as held in a ref.
   *
   * The ref is what disposal paths use, because they must work even mid-render.
   * The state copy is what the context publishes — without it a scope created
   * outside a render (notably the one for a deep link straight to `#/x-ray`)
   * never reaches ModeHost, the mode never mounts, and the engine watchdog
   * bounces a perfectly valid URL back to the index six seconds later.
   */
  const [scope, setScope] = useState<CleanupScope | null>(() =>
    initial.modeId ? new CleanupScope(`mode:${initial.modeId}`) : null,
  );
  const scopeRef = useRef<CleanupScope | null>(scope);
  const watchdogRef = useRef<number>(0);
  const exitTimerRef = useRef<number>(0);

  const activeMode = useMemo(() => findMode(activeId) ?? null, [activeId]);

  /* ---- scope lifecycle -------------------------------------------------- */
  const openScope = useCallback((id: string) => {
    scopeRef.current?.dispose();
    const next = new CleanupScope(`mode:${id}`);
    scopeRef.current = next;
    setScope(next);
    return next;
  }, []);

  const closeScope = useCallback(() => {
    scopeRef.current?.dispose();
    scopeRef.current = null;
    setScope(null);
  }, []);

  const clearTimers = useCallback(() => {
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    watchdogRef.current = 0;
    exitTimerRef.current = 0;
  }, []);

  /* ---- navigation ------------------------------------------------------- */
  const applyLocation = useCallback(
    (loc: Loc) => {
      clearTimers();
      setError(null);

      if (loc.stage === 'mode' && loc.modeId) {
        // The map remembers where this visitor has walked, for this session.
        markVisited(loc.modeId);
        closeScope();
        const next = openScope(loc.modeId);
        // Punctuation, chosen by destination. Registered on the new scope so
        // any exit removes it; nothing waits for it to finish.
        runTransition(transitionFor(loc.modeId), {
          scope: next,
          reduced: prefersReducedMotion(),
        });
        setActiveId(loc.modeId);
        setStage('mode');
        setPhase('loading');
        setScrollLock(true);
        return;
      }

      // Leaving mode territory in any way disposes the mode — and takes any
      // in-flight transition overlay with it.
      clearTransition();
      closeScope();
      setActiveId(null);
      setPhase('idle');
      setStage(loc.stage);
      setScrollLock(loc.stage === 'launcher');
    },
    [clearTimers, closeScope, openScope],
  );

  const navigate = useCallback(
    (next: Loc, replace = false) => {
      const url = hashFor(next.stage, next.modeId);
      if (replace) window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
      applyLocation(next);
    },
    [applyLocation],
  );

  useEffect(() => {
    const onPop = () => applyLocation(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [applyLocation]);

  /*
   * Launcher owns the viewport; nothing scrolls behind it.
   *
   * This effect deliberately does NOT dispose the mode scope on cleanup.
   *
   * It used to, and that was a real bug: React StrictMode mounts, tears down and
   * re-mounts effects, so the teardown disposed the scope created for a deep
   * link — while the `scope` *state* still held the now-dead object. ModeHost
   * then handed a disposed scope to the mode, and because `CleanupScope.add()`
   * runs a teardown immediately on a disposed scope, every subscription the mode
   * registered was cancelled the instant it was made. Reality Compiler's whole
   * animation loop unsubscribed itself on creation, silently.
   *
   * Scope lifetime belongs to openScope/closeScope, which are driven by
   * navigation. This provider wraps the entire application and is never unmounted
   * in practice, so there is nothing here for an unmount teardown to reclaim.
   */
  useEffect(() => {
    if (initial.stage !== 'index') setScrollLock(true);
    return () => setScrollLock(false);
  }, [initial.stage]);

  /* ---- material: the single place <html> changes state ------------------ */
  useEffect(() => {
    const root = document.documentElement;
    let material: string;
    if (stage === 'launcher') material = 'paper';
    else if (stage === 'mode' && activeMode && phase !== 'exiting') material = activeMode.material;
    else material = 'ink';
    root.setAttribute('data-material', material);
    root.setAttribute('data-stage', stage);
  }, [stage, activeMode, phase]);

  /* ---- watchdog: no transition may hang -------------------------------- */
  useEffect(() => {
    if (phase !== 'loading' && phase !== 'entering') return;
    watchdogRef.current = window.setTimeout(() => {
      console.warn('[lab] mode did not report ready in time — recovering');
      emergencyReset('enter watchdog');
      closeScope();
      setError('This reality failed to start. Returned to the index.');
      setPhase('error');
      window.history.replaceState(null, '', '#index');
      setActiveId(null);
      setStage('index');
      setScrollLock(false);
    }, ENTER_WATCHDOG_MS);
    return () => {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = 0;
    };
  }, [phase, closeScope]);

  /* ---- public api ------------------------------------------------------- */
  const enterLab = useCallback(() => navigate({ stage: 'index', modeId: null }), [navigate]);

  const returnToLauncher = useCallback(
    () => navigate({ stage: 'launcher', modeId: null }),
    [navigate],
  );

  const enterMode = useCallback(
    (id: string) => {
      const mode = findMode(id);
      if (!mode || !isEnterable(mode)) return; // unbuilt modes are simply inert
      navigate({ stage: 'mode', modeId: id });
    },
    [navigate],
  );

  const exitMode = useCallback(() => {
    if (stage !== 'mode') return;
    // Let the mode play its leave beat, then tear down unconditionally.
    setPhase('exiting');
    clearTimers();
    exitTimerRef.current = window.setTimeout(() => {
      closeScope();
      setActiveId(null);
      setPhase('idle');
      setStage('index');
      setScrollLock(false);
      window.history.pushState(null, '', '#index');
    }, EXIT_DURATION_MS);
  }, [stage, clearTimers, closeScope]);

  const reportReady = useCallback(() => {
    setPhase((p) => (p === 'loading' || p === 'entering' ? 'active' : p));
  }, []);

  const reportError = useCallback(
    (message: string) => {
      console.error('[lab] mode error:', message);
      emergencyReset('mode reported error');
      closeScope();
      setError(message);
      setPhase('error');
      setActiveId(null);
      setStage('index');
      setScrollLock(false);
      window.history.replaceState(null, '', '#index');
    },
    [closeScope],
  );

  const value = useMemo<ExperienceValue>(
    () => ({
      stage,
      phase,
      activeMode,
      scope,
      error,
      enterLab,
      returnToLauncher,
      enterMode,
      exitMode,
      reportReady,
      reportError,
    }),
    [
      stage,
      phase,
      activeMode,
      scope,
      error,
      enterLab,
      returnToLauncher,
      enterMode,
      exitMode,
      reportReady,
      reportError,
    ],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}
