import gsap from 'gsap';
import { haltAllFrames, onFrame, type FrameFn } from './raf';

/**
 * CleanupScope — the single discipline that makes "enter / exit / enter / exit"
 * safe forever.
 *
 * Nothing in a mode may register a listener, timer, frame callback, GSAP
 * timeline or GPU resource except through a scope. Exiting a mode disposes its
 * scope, and the mode is then provably gone: there is no path by which a
 * subscription outlives the thing that created it.
 */
export class CleanupScope {
  private tasks: Array<() => void> = [];
  private disposed = false;
  readonly label: string;

  constructor(label = 'scope') {
    this.label = label;
  }

  get isDisposed() {
    return this.disposed;
  }

  /**
   * Register an arbitrary teardown. Runs LIFO.
   *
   * Registering on an already-disposed scope runs the teardown immediately —
   * the resource has no owner left, so releasing it at once is the only safe
   * thing to do. But that is almost always a lifecycle mistake at the call
   * site, and it is invisible: the caller sees a successful `add()` and a
   * subscription that is already gone. So it says so, loudly, in development.
   */
  add(fn: () => void): void {
    if (this.disposed) {
      if (import.meta.env.DEV) {
        console.warn(
          `[lab] CleanupScope "${this.label}" is already disposed — the teardown ` +
            'just registered was run immediately. Whatever it was meant to keep ' +
            'alive is not alive.',
        );
      }
      fn();
      return;
    }
    this.tasks.push(fn);
  }

  listen<T extends EventTarget>(
    target: T,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.add(() => target.removeEventListener(type, handler, options));
  }

  frame(fn: FrameFn): void {
    this.add(onFrame(fn));
  }

  timeout(fn: () => void, ms: number): void {
    const id = window.setTimeout(fn, ms);
    this.add(() => window.clearTimeout(id));
  }

  /** A GSAP context. `.revert()` restores every property it ever touched. */
  gsap(create: (ctx: gsap.Context) => void, scopeEl?: Element | null): gsap.Context {
    const ctx = gsap.context(() => create(ctx), scopeEl ?? undefined);
    this.add(() => ctx.revert());
    return ctx;
  }

  observe(observer: { disconnect(): void }): void {
    this.add(() => observer.disconnect());
  }

  /** Set a DOM attribute now, restore the previous value on dispose. */
  attribute(el: Element, name: string, value: string): void {
    const prev = el.getAttribute(name);
    el.setAttribute(name, value);
    this.add(() => {
      if (prev === null) el.removeAttribute(name);
      else el.setAttribute(name, prev);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      try {
        this.tasks[i]();
      } catch (err) {
        // A failing teardown must never prevent the remaining teardowns.
        console.warn(`[lab] cleanup task failed in "${this.label}"`, err);
      }
    }
    this.tasks.length = 0;
  }
}

/**
 * EmergencyReset — the floor beneath the architecture.
 *
 * Scopes handle the ordinary path. This handles the extraordinary one: a mode
 * that threw during enter, a WebGL context loss, a double-Escape during a
 * transition. It force-restores the document to a state the shell can render
 * into, and is safe to call at any time, any number of times.
 */
export function emergencyReset(reason: string): void {
  const doc = document;
  const body = doc.body;

  // 1. every animation frame in the app
  haltAllFrames();

  // 2. every GSAP tween/timeline, including orphans from a reverted context
  try {
    gsap.globalTimeline.clear();
    gsap.killTweensOf('*');
  } catch {
    /* gsap not initialised yet — nothing to kill */
  }

  // 3. scroll + pointer + inline style residue
  body.removeAttribute('data-scroll-locked');
  body.removeAttribute('data-pointer');
  body.style.removeProperty('overflow');
  body.style.removeProperty('position');
  body.style.removeProperty('top');
  body.style.removeProperty('touch-action');
  body.style.removeProperty('cursor');

  // 4. anything a mode injected outside React's tree
  doc.querySelectorAll('[data-lab-transient]').forEach((el) => el.remove());

  // 5. focus somewhere real, so the keyboard user is not stranded
  const root = doc.getElementById('lab-root');
  if (root instanceof HTMLElement) {
    root.focus({ preventScroll: true });
    root.blur();
  }

  if (import.meta.env.DEV) {
    console.info(`[lab] EmergencyReset — ${reason}`);
  }
}

/** Scroll lock that survives being applied or released twice. */
export function setScrollLock(locked: boolean): void {
  if (locked) document.body.setAttribute('data-scroll-locked', 'true');
  else document.body.removeAttribute('data-scroll-locked');
}
