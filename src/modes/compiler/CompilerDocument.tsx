import { COMPILER_DOC } from '../../content/compiler';
import { ContourPlate } from '../../graphics/ContourPlate';

/**
 * THE DOCUMENT.
 *
 * Real, semantic, accessible DOM — not a screenshot, not a texture, not a fake
 * page. This is the thing that gets compiled, and it is the thing that is still
 * on screen at the far end: the title in the world *is* this `<h2>`, at a new z.
 *
 * Two attributes carry the whole spatial contract:
 *   data-cell   the element participates in compilation, and names itself
 *   data-plane  which depth plane it belongs to
 *
 * Planes are assigned so that reading order becomes depth order. The six method
 * stages take planes 3–8 in sequence, which is what turns the list into a
 * corridor. Nothing about that ordering is decorative — it is the document's own
 * structure, read as space.
 *
 * If compilation never ran, this would still be a composed editorial sheet.
 */

export function CompilerDocument() {
  return (
    <article className="rc-doc" aria-label="The method — a compilable document">
      <header className="rc-doc__head" data-cell="MASTHEAD" data-plane="0" data-cell-kind="region">
        <p className="t-mono t-mono-xs rc-doc__plate">
          <span className="t-signal">{COMPILER_DOC.plate}</span>
          <span className="t-faint"> / </span>
          {COMPILER_DOC.kicker}
        </p>
        <h2 className="t-display rc-doc__title" data-cell="TITLE" data-plane="0" data-cell-kind="display">
          {COMPILER_DOC.title}
        </h2>
      </header>

      <p className="t-body rc-doc__standfirst" data-cell="STANDFIRST" data-plane="1" data-cell-kind="body">
        {COMPILER_DOC.standfirst}
      </p>

      <figure className="rc-doc__figure" data-cell="FIGURE" data-plane="2" data-cell-kind="figure">
        <ContourPlate process="normal" className="rc-doc__plate-img" />
        <figcaption className="t-mono t-mono-xs t-dim rc-doc__caption">
          {COMPILER_DOC.figureCaption}
        </figcaption>
      </figure>

      <ol className="rc-doc__stages">
        {COMPILER_DOC.stages.map((s, i) => (
          <li
            className="rc-doc__stage"
            key={s.n}
            data-cell={`STAGE/${s.n}`}
            data-plane={String(3 + i)}
            data-cell-kind="region"
          >
            <span className="t-mono t-mono-xs t-dim rc-doc__stage-n" aria-hidden="true">
              {s.n}
            </span>
            <h3 className="t-display t-display-m rc-doc__stage-name">{s.name}</h3>
            <p className="t-body-s t-dim rc-doc__stage-line">{s.line}</p>
            <span className="rc-doc__stage-rule" aria-hidden="true" />
          </li>
        ))}
      </ol>

      <div className="rc-doc__band" data-cell="CAPABILITIES" data-plane="9" data-cell-kind="mono">
        <p className="u-sr">Capabilities assembled per brief</p>
        <ul className="rc-doc__caps">
          {COMPILER_DOC.capabilities.map((c) => (
            <li className="t-mono t-mono-xs" key={c}>
              {c}
            </li>
          ))}
        </ul>
      </div>

      <p className="t-mono t-mono-xs t-faint rc-doc__colophon" data-cell="COLOPHON" data-plane="9" data-cell-kind="mono">
        {COMPILER_DOC.colophon}
      </p>
    </article>
  );
}
