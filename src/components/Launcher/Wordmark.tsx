import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { EASE, DUR } from '../../motion/easing';
import { useLatest, useMediaQuery, useReducedMotion } from '../../core/hooks';

/**
 * THE WORDMARK — three ink plates coming into register.
 *
 * The Hi Anzy logotype already contains a misregistration: an orange bar sitting
 * off the top of "hi", a red bar off the bottom of "zy". So the launcher does
 * not "animate a logo in" — it prints one. Three plates arrive out of register
 * and pull into alignment, settling at the small residual offset that offset
 * lithography always leaves. The brand's own graphic device becomes the reveal.
 *
 * Set as SVG so the wordmark can span the sheet exactly at any viewport. The
 * viewBox is derived from the real glyph bounds after the webfont resolves,
 * which is also why the reveal waits for `document.fonts.ready` — no reflow,
 * no fallback-metrics flash.
 */

export type WordmarkState = 'hidden' | 'registering' | 'settled' | 'separating';

const TEXT = 'HI ANZY';
/**
 * On a phone the wordmark stacks.
 *
 * Set on one line, a width-constrained wordmark on a 390px viewport is about
 * 90px tall and the composition ends up more than half empty air. Stacking is
 * not a smaller desktop — it is the right composition for a tall narrow sheet,
 * and it doubles the wordmark's presence without changing a single token.
 */
const STACKED_LINES = ['HI', 'ANZY'] as const;
const FONT_SIZE = 200;
/** Baseline-to-baseline advance for the stacked setting, in user units. */
const LINE_ADVANCE = FONT_SIZE * 0.94;
/**
 * Padding inflates the viewBox, and because the wordmark is width-constrained,
 * vertical padding costs height twice over. Kept tight; the plates travel
 * outside the box during entry, which `overflow: visible` allows.
 */
const PAD = 8;

/**
 * Residual misregistration, in SVG user units.
 *
 * Vertical only, and deliberately so. Offsetting on both axes puts colour on
 * every edge of every stroke, which stops reading as a press out of register
 * and starts reading as embossed 3D text — the cheapest look in the building.
 * Pure vertical offset puts orange along the top edges and red along the
 * bottom, which is also what the Hi Anzy logotype already does: an orange bar
 * above "hi", a red bar below "zy".
 */
const REST = {
  orange: { x: 0, y: -2.6 },
  red: { x: 0, y: 2.2 },
};

interface Props {
  state: WordmarkState;
  onRegistered?: () => void;
}

export function Wordmark({ state, onRegistered }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const inkRef = useRef<SVGTextElement>(null);
  const orangeRef = useRef<SVGGElement>(null);
  const redRef = useRef<SVGGElement>(null);
  const inkGroupRef = useRef<SVGGElement>(null);
  const [viewBox, setViewBox] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const stacked = useMediaQuery('(max-width: 640px)');
  const lines = stacked ? STACKED_LINES : [TEXT];
  const readyRef = useLatest(onRegistered);

  /* ---- measure real glyph bounds once the webfont has resolved ---------- */
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      // Measure the whole ink group: for the stacked setting its bbox width is
      // the widest line, which is exactly what the viewBox needs.
      const node = inkGroupRef.current;
      if (!node) return;
      try {
        const b = node.getBBox();
        if (b.width === 0) return;

        /**
         * getBBox on SVG text returns the font's *layout* box — ascent plus
         * descent — which for Rajdhani is nearly twice the cap height. Using it
         * directly wraps the wordmark in ~45% invisible padding and wrecks the
         * composition. The horizontal measure is trustworthy, so we take width
         * from the bbox and get the true cap height from canvas glyph metrics.
         */
        let capHeight = b.height;
        const ctx2d = document.createElement('canvas').getContext('2d');
        if (ctx2d) {
          ctx2d.font = `700 ${FONT_SIZE}px Rajdhani, Oswald, sans-serif`;
          const m = ctx2d.measureText(TEXT);
          const ascent = m.actualBoundingBoxAscent;
          const descent = m.actualBoundingBoxDescent;
          if (Number.isFinite(ascent) && ascent > 0) {
            capHeight = ascent + Math.max(0, descent);
          }
        }

        // First baseline sits at y = 0, so the glyphs run from -capHeight down
        // to the last baseline.
        const lastBaseline = (lines.length - 1) * LINE_ADVANCE;
        setViewBox(
          `${b.x - PAD} ${-capHeight - PAD} ${b.width + PAD * 2} ${capHeight + lastBaseline + PAD * 2}`,
        );
      } catch {
        /* getBBox throws if the node is not rendered yet; the retry below covers it */
      }
    };

    // `document.fonts.ready` is a Promise, so it is always truthy — the guard
    // has to be on the FontFaceSet itself.
    if (document.fonts) {
      void document.fonts.ready.then(measure).catch(measure);
    } else {
      measure();
    }
    // Safety net: if the font never resolves we still show the wordmark.
    const fallback = window.setTimeout(measure, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
    // Re-measure when the setting changes between one line and two.
  }, [lines.length]);

  /* ---- choreography ----------------------------------------------------- */
  useEffect(() => {
    if (!viewBox) return;
    const ink = inkGroupRef.current;
    const orange = orangeRef.current;
    const red = redRef.current;
    if (!ink || !orange || !red) return;

    const ctx = gsap.context(() => {
      if (state === 'hidden') {
        gsap.set(ink, { clipPath: 'inset(100% 0% 0% 0%)', opacity: 1 });
        gsap.set(orange, { x: -44, y: -26, rotate: -0.7, opacity: 0 });
        gsap.set(red, { x: 37, y: 30, rotate: 0.55, opacity: 0 });
        return;
      }

      if (state === 'registering') {
        if (reduced) {
          // Reduced motion keeps the idea — three plates, slightly out of
          // register — and simply arrives at it without the travel.
          gsap.set(ink, { clipPath: 'inset(0% 0% 0% 0%)' });
          gsap.set(orange, { ...REST.orange, rotate: 0, opacity: 1 });
          gsap.set(red, { ...REST.red, rotate: 0, opacity: 1 });
          readyRef.current?.();
          return;
        }

        const tl = gsap.timeline({ onComplete: () => readyRef.current?.() });

        // The black plate is pulled through the aperture first: the sheet is
        // being printed, not faded in.
        tl.fromTo(
          ink,
          { clipPath: 'inset(100% 0% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.d5, ease: EASE.weight },
        )
          .to(
            orange,
            { x: REST.orange.x, y: REST.orange.y, rotate: 0, opacity: 1, duration: 1.05, ease: EASE.mechanical },
            0.18,
          )
          .to(
            red,
            { x: REST.red.x, y: REST.red.y, rotate: 0, opacity: 1, duration: 1.05, ease: EASE.mechanical },
            0.3,
          );
        return;
      }

      if (state === 'settled') {
        gsap.set(ink, { clipPath: 'inset(0% 0% 0% 0%)' });
        gsap.set(orange, { ...REST.orange, rotate: 0, opacity: 1 });
        gsap.set(red, { ...REST.red, rotate: 0, opacity: 1 });
        return;
      }

      // separating — the plates come apart again as the sheet is turned over.
      if (reduced) {
        gsap.to([ink, orange, red], { opacity: 0, duration: 0.18 });
        return;
      }
      gsap.to(orange, { x: -96, y: -54, rotate: -1.2, duration: 0.62, ease: EASE.snap });
      gsap.to(red, { x: 84, y: 62, rotate: 1, duration: 0.62, ease: EASE.snap });
      gsap.to(ink, {
        clipPath: 'inset(0% 0% 100% 0%)',
        duration: 0.5,
        ease: EASE.mechanical,
        delay: 0.1,
      });
    });

    return () => ctx.revert();
  }, [state, viewBox, reduced, readyRef]);

  const textProps = {
    x: 0,
    fontFamily: 'Rajdhani, Oswald, Arial Narrow, sans-serif',
    fontWeight: 700,
    fontSize: FONT_SIZE,
    letterSpacing: -7,
    dominantBaseline: 'alphabetic' as const,
  };

  /** One plate = the whole setting in a single ink. */
  const plate = (fill: string, first?: React.Ref<SVGTextElement>) =>
    lines.map((line, i) => (
      <text
        key={line}
        {...textProps}
        y={i * LINE_ADVANCE}
        ref={i === 0 ? first : undefined}
        fill={fill}
      >
        {line}
      </text>
    ));

  return (
    <svg
      ref={svgRef}
      className="wordmark"
      viewBox={viewBox ?? `0 0 1000 ${FONT_SIZE}`}
      preserveAspectRatio="xMinYMid meet"
      role="img"
      aria-label="Hi Anzy"
      data-measured={viewBox ? 'true' : 'false'}
      data-lines={lines.length}
    >
      {/* Colour plates print first and are overprinted by the black plate;
          multiply makes the overlaps behave like ink on stock. */}
      <g ref={orangeRef} className="wordmark__plate wordmark__plate--orange">
        {plate('var(--c-signal)')}
      </g>
      <g ref={redRef} className="wordmark__plate wordmark__plate--red">
        {plate('var(--c-signal-hot)')}
      </g>
      <g ref={inkGroupRef} className="wordmark__plate wordmark__plate--ink">
        {plate('var(--figure)', inkRef)}
      </g>
    </svg>
  );
}
