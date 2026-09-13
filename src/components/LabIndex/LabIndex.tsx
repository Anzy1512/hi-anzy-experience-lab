import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { findMode, MODES } from '../../content/lab';
import { groupMembers, INDEX_GROUPS } from '../../system/registry';
import { ProductContract } from '../Product/ProductContract';
import { WorkBand } from '../Work/WorkBand';
import { EDGES } from '../../content/graph';
import { INDEX_COPY, indexNote } from '../../content/brand';
import { isEnterable, STATUS_LABEL, type ModeDefinition } from '../../experience/types';
import { useExperience } from '../../experience/context';
import { hasVisited, subscribeVisited, takeReturningFrom, visitedCount, visitTrail } from '../../experience/visited';
import { useReducedMotion } from '../../core/hooks';
import { journeyState, leavePath, subscribeJourney } from '../../experience/journey';
import { PATH } from '../../content/journey';
import { emit } from '../../analytics/events';
import { ReturnPanel } from './ReturnPanel';
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
      data-mode-id={mode.id}
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
          {/* What kind of thing this is, and — for a tool — what it will and
              will not do for you, before you spend a mode entry finding out. */}
          <ProductContract id={mode.id} variant="brief" />
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

/**
 * CROSS-REFERENCES — the reality graph, printed.
 *
 * The mode host offers an onward move inside a reality, but only where a fixed
 * overlay has room: below 900px it would print through the reality's own copy,
 * so it is hidden there. This block is where the graph actually lives. It is
 * reference matter on the back of the plate list — every edge, both ends named
 * by their index numeral, and the reason stated in full.
 *
 * Deliberately not interactive. Every reality named here has its own enterable
 * row a few centimetres up the same sheet; a second set of controls pointing at
 * the same sixteen destinations would be duplicate navigation, and it would put
 * thirteen more stops in the tab order for nothing.
 */
/* The one module on this page that reaches three.js, behind a dynamic import so
   it cannot land in the entry chunk. The list below renders and is complete
   whether or not this ever loads. */
const IndexLatticeCanvas = lazy(() => import('./IndexLatticeCanvas'));

/**
 * DO NOT FETCH A RENDERER FOR A FIGURE NOBODY HAS SCROLLED TO.
 *
 * A lazy import is not a gate. `lazy()` resolves the moment React renders the
 * component, so mounting it inside the cross-reference section meant every
 * visitor who opened the Index pulled **227 kB of react-three-fiber** before
 * entering a single reality — measured on the production build, not guessed.
 * The section sits roughly two thousand pixels down a sixteen-row plate list;
 * most visitors never reach it.
 *
 * So intent is the gate, and intent here is "scrolled far enough that the
 * figure is about to matter". The margin is deliberately generous, for the
 * reason `three/useSceneVisibility.js` gives on the canonical side: resuming
 * well before the element is visible means the discontinuity happens off
 * screen. Once armed it stays armed — this is a load gate, not a render loop.
 */
function useApproached(ref: React.RefObject<HTMLElement | null>): boolean {
  /* A browser with no IntersectionObserver starts armed, decided during the
     lazy initialiser rather than by writing state from inside the effect — the
     same reason ANZY.OS derives its boot lines instead of setting them. */
  const [approached, setApproached] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const node = ref.current;
    if (!node || approached) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setApproached(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [ref, approached]);
  return approached;
}

function CrossReferences({ visited }: { visited: string[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const approached = useApproached(sectionRef);
  const edges = EDGES.map((edge) => ({
    edge,
    from: findMode(edge.from),
    to: findMode(edge.to),
  })).filter((row) => row.from && row.to);

  if (edges.length === 0) return null;

  return (
    <section className="index__graph" aria-labelledby="index-graph-label" ref={sectionRef}>
      <h2 className="t-mono t-mono-xs t-dim index__graph-label" id="index-graph-label">
        CROSS-REFERENCES — WHERE EACH REALITY LEADS
      </h2>
      {/* The same twelve relationships, drawn. Decorative in the accessibility
          sense and nowhere else: it is the only thing on this page that can
          show they form one structure rather than twelve observations. */}
      {approached && (
        <Suspense fallback={null}>
          <IndexLatticeCanvas visited={visited} />
        </Suspense>
      )}
      <ul className="index__graph-list">
        {edges.map(({ edge, from, to }) => (
          <li className="index__graph-row" key={`${edge.from}-${edge.to}`}>
            <p className="t-mono t-mono-xs index__graph-pair">
              <span className="index__graph-num" aria-hidden="true">
                {from!.index}
              </span>
              <span className="index__graph-name">{from!.title}</span>
              <span className="index__graph-arrow" aria-hidden="true">
                &rarr;
              </span>
              <span className="index__graph-num" aria-hidden="true">
                {to!.index}
              </span>
              <span className="index__graph-name index__graph-name--to">{to!.title}</span>
            </p>
            <p className="t-body-s t-dim index__graph-why">{edge.because}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LabIndex() {
  const { error, enterMode } = useExperience();
  const journey = useSyncExternalStore(subscribeJourney, journeyState);
  const nextOnRoute = journey.active ? findMode(PATH[journey.reached + 1]?.id ?? '') : null;
  const reduced = useReducedMotion();
  /*
   * One ref over every group rather than one per list.
   *
   * The sheet used to be two lists — front and reverse — and held a ref to
   * each. It is now four groups by kind, and a ref per group would mean the
   * entrance animation and the focus restoration both had to know how many
   * groups there are. Scoping to the container means they do not.
   */
  const listRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const onToggle = useCallback((id: string) => {
    setExpanded((cur) => (cur === id ? null : id));
  }, []);

  useEffect(() => {
    const rows = listRef.current?.querySelectorAll('.row');
    if (!rows) return;
    const all = Array.from(rows);

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

  /**
   * Put the keyboard back where it was.
   *
   * Leaving a reality used to land focus on `<body>`: the focus trap restores
   * whatever was focused when it turned on, and by then this list had already
   * unmounted, so it captured nothing worth returning to. Sixteen rows and no
   * caret is a real loss of place for a keyboard visitor. The provider hands
   * over the id of the reality just left, once, and the row it names takes
   * focus. `preventScroll` is off deliberately — the point is to bring the
   * visitor back to where they were on the sheet, not merely to the element.
   *
   * A fresh load or a deep link to `#index` reads `null` and moves nothing.
   */
  useEffect(() => {
    const from = takeReturningFrom();
    if (!from) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-mode-id="${from}"] .row__hit`);
    row?.focus();
  }, []);

  // Counted, not asserted. The note used to claim a number that had been wrong
  // for two phases.
  const onlineCount = MODES.filter((m) => m.status === 'online').length;

  // The index redraws when the visitor's trail changes, so returning from a
  // reality visibly marks it. Session-only; nothing is persisted.
  const seen = useSyncExternalStore(subscribeVisited, visitedCount);

  // `tabIndex={-1}` so the skip link actually lands: without it the hash moves
  // and focus stays on <body>, which is the one thing the link exists to
  // prevent. Programmatic focus only — `:focus-visible` will not match, so no
  // ring is printed. Same reason ModeHost carries it.
  return (
    <main className="index" id="lab-main" tabIndex={-1}>
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

      {journey.complete && <ReturnPanel />}

      {/* Mid-route: the map is still the map, with one line saying the route is
          still open and where it goes next. Not a progress bar and not a score
          — a visitor who wandered off the path is not behind on anything. */}
      {journey.active && !journey.complete && nextOnRoute && (
        <p className="index__route t-mono t-mono-xs" role="status">
          <span className="t-signal">ON A ROUTE</span>
          <span className="index__route-sep" aria-hidden="true"> / </span>
          <button
            type="button"
            className="index__route-next"
            onClick={() => {
              emit('recommended_next_click', { reality: nextOnRoute.id });
              enterMode(nextOnRoute.id);
            }}
          >
            NEXT: {nextOnRoute.title}
            <span aria-hidden="true"> →</span>
          </button>
          <button
            type="button"
            className="index__route-leave t-faint"
            onClick={() => {
              leavePath();
              emit('curated_path_leave');
            }}
          >
            LEAVE THE ROUTE
          </button>
        </p>
      )}

      {/*
        SIXTEEN THINGS, FOUR KINDS.

        This was one list of eight and a reverse list of eight, which is a fact
        about the plate rather than about the work: a visitor met sixteen
        equivalent choices and had to open each one to find out whether it was a
        tool, a measuring instrument or a piece of cinema. The grouping is now
        by kind, from `system/registry`, and each group says in one line what
        having that kind of thing means.

        Plate numbers are untouched. 01–08 and X1–X8 are identity — the graph,
        the cross-references and the Terminal all name realities by them — so a
        group can reorder the sheet without renumbering anything on it.
      */}
      {/* The question before the catalogue. Three jobs with an outcome and one
          open route, above sixteen rows that stay exactly where they were. */}
      <WorkBand />

      <div className="index__groups" ref={listRef}>
        {INDEX_GROUPS.map((group) => {
          const members = groupMembers(group.key)
            .map((id) => findMode(id))
            .filter((m): m is ModeDefinition => Boolean(m));
          if (!members.length) return null;
          return (
            <section className="index__group" key={group.key} data-group={group.key}>
              <header className="index__group-head">
                <h2 className="t-mono t-mono-s index__group-label">{group.label}</h2>
                <p className="t-mono t-mono-xs t-dim index__group-note">{group.note}</p>
              </header>
              <ul className="index__list">
                {members.map((mode) => (
                  <Row
                    key={mode.id}
                    mode={mode}
                    expanded={expanded === mode.id}
                    onToggle={onToggle}
                    visited={hasVisited(mode.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <CrossReferences visited={visitTrail() as string[]} />
    </main>
  );
}
