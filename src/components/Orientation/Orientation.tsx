import { useEffect, useRef } from 'react';
import { ProductContract } from '../Product/ProductContract';
import { useProject } from '../../system/project';
import { projectStatus, projectTitle } from '../../system/schema';
import { findMode } from '../../content/lab';
import type { ModeDefinition } from '../../experience/types';
import './orientation.css';

/**
 * WHERE AM I, AND WHAT IS THIS.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 *
 * Phase 8.7 classified all sixteen realities and wrote each product's contract
 * — what you give it, what it works from, what it does, what you get, what you
 * can take, where it leads. Phase 8.11 found that contract was rendered in
 * exactly one place: an expanded row on the Reality Index, which a visitor sees
 * *before* entering and cannot reach again without leaving.
 *
 * So the answer to "what is this and what can I do here" lived one navigation
 * away from every moment somebody actually needed it. The registry was not the
 * problem; the reach was.
 *
 * ── WHY IT IS BEHIND A PRESS ────────────────────────────────────────────────
 *
 * Not a tutorial overlay, and not always-on furniture. Every reality here is
 * full-bleed by design and there is no free rectangle — WorkStrip's own comment
 * records two earlier attempts at a floating panel, both of which printed over
 * the product underneath. This opens from the one control that is already in
 * the chrome band and already names the reality: the plate number and title.
 * That block was previously inert text, which made it the only part of the
 * chrome that looked like a label and behaved like one.
 *
 * ── AND IT IS ADDITIVE ──────────────────────────────────────────────────────
 *
 * The project section is drawn only when a project holds something. A reality
 * entered with no project open is not shown an empty ledger, told to start one,
 * or blocked — it simply gets the first half of the sheet, which is the half
 * about the reality itself. Project mode is additive; it has never been a
 * requirement for entering anything, and printing a blank one here would have
 * quietly turned it into one.
 */

interface Props {
  mode: ModeDefinition;
  open: boolean;
  onClose: () => void;
  /** The id the toggle carries, so the button can point at this panel. */
  panelId: string;
}

/** The last thing that happened that a person would call an event. */
function lastMeaningful(history: { kind: string; note: string }[]): string | null {
  const SKIP = new Set(['PROJECT_RESUMED', 'PROJECT_CREATED']);
  for (let i = history.length - 1; i >= 0; i--) {
    if (!SKIP.has(history[i].kind)) return history[i].note;
  }
  return null;
}

export function Orientation({ mode, open, onClose, panelId }: Props) {
  const project = useProject();
  const ref = useRef<HTMLDivElement>(null);

  /*
   * Focus moves in when it opens, so the keyboard is where the eye is, and the
   * panel is the thing Escape closes. Escape itself is owned by ModeHost —
   * two listeners racing for one key is how a panel closes the mode behind it.
   */
  useEffect(() => {
    if (!open) return;
    ref.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const title = projectTitle(project);
  const status = projectStatus(project);
  /* A project earns this section by holding something, exactly as it earns
     persistence. Browsing leaves nothing behind and shows nothing here. */
  const hasProject = project.statement !== null || project.artifacts.length > 0;
  const last = lastMeaningful(project.history);

  return (
    <div
      className="ori"
      id={panelId}
      role="dialog"
      aria-label={`What ${mode.title} is`}
      tabIndex={-1}
      ref={ref}
    >
      <div className="ori__sheet">
        <header className="ori__head">
          <p className="t-mono t-mono-xs t-dim">WHERE YOU ARE</p>
          <h2 className="t-display t-display-s ori__title">
            <span className="t-signal">{mode.index}</span>
            <span className="t-faint"> / </span>
            {mode.title}
          </h2>
          <p className="t-body-s t-dim ori__tagline">{mode.tagline}</p>
        </header>

        {/* The registry's own words, in the registry's own component. There is
            no second description of a product anywhere in this build. */}
        <ProductContract id={mode.id} variant="full" />

        {hasProject && (
          <section className="ori__project">
            <h3 className="t-mono t-mono-xs ori__h">THE PROJECT YOU ARE IN</h3>
            <dl className="ori__kv">
              <div>
                <dt className="t-mono t-mono-xs">NAME</dt>
                <dd className="t-body-s">
                  {title.text}
                  {title.named ? null : <span className="t-mono t-mono-xs t-dim"> · DERIVED</span>}
                </dd>
              </div>
              {project.statement && (
                <div>
                  <dt className="t-mono t-mono-xs">STATED</dt>
                  <dd className="t-body-s">{project.statement}</dd>
                </div>
              )}
              <div>
                <dt className="t-mono t-mono-xs">STATE</dt>
                <dd className="t-mono t-mono-xs">
                  {status} · {project.artifacts.length}{' '}
                  {project.artifacts.length === 1 ? 'RESULT' : 'RESULTS'} KEPT
                </dd>
              </div>
              {last && (
                <div>
                  <dt className="t-mono t-mono-xs">LAST</dt>
                  <dd className="t-body-s">{last}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* There is no "WHERE THIS LEADS" section. There was one, and it
            printed the contract's CONTINUE row a second time, four lines
            under the first — the exact duplication this phase is meant to
            find. The contract already answers it. */}

        <footer className="ori__foot">
          <p className="t-body-s t-dim ori__out">
            Leave with <span className="t-mono t-mono-xs">EXIT EXPERIENCE</span> or{' '}
            <span className="t-mono t-mono-xs">ESC</span>. Anything this project has kept stays
            kept.
          </p>
          <button type="button" className="t-mono t-mono-xs ori__close" onClick={onClose}>
            CLOSE
          </button>
        </footer>
      </div>
    </div>
  );
}

/** The mode id block in the chrome, which is also the way in. */
export function OrientationToggle({
  mode,
  open,
  onToggle,
  panelId,
}: {
  mode: ModeDefinition;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  const known = Boolean(findMode(mode.id));
  return (
    <button
      type="button"
      className="modehost__id t-mono t-mono-xs"
      aria-expanded={open}
      aria-controls={panelId}
      /*
       * The name says what pressing it does.
       *
       * Without this the control announced as "04 / AGENCY SIMULATOR" — the
       * label it had when it was inert text — which tells somebody using a
       * screen reader the name of the room and nothing about the door. The
       * visible glyph is `aria-hidden`, so it was contributing nothing either.
       */
      aria-label={`What ${mode.title} is: what it takes, what it does, and what you can take away`}
      onClick={onToggle}
      disabled={!known}
    >
      <span className="t-signal">{mode.index}</span>
      <span className="t-faint"> / </span>
      <span>{mode.title}</span>
      {/*
        A QUESTION MARK IS NOT AN AFFORDANCE.

        This was a bare `?`, on the reasoning that the band is shared with EXIT
        and two competing words is how the way out stops being obvious. Tested
        cold on a first visit, that reasoning was wrong in the other direction:
        nothing on screen said what the mark opened, none of the six contract
        words were visible until it was pressed, and a visitor had no reason to
        press it. Available is not discoverable.

        So it says the visitor's own question instead. EXIT keeps its weight —
        it is bordered, it lights on hover and it carries ESC; this is a dim
        line of the same small mono. On a narrow band the words give way to the
        mark again, where there is genuinely no room for both.
      */}
      <span className="modehost__id-mark" aria-hidden="true">
        <span className="modehost__id-word">{open ? 'HIDE' : 'WHAT IS THIS'}</span>
        <span className="modehost__id-glyph">{open ? '×' : '?'}</span>
      </span>
    </button>
  );
}
