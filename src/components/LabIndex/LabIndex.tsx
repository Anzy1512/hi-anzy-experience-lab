import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { EXPERIMENT_MODES, FLAGSHIP_MODES, MODES } from '../../content/lab';
import { INDEX_COPY, indexNote } from '../../content/brand';
import { isEnterable, STATUS_LABEL, type ModeDefinition } from '../../experience/types';
import { useExperience } from '../../experience/context';
import { hasVisited, subscribeVisited, visitedCount } from '../../experience/visited';
import { useReducedMotion } from '../../core/hooks';
import { setPointerIntent } from '../../core/pointer';
import { guaranteeCompletion, rowsIn, settleImmediately } from '../../motion/primitives';
import './labindex.css';

/**
 * THE REALITY INDEX — a plate list.
 *
 * Not a card wall. The model is an imposition sheet or a museum plate list:
 * oversized index numerals, condensed display titles, right-aligned status,
 * rules between rows. Hierarchy comes from typographic scale and from what the
 * sheet chooses to recede, never from boxes and shadows.
 *
 * Proximity is done in CSS with :has() — hovering one row recedes the others.
 * That gives the "the sheet is paying attention to you" effect with zero
 * per-frame JavaScript and zero React re-renders.
 */

function requirementChips(mode: ModeDefinition): string[] {
  const r = mode.requirements;
  const out: string[] = [];
  if (r.webgl) out.push('WEBGL');
  if (r.webgpu) out.push('WEBGPU+');
  if (r.audio) out.push('AUDIO');
  if (r.camera) out.push('CAMERA');
  out.push(`COST/${r.cost.toUpperCase()}`);
  out.push(`MOBILE/${r.mobile.toUpperCase()}`);
  out.push(`RM/${r.reducedMotion.toUpperCase()}`);
  return out;
}

interface RowProps {
  mode: ModeDefinition;
  expanded: boolean;
  onToggle: (id: string) => void;
  visited: boolean;
}

function Row({ mode, expanded, onToggle, visited }: RowProps) {
  const { enterMode } = useExperience();
  const enterable = isEnterable(mode);

  const onClick = useCallback(() => {
    if (enterable) enterMode(mode.id);
    else onToggle(mode.id);
  }, [enterable, enterMode, mode.id, onToggle]);

  return (
    <li
      className="row"
      data-status={mode.status}
      data-expanded={expanded ? 'true' : 'false'}
      data-visited={visited ? 'true' : 'false'}
    >
      <button
        type="button"
        className="row__hit"
        onClick={onClick}
        onPointerEnter={() => setPointerIntent(enterable ? 'enter' : 'discover')}
        onPointerLeave={() => setPointerIntent('default')}
        onFocus={() => setPointerIntent(enterable ? 'enter' : 'discover')}
        onBlur={() => setPointerIntent('default')}
        aria-expanded={enterable ? undefined : expanded}
        aria-label={
          enterable
            ? `Enter ${mode.title}. ${mode.tagline} Status: online.`
            : `${mode.title}. ${mode.tagline} Status: ${STATUS_LABEL[mode.status]}. Not yet enterable.`
        }
      >
        {/* The trace: a struck register mark on a reality this visitor has
            already been inside. It is the map remembering, not a badge. */}
        <span className="row__trace" aria-hidden="true" />
        <span className="row__index t-index" aria-hidden="true">
          {mode.index}
        </span>

        <span className="row__title t-display" aria-hidden="true">
          {mode.title}
        </span>

        <span className="row__tagline t-body-s t-dim" aria-hidden="true">
          {mode.tagline}
        </span>

        <span className="row__status t-mono t-mono-xs" aria-hidden="true">
          {STATUS_LABEL[mode.status]}
        </span>

        <span className="row__scan" aria-hidden="true" />
      </button>

      <div className="row__expand" aria-hidden={!expanded}>
        <div className="row__expand-inner">
          <p className="t-body-s row__desc">{mode.description}</p>
          <ul className="row__req">
            {requirementChips(mode).map((chip) => (
              <li className="t-mono t-mono-xs t-dim" key={chip}>
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

export function LabIndex() {
  const { error } = useExperience();
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const reverseRef = useRef<HTMLUListElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const onToggle = useCallback((id: string) => {
    setExpanded((cur) => (cur === id ? null : id));
  }, []);

  useEffect(() => {
    const rows = listRef.current?.querySelectorAll('.row');
    const reverse = reverseRef.current?.querySelectorAll('.row');
    if (!rows) return;
    const all = [...Array.from(rows), ...Array.from(reverse ?? [])];

    if (reduced) {
      settleImmediately(all);
      return;
    }
    const tl = rowsIn(all, { delay: 0.12 });
    // The index is the navigation. It must never be held hostage by a tween.
    const releaseGuarantee = guaranteeCompletion(tl, 2400);
    return () => {
      releaseGuarantee();
      tl.kill();
      settleImmediately(all);
    };
  }, [reduced]);

  // Counted, not asserted. The note used to claim a number that had been wrong
  // for two phases.
  const onlineCount = MODES.filter((m) => m.status === 'online').length;

  // The index redraws when the visitor's trail changes, so returning from a
  // reality visibly marks it. Session-only; nothing is persisted.
  const seen = useSyncExternalStore(subscribeVisited, visitedCount);

  return (
    <main className="index" id="lab-main">
      <header className="index__head">
        <div className="index__head-left">
          <p className="t-mono t-mono-xs t-dim">{INDEX_COPY.eyebrow}</p>
          <h1 className="t-display t-display-m index__title">REALITIES</h1>
        </div>
        <div className="index__head-right">
          <p className="t-mono t-mono-xs t-faint index__note">{seen > 0 ? `${indexNote(onlineCount, MODES.length)} ${seen} VISITED THIS SESSION.` : indexNote(onlineCount, MODES.length)}</p>
        </div>
      </header>

      {error && (
        <p className="index__error t-mono t-mono-s" role="status">
          {error}
        </p>
      )}

      <ul className="index__list" ref={listRef}>
        {FLAGSHIP_MODES.map((mode) => (
          <Row
            key={mode.id}
            mode={mode}
            expanded={expanded === mode.id}
            onToggle={onToggle}
            visited={hasVisited(mode.id)}
          />
        ))}
      </ul>

      <div className="index__reverse">
        <p className="t-mono t-mono-xs t-dim index__reverse-label">{INDEX_COPY.reverse}</p>
        <ul className="index__list index__list--dense" ref={reverseRef}>
          {EXPERIMENT_MODES.map((mode) => (
            <Row
              key={mode.id}
              mode={mode}
              expanded={expanded === mode.id}
              onToggle={onToggle}
              visited={hasVisited(mode.id)}
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
