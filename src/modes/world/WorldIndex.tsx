import { WORLD_COPY, type District } from '../../content/world';
import { setPointerIntent } from '../../core/pointer';

/**
 * THE TERRITORY INDEX — orientation, not a minimap.
 *
 * A game minimap would be the obvious move and the wrong one: this world is
 * read, not traversed, and the Lab already has a language for "a list of places
 * with numbers and statuses" — the Reality Index plate list. This is that same
 * device, one level down.
 *
 * It answers the three questions a visitor in any spatial interface must always
 * be able to answer — *where am I, what can I visit, how do I leave* — and it is
 * also the whole experience for anyone without WebGL or with a screen reader:
 * every district, its line, and its notes are here as ordinary HTML.
 */

interface Props {
  districts: District[];
  active: District | null;
  arrived: boolean;
  coarse: boolean;
  onSelect: (id: string | null) => void;
}

export function WorldIndex({ districts, active, arrived, coarse, onSelect }: Props) {
  const hover = {
    onPointerEnter: () => setPointerIntent('discover'),
    onPointerLeave: () => setPointerIntent('default'),
  };

  return (
    <div className="lw-index">
      <div className="lw-index__head">
        <h2 className="t-display t-display-m lw-index__title">{WORLD_COPY.title}</h2>
        <p className="t-mono t-mono-xs t-dim lw-index__tag">{WORLD_COPY.tagline}</p>
      </div>

      <nav className="lw-index__nav" aria-label="Territory districts">
        <p className="t-mono t-mono-xs t-faint lw-index__label">{WORLD_COPY.mapLabel}</p>
        <ul className="lw-index__list">
          <li>
            <button
              type="button"
              className="lw-stop"
              data-on={active ? 'false' : 'true'}
              onClick={() => onSelect(null)}
              {...hover}
            >
              <span className="t-mono t-mono-xs">{WORLD_COPY.overview}</span>
            </button>
          </li>
          {districts.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="lw-stop"
                data-on={active?.id === d.id ? 'true' : 'false'}
                data-status={d.status}
                aria-current={active?.id === d.id ? 'true' : undefined}
                onClick={() => onSelect(d.id)}
                {...hover}
              >
                <span className="t-mono t-mono-xs lw-stop__idx">{d.index}</span>
                <span className="t-mono t-mono-xs lw-stop__name">{d.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="lw-index__readout">
        {active ? (
          <>
            <p className="t-mono t-mono-xs lw-index__now" role="status">
              <span className="t-signal">{active.index}</span>
              <span className="t-faint"> · </span>
              {arrived ? active.name : `${WORLD_COPY.arriving} ${active.name}`}
            </p>
            <p className="t-body-s lw-index__line">{active.line}</p>
            {/*
              What the district is made of.

              The world draws each district in its own material — value and
              hatch density, never a colour — and that is genuinely information
              about the place rather than a rendering decision. A visitor on
              the index is reading the same territory; they should be told the
              same thing, the same way Memory's fallback carries its artefacts.
            */}
            <p className="t-mono t-mono-xs t-faint lw-index__material">
              MATERIAL · {active.material}
            </p>
            <ul className="lw-index__notes">
              {active.notes.map((n) => (
                <li className="t-mono t-mono-xs t-dim" key={n}>
                  {n}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="t-mono t-mono-xs lw-index__now" role="status">
              <span className="t-signal">{WORLD_COPY.overview}</span>
            </p>
            <p className="t-body-s lw-index__line">{WORLD_COPY.intro}</p>
          </>
        )}
        <p className="t-mono t-mono-xs t-faint lw-index__hint">
          {coarse ? WORLD_COPY.hintTouch : WORLD_COPY.hintPointer}
        </p>
      </div>
    </div>
  );
}
