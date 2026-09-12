import { useCallback } from 'react';
import { claim, dismiss, handoffsForCurrentProject, usePendingHandoff } from '../../system/handoff';
import { getArtifact, newProject, useProject, type ArtifactRecord } from '../../system/project';
import { findMode } from '../../content/lab';
import { resetBrief } from '../../system/brief';

/**
 * THE PROJECT — what this session has actually produced.
 *
 * ── WHY SYSTEM.app HOLDS IT ─────────────────────────────────────────────────
 *
 * The operating environment is where a project's state belongs: the Terminal
 * frames a problem, the Simulator develops it, the Compiler takes a page apart,
 * and all three of those are work on the same thing. Before Phase 8.7 each of
 * them ended in a download and the relationship stopped there — a visitor could
 * take four files away and nothing in the product knew they were related.
 *
 * This is the ledger. It lists what was made, by which tool, in what order, and
 * what each one refuses to tell you.
 *
 * ── TAKING IS A CHOICE ──────────────────────────────────────────────────────
 *
 * A handoff arrives as an offer rather than as an accomplished fact. The
 * artifact is already recorded — it was produced, and pretending otherwise
 * would lose somebody's work — but the pending slot stays lit until the visitor
 * either takes it or declines. That is what makes a continuation reversible:
 * declining costs nothing and mutates nothing, which would not be true if the
 * receiving surface simply absorbed whatever it was handed.
 */

const KIND_LABEL: Record<ArtifactRecord['kind'], string> = {
  frame: 'PROBLEM FRAME',
  brief: 'SYSTEM BRIEF',
  manifest: 'TRANSFORMATION MANIFEST',
  specimen: 'SPECIMEN REPORT',
  recipe: 'MATTER RECIPE',
  session: 'SESSION REPORT',
};

/** `14:32` — a time, not a date. Nothing here outlives the tab. */
function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function producerName(id: string): string {
  return findMode(id)?.title ?? id.toUpperCase();
}

export function ProjectPanel() {
  const project = useProject();
  const pending = usePendingHandoff();

  /* Only offers addressed to this environment. A handoff to DIRECTOR is not
     this panel's to accept, and showing it here would invite exactly that. */
  const waiting = pending && pending.to === 'anzy-os' ? pending : null;
  const offered = waiting ? getArtifact(waiting.artifactId) : undefined;

  const take = useCallback(() => {
    claim('anzy-os');
  }, []);

  /*
   * A new project clears the working brief too.
   *
   * The project store deliberately does not reach into other stores — but the
   * environment that owns both surfaces can, and must: starting again while
   * SYSTEM.app still displays the previous problem's frame would be the exact
   * "document that looks assembled and describes something else" failure the
   * brief store was written to prevent.
   */
  const startOver = useCallback(() => {
    newProject();
    resetBrief();
  }, []);

  const history = handoffsForCurrentProject();

  return (
    <>
      <h4 className="os-app__h t-mono t-mono-xs">PROJECT</h4>

      {waiting && offered && (
        <div className="os-offer" role="status">
          <p className="t-mono t-mono-xs os-offer__head">
            {KIND_LABEL[offered.kind]} FROM {producerName(waiting.from)}
          </p>
          <p className="t-body-s os-offer__title">{offered.title}</p>
          <p className="t-body-s t-dim os-offer__limits">{offered.limits}</p>
          <div className="os-offer__row">
            <button type="button" className="t-mono t-mono-xs artifact__btn artifact__btn--send" onClick={take}>
              TAKE IT
            </button>
            <button type="button" className="t-mono t-mono-xs artifact__btn" onClick={dismiss}>
              NOT NOW
            </button>
          </div>
        </div>
      )}

      {project.artifacts.length === 0 ? (
        <p className="t-body-s t-dim os-app__foot">
          Nothing made yet. Anything the Terminal frames, the Agency Simulator runs or the
          Reality Compiler takes apart is listed here, with what it came from and what it
          cannot tell you.
        </p>
      ) : (
        <>
          <ol className="os-arts">
            {[...project.artifacts].reverse().map((a) => (
              <li key={a.id} className="os-art">
                <p className="t-mono t-mono-xs os-art__meta">
                  <span className="os-art__kind">{KIND_LABEL[a.kind]}</span>
                  <span className="t-dim"> · {producerName(a.producer)} · {clock(a.createdAt)}</span>
                </p>
                <p className="t-body-s os-art__title">{a.title}</p>
                {/* Every artifact states its own limits, here as well as in the
                    file. The screen that qualified it is the one thing that does
                    not travel with the download. */}
                <p className="t-body-s t-dim os-art__limits">{a.limits}</p>
                {a.sourceIds.length > 0 && (
                  <p className="t-mono t-mono-xs t-dim os-art__from">
                    DEVELOPED FROM {a.sourceIds.length} EARLIER{' '}
                    {a.sourceIds.length === 1 ? 'ARTIFACT' : 'ARTIFACTS'}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p className="t-mono t-mono-xs t-dim os-app__foot">
            {project.artifacts.length}{' '}
            {project.artifacts.length === 1 ? 'ARTIFACT' : 'ARTIFACTS'} · {history.length}{' '}
            {history.length === 1 ? 'HANDOFF' : 'HANDOFFS'} · HELD IN THIS TAB ONLY
          </p>
          <div className="os-offer__row">
            <button type="button" className="t-mono t-mono-xs artifact__btn" onClick={startOver}>
              NEW PROJECT
            </button>
          </div>
        </>
      )}
    </>
  );
}
