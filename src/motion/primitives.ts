import gsap from 'gsap';
import { EASE, DUR } from './easing';

/**
 * MOTION PRIMITIVES
 *
 * A deliberately short list. Each one exists because it is used more than once
 * and because it expresses something in the visual language:
 *
 *   splitChars   type as individually addressable matter
 *   maskReveal   type arriving through an aperture, never by opacity alone
 *   trackIn      tracking as an arrival, not a decoration
 *   scanSweep    the instrument passing over a subject
 *   rowsIn       an index assembling itself, top-down, with real stagger
 *
 * There is no generic "fadeUp". Its absence is the point.
 */

/* -------------------------------------------------------------------------- */
/* splitChars                                                                  */
/* -------------------------------------------------------------------------- */
/**
 * ~20 lines instead of GSAP SplitText.
 *
 * SplitText is free now and excellent, but it rewrites the element's innerHTML,
 * which means cleanup correctness depends on remembering to revert() on every
 * exit path. Owning the split ourselves keeps that guarantee inside CleanupScope
 * where the rest of the app's teardown lives — and we only need two places.
 *
 * The original string is preserved for assistive tech via aria-label, and the
 * generated spans are hidden from the accessibility tree.
 */
export interface SplitResult {
  chars: HTMLSpanElement[];
  revert: () => void;
}

export function splitChars(el: HTMLElement): SplitResult {
  const original = el.innerHTML;
  const text = el.textContent ?? '';

  el.setAttribute('aria-label', text.trim());
  el.textContent = '';

  const chars: HTMLSpanElement[] = [];
  const frag = document.createDocumentFragment();

  for (const ch of Array.from(text)) {
    const span = document.createElement('span');
    span.className = 'm-char';
    span.setAttribute('aria-hidden', 'true');
    if (ch === ' ') {
      span.innerHTML = '&nbsp;';
      span.style.display = 'inline';
    } else {
      span.textContent = ch;
    }
    frag.appendChild(span);
    chars.push(span);
  }
  el.appendChild(frag);

  return {
    chars,
    revert() {
      el.innerHTML = original;
      el.removeAttribute('aria-label');
    },
  };
}

/* -------------------------------------------------------------------------- */
/* maskReveal — an aperture opens; the type was always there                   */
/* -------------------------------------------------------------------------- */
export function maskReveal(
  targets: gsap.TweenTarget,
  opts: { from?: 'bottom' | 'top' | 'left'; duration?: number; stagger?: number; delay?: number } = {},
): gsap.core.Tween {
  const { from = 'bottom', duration = DUR.d4, stagger = 0, delay = 0 } = opts;

  const closed =
    from === 'bottom'
      ? 'inset(100% 0% 0% 0%)'
      : from === 'top'
        ? 'inset(0% 0% 100% 0%)'
        : 'inset(0% 100% 0% 0%)';

  return gsap.fromTo(
    targets,
    { clipPath: closed, willChange: 'clip-path' },
    {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration,
      stagger,
      delay,
      ease: EASE.weight,
      clearProps: 'willChange',
    },
  );
}

/* -------------------------------------------------------------------------- */
/* trackIn — letter-spacing as arrival                                         */
/* -------------------------------------------------------------------------- */
export function trackIn(
  targets: gsap.TweenTarget,
  opts: { fromEm?: number; toEm?: number; duration?: number; delay?: number } = {},
): gsap.core.Tween {
  const { fromEm = 0.6, toEm = 0.24, duration = DUR.d5, delay = 0 } = opts;
  return gsap.fromTo(
    targets,
    { letterSpacing: `${fromEm}em`, opacity: 0 },
    {
      letterSpacing: `${toEm}em`,
      opacity: 1,
      duration,
      delay,
      ease: EASE.glide,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* scanSweep — the instrument passes over a subject                            */
/* -------------------------------------------------------------------------- */
export function scanSweep(
  target: gsap.TweenTarget,
  opts: { duration?: number; repeat?: number; delay?: number } = {},
): gsap.core.Tween {
  const { duration = DUR.d5, repeat = 0, delay = 0 } = opts;
  return gsap.fromTo(
    target,
    { '--scan': 0 },
    { '--scan': 1, duration, repeat, delay, ease: EASE.mechanical },
  );
}

/* -------------------------------------------------------------------------- */
/* rowsIn — an index assembling                                                */
/* -------------------------------------------------------------------------- */
export function rowsIn(targets: gsap.TweenTarget, opts: { delay?: number } = {}): gsap.core.Timeline {
  const { delay = 0 } = opts;
  const tl = gsap.timeline({ delay });

  // The rule draws first, the content arrives into it. Structure precedes content:
  // the same order in which a printed page is imposed.
  tl.fromTo(
    targets,
    { '--row-rule': 0 },
    { '--row-rule': 1, duration: DUR.d3, stagger: 0.045, ease: EASE.mechanical },
  ).fromTo(
    targets,
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: DUR.d4, stagger: 0.045, ease: EASE.glide },
    '-=0.32',
  );

  return tl;
}

/**
 * A hard guarantee that an entrance animation finishes.
 *
 * Any reveal that animates *from* opacity 0 is holding content hostage to a
 * tween. If the frame budget collapses — a slow device, a tab restored from the
 * background, GSAP's own lag smoothing stretching the timeline — the visitor is
 * left looking at an empty sheet. `setTimeout` keeps running when rAF does not,
 * so this forces the end state after a deadline and the content always arrives.
 *
 * Returns a teardown; register it on a CleanupScope or an effect cleanup.
 */
export function guaranteeCompletion(
  animation: gsap.core.Timeline | gsap.core.Tween,
  deadlineMs = 2200,
): () => void {
  const id = window.setTimeout(() => {
    if (animation.progress() < 1) animation.progress(1);
  }, deadlineMs);
  return () => window.clearTimeout(id);
}

/**
 * Reduced-motion equivalent of any of the above: end state, immediately.
 * Used instead of skipping the reveal entirely, so the composition still lands.
 */
export function settleImmediately(targets: gsap.TweenTarget): void {
  gsap.set(targets, {
    clipPath: 'inset(0% 0% 0% 0%)',
    opacity: 1,
    x: 0,
    y: 0,
    '--row-rule': 1,
    clearProps: 'willChange',
  });
}
