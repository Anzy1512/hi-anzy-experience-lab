import type { CleanupScope } from '../core/cleanup';
import { onFrame } from '../core/raf';
import './transitions.css';

/**
 * THE TRANSITION VOCABULARY.
 *
 * Moving between realities used to be a cut. This is a small shared set of
 * transitions that make the move mean something — and it is deliberately small,
 * because a transition framework is how a product ends up with one generic
 * animation applied everywhere.
 *
 * Each primitive is chosen by *destination*: entering Matter Engine should not
 * feel like entering Time Machine, and the transition is the first thing that
 * says so.
 *
 * FIVE RULES, ENFORCED BY THE IMPLEMENTATION RATHER THAN BY INTENT
 *
 *  1. **Interruptible.** `run()` returns a cancel function and every primitive
 *     resolves its own DOM to a clean state when cancelled mid-flight.
 *  2. **Never load-bearing.** A transition only ever animates an overlay that
 *     sits *above* the document. Nothing waits for it; navigation has already
 *     happened by the time it plays. If it is cancelled, killed, or never runs
 *     at all, the visitor still arrives.
 *  3. **Cleanup-safe.** The overlay element and the frame subscription are both
 *     registered on the mode scope, so any exit path removes them.
 *  4. **Reduced motion is a different transition, not the absence of one.**
 *     A registration shift becomes an instant state change; conceptual
 *     continuity survives, travel does not.
 *  5. **No WebGL.** These are DOM overlays. A transition must never be the
 *     reason a renderer is created.
 */

export type TransitionId =
  | 'REGISTRATION_SHIFT'
  | 'PAPER_APERTURE'
  | 'PLATE_SEPARATE'
  | 'INK_DISSOLVE'
  | 'ARCHIVE_RESOLVE';

export interface TransitionSpec {
  id: TransitionId;
  /** Milliseconds. Short: this is punctuation, not a scene. */
  duration: number;
  /** Why this transition belongs to these destinations. */
  rationale: string;
}

export const TRANSITIONS: Record<TransitionId, TransitionSpec> = {
  REGISTRATION_SHIFT: {
    id: 'REGISTRATION_SHIFT',
    duration: 460,
    rationale:
      'Three plates slip and pull back into register. The logotype’s own device, and the Lab’s default move between any two states.',
  },
  PAPER_APERTURE: {
    id: 'PAPER_APERTURE',
    duration: 520,
    rationale: 'A hole opens in the sheet. Used where the destination is an opening onto somewhere else.',
  },
  PLATE_SEPARATE: {
    id: 'PLATE_SEPARATE',
    duration: 540,
    rationale: 'Layers pull apart in depth. Used where the destination is about structure being taken apart.',
  },
  INK_DISSOLVE: {
    id: 'INK_DISSOLVE',
    duration: 500,
    rationale: 'The surface breaks into grain. Used where the destination is made of particles or matter.',
  },
  ARCHIVE_RESOLVE: {
    id: 'ARCHIVE_RESOLVE',
    duration: 560,
    rationale: 'Grain gathers back into a surface. The inverse of INK_DISSOLVE; used for reconstruction destinations.',
  },
};

/**
 * Which transition a destination earns. Anything unlisted gets the default
 * registration shift, which is correct rather than a fallback.
 */
const BY_DESTINATION: Record<string, TransitionId> = {
  'matter-engine': 'INK_DISSOLVE',
  presence: 'INK_DISSOLVE',
  memory: 'ARCHIVE_RESOLVE',
  dream: 'ARCHIVE_RESOLVE',
  'reality-compiler': 'PLATE_SEPARATE',
  'living-world': 'PLATE_SEPARATE',
  chaos: 'PLATE_SEPARATE',
  portal: 'PAPER_APERTURE',
  'anzy-os': 'PAPER_APERTURE',
  'time-machine': 'PAPER_APERTURE',
};

export function transitionFor(destinationId: string | null): TransitionSpec {
  const id = (destinationId && BY_DESTINATION[destinationId]) || 'REGISTRATION_SHIFT';
  return TRANSITIONS[id];
}

/* -------------------------------------------------------------------------- */
/* Running one                                                                 */
/* -------------------------------------------------------------------------- */

const LAYER_ID = 'lab-transition-layer';

function ensureLayer(): HTMLElement {
  let el = document.getElementById(LAYER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = LAYER_ID;
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-lab-transient', 'true');
    document.body.appendChild(el);
  }
  return el;
}

/** Removes the overlay entirely. Safe to call repeatedly. */
export function clearTransition(): void {
  document.getElementById(LAYER_ID)?.remove();
}

export interface RunOptions {
  /** Registered so no exit path can leave the overlay behind. */
  scope?: CleanupScope | null;
  /** Reduced motion collapses the whole thing to a single instant state. */
  reduced?: boolean;
}

/**
 * Plays a transition over the document. Returns a cancel function.
 *
 * Nothing awaits this. The navigation that triggered it has already happened —
 * this is the punctuation after the sentence, and a cancelled transition simply
 * removes its own overlay.
 */
export function runTransition(
  spec: TransitionSpec,
  { scope = null, reduced = false }: RunOptions = {},
): () => void {
  // Reduced motion still marks the change — one frame of registration offset,
  // removed immediately. The concept survives; the travel does not.
  if (reduced) {
    const layer = ensureLayer();
    layer.className = `tr tr--${spec.id.toLowerCase()} tr--static`;
    const id = window.setTimeout(clearTransition, 90);
    const cancel = () => {
      window.clearTimeout(id);
      clearTransition();
    };
    scope?.add(cancel);
    return cancel;
  }

  const layer = ensureLayer();
  layer.className = `tr tr--${spec.id.toLowerCase()}`;
  layer.style.setProperty('--tr-p', '0');

  const started = performance.now();
  let stopped = false;

  const stopFrame = onFrame(() => {
    if (stopped) return;
    // Wall time, not accumulated dt: `core/raf` clamps dt for animation safety
    // and a transition built from clamped deltas runs long on a busy machine.
    const p = Math.min(1, (performance.now() - started) / spec.duration);
    layer.style.setProperty('--tr-p', p.toFixed(4));
    if (p >= 1) cancel();
  });

  function cancel() {
    if (stopped) return;
    stopped = true;
    stopFrame();
    clearTransition();
  }

  scope?.add(cancel);
  return cancel;
}
