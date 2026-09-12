import { useCallback, useEffect, useRef, useState } from 'react';
import type { ObjectKind } from './notation';

/**
 * THE MEASUREMENT PASS.
 *
 * X-Ray measures the real document. It does not render a stylised copy of a
 * page and call it an inspection — every box, baseline and dimension drawn on
 * screen came out of getBoundingClientRect and getComputedStyle on a live node.
 * That honesty is the entire concept, and it is also why the overlays stay
 * correct at any viewport without a second layout system to keep in sync.
 *
 * One pass feeds every layer. Layers are pure functions of this array.
 */

export interface TypeMetrics {
  set: string;
  family: string;
  size: number;
  weight: string;
  lineHeight: number;
  tracking: string;
}

export interface MeasuredObject {
  id: number;
  el: HTMLElement;
  kind: ObjectKind;
  name: string;
  /** viewport-space box */
  x: number;
  y: number;
  w: number;
  h: number;
  /** DOM nesting depth relative to the measured root — used as the z index */
  depth: number;
  type?: TypeMetrics;
}

function readType(el: HTMLElement): TypeMetrics {
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize) || 0;
  const lhRaw = cs.lineHeight;
  const lineHeight = lhRaw === 'normal' ? size * 1.2 : parseFloat(lhRaw) || size * 1.2;
  const family = (cs.fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim();
  return {
    set: `${family.toUpperCase()} ${Math.round(size)}/${cs.fontWeight}`,
    family,
    size,
    weight: cs.fontWeight,
    lineHeight,
    tracking: cs.letterSpacing,
  };
}

function depthOf(el: HTMLElement, root: HTMLElement): number {
  let d = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    d++;
    node = node.parentElement;
  }
  return d;
}

export function useMeasure(
  rootRef: React.RefObject<HTMLElement | null>,
  active: boolean,
  /**
   * Changes when the measured DOM is replaced wholesale — X-Ray swapping its
   * subject, for instance. The observer below binds to the nodes that exist
   * when it runs, so without this a new subject's elements were never observed
   * and the object table described a tree that had been unmounted.
   */
  subjectKey: unknown = null,
): { objects: MeasuredObject[]; remeasure: () => void } {
  const [objects, setObjects] = useState<MeasuredObject[]>([]);
  const frameRef = useRef(0);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-xr]'));
    const next: MeasuredObject[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const r = el.getBoundingClientRect();
      // Skip anything with no area — a collapsed node is not an object.
      if (r.width < 1 || r.height < 1) continue;

      const kind = (el.dataset.xr ?? 'region') as ObjectKind;
      const name = el.dataset.xrName ?? el.tagName.toLowerCase();
      const wantsType = kind === 'display' || kind === 'body' || kind === 'mono';

      next.push({
        id: next.length + 1,
        el,
        kind,
        name,
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
        depth: depthOf(el, root),
        type: wantsType ? readType(el) : undefined,
      });
    }

    setObjects(next);
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

    // Fonts change metrics; a measurement taken before they resolve is wrong.
    document.fonts?.ready.then(schedule).catch(() => {});

    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    root.querySelectorAll<HTMLElement>('[data-xr]').forEach((el) => ro.observe(el));

    window.addEventListener('resize', schedule, { passive: true });
    root.addEventListener('scroll', schedule, { passive: true });

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      root.removeEventListener('scroll', schedule);
    };
  }, [active, rootRef, schedule, subjectKey]);

  return { objects, remeasure: schedule };
}

/** Topmost object containing a point. Deepest node wins, as in real hit-testing. */
export function hitTest(objects: MeasuredObject[], x: number, y: number): MeasuredObject | null {
  let best: MeasuredObject | null = null;
  for (const o of objects) {
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
      if (!best || o.depth > best.depth) best = o;
    }
  }
  return best;
}
