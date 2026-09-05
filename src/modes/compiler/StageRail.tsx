import { COMPILER_COPY } from '../../content/compiler';
import { setPointerIntent } from '../../core/pointer';
import { STAGES } from './stages';

/**
 * THE STAGE RAIL.
 *
 * Compilation progress, made legible and operable. It is a *rail* rather than a
 * scrubber because the stages are named things worth reading, and because a rail
 * of eight labelled stops is navigable by keyboard and by tap without any
 * gesture literacy.
 *
 * It doubles as the accessible description of the mode: a screen-reader user who
 * cannot see the spatial layer still gets the sequence, the current position,
 * and every control.
 */

interface Props {
  stageIndex: number;
  coarse: boolean;
  atWorld: boolean;
  onStage: (i: number) => void;
  onReturn: () => void;
  onEnterWorld: () => void;
  onExit: () => void;
}

export function StageRail({ stageIndex, coarse, atWorld, onStage, onReturn, onEnterWorld }: Props) {
  const stage = STAGES[stageIndex];

  const hover = {
    onPointerEnter: () => setPointerIntent('discover'),
    onPointerLeave: () => setPointerIntent('default'),
  };

  return (
    <div className="rc-rail">
      <div className="rc-rail__head">
        <h2 className="t-display t-display-m rc-rail__title">{COMPILER_COPY.title}</h2>
        <p className="t-mono t-mono-xs t-dim rc-rail__tag">{COMPILER_COPY.tagline}</p>
      </div>

      <nav className="rc-rail__stages" aria-label="Compilation stages">
        <ol className="rc-rail__list">
          {STAGES.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className="rc-stop"
                data-on={i <= stageIndex ? 'true' : 'false'}
                data-current={i === stageIndex ? 'true' : 'false'}
                aria-current={i === stageIndex ? 'step' : undefined}
                onClick={() => onStage(i)}
                {...hover}
              >
                <span className="rc-stop__tick" aria-hidden="true" />
                <span className="rc-stop__label t-mono t-mono-xs">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="rc-rail__readout">
        <p className="t-mono t-mono-xs rc-rail__now" role="status">
          <span className="t-signal">
            {String(stageIndex + 1).padStart(2, '0')}/{String(STAGES.length).padStart(2, '0')}
          </span>
          <span className="t-faint"> · </span>
          {stage.label}
        </p>
        <p className="t-body-s t-dim rc-rail__note">{stage.note}</p>

        <p className="t-mono t-mono-xs t-faint rc-rail__hint">
          {coarse ? COMPILER_COPY.hintTouch : COMPILER_COPY.hintPointer}
        </p>

        <div className="rc-rail__actions">
          <button type="button" className="rc-act" onClick={onReturn} {...hover}>
            {COMPILER_COPY.returnLabel}
          </button>
          {/* The bridge into Living World. It appears only once the document has
              actually become one — offering it earlier would be a link, not a
              consequence. Living World remains independently reachable from the
              Reality Index either way. */}
          {atWorld && (
            <button
              type="button"
              className="rc-act rc-act--signal"
              onClick={onEnterWorld}
              onPointerEnter={() => setPointerIntent('enter')}
              onPointerLeave={() => setPointerIntent('default')}
            >
              {COMPILER_COPY.enterWorld}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
