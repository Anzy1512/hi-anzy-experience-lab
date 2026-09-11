import { useCallback, useRef, type ReactNode } from 'react';
import type { SheetStock } from '../../content/os';

/**
 * A SHEET — the OS's window, and the reason this is not a desktop clone.
 *
 * A sheet is paper laid on an ink desk. It has a head (grab here), a plate
 * number, and a single control. No chrome buttons, no traffic lights, no
 * minimise, no maximise, no shadow pretending to be glass.
 *
 * ── WHAT PHASE 6.5 ADDED ────────────────────────────────────────────────────
 *
 * The concept was right and the execution was a rectangle. A sheet now has the
 * three things a physical sheet has and this one did not:
 *
 * **A stock.** `SheetStock` says what the paper is — tracing, mount board,
 * engineering grid, a printed screen, a punched leaf, plain, or a docket roll.
 * Seven applications, seven materials, distinguished by pattern and weight and
 * never by hue. The bench can be read before it is read.
 *
 * **A thickness and a contact.** Two shadows instead of one: a tight dark
 * contact where the paper meets the bench, and a wide soft ambient above it.
 * Plus a lit top edge and a shadowed bottom edge, which is what an actual
 * sheet's cut edge does under a lamp coming from above.
 *
 * **A register.** Every sheet is punched for a register bar. The sheet you are
 * working on is *seated* on the pins: square, at the working plane, tight
 * contact shadow. The sheets behind it are off the pins — a fraction of a
 * degree out of square, pushed back in depth, their contact softened. Focusing
 * a sheet is therefore not a fade: it is a registration event, and the ones it
 * displaces go off-square as it seats.
 *
 * ── WHY THE TRANSFORM IS COMPOSED FROM CUSTOM PROPERTIES ────────────────────
 *
 * Dragging still writes to the element directly and commits once on release, so
 * a moving sheet never re-renders React and the pointer never becomes
 * application state. But depth and register rotation are CSS's business, and a
 * drag that wrote `transform` wholesale would flatten both. So the drag writes
 * `--sh-dx/--sh-dy` and CSS composes translate × depth × rotation. `data-drag`
 * suspends the transform transition for the duration, or the sheet would ease
 * along behind the pointer.
 */

export interface SheetProps {
  plate: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  w: number;
  /** Bench height available below this sheet's top edge. */
  maxH: number;
  z: number;
  top: boolean;
  /**
   * How far back in the stack this sheet is. 0 is the working plane.
   *
   * Drives depth and how far off the register pins the sheet sits — the two
   * cues that turn an overlapping pile into a bench with things on it.
   */
  depth: number;
  stock: SheetStock;
  draggable: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMove: (x: number, y: number) => void;
  children: ReactNode;
}

/** Depth step and register slip per sheet behind the working plane. */
const Z_STEP = 15;
const SLIP = 0.34;
/** Beyond this the stack stops receding: a bench is shallow, not a corridor. */
const MAX_DEPTH = 5;

export function Sheet({
  plate,
  title,
  subtitle,
  x,
  y,
  w,
  maxH,
  z,
  top,
  depth,
  stock,
  draggable,
  onFocus,
  onClose,
  onMove,
  children,
}: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef({ active: false, px: 0, py: 0, dx: 0, dy: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      onFocus();
      if (!draggable) return;
      if ((e.target as HTMLElement).closest('button')) return;
      const d = drag.current;
      d.active = true;
      d.px = e.clientX;
      d.py = e.clientY;
      d.dx = 0;
      d.dy = 0;
      // Suspend the transform transition, or the sheet eases along behind the
      // pointer instead of being held by it.
      ref.current?.setAttribute('data-drag', 'true');
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [draggable, onFocus],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.dx = e.clientX - d.px;
    d.dy = e.clientY - d.py;
    // Direct write. No state, no frame subscription, no re-render — and two
    // properties rather than the whole transform, so depth and register survive.
    const el = ref.current;
    if (el) {
      el.style.setProperty('--sh-dx', `${d.dx}px`);
      el.style.setProperty('--sh-dy', `${d.dy}px`);
    }
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      const el = ref.current;
      if (el) {
        el.style.removeProperty('--sh-dx');
        el.style.removeProperty('--sh-dy');
        el.removeAttribute('data-drag');
      }
      if (d.dx || d.dy) onMove(x + d.dx, y + d.dy);
    },
    [onMove, x, y],
  );

  const back = Math.min(depth, MAX_DEPTH);

  return (
    <section
      className="os-sheet"
      ref={ref}
      data-top={top ? 'true' : 'false'}
      data-stock={stock}
      style={{
        left: x,
        top: y,
        width: w,
        maxHeight: maxH,
        zIndex: z,
        /* Depth and register slip. The slip alternates so a stack fans rather
           than leaning — paper pushed aside goes both ways. */
        ['--sh-z' as string]: `${-back * Z_STEP}px`,
        ['--sh-rot' as string]: `${back === 0 ? 0 : (back % 2 ? 1 : -1) * SLIP * back}deg`,
      }}
      aria-label={title}
      onPointerDownCapture={onFocus}
    >
      <div
        className="os-sheet__head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-grab={draggable ? 'true' : 'false'}
      >
        {/* Punched for the register bar. Two holes, because one is a hole and
            two are a registration — you cannot locate a sheet on one pin. */}
        <span className="os-sheet__punch" aria-hidden="true">
          <i />
          <i />
        </span>
        <span className="t-mono t-mono-xs os-sheet__plate">{plate}</span>
        <h3 className="t-mono t-mono-s os-sheet__title">{title}</h3>
        {subtitle && <span className="t-mono t-mono-xs t-faint os-sheet__sub">{subtitle}</span>}
        <button
          type="button"
          className="os-sheet__close t-mono t-mono-xs"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          CLOSE
        </button>
      </div>
      <div className="os-sheet__body">{children}</div>
      {/* Trim ticks at the foot. Two, not four: a full box is a frame around a
          picture, and this is stock that has been cut to size. */}
      <span className="os-sheet__trim" aria-hidden="true" />
    </section>
  );
}
