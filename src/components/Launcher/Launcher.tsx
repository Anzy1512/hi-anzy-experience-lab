import { useCallback, useEffect, useRef, useState } from 'react';
import { Wordmark, type WordmarkState } from './Wordmark';
import { LAB } from '../../content/brand';
import { useExperience } from '../../experience/context';
import { useReducedMotion } from '../../core/hooks';
import { setPointerIntent } from '../../core/pointer';
import './launcher.css';

/**
 * THE OPENING.
 *
 * Six beats, and most of them are quiet:
 *
 *   0 VOID       bone stock, the print screen, nothing else
 *   1 SIGNAL     one line of mono and a rule drawing across the sheet
 *   2 REGISTER   three ink plates pull into register (Wordmark.tsx)
 *   3 LABEL      a second, machine voice establishes itself beneath
 *   4 STATEMENT  the position, stated small
 *   5 ENTER      a deliberate act
 *
 * The rhythm is the point: stillness, then one event, then stillness again. The
 * loudest moment (registration) is the only loud moment, and it is over in about
 * a second and a half.
 */

type Beat = 0 | 1 | 2 | 3 | 4 | 5;

export function Launcher() {
  const { enterLab } = useExperience();
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState<Beat>(0);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);
  const enterRef = useRef<HTMLButtonElement>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const at = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /** Skip to the end. Any key or click during the opening honours impatience. */
  const skip = useCallback(() => {
    clearTimers();
    setBeat(5);
  }, [clearTimers]);

  /* ---- the sequence ----------------------------------------------------- */
  useEffect(() => {
    if (reduced) {
      // Reduced motion still gets the composition and still gets a beat of
      // quiet — it just does not get the travel.
      at(220, () => setBeat(5));
      return clearTimers;
    }
    at(520, () => setBeat(1));
    at(1150, () => setBeat(2));
    return clearTimers;
  }, [reduced, at, clearTimers]);

  /** Wordmark reports when the plates are in register; the rest follows it. */
  const onRegistered = useCallback(() => {
    setBeat((b) => (b < 3 ? 3 : b));
    at(360, () => setBeat((b) => (b < 4 ? 4 : b)));
    at(760, () => setBeat((b) => (b < 5 ? 5 : b)));
  }, [at]);

  /**
   * Registration watchdog.
   *
   * The opening hands control to the wordmark and waits for it to report that
   * the plates are in register. If that report never arrives — a stalled
   * animation frame budget, a tab restored from the background, GSAP's lag
   * smoothing stretching the timeline on a slow device — the visitor would be
   * left looking at a half-printed wordmark with no way forward. So the beat
   * advances on its own if registration has not reported in time.
   */
  useEffect(() => {
    if (beat !== 2) return;
    const id = window.setTimeout(() => {
      setBeat((b) => (b === 2 ? 3 : b));
      at(360, () => setBeat((b) => (b < 4 ? 4 : b)));
      at(760, () => setBeat((b) => (b < 5 ? 5 : b)));
    }, 2600);
    return () => window.clearTimeout(id);
  }, [beat, at]);

  /* ---- skip affordance -------------------------------------------------- */
  useEffect(() => {
    if (beat >= 5) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip();
    };
    const onClick = () => skip();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onClick);
    };
  }, [beat, skip]);

  /*
   * Deliberately no autofocus on the entry control. Moving focus without the
   * visitor asking is hostile to screen-reader and keyboard users mid-read, and
   * it would mean the control never shows its resting state. The skip link is
   * the first tab stop and the control is the next one.
   */

  /* ---- leaving: the sheet is turned over -------------------------------- */
  const handleEnter = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setPointerIntent('default');
    window.setTimeout(enterLab, reduced ? 180 : 640);
  }, [leaving, enterLab, reduced]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const wordmarkState: WordmarkState = leaving
    ? 'separating'
    : beat >= 3
      ? 'settled'
      : beat === 2
        ? 'registering'
        : 'hidden';

  return (
    <main
      className="launcher"
      data-beat={beat}
      data-leaving={leaving ? 'true' : 'false'}
      id="lab-main"
    >
      <h1 className="u-sr">Hi Anzy — Experience Lab. One company. Multiple realities.</h1>

      <div className="launcher__head">
        {/* The sheet furniture already carries HA/XL and the sheet number, so this
            line is purely the process log — one changing word, not a second id. */}
        <p className="t-mono t-mono-xs launcher__signal">
          <span className="launcher__signal-dot" aria-hidden="true" />
          <span className="launcher__signal-state">{beat >= 3 ? 'SYSTEM READY' : LAB.initialising}</span>
        </p>
        <span className="launcher__head-rule" />
      </div>

      <div className="launcher__mark">
        <Wordmark state={wordmarkState} onRegistered={onRegistered} />
      </div>

      <div className="launcher__label">
        <span className="launcher__label-rule" />
        <p className="t-mono t-mono-s launcher__label-text">{LAB.label}</p>
        <p className="t-mono t-mono-xs t-dim launcher__label-meta">EST. INDEX / 16 REALITIES</p>
      </div>

      <div className="launcher__foot">
        <div className="launcher__statement">
          {LAB.statement.map((line, i) => (
            <p className="t-body launcher__statement-line" key={line} style={{ '--i': i } as React.CSSProperties}>
              {line}
            </p>
          ))}
        </div>

        <button
          ref={enterRef}
          type="button"
          className="launcher__enter"
          onClick={handleEnter}
          onPointerEnter={() => setPointerIntent('enter')}
          onPointerLeave={() => setPointerIntent('default')}
          onFocus={() => setPointerIntent('enter')}
          onBlur={() => setPointerIntent('default')}
          disabled={beat < 5 || leaving}
          aria-label={LAB.enter}
        >
          <span className="launcher__enter-text t-mono">{LAB.enter}</span>
        </button>
      </div>
    </main>
  );
}
