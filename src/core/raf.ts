/**
 * ONE requestAnimationFrame loop for the entire application.
 *
 * Every continuously-running system (pointer smoothing, scanner, depth field,
 * X-Ray readouts) subscribes here. The loop only exists while it has at least
 * one subscriber, so an idle Lab genuinely idles — that is the difference
 * between "it compiles" and "the fan stays off".
 */

export type FrameFn = (dt: number, elapsed: number) => void;

const subscribers = new Set<FrameFn>();
let handle = 0;
let last = 0;
let start = 0;

function tick(now: number) {
  const dt = last === 0 ? 16.7 : Math.min(now - last, 64); // clamp tab-restore spikes
  last = now;
  const elapsed = now - start;

  for (const fn of subscribers) fn(dt, elapsed);

  handle = subscribers.size > 0 ? requestAnimationFrame(tick) : 0;
  if (handle === 0) last = 0;
}

export function onFrame(fn: FrameFn): () => void {
  subscribers.add(fn);
  if (handle === 0) {
    start = performance.now();
    last = 0;
    handle = requestAnimationFrame(tick);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && handle !== 0) {
      cancelAnimationFrame(handle);
      handle = 0;
      last = 0;
    }
  };
}

/** Used by EmergencyReset. Nothing else should call this. */
export function haltAllFrames() {
  subscribers.clear();
  if (handle !== 0) {
    cancelAnimationFrame(handle);
    handle = 0;
  }
  last = 0;
}

export function frameSubscriberCount() {
  return subscribers.size;
}
