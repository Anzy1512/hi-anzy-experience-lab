import { SPECIMEN } from '../../content/brand';
import { ContourPlate, type PlateProcess } from '../../graphics/ContourPlate';

/**
 * THE SPECIMEN — a real editorial composition, built to be measured.
 *
 * X-Ray needs an honest subject. This is a composed sheet with genuine
 * hierarchy, a real 12-column grid, real type metrics and a real image, and
 * every element that the instrument may inspect carries `data-xr` (its kind)
 * and `data-xr-name` (its label). The overlays derive everything else by
 * measuring these nodes — nothing about the diagnostics is hand-authored.
 */

interface Props {
  plateProcess: PlateProcess;
}

export function Specimen({ plateProcess }: Props) {
  return (
    <article className="xr-spec" data-xr="region" data-xr-name="SPECIMEN SHEET">
      <header className="xr-spec__head" data-xr="region" data-xr-name="MASTHEAD">
        <p className="t-mono t-mono-xs xr-spec__kicker" data-xr="mono" data-xr-name="KICKER">
          <span className="t-signal">{SPECIMEN.plate}</span>
          <span className="t-faint"> / </span>
          {SPECIMEN.kicker}
        </p>
        <h2 className="t-display t-display-xl xr-spec__title" data-xr="display" data-xr-name="TITLE">
          {SPECIMEN.title}
        </h2>
        <p className="t-body xr-spec__subtitle" data-xr="body" data-xr-name="SUBTITLE">
          {SPECIMEN.subtitle}
        </p>
      </header>

      <figure className="xr-spec__figure" data-xr="region" data-xr-name="FIGURE">
        <ContourPlate process={plateProcess} className="xr-spec__plate" />
        <div className="xr-spec__plate-frame" aria-hidden="true" />
        <figcaption className="t-mono t-mono-xs t-dim xr-spec__caption" data-xr="mono" data-xr-name="CAPTION">
          {SPECIMEN.caption}
        </figcaption>
      </figure>

      <p className="t-body xr-spec__standfirst" data-xr="body" data-xr-name="STANDFIRST">
        {SPECIMEN.standfirst}
      </p>

      <div className="xr-spec__cols" data-xr="region" data-xr-name="COLUMN SET">
        {SPECIMEN.columns.map((col, i) => (
          <section className="xr-spec__col" key={col.head} data-xr="region" data-xr-name={`COLUMN ${i + 1}`}>
            <h3 className="t-display t-display-s xr-spec__col-head" data-xr="display" data-xr-name={col.head}>
              <span className="xr-spec__col-num t-mono t-mono-xs t-faint" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              {col.head}
            </h3>
            <p className="t-body-s xr-spec__col-body" data-xr="body" data-xr-name={`${col.head} BODY`}>
              {col.body}
            </p>
          </section>
        ))}
      </div>

      <p className="t-mono t-mono-xs t-faint xr-spec__colophon" data-xr="mono" data-xr-name="COLOPHON">
        {SPECIMEN.colophon}
      </p>
    </article>
  );
}
