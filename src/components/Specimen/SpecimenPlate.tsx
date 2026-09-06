import { useEffect, useRef } from 'react';
import { onFrame } from '../../core/raf';
import type { CleanupScope } from '../../core/cleanup';
import { pointer } from '../../core/pointer';
import { specimen, specimenSrc } from '../../content/specimens';
import './specimen.css';

/**
 * SPECIMEN_PLATE — a collage, taken apart.
 *
 * ── THE IDEA ────────────────────────────────────────────────────────────────
 *
 * Hi Anzy's brand images are photomontage: a cut-out figure, an object where
 * the head should be, a halftone paper ground, sometimes a signal shape. They
 * were assembled from separate pieces of paper and then flattened by a camera.
 *
 * This puts the space back. Not a depth map, not a displacement field, not a
 * point cloud — those would be inventing depth *inside* a photograph that
 * never had any. What this restores is the depth *between the collage's own
 * layers*, which genuinely existed when somebody cut them out and laid them
 * down. The ground goes back, the figure sits above it on its own plane and
 * casts a real edge shadow, the marks come forward.
 *
 * That distinction is the whole reason this is not a stock parallax effect: it
 * is specific to how these particular images were actually made.
 *
 * ── WHY CSS AND NOT WEBGL ───────────────────────────────────────────────────
 *
 * `spatial/projection.ts` exists because a CSS `perspective: P` container and a
 * Three camera at distance P produce identical projections. Three or four
 * planes with `translateZ` is precisely the case that contract was written for.
 * A renderer here would buy nothing, cost a GPU context in modes that need none
 * (Director is DOM; Memory already has its own canvas), and — the part that
 * actually matters — would turn a real `<img>` with real alt text into a
 * texture, which is the one thing the DOM/WebGL twin rule forbids.
 *
 * ── SCALE ───────────────────────────────────────────────────────────────────
 *
 * Never drawn larger than native. `MotifFrame.js` on the commercial site says
 * why: "reproducing scanned pop-art collage at hero scale would look like a
 * screenshot of a PDF." At specimen scale the halftone rosette and the
 * scissored edge read as material rather than as resolution failure.
 *
 * ── COST ────────────────────────────────────────────────────────────────────
 *
 * One `<img>` (10–58 kB AVIF, `loading="lazy"`, `decoding="async"`) and three
 * empty elements. The frame subscription exists only while a pointer is
 * actually moving over the plate and unsubscribes when it settles, so a
 * specimen sitting on screen costs nothing.
 */

interface Props {
  /** A `SPECIMENS` id. */
  id: string;
  /** Reduced motion arrives explicitly, never inferred from a quality tier. */
  reduced: boolean;
  scope: CleanupScope;
  /** How far the planes separate, 0..1. Directors hold plates flatter than archives do. */
  separation?: number;
  /** Drawn width in px. Clamped to the specimen's native width — never upscaled. */
  width?: number;
  /**
   * Height ceiling in px, if the frame has one.
   *
   * The set runs from 583px tall to 980px, so a single width produces plates of
   * wildly different heights — `char-walkers` at width 340 came out 638px tall
   * and filled a 900px frame edge to edge with its caption crushed underneath.
   * A specimen is a thing held in a frame with room around it, so callers that
   * have a frame say how tall it may be and the width follows.
   */
  maxHeight?: number;
  /** Marks drawn on the near plane. Registration furniture, not decoration. */
  marks?: boolean;
  /**
   * Angles, when the caller owns them.
   *
   * Omitted, the plate answers the pointer — an archive is something you lean
   * over. Supplied, it does not subscribe to the frame loop at all, because a
   * film is not something you tilt: Director drives these from the shot's own
   * progress so the plate moves with the cut rather than with the mouse. One
   * primitive, two legitimate ways to be driven.
   */
  tilt?: { rx: number; ry: number };
  className?: string;
}

export function SpecimenPlate({
  id,
  reduced,
  scope,
  separation = 1,
  width,
  marks = true,
  maxHeight,
  tilt,
  className = '',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spec = specimen(id);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced || tilt) return;

    /*
     * The plate answers the pointer, and stops when the pointer does.
     *
     * Weighted rather than tracking: paper has mass, and a plate that snapped
     * to the cursor would read as a hover effect rather than as an object
     * being tilted. `k` is the same damping the spatial layer uses.
     */
    let rx = 0;
    let ry = 0;
    let lastX = -1;
    let lastY = -1;
    let still = 0;

    const stop = onFrame((dt) => {
      const moved = Math.abs(pointer.nx - lastX) > 0.0008 || Math.abs(pointer.ny - lastY) > 0.0008;
      lastX = pointer.nx;
      lastY = pointer.ny;
      still = moved ? 0 : still + dt;

      // Settled and level: nothing left to compute until the visitor moves.
      if (still > 900 && Math.abs(rx) < 0.02 && Math.abs(ry) < 0.02) return;

      const k = 1 - Math.exp(-dt / 190);
      const tx = still > 900 ? 0 : (pointer.ny - 0.5) * -7 * separation;
      const ty = still > 900 ? 0 : (pointer.nx - 0.5) * 9 * separation;
      rx += (tx - rx) * k;
      ry += (ty - ry) * k;

      root.style.setProperty('--sp-rx', `${rx.toFixed(3)}deg`);
      root.style.setProperty('--sp-ry', `${ry.toFixed(3)}deg`);
    });

    scope.add(stop);
    return stop;
  }, [reduced, scope, separation, tilt]);

  if (!spec) return null;

  /* Fit inside both ceilings, never above native. Width follows height when
     the frame is the tighter constraint, which for this set it usually is. */
  const byWidth = Math.min(width ?? spec.w, spec.w);
  const byHeight = maxHeight ? (maxHeight / spec.h) * spec.w : Infinity;
  const w = Math.round(Math.min(byWidth, byHeight, spec.w));
  const h = Math.round((w / spec.w) * spec.h);

  return (
    <figure
      className={`spec ${className}`}
      ref={rootRef}
      style={{
        width: `${w}px`,
        ['--sp-sep' as string]: String(separation),
        /* When the caller owns the angles they are written here; when the
           pointer owns them the effect writes the same two properties. */
        ...(tilt ? { ['--sp-rx' as string]: `${tilt.rx}deg`, ['--sp-ry' as string]: `${tilt.ry}deg` } : null),
      }}
      data-family={spec.family}
    >
      {/* GROUND. The halftone field the collage was laid on, furthest back and
          drawn rather than photographed — the Lab already owns this material,
          and generating it means the plane can be lit and cut independently of
          whatever the scan happened to capture. */}
      <span className="spec__ground" aria-hidden="true" />

      {/* FIGURE. The image itself, on its own plane, casting the edge shadow a
          piece of paper resting on another piece of paper actually casts. */}
      <span className="spec__figure" style={{ height: `${h}px` }}>
        <img
          className="spec__img"
          src={specimenSrc(spec.id)}
          width={spec.w}
          height={spec.h}
          loading="lazy"
          decoding="async"
          alt={
            spec.instead
              ? `${spec.subject} Where the head would be: ${spec.instead}.`
              : spec.subject
          }
        />
      </span>

      {/* MARKS. Nearest plane. Trim corners and the accession line — the
          furniture that says this is a specimen being examined rather than a
          picture being shown. */}
      {marks && (
        <span className="spec__marks" aria-hidden="true">
          <span className="spec__corner spec__corner--tl" />
          <span className="spec__corner spec__corner--br" />
        </span>
      )}
    </figure>
  );
}
