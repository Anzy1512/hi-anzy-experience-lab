import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from './projection';

/**
 * THE SPATIAL MEASUREMENT BRIDGE.
 *
 * Reality Compiler needs each cell's **layout** box — where the element sits in
 * the flat document — and it needs that box to stay valid while the element is
 * being transformed into depth.
 *
 * `getBoundingClientRect()` cannot do this. It reports the *transformed* box, so
 * the moment compilation starts, measuring a cell returns the position
 * compilation just gave it: the system would be reading its own output and
 * drifting a little further every frame.
 *
 * `offsetLeft/offsetTop/offsetWidth/offsetHeight` are immune to CSS transforms.
 * Walking the offsetParent chain up to the document root therefore yields the
 * untransformed layout rect at any point during the compilation, which is
 * exactly the invariant the spatial mapping needs.
 *
 * (X-Ray keeps its own `useMeasure`: it deliberately wants the *rendered* rect,
 * because it is instrumenting what is actually on screen. Different question,
 * different tool — sharing one would make both wrong.)
 */

export interface SpatialCell {
  id: number;
  el: HTMLElement;
  /** Semantic name from `data-cell`, e.g. "TITLE", "STAGE/03". */
  key: string;
  /** Depth plane index from `data-plane`. Cells on a plane travel together. */
  plane: number;
  /** Coarse type from `data-cell-kind`: display | body | mono | figure | rule. */
  kind: string;
  /** Untransformed layout rect, relative to the measured root. */
  rect: Rect;
}

/** Layout position of `el` relative to `root`, ignoring any CSS transforms. */
function offsetRectWithin(el: HTMLElement, root: HTMLElement): Rect {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;

  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    // Scroll inside an intermediate container still shifts layout position.
    if (parent && parent !== root) {
      x -= parent.scrollLeft;
      y -= parent.scrollTop;
    }
    node = parent;
  }

  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function useSpatialCells(
  rootRef: React.RefObject<HTMLElement | null>,
  active: boolean,
): { cells: SpatialCell[]; rootRect: Rect; remeasure: () => void } {
  const [cells, setCells] = useState<SpatialCell[]>([]);
  const [rootRect, setRootRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const frameRef = useRef(0);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    // The root is never transformed, so its client rect *is* its layout box and
    // is the one place we need viewport-space coordinates.
    const rr = root.getBoundingClientRect();
    setRootRect({ x: rr.left, y: rr.top, w: rr.width, h: rr.height });

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-cell]'));
    const next: SpatialCell[] = [];

    for (const el of nodes) {
      const rect = offsetRectWithin(el, root);
      if (rect.w < 1 || rect.h < 1) continue;
      next.push({
        id: next.length + 1,
        el,
        key: el.dataset.cell ?? el.tagName.toLowerCase(),
        plane: Number(el.dataset.plane ?? '0') || 0,
        kind: el.dataset.cellKind ?? 'body',
        rect,
      });
    }

    setCells(next);
  }, [rootRef]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;

    schedule();
    // Metrics taken before the webfonts resolve are wrong, and this composition
    // is entirely typographic.
    void document.fonts?.ready.then(schedule).catch(() => {});

    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [active, rootRef, schedule]);

  return { cells, rootRect, remeasure: schedule };
}
