import { Suspense, lazy, useEffect, useRef, type ComponentType } from 'react';
import { useExperience } from '../experience/context';
import { MODES } from '../content/lab';
import type { ModeDefinition, ModeViewProps } from '../experience/types';
import { useEscape, useFocusTrap } from '../core/hooks';
import { setPointerIntent } from '../core/pointer';
import { XRAY_COPY } from '../content/brand';
import { edgesFrom } from '../content/graph';
import './modehost.css';

/**
 * MODE HOST — the frame every reality is entered through.
 *
 * Owns the three things a mode must never be trusted to own itself:
 * the code-split boundary, the way out (Escape + a visible control), and the
 * focus contract. A mode that crashes on load still leaves a usable exit.
 */

/**
 * Lazy wrappers are built once, at module scope.
 *
 * `lazy()` only stores the loader — it does not fetch anything — so creating the
 * whole map eagerly is free, and it keeps component creation out of render where
 * a re-render could otherwise mint a brand-new component type and remount the
 * mode underneath itself.
 */
let reportLoadFailure: (message: string) => void = () => {};

function wrapMode(mode: ModeDefinition): ComponentType<ModeViewProps> {
  const loader = mode.load!;
  return lazy(() =>
    loader().catch((err: unknown) => {
      console.error('[lab] mode chunk failed to load', err);
      // Recover immediately rather than letting Suspense hang until the
      // engine's watchdog notices six seconds later.
      reportLoadFailure('This reality could not be loaded. Returned to the index.');
      return { default: (() => null) as ComponentType<ModeViewProps> };
    }),
  );
}

/* A plain record, so looking a mode up is a property access rather than a call —
   which is also what makes it obvious that nothing is constructed per render. */
const LAZY_MODES: Record<string, ComponentType<ModeViewProps> | undefined> =
  Object.fromEntries(
    MODES.filter((m) => typeof m.load === 'function').map((m) => [m.id, wrapMode(m)]),
  );

function ModeFallback({ title }: { title: string }) {
  return (
    <div className="modehost__loading" role="status" aria-live="polite">
      <p className="t-mono t-mono-s">
        <span className="t-dim">LOADING </span>
        <span className="t-signal">{title}</span>
      </p>
      {/* A measured rule, not a spinner: the sheet reporting progress. */}
      <span className="modehost__loading-rule" />
    </div>
  );
}

/**
 * The two onward moves a reality earns, if it has any.
 *
 * Deliberately not a "next mode" button: each edge states why the move is worth
 * making, and a reality with no honest onward relationship shows nothing.
 */
function OnwardMoves({ fromId, phase }: { fromId: string; phase: string }) {
  const { enterMode } = useExperience();
  const edges = edgesFrom(fromId);
  if (edges.length === 0 || phase !== 'active') return null;
  return (
    <nav className="modehost__onward" aria-label="Related realities">
      {edges.map((e) => (
        <button
          key={e.to}
          type="button"
          className="modehost__onward-btn t-mono t-mono-xs"
          onClick={() => enterMode(e.to)}
          onPointerEnter={() => setPointerIntent('enter')}
          onPointerLeave={() => setPointerIntent('scan')}
        >
          <span className="modehost__onward-why">{e.because}</span>
          <span className="modehost__onward-to">
            {findModeTitle(e.to)}
            <span aria-hidden="true"> →</span>
          </span>
        </button>
      ))}
    </nav>
  );
}

function findModeTitle(id: string): string {
  return MODES.find((m) => m.id === id)?.title ?? id.toUpperCase();
}

export function ModeHost() {
  const { activeMode, phase, exitMode, reportReady, reportError, scope } = useExperience();
  const containerRef = useRef<HTMLDivElement>(null);

  // The engine's failure reporter, published to the module-level loaders above.
  // Assigned in an effect rather than during render.
  useEffect(() => {
    reportLoadFailure = reportError;
  }, [reportError]);

  const LazyMode = activeMode ? (LAZY_MODES[activeMode.id] ?? null) : null;

  useEscape(true, exitMode);
  useFocusTrap(phase === 'active', containerRef);

  /**
   * Move focus into the dialog on entry, as a modal must — but onto the dialog
   * itself, not onto the exit control. Focusing the button satisfied the same
   * requirement while lighting it up on every single entry, so the mode always
   * opened with a red control the visitor had not touched. From here, the first
   * Tab still lands on EXIT.
   */
  useEffect(() => {
    if (phase !== 'active') return;
    containerRef.current?.focus({ preventScroll: true });
  }, [phase]);

  if (!activeMode || !LazyMode || !scope) return null;

  return (
    <div
      className="modehost"
      ref={containerRef}
      data-phase={phase}
      data-mode={activeMode.id}
      role="dialog"
      aria-modal="true"
      aria-label={`${activeMode.title} — ${activeMode.tagline}`}
      id="lab-main"
      tabIndex={-1}
    >
      <div className="modehost__chrome">
        <p className="modehost__id t-mono t-mono-xs">
          <span className="t-signal">{activeMode.index}</span>
          <span className="t-faint"> / </span>
          <span>{activeMode.title}</span>
        </p>

        <button
          type="button"
          className="modehost__exit t-mono t-mono-xs"
          onClick={exitMode}
          /* Pointer intent follows the pointer only. Driving it from focus left
             the instrument stuck reading EXIT after the mode moved focus here
             on entry, with the pointer nowhere near this control. */
          onPointerEnter={() => setPointerIntent('exit')}
          onPointerLeave={() => setPointerIntent('scan')}
        >
          {XRAY_COPY.exit}
          <span className="modehost__esc t-faint" aria-hidden="true">
            ESC
          </span>
        </button>
      </div>

      <Suspense fallback={<ModeFallback title={activeMode.title} />}>
        <LazyMode onReady={reportReady} onExit={exitMode} scope={scope} />
      </Suspense>

      {/* Where this reality leads. Offered in the chrome rather than inside the
          mode, so no reality has to be redesigned to carry it and none of them
          can trap you: the index and Escape are always still there. */}
      <OnwardMoves fromId={activeMode.id} phase={phase} />
    </div>
  );
}
