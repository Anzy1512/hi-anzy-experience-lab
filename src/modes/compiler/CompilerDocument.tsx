import type { CanonicalPage } from '../../content/canonicalPages';
import { CANONICAL_PAGES_COMMIT } from '../../content/canonicalPages';
import { SpecimenPlate } from '../../components/Specimen/SpecimenPlate';
import type { CleanupScope } from '../../core/cleanup';

/**
 * THE DOCUMENT — a real Hi Anzy page, compilable.
 *
 * Real, semantic, accessible DOM — not a screenshot, not a texture, not a fake
 * page. This is the thing that gets compiled, and it is the thing that is still
 * on screen at the far end: the heading in the world *is* this `<h3>`, at a new z.
 *
 * Two attributes carry the whole spatial contract:
 *   data-cell   the element participates in compilation, and names itself
 *   data-plane  which depth plane it belongs to
 *
 * ── WHAT CHANGED, AND WHY IT MATTERS MORE THAN IT LOOKS ─────────────────────
 *
 * This used to compile an authored Lab composition — six stages named VISION,
 * STRATEGY, IDENTITY, DIGITAL, LAUNCH, GROWTH, under the title HI ANZY. That
 * content came from a printed deck the company no longer works to, so the one
 * reality whose entire subject is "here is a Hi Anzy page, taken apart" was
 * taking apart a page that had never existed and printing a retired methodology
 * while doing it.
 *
 * It now compiles pages that are actually shipped. Every heading, every line of
 * copy, every colour and every component name below was read out of the
 * commercial frontend's own source at a known commit — see
 * `scripts/capture-canonical-pages.mjs`, which reads `origin/main` read-only and
 * marks anything the page computes at runtime as ⟨DYNAMIC⟩ rather than
 * inventing a value for it.
 *
 * ── THE PLANES ARE THE PAGE'S OWN ───────────────────────────────────────────
 *
 * Reading order becomes depth order, exactly as before — but the order is no
 * longer one this Lab chose. It is the sequence the commercial page mounts its
 * own sections in, and where that page states the logic of a transition through
 * a `SectionConnector` ("SYMPTOM → QUESTION", "CAPABILITY → METHOD") the label
 * is carried onto the plane boundary. The corridor a visitor walks is the
 * argument the real page is already making, spatialised rather than authored.
 */

/** One owned specimen per page, so each compiles with real Hi Anzy imagery. */
const PAGE_FIGURE: Record<string, string> = {
  '/': 'pop-cube-thinker',
  '/what-we-do': 'char-fixer',
  '/how-we-work': 'pop-clock-watch',
  '/network': 'char-walkers',
  '/why-hi-anzy': 'char-visionary',
};

export function CompilerDocument({
  page,
  reduced,
  scope,
}: {
  page: CanonicalPage;
  reduced: boolean;
  scope: CleanupScope;
}) {
  const figure = PAGE_FIGURE[page.route] ?? 'pop-cube-thinker';

  /*
   * WHICH SECTIONS BECOME PLANES.
   *
   * A section with neither a heading nor a line of copy is a structural or
   * decorative mount — Home's `HalftoneBackdrop`, `HalftoneStatic` and
   * `PunRow`. There is nothing in it to read, so there is nothing to lift onto
   * a plane, and putting it on the sheet meant fifteen cards where twelve fit
   * and the last row fell off the bottom edge.
   *
   * They are not dropped. Every one of them is in the exported manifest with
   * its file and the reason, and the colophon says how many were set aside —
   * "this page has three parts I did not compile" is a fact about the page, and
   * silently showing twelve of fifteen would be the one dishonest thing this
   * mode could do.
   */
  const planes = page.sections.filter(
    (s) => s.headings.length > 0 || s.copy.length > 0 || s.data.length > 0,
  );
  const setAside = page.sections.length - planes.length;

  return (
    <article className="rc-doc" aria-label={`${page.name} — a compilable document`}>
      <header className="rc-doc__head" data-cell="MASTHEAD" data-plane="0" data-cell-kind="region">
        <p className="t-mono t-mono-xs rc-doc__plate">
          <span className="t-signal">{page.route}</span>
          <span className="t-faint"> / </span>
          {page.name}
        </p>
        <h2 className="t-display rc-doc__title" data-cell="TITLE" data-plane="0" data-cell-kind="display">
          {page.title ?? page.name}
        </h2>
      </header>

      {page.description && (
        <p className="t-body rc-doc__standfirst" data-cell="STANDFIRST" data-plane="1" data-cell-kind="body">
          {page.description}
        </p>
      )}

      <figure className="rc-doc__figure" data-cell="FIGURE" data-plane="2" data-cell-kind="figure">
        <SpecimenPlate
          id={figure}
          reduced={reduced}
          scope={scope}
          separation={0.7}
          width={250}
          maxHeight={230}
          marks={false}
          className="rc-doc__plate-img"
        />
        <figcaption className="t-mono t-mono-xs t-dim rc-doc__caption">
          FIG. — {figure.toUpperCase()} · HI ANZY'S OWN LIBRARY
        </figcaption>
      </figure>

      {/*
        THE SHEET TAKES THE PAGE'S OWN GRID.

        `auto-fit` sized cells to a minimum and then wrapped whatever did not
        fit onto a second row that fell off the bottom of the sheet. A column
        count is the right control here and there is an obvious correct value:
        the commercial page is built on twelve columns, every section below
        reports how many of them it spans, and the sheet it compiles from is
        already `repeat(12, 1fr)`. So the planes lie on the same twelve-column
        measure the page itself uses — fewer when a page has fewer parts, never
        more, and never a second row.
      */}
      <ol
        className="rc-doc__stages"
        style={{
          gridTemplateColumns: `repeat(${Math.min(planes.length, 12)}, minmax(0, 1fr))`,
        }}
      >
        {planes.map((s, i) => (
          <li
            className="rc-doc__stage"
            key={`${s.index}-${s.label}`}
            data-cell={`SECTION/${s.index}`}
            data-plane={String(3 + i)}
            data-cell-kind="region"
          >
            {/*
              The page's own word for this transition, where it has one. The
              slot is rendered on every plane, empty or not: printed only where
              a transition exists it pushed those three cells down and broke the
              alignment of all twelve, which made a row of equals look like an
              accident. Reserved, the row stays a row.
            */}
            <p className="t-mono t-mono-xs rc-doc__transition" aria-hidden="true">
              {s.transition ?? ''}
            </p>
            <span className="t-mono t-mono-xs t-dim rc-doc__stage-n" aria-hidden="true">
              {s.index}
            </span>
            <h3 className="t-display t-display-m rc-doc__stage-name">{s.label}</h3>

            {s.headings[0] && <p className="t-body rc-doc__stage-line">{s.headings[0].text}</p>}
            {!s.headings[0] && s.copy[0] && (
              <p className="t-body rc-doc__stage-line">{s.copy[0]}</p>
            )}
            {/* A section whose copy is not literal says what fills it instead
                of showing a blank. These are canonical exports the Lab already
                mirrors, so the chain is checkable end to end. */}
            {!s.headings[0] && !s.copy[0] && s.data.length > 0 && (
              <p className="t-body-s t-dim rc-doc__stage-line">
                Rendered from {s.data.join(', ')}
              </p>
            )}

            {/*
              PROVENANCE, ON EVERY SECTION.

              The whole claim of this mode is that a real page is being taken
              apart. A claim like that is worth nothing unless a visitor can
              check it, so each plane names the file it came from, the grid it
              spans, the ground it sits on, and the typographic roles it uses —
              all of it read from the source rather than described.
            */}
            <p className="t-mono t-mono-xs t-dim rc-doc__prov">
              {s.read ? s.source : `${s.source} — NOT READ`}
              {s.columns ? ` · ${s.columns}-COL` : ''}
              {` · ${s.ground}`}
              {s.roles.length ? ` · ${s.roles.map((r) => r.split(' ')[0]).join('+')}` : ''}
              {s.data.length && (s.headings[0] || s.copy[0]) ? ` · DATA ${s.data.join('+')}` : ''}
            </p>
            {s.colours.length > 0 && (
              <p className="rc-doc__swatches" aria-hidden="true">
                {s.colours.slice(0, 5).map((c) => (
                  <span key={c} className="rc-doc__swatch" style={{ background: c }} title={c} />
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>

      <p className="t-mono t-mono-xs t-dim rc-doc__colophon">
        READ FROM {page.file} @ {CANONICAL_PAGES_COMMIT} · {planes.length} OF{' '}
        {page.sections.length} PARTS COMPILED
        {setAside > 0
          ? ` · ${setAside} CARRY NO READABLE CONTENT AND ARE IN THE MANIFEST ONLY`
          : ''}{' '}
        · STRUCTURAL READ, NOT A SCREENSHOT
      </p>
    </article>
  );
}
