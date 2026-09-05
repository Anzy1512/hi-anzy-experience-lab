import { useCallback, useRef, type ReactNode } from 'react';

/**
 * A SHEET — the OS's window, and the reason this is not a desktop clone.
 *
 * A sheet is paper laid on an ink desk. It has a head (grab here), a plate
 * number, and a single control. No chrome buttons, no traffic lights, no
 * minimise, no maximise, no shadow pretending to be glass.
 *
 * Dragging writes `transform` straight to the element and commits once on
 * release, so a moving sheet never re-renders React and the pointer never
 * becomes application state.
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
  draggable: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMove: (x: number, y: number) => void;
  children: ReactNode;
}

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
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [draggable, onFocus],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.dx = e.clientX - d.px;
    d.dy = e.clientY - d.py;
    // Direct write. No state, no frame subscription, no re-render.
    const el = ref.current;
    if (el) el.style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0)`;
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      const el = ref.current;
      if (el) el.style.transform = '';
      if (d.dx || d.dy) onMove(x + d.dx, y + d.dy);
    },
    [onMove, x, y],
  );

  return (
    <section
      className="os-sheet"
      ref={ref}
      data-top={top ? 'true' : 'false'}
      style={{ left: x, top: y, width: w, maxHeight: maxH, zIndex: z }}
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
    </section>
  );
}
