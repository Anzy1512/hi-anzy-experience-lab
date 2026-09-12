import type { CanonicalPage } from '../../content/canonicalPages';
import { CANONICAL_PAGES_COMMIT } from '../../content/canonicalPages';

/**
 * A CANONICAL SUBJECT — a real Hi Anzy page, laid out to be measured.
 *
 * ── WHY THE INSTRUMENT NEEDED ONE ───────────────────────────────────────────
 *
 * X-Ray's measurement was always honest: every number it prints comes off a
 * live node, and nothing in the diagnostics is hand-authored. What it was
 * honest *about* was a specimen sheet this Lab composed for it — a real
 * composition with a real grid, but one whose only reason to exist was to be
 * measured. An instrument pointed at a test card tells you the instrument
 * works. It does not tell you anything about the company.
 *
 * This is the other subject: the section structure of a page that is actually
 * shipped, read from the commercial frontend's own source at a known commit.
 * The measurements are exactly as real as they were — X-Ray reads these nodes,
 * not this file — but now the thing under the lens is Hi Anzy's own work.
 *
 * ── TWO KINDS OF TRUTH ON ONE SCREEN, KEPT APART ────────────────────────────
 *
 * Everything here carries its origin:
 *
 *   SOURCED    quoted from `frontend/src/...` at ${commit}. Copy, headings,
 *              section names, the colours, the component names, the grid span.
 *   MEASURED   produced by X-Ray from this DOM, live, in this browser — box,
 *              position, depth, type metrics.
 *
 * Those must never be allowed to blur. A section's twelve-column span is a fact
 * about the commercial page; the width in pixels of the card representing it
 * here is a fact about this window, and means nothing about the real site. The
 * report this mode exports states which is which on every line, and this
 * component's own caption says it outright.
 */

export function CanonicalSubject({ page }: { page: CanonicalPage }) {
  const planes = page.sections.filter(
    (s) => s.headings.length > 0 || s.copy.length > 0 || s.data.length > 0,
  );

  return (
    <article className="xr-spec xr-canon" data-xr="region" data-xr-name={`PAGE ${page.route}`}>
      <header className="xr-spec__head" data-xr="region" data-xr-name="MASTHEAD">
        <p className="t-mono t-mono-xs xr-spec__kicker" data-xr="mono" data-xr-name="ROUTE">
          <span className="t-signal">{page.route}</span>
          <span className="t-faint"> / </span>
          {page.name}
        </p>
        <h2
          className="t-display t-display-l xr-spec__title xr-canon__title"
          data-xr="display"
          data-xr-name="PAGE TITLE"
        >
          {page.title ?? page.name}
        </h2>
        {page.description && (
          <p className="t-body xr-spec__subtitle" data-xr="body" data-xr-name="META DESCRIPTION">
            {page.description}
          </p>
        )}
      </header>

      {/* One row, on the page's own twelve-column measure. `auto-fit` wrapped
          twelve sections onto a second row that ran under the fixed instrument
          band, where the overlays drew boxes around elements nobody could see. */}
      <ol
        className="xr-canon__sections"
        style={{
          gridTemplateColumns: `repeat(${Math.min(planes.length, 12)}, minmax(0, 1fr))`,
        }}
      >
        {planes.map((s) => (
          <li
            key={`${s.index}-${s.label}`}
            className="xr-canon__section"
            data-xr="region"
            /*
             * Short on purpose. The overlay prints this name above the object's
             * box, and twelve sections on a twelve-column measure give each box
             * about 110px — "SECTION 03 HERO" is wider than that, so every label
             * in the row printed through its neighbours. `S03 HERO` fits.
             */
            data-xr-name={`S${s.index} ${s.label}`}
          >
            {/* The index, provenance and swatches are annotation rather than
                composition: marking them made sixty measurable objects out of a
                twelve-part page and buried the structure the instrument is for. */}
            <p className="t-mono t-mono-xs t-dim xr-canon__n">
              {s.index}
              {s.transition ? ` · ${s.transition}` : ''}
            </p>
            <h3
              className="t-display t-display-s xr-canon__name"
              data-xr="display"
              data-xr-name={s.label}
            >
              {s.label}
            </h3>
            {(s.headings[0]?.text ?? s.copy[0]) && (
              <p className="t-body-s xr-canon__copy">
                {s.headings[0]?.text ?? s.copy[0]}
              </p>
            )}
            {/*
              Sourced facts about the real page. Deliberately set in the
              instrument's voice but marked SOURCED, because everything else in
              that voice on this screen was measured here — and the difference
              between "the real page spans twelve columns" and "this card is
              214px wide" is the whole integrity of the mode.
            */}
            <p className="t-mono t-mono-xs t-dim xr-canon__prov">
              SOURCED · {s.source}
              {s.columns ? ` · ${s.columns}-COL` : ''}
              {` · ${s.ground}`}
              {s.data.length ? ` · ${s.data.join('+')}` : ''}
            </p>
            {s.colours.length > 0 && (
              <p className="xr-canon__swatches" aria-hidden="true">
                {s.colours.slice(0, 5).map((c) => (
                  <span key={c} className="xr-canon__swatch" style={{ background: c }} title={c} />
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>

      <p className="t-mono t-mono-xs t-dim xr-canon__foot" data-xr="mono" data-xr-name="COLOPHON">
        SOURCED FROM {page.file} @ {CANONICAL_PAGES_COMMIT} · BOXES AND TYPE METRICS ARE MEASURED
        IN THIS WINDOW AND DESCRIBE THIS LAYOUT, NOT THE LIVE SITE&apos;S
      </p>
    </article>
  );
}
