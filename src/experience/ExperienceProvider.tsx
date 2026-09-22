import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CleanupScope, emergencyReset, setScrollLock } from '../core/cleanup';
import { findMode } from '../content/lab';
import { isEnterable, type ModePhase } from './types';
import { markReturningFrom, markVisited } from './visited';
import { arrivedAt } from './journey';
import { emit } from '../analytics/events';
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

  /**
   * The active mode id, mirrored in a ref.
   *
   * `applyLocation` needs to know which reality it is leaving, and it must not
   * take `activeId` as a dependency: the callback is what drives navigation, so
   * rebuilding it on every mode change would make the effect that owns it fire
   * against a location it has already applied. The ref is written on the two
   * lines that also call `setActiveId`, so the two cannot drift.
   */
  const activeIdRef = useRef<string | null>(initial.modeId);

  /**
   * The phase, mirrored, for the one caller that must read it without taking it
   * as a dependency.
   *
   * `applyLocation` is what drives navigation, so depending on `phase` would
   * rebuild it on every step of every transition and fire the effect that owns
   * it against a location it has already applied — the same reason `activeId`
   * is mirrored above. An effect keeps this in step; `applyLocation` only ever
   * runs from an event or a popstate, never inside the commit that changed the
   * phase, so it never reads a stale value.
   */
  const phaseRef = useRef<ModePhase>(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* ---- navigation ------------------------------------------------------- */
  const applyLocation = useCallback(
    (loc: Loc) => {
      /**
       * ALREADY STANDING HERE.
       *
       * Arriving at the reality that is already open is not an entry. It used
       * to be treated as one, and the result was a mode that could never
       * finish starting: the teardown below disposed the scope and set the
       * phase back to `loading`, but React kept the SAME lazy component
       * mounted — same id, same element type — so its boot effect never ran
       * again and `onReady()` was never called a second time. The phase then
       * sat at `loading` until the watchdog gave up and returned the visitor
       * to the index, six seconds after they asked to go somewhere they
       * already were.
       *
       * Worse than the bounce: the still-mounted mode was left holding a
       * disposed scope, and `CleanupScope.add()` runs a teardown immediately
       * on a disposed scope — so every listener, timer and frame callback the
       * mode registered from that moment on was cancelled as it was made.
       *
       * Reachable without a test harness: an onward move, a WorkStrip button
       * or a SYSTEM.app door that points at the current reality, a pasted deep
       * link to it, or Back landing on the same id.
       *
       * `exiting` and `idle` are excluded deliberately — a visitor who changes
       * their mind mid-exit is asking for a real re-entry, and gets one. The
       * watchdog is untouched: if this is a genuine entry it is armed below,
       * and if it is not, the one already armed stays armed.
       */
      if (
        loc.stage === 'mode' &&
        loc.modeId &&
        loc.modeId === activeIdRef.current &&
        phaseRef.current !== 'exiting' &&
        phaseRef.current !== 'idle'
      ) {
        return;
      }

      clearTimers();
      setError(null);

      if (loc.stage === 'mode' && loc.modeId) {
        // The map remembers where this visitor has walked, for this session.
        markVisited(loc.modeId);
        /*
         * And the path, if they are on one, notes whether this was its next
         * stop. Both live here rather than in the mode host because this is the
         * one function every arrival passes through — a deep link, a Back
         * button and a click on an onward move all land on this line, and an
         * arrival recorded in only two of those three is worse than none.
         */
        arrivedAt(loc.modeId);
        emit('reality_enter', { reality: loc.modeId });
        closeScope();
        const next = openScope(loc.modeId);
        // Punctuation, chosen by destination. Registered on the new scope so
        // any exit removes it; nothing waits for it to finish.
        runTransition(transitionFor(loc.modeId), {
          scope: next,
          reduced: prefersReducedMotion(),
        });
        activeIdRef.current = loc.modeId;
        setActiveId(loc.modeId);
        setStage('mode');
        setPhase('loading');
        setScrollLock(true);
        return;
      }

      // Leaving mode territory in any way disposes the mode — and takes any
      // in-flight transition overlay with it. The id is handed to the index so
      // the keyboard lands back on the row it left from rather than on <body>.
      markReturningFrom(activeIdRef.current);
      activeIdRef.current = null;
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
      /* Asking to go where you already are must not leave a second identical
         entry in the history. It would make the Back button look broken: the
         first press would pop to the same place and, correctly, do nothing. */
      const samePlace = !replace && window.location.hash === url;
      if (replace) window.history.replaceState(null, '', url);
      else if (!samePlace) window.history.pushState(null, '', url);
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
    emit('reality_exit', { reality: activeIdRef.current ?? undefined });
    // Let the mode play its leave beat, then tear down unconditionally.
    setPhase('exiting');
    clearTimers();
    exitTimerRef.current = window.setTimeout(() => {
      /*
       * This is the second way out of a reality — Escape and the EXIT control
       * both land here rather than in `applyLocation`, because the exit beat has
       * to play before the teardown. A second teardown route must not be a
       * quieter one: the index needs the same handover it gets from the first,
       * or a keyboard visitor who presses Escape is returned to a sixteen-row
       * list with focus on <body>, which is exactly what happened.
       *
       * (The in-flight transition needs no explicit clear: it is registered on
       * the mode scope, so `closeScope()` cancels it and removes the overlay.)
       */
      markReturningFrom(activeIdRef.current);
      activeIdRef.current = null;
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
