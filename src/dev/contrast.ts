/**
 * THE LIVE CONTRAST INSTRUMENT — development only.
 *
 *   window.__labContrast.audit()   every visible text run on this screen
 *   window.__labContrast.report()  the same, as a printable table
 *
 * ── WHY A LIVE ONE WHEN `scripts/check-contrast.mjs` EXISTS ─────────────────
 *
 * They answer different questions and Phase 8.6 E needed both.
 *
 * The script reads `tokens.css` and proves the SYSTEM is sound: every semantic
 * pair the design system declares clears AA. It cannot know whether a mode
 * actually uses the token it should, whether a fixed strip ended up over a dark
 * aperture at some viewport, or whether a label inherited a colour from three
 * ancestors away. Those are properties of a rendered screen, not of a
 * stylesheet, and every real defect this milestone found was one of them.
 *
 * ── WHY IT IS HARDER THAN IT LOOKS ──────────────────────────────────────────
 *
 * "What is behind this text" has three wrong answers that all seem right:
 *
 *   1. The nearest ancestor with a background. Wrong here — the Lab paints
 *      grounds with absolutely positioned SIBLINGS (Portal's aperture interior
 *      sits behind the carried section, not above it in the tree), so an
 *      ancestor walk reported legible bone-on-dark as bone-on-bone.
 *   2. `backgroundColor`. Wrong — several grounds are gradients, which read as
 *      `rgba(0, 0, 0, 0)` and look transparent.
 *   3. `elementsFromPoint` alone. Wrong — it honours `pointer-events: none`,
 *      and the Lab uses that on exactly the layers that paint those grounds.
 *
 * So: hit-test with pointer-events temporarily neutralised, read gradients as
 * well as fills, and consider each candidate's own ::before/::after — skipping
 * a pseudo that has been transformed away, because Portal's cut sheet is two
 * halves that withdraw and a withdrawn half is not a ground.
 *
 * The lightest opaque stop of a gradient is taken, which is the worst case for
 * light type and the best for dark: a pass is a pass across the whole sweep.
 */

export interface ContrastFailure {
  text: string;
  className: string;
  colour: string;
  ground: string;
  fontSize: number;
  ratio: number;
  need: number;
  /** Punctuation and `t-faint` furniture. Measured, never a failure. */
  decorative: boolean;
}

export interface ContrastAudit {
  viewport: string;
  /** Text runs actually on screen and visible. */
  checked: number;
  failures: ContrastFailure[];
  decorativeBelowAA: number;
  horizontalOverflow: boolean;
  overflowing: { className: string; right: number }[];
  /** Controls under 28px on either axis. Touch is a first-class model here. */
  tinyTargets: { text: string; w: number; h: number }[];
}

type RGBA = [number, number, number, number];

function parse(c: string): RGBA | null {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

function luminance([r, g, b]: RGBA): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function over(fg: RGBA, bg: RGBA): RGBA {
  if (fg[3] >= 1) return fg;
  const mix = (i: number) => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  return [mix(0), mix(1), mix(2), 1];
}

function ratio(a: RGBA, b: RGBA): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The lightest opaque stop of a gradient, or null if this is not one. */
function gradient(image: string): RGBA | null {
  if (!image || image === 'none' || !image.includes('gradient')) return null;
  const stops = [...image.matchAll(/rgba?\([^)]+\)/g)]
    .map((m) => parse(m[0]))
    .filter((c): c is RGBA => Boolean(c) && c![3] > 0.85);
  if (!stops.length) return null;
  return stops.reduce((a, b) => (luminance(b) > luminance(a) ? b : a));
}

const UNTRANSFORMED = /matrix\(1, 0, 0, 1, 0, 0\)/;

/** What this one element paints, counting its own pseudo-elements. */
function painted(n: Element): RGBA | null {
  const cs = getComputedStyle(n);
  const own = parse(cs.backgroundColor);
  if (own && own[3] > 0.85) return own;
  const g = gradient(cs.backgroundImage);
  if (g) return g;
  for (const which of ['::before', '::after'] as const) {
    const ps = getComputedStyle(n, which);
    if (ps.content === 'none' || ps.position === 'static') continue;
    if (ps.transform && ps.transform !== 'none' && !UNTRANSFORMED.test(ps.transform)) continue;
    const c = parse(ps.backgroundColor);
    if (c && c[3] > 0.85) return c;
    const pg = gradient(ps.backgroundImage);
    if (pg) return pg;
  }
  return null;
}

export function audit(): ContrastAudit {
  /* pointer-events: none hides real grounds from the hit test. Lift it, and put
     every inline style back exactly as it was — including removing the property
     from elements that never had one. */
  const muted = [...document.querySelectorAll<HTMLElement>('body *')].filter(
    (e) => getComputedStyle(e).pointerEvents === 'none',
  );
  const before = muted.map((e) => e.style.pointerEvents);
  muted.forEach((e) => {
    e.style.pointerEvents = 'auto';
  });

  try {
    /**
     * The ground behind one element.
     *
     * A hit test only tells the truth at a point that is actually ON the
     * element, and a bounding rect is not that point when the element is
     * ROTATED — which in this Lab is common: the OS lays its sheets on the
     * bench at angles, Dream and Chaos throw fragments, the spatial modes
     * transform their whole label layer. The first version of this sampled the
     * middle of the bounding box, missed every rotated element, and reported
     * ink-on-bone at 10.3:1 as 1.2:1 because the ray had landed on the dark
     * bench beside the sheet rather than on the sheet.
     *
     * So: try several points, accept only one that genuinely hits this element,
     * and when none do — a fully occluded or very thin run — fall back to
     * walking the ancestors, which is right for exactly that case because a
     * transformed element is painted on the parent that transformed it.
     */
    const groundAt = (el: Element, r: DOMRect): RGBA => {
      /* An element that paints its OWN opaque background is the ground for its
         own text, and nothing behind it is. Matter's active control is orange
         with ink on it; scored against the stage it sits on, that ink read as
         1.33:1 — a failure invented entirely by looking past the button. */
      const self = painted(el);
      if (self) return self;
      const clamp = (v: number, hi: number) => Math.min(Math.max(v, 1), hi - 1);
      const points: [number, number][] = [
        [r.left + Math.min(r.width / 2, 12), r.top + r.height / 2],
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + r.width * 0.25, r.top + r.height * 0.5],
        [r.left + r.width * 0.75, r.top + r.height * 0.5],
        [r.left + 2, r.top + 2],
      ];
      for (const [px0, py0] of points) {
        const x = clamp(px0, innerWidth);
        const y = clamp(py0, innerHeight);
        const stack = document.elementsFromPoint(x, y);
        const i = stack.findIndex((n) => n === el || el.contains(n));
        if (i < 0) continue; // this ray missed the element entirely
        for (const n of stack.slice(i + 1)) {
          if (el.contains(n)) continue;
          const c = painted(n);
          if (c) return c;
        }
      }
      for (let n = el.parentElement; n; n = n.parentElement) {
        const c = painted(n);
        if (c) return c;
      }
      return parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1];
    };

    /**
     * Is this run actually on screen, or only in the layout?
     *
     * A rect is not visibility. Anzy.OS scrolls a long list inside a sheet, and
     * the rows below the fold still have rects — rects that lie over the dark
     * bench beside the sheet, because the sheet clips them and the bench does
     * not. Scored naively that produced ninety-four failures in a mode where a
     * screenshot shows every line crisply legible on bone: the instrument was
     * measuring ink against a ground the reader never sees it on.
     *
     * The same shape appears in Sonic's datum column, Time Machine's frames and
     * X-Ray's patch list. So: anything clipped out of a scrolling ancestor is
     * not on screen and is not audited.
     */
    const clipped = (el: Element, r: DOMRect): boolean => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (!/auto|scroll|hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
        const c = n.getBoundingClientRect();
        if (r.bottom <= c.top + 1 || r.top >= c.bottom - 1) return true;
        if (r.right <= c.left + 1 || r.left >= c.right - 1) return true;
      }
      return false;
    };

    const failures: ContrastFailure[] = [];
    const overflowing: ContrastAudit['overflowing'] = [];
    const tinyTargets: ContrastAudit['tinyTargets'] = [];
    let checked = 0;

    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.u-sr')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;

      /* Only elements with their OWN text, so a wrapper is not scored for the
         colour of a child it never set. */
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === 3 && n.textContent?.trim())
        .map((n) => n.textContent!.trim())
        .join(' ');
      if (!text) continue;

      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom < 1 || r.top > innerHeight - 1 || r.right < 1 || r.left > innerWidth - 1) continue;
      if (clipped(el, r)) continue;
      checked++;

      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = groundAt(el, r);

      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      const value = ratio(over(fg, bg), bg);
      if (value >= need) continue;

      const className = String((el as HTMLElement).className || '');
      failures.push({
        text: text.slice(0, 48),
        className: className.slice(0, 40),
        colour: cs.color,
        ground: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
        fontSize: size,
        ratio: Number(value.toFixed(2)),
        need,
        decorative:
          /t-faint/.test(className) || text.replace(/[·/|—–\-+.,:()]/g, '').trim() === '',
      });
    }

    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 2 && getComputedStyle(el).position !== 'fixed') {
        overflowing.push({
          className: String((el as HTMLElement).className || el.tagName).slice(0, 40),
          right: Math.round(r.right),
        });
      }
    }

    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;
      if (r.width < 28 || r.height < 28) {
        tinyTargets.push({
          text: (el.textContent ?? '').trim().slice(0, 24),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }

    const real = failures.filter((f) => !f.decorative);
    return {
      viewport: `${innerWidth}x${innerHeight}`,
      checked,
      failures: real,
      decorativeBelowAA: failures.length - real.length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      overflowing: overflowing.slice(0, 8),
      tinyTargets: tinyTargets.slice(0, 8),
    };
  } finally {
    muted.forEach((e, i) => {
      if (before[i]) e.style.pointerEvents = before[i];
      else e.style.removeProperty('pointer-events');
    });
  }
}

/** One line per failure, for reading rather than for parsing. */
export function report(): string {
  const a = audit();
  const head =
    `${a.viewport} · ${a.checked} text runs · ${a.failures.length} below AA · ` +
    `${a.decorativeBelowAA} decorative · overflow ${a.horizontalOverflow ? 'YES' : 'no'}`;
  if (!a.failures.length) return `${head}\nnothing information-bearing is below AA.`;
  return [
    head,
    ...a.failures.map(
      (f) =>
        `  ${String(f.ratio).padStart(6)}:1 need ${f.need}  ${String(f.fontSize).padStart(4)}px  ` +
        `${f.colour} on ${f.ground}  ${f.className}  "${f.text}"`,
    ),
  ].join('\n');
}

declare global {
  interface Window {
    __labContrast?: {
      audit: () => ContrastAudit;
      report: () => string;
    };
  }
}

/** Called by the overlay on mount; never at module scope. */
export function installContrastApi(): () => void {
  window.__labContrast = { audit, report };
  return () => {
    delete window.__labContrast;
  };
}
