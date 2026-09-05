import { Suspense, lazy, useEffect } from 'react';
import { useExperience } from '../experience/context';
import { Launcher } from '../components/Launcher/Launcher';
import { LabIndex } from '../components/LabIndex/LabIndex';
import { SheetFrame } from '../components/Sheet/SheetFrame';
import { Instrument } from '../components/Pointer/Instrument';
import { ModeHost } from './ModeHost';
import { MODES } from '../content/lab';
import { registerEases } from '../motion/easing';
import { emergencyReset } from '../core/cleanup';

const ONLINE_COUNT = MODES.filter((m) => m.status === 'online').length;

/**
 * The dev frame-budget harness.
 *
 * `import.meta.env.DEV` is statically replaced at build time, so in production
 * this whole expression folds to `null` and the dynamic import is eliminated
 * along with it — the harness never reaches a shipped bundle.
 */
const FrameBudget = import.meta.env.DEV ? lazy(() => import('../dev/FrameBudget')) : null;

export function App() {
  const { stage } = useExperience();

  useEffect(() => {
    registerEases();
  }, []);

  /**
   * Last line of defence. If anything escapes a scope and reaches the window,
   * the sheet is restored to a state the shell can still render into rather
   * than leaving the visitor with a locked body and an orphaned overlay.
   */
  useEffect(() => {
    const onError = (e: ErrorEvent) => emergencyReset(`window error: ${e.message}`);
    const onRejection = () => emergencyReset('unhandled rejection');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <>
      <a className="u-skip" href="#lab-main">
        Skip to content
      </a>

      {/* A mode brings its own chrome and its own marks. Rendering the sheet
          furniture underneath it double-prints the identifier band. */}
      {stage !== 'mode' && (
        <SheetFrame
          readout={
            stage === 'index'
              ? `${MODES.length} REALITIES / ${ONLINE_COUNT} ONLINE`
              : 'STANDBY'
          }
        />
      )}

      {stage === 'launcher' && <Launcher />}
      {stage === 'index' && <LabIndex />}
      {stage === 'mode' && <ModeHost />}

      <Instrument />

      {FrameBudget && (
        <Suspense fallback={null}>
          <FrameBudget />
        </Suspense>
      )}
    </>
  );
}
