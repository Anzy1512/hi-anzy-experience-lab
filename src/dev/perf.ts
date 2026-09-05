import { frameSubscriberCount, onFrame } from '../core/raf';
import { readCapability } from '../core/capability';

/**
 * FRAME-BUDGET SAMPLER — development only.
 *
 * Two deliberate constraints:
 *
 *  1. It only subscribes to the shared RAF loop **while it is sampling**. The
 *     whole point of `core/raf.ts` is that no loop exists when the Lab is idle,
 *     and a diagnostics tool that quietly pins a loop open would invalidate the
 *     very thing it claims to measure.
 *  2. It is imported behind an `import.meta.env.DEV` branch and has no
 *     module-level side effects, so it is dead-code-eliminated from production.
 */

export interface PerfSample {
  frames: number;
  durationMs: number;
  fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  /** frames over 50ms — the ones a visitor actually perceives as a stall */
  longFrames: number;
  rafSubscribers: number;
  canvases: number;
  dpr: number;
  viewport: { w: number; h: number };
  profile: string;
  stage: string;
  mode: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[i];
}

export function currentStage(): { stage: string; mode: string } {
  const stage = document.documentElement.getAttribute('data-stage') ?? 'unknown';
  const hash = window.location.hash;
  const mode = hash.startsWith('#/') ? hash.slice(2) : '—';
  return { stage, mode };
}

/**
 * Samples for `durationMs`, then unsubscribes and resolves.
 * Exposed on `window.__labPerf` so Playwright can profile without any UI.
 */
export function samplePerformance(durationMs = 2000): Promise<PerfSample> {
  return new Promise((resolve) => {
    const times: number[] = [];
    let elapsed = 0;

    const stop = onFrame((dt) => {
      times.push(dt);
      elapsed += dt;
      if (elapsed >= durationMs) {
        stop();
        finish();
      }
    });

    // Hard stop even if frames never arrive (a stalled or hidden tab).
    const guard = window.setTimeout(() => {
      stop();
      finish();
    }, durationMs + 1500);

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      window.clearTimeout(guard);

      const sorted = [...times].sort((a, b) => a - b);
      const total = times.reduce((a, b) => a + b, 0);
      const cap = readCapability();
      const { stage, mode } = currentStage();

      resolve({
        frames: times.length,
        durationMs: Math.round(total),
        fps: total > 0 ? +(1000 / (total / times.length)).toFixed(1) : 0,
        avgFrameMs: times.length ? +(total / times.length).toFixed(2) : 0,
        p95FrameMs: +percentile(sorted, 0.95).toFixed(2),
        maxFrameMs: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
        longFrames: times.filter((t) => t > 50).length,
        // Subtract our own subscription so the number reflects the app's loops.
        rafSubscribers: Math.max(0, frameSubscriberCount() - 1),
        canvases: document.querySelectorAll('canvas').length,
        dpr: cap.dpr,
        viewport: cap.viewport,
        profile: cap.profile,
        stage,
        mode,
      });
    }
  });
}

/**
 * A recorded observation. `label` is whatever the person running the session
 * typed — there is no automatic naming, because a number without the context a
 * human supplied is not an observation, it is a digit.
 */
export interface PerfRecord extends PerfSample {
  label: string;
  at: string;
  userAgent: string;
}

const recorded: PerfRecord[] = [];

/**
 * Samples, labels and keeps the result so a real-browser session can build a
 * table worth reading.
 *
 * This deliberately does NOT feed back into quality selection. Adaptive
 * frame-rate governing would need frame timings this project cannot trust —
 * headless Chrome drives rAF at roughly 2fps, so nothing measured here is a
 * benchmark. `record()` exists so that numbers observed on real hardware by a
 * real person can be written down; it invents nothing.
 */
async function recordPerformance(label: string, ms = 3000): Promise<PerfRecord> {
  const sample = await samplePerformance(ms);
  const entry: PerfRecord = {
    ...sample,
    label,
    at: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };
  recorded.push(entry);
  return entry;
}

/** Everything recorded this session, as a table you can read or copy out. */
function results(): PerfRecord[] {
  return [...recorded];
}

function toCsv(): string {
  const cols: (keyof PerfRecord)[] = [
    'label', 'at', 'stage', 'mode', 'profile', 'viewport', 'dpr',
    'frames', 'durationMs', 'fps', 'avgFrameMs', 'p95FrameMs', 'maxFrameMs',
    'longFrames', 'rafSubscribers', 'canvases',
  ];
  const head = cols.join(',');
  const rows = recorded.map((r) =>
    cols
      .map((c) => {
        const v = r[c];
        return typeof v === 'object' && v !== null && 'w' in v ? `${v.w}x${v.h}` : String(v);
      })
      .join(','),
  );
  return [head, ...rows].join('\n');
}

declare global {
  interface Window {
    __labPerf?: {
      sample: (ms?: number) => Promise<PerfSample>;
      record: (label: string, ms?: number) => Promise<PerfRecord>;
      results: () => PerfRecord[];
      csv: () => string;
      clear: () => void;
    };
  }
}

/** Called by the overlay on mount; never at module scope. */
export function installPerfApi(): () => void {
  window.__labPerf = {
    sample: samplePerformance,
    record: recordPerformance,
    results,
    csv: toCsv,
    clear: () => {
      recorded.length = 0;
    },
  };
  return () => {
    delete window.__labPerf;
  };
}
