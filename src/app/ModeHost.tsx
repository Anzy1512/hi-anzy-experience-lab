import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { useExperience } from '../experience/context';
import { MODES } from '../content/lab';
import type { ModeDefinition, ModeViewProps } from '../experience/types';
import { useEscape, useFocusTrap } from '../core/hooks';
import { setPointerIntent } from '../core/pointer';
import { XRAY_COPY } from '../content/brand';
import { WorkStrip } from '../components/Work/WorkStrip';
import { Orientation, OrientationToggle } from '../components/Orientation/Orientation';
import { useActiveWork } from '../system/work';
import { edgesFrom } from '../content/graph';
import { PATH, indexOfStop, reasonInto } from '../content/journey';
import { journeyState, subscribeJourney } from '../experience/journey';
import { emit } from '../analytics/events';
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
  const journey = useSyncExternalStore(subscribeJourney, journeyState);
  /*
   * A visitor's own piece of work outranks both the curated route and the
   * relation graph.
   *
   * Not for room — the work strip lives in the chrome band now and this corner
   * is free. For the same reason the route already silences the graph below: a
   * visitor part-way through turning a problem into a system, offered "MATTER
   * ENGINE — the same field, without the argument", is being invited to
   * abandon something they chose. The suggestion is not wrong; it is just not
   * what they asked for, and the index is still one keystroke away.
   */
  const work = useActiveWork();

  /*
   * On the path, the route speaks instead of the graph.
   *
   * A visitor walking a curated sequence and a visitor browsing the graph want
   * different things from this corner: the first wants the next stop, the
   * second wants to know what this reality is related to. Showing both at once
   * offers up to three onward moves from one reality and quietly puts the route
   * in competition with itself, so only one is ever rendered.
   *
   * Where the next stop is also a real graph edge, `reasonInto` returns the
   * graph's own sentence — the two can say the same thing because they are the
   * same fact, read from one place.
   */
  const onPath = journey.active && !journey.complete && indexOfStop(fromId) === journey.reached;
  const nextIdx = journey.reached + 1;
  const nextId = onPath ? PATH[nextIdx]?.id : undefined;

  const edges = edgesFrom(fromId);
  if (phase !== 'active') return null;
  if (work) return null;
  if (!nextId && edges.length === 0) return null;

  const moves = nextId
    ? [{ to: nextId, because: reasonInto(nextIdx) ?? '', route: true }]
    : edges.map((e) => ({ to: e.to, because: e.because, route: false }));

  return (
    <nav className="modehost__onward" aria-label={nextId ? 'Next on this route' : 'Related realities'}>
      {moves.map((m) => (
        <button
          key={m.to}
          type="button"
          className="modehost__onward-btn t-mono t-mono-xs"
          data-route={m.route ? 'true' : undefined}
          onClick={() => {
            emit('recommended_next_click', { reality: m.to });
            enterMode(m.to);
          }}
          onPointerEnter={() => setPointerIntent('enter')}
          onPointerLeave={() => setPointerIntent('scan')}
        >
          <span className="modehost__onward-why">{m.because}</span>
          <span className="modehost__onward-to">
            {findModeTitle(m.to)}
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

  /**
   * The orientation sheet, and the single owner of Escape.
   *
   * Two listeners racing for one key is how a panel closes the mode behind it,
   * so there is still exactly one `useEscape` here: it closes the sheet when
   * the sheet is open, and leaves the reality when it is not. The way out is
   * never more than two presses away and never fails to be the second one.
   */
  /*
   * Held as the id the sheet is open FOR, not as a boolean.
   *
   * A sheet describing one reality must not survive into the next one, and the
   * obvious way to get that — clear a boolean in an effect when the mode
   * changes — is a setState in an effect, which is both a lint error here and
   * an extra render. Keyed on the id, the sheet simply is not open for a
   * reality it was not opened for, and no effect is needed.
   */
  const [oriFor, setOriFor] = useState<string | null>(null);
  const oriOpen = activeMode !== null && oriFor === activeMode.id;
  const closeOri = useCallback(() => setOriFor(null), []);
  const toggleOri = useCallback(() => {
    setOriFor((cur) => (activeMode && cur === activeMode.id ? null : (activeMode?.id ?? null)));
  }, [activeMode]);

  useEscape(true, oriOpen ? closeOri : exitMode);
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
        {/* The plate number and title were inert text — the one part of the
            chrome that looked like a label and behaved like one. They are now
            the way into the orientation sheet, which is where "what is this
            and what can I do here" finally lives inside the reality rather
            than one navigation away on the index. */}
        <OrientationToggle
          mode={activeMode}
          open={oriOpen}
          onToggle={toggleOri}
          panelId="lab-orientation"
        />

        {/* The piece of work being followed, if any. It sits in the chrome
            band because that is the only region sixteen full-bleed realities
            have all been designed to keep clear — see WorkStrip. */}
        <WorkStrip />

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
          <span className="modehost__esc t-dim" aria-hidden="true">
            ESC
          </span>
        </button>
      </div>

      <Orientation
        mode={activeMode}
        open={oriOpen}
        onClose={closeOri}
        panelId="lab-orientation"
      />

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
