import { onFrame } from './raf';

/**
 * Global pointer tracking that never touches React.
 *
 * The pointer moves at input rate. Routing that through setState would re-render
 * the Lab Index dozens of times a second for a visual that is pure transform.
 * Instead we keep a single mutable record, smooth it in the shared RAF loop, and
 * publish it two ways:
 *
 *   - CSS custom properties on <html>, which the pointer element and any
 *     proximity effect can consume with zero JS per frame;
 *   - a plain subscriber list, for readouts that need the numbers (X-Ray).
 */

export type PointerIntent = 'default' | 'discover' | 'enter' | 'scan' | 'exit' | 'drag';

export interface PointerState {
  /** raw viewport coords */
  x: number;
  y: number;
  /** smoothed coords — what the instrument is drawn at */
  sx: number;
  sy: number;
  /** normalised 0..1 */
  nx: number;
  ny: number;
  /** px per frame, smoothed */
  velocity: number;
  intent: PointerIntent;
  down: boolean;
  /** true once the user has actually moved a fine pointer */
  present: boolean;
  target: Element | null;
}

export const pointer: PointerState = {
  x: 0,
  y: 0,
  sx: 0,
  sy: 0,
  nx: 0.5,
  ny: 0.5,
  velocity: 0,
  intent: 'default',
  down: false,
  present: false,
  target: null,
};

type Listener = (p: PointerState) => void;
const listeners = new Set<Listener>();

export function subscribePointer(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setPointerIntent(intent: PointerIntent): void {
  if (pointer.intent === intent) return;
  pointer.intent = intent;
  document.documentElement.setAttribute('data-ptr', intent);
  for (const l of listeners) l(pointer);
}

/**
 * Starts tracking. Returns a teardown. Only meaningful for fine pointers —
 * on touch we never fake a cursor, so the caller simply does not start it.
 */
export function startPointerTracking(): () => void {
  const root = document.documentElement;
  let smoothV = 0;

  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = e.clientX / Math.max(window.innerWidth, 1);
    pointer.ny = e.clientY / Math.max(window.innerHeight, 1);
    pointer.target = e.target instanceof Element ? e.target : null;
    if (!pointer.present) {
      pointer.present = true;
      root.setAttribute('data-ptr-present', 'true');
      // Avoid the instrument flying in from 0,0 on first move.
      pointer.sx = e.clientX;
      pointer.sy = e.clientY;
    }
  };

  const onDown = () => {
    pointer.down = true;
    root.setAttribute('data-ptr-down', 'true');
  };
  const onUp = () => {
    pointer.down = false;
    root.removeAttribute('data-ptr-down');
  };
  const onLeave = () => {
    pointer.present = false;
    root.removeAttribute('data-ptr-present');
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  const stopFrame = onFrame((dt) => {
    // Frame-rate independent damping: same feel at 60 and 144 Hz.
    const k = 1 - Math.pow(0.0016, dt / 1000);
    const px = pointer.sx;
    const py = pointer.sy;
    pointer.sx += (pointer.x - pointer.sx) * k;
    pointer.sy += (pointer.y - pointer.sy) * k;

    const inst = Math.hypot(pointer.sx - px, pointer.sy - py);
    smoothV += (inst - smoothV) * 0.18;
    pointer.velocity = smoothV;

    root.style.setProperty('--ptr-x', `${pointer.sx.toFixed(1)}px`);
    root.style.setProperty('--ptr-y', `${pointer.sy.toFixed(1)}px`);
    root.style.setProperty('--ptr-v', smoothV.toFixed(3));

    for (const l of listeners) l(pointer);
  });

  return () => {
    stopFrame();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.removeEventListener('pointerleave', onLeave);
    root.removeAttribute('data-ptr');
    root.removeAttribute('data-ptr-present');
    root.removeAttribute('data-ptr-down');
    root.style.removeProperty('--ptr-x');
    root.style.removeProperty('--ptr-y');
    root.style.removeProperty('--ptr-v');
    pointer.present = false;
    pointer.intent = 'default';
  };
}
