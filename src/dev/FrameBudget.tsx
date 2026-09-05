import { useEffect, useRef, useState } from 'react';
import { onFrame, frameSubscriberCount } from '../core/raf';
import { readCapability } from '../core/capability';
import { currentStage, installPerfApi } from './perf';
import './frame-budget.css';

/**
 * THE FRAME-BUDGET HARNESS — development only.
 *
 * Hidden by default; toggled with Ctrl+Alt+P. While hidden it holds no RAF
 * subscription at all, so it cannot perturb the thing it exists to measure.
 * While visible it reads from the shared loop like every other system and
 * writes into text nodes directly — the panel itself never re-renders per frame.
 *
 * `window.__labPerf.sample(ms)` is installed alongside it for headless
 * profiling; that path needs no UI and is what the Playwright performance pass
 * uses. This will fold into the PERFORMANCE experiment when that is built.
 */

const LONG_FRAME_MS = 50;

/** `?perf=1` opens the harness on load, so a real-browser run needs no keystroke. */
function openedByUrl(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
}

export default function FrameBudget() {
  const [open, setOpen] = useState(openedByUrl);
  const bodyRef = useRef<HTMLDListElement>(null);

  useEffect(() => installPerfApi(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = bodyRef.current;
    if (!root) return;

    const cell = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`);
    let acc = 0;
    let frames = 0;
    let worst = 0;
    let long = 0;

    return onFrame((dt) => {
      acc += dt;
      frames++;
      if (dt > worst) worst = dt;
      if (dt > LONG_FRAME_MS) long++;

      if (acc < 250) return;
      const avg = acc / frames;
      const cap = readCapability();
      const { stage, mode } = currentStage();

      const set = (k: string, v: string) => {
        const el = cell(k);
        if (el) el.textContent = v;
      };
      set('fps', String(Math.round(1000 / avg)));
      set('avg', `${avg.toFixed(1)}ms`);
      set('max', `${worst.toFixed(1)}ms`);
      set('long', String(long));
      // minus this panel's own subscription
      set('raf', String(Math.max(0, frameSubscriberCount() - 1)));
      set('canvas', String(document.querySelectorAll('canvas').length));
      set('dpr', cap.dpr.toFixed(2));
      set('view', `${cap.viewport.w}×${cap.viewport.h}`);
      set('profile', cap.profile.toUpperCase());
      set('where', mode !== '—' ? `${stage}/${mode}` : stage);

      const fpsEl = cell('fps');
      if (fpsEl) fpsEl.dataset.warn = 1000 / avg < 45 ? 'true' : 'false';

      acc = 0;
      frames = 0;
      worst = 0;
    });
  }, [open]);

  if (!open) return null;

  return (
    <aside className="fb" aria-hidden="true">
      <p className="fb__title">FRAME BUDGET · CTRL+ALT+P</p>
      <dl className="fb__body" ref={bodyRef}>
        {(
          [
            ['fps', 'FPS'],
            ['avg', 'AVG'],
            ['max', 'MAX'],
            ['long', `>${LONG_FRAME_MS}MS`],
            ['raf', 'RAF'],
            ['canvas', 'CANVAS'],
            ['dpr', 'DPR'],
            ['view', 'VIEW'],
            ['profile', 'PROFILE'],
            ['where', 'AT'],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd data-k={k}>--</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
