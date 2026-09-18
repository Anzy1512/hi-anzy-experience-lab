import { useCallback, useState } from 'react';
import { claim, dismiss, handoffsForCurrentProject, usePendingHandoff } from '../../system/handoff';
import { getArtifact, useProject, type ArtifactRecord } from '../../system/project';
import { findMode } from '../../content/lab';
import { assemble } from '../../system/assemble';
import {
  beginProject,
  dismissNotice,
  forgetEverything,
  forgetProject,
  openProject,
  projectStatus,
  projectTitle,
  storageSentence,
  useWorkspace,
} from '../../system/projects';
import { note, setTitle } from '../../system/project';
import { exportProject } from '../../system/exportProject';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { useExperience } from '../../experience/context';

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

/*
 * What each kind of thing is called, wherever the producing tool is named
 * beside it. So: RECIPE, not MATTER RECIPE — the panel prints "MATTER RECIPE
 * FROM MATTER ENGINE" otherwise, and "DIRECTOR TREATMENT FROM DIRECTOR", which
 * is the product stuttering its own name at somebody.
 */
const KIND_LABEL: Record<ArtifactRecord['kind'], string> = {
  frame: 'PROBLEM FRAME',
  brief: 'SYSTEM BRIEF',
  manifest: 'TRANSFORMATION MANIFEST',
  specimen: 'SPECIMEN REPORT',
  recipe: 'RECIPE',
  session: 'SESSION REPORT',
  treatment: 'TREATMENT',
  delivery: 'DELIVERY PACKAGE',
};

/** `14:32` — a time, not a date. Nothing here outlives the tab. */
function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function producerName(id: string): string {
  return findMode(id)?.title ?? id.toUpperCase();
}

/**
 * The five questions, rendered.
 *
 * Only shown once the session has something to read back. Five headings over
 * five apologies would be scaffolding pretending to be a document, which is the
 * failure this whole pass exists to remove — so the panel below stays a single
 * sentence until there is genuinely an assembled project to assemble.
 */
function Sections({ sections }: { sections: ReturnType<typeof assemble>['sections'] }) {
  return (
    <>
      {sections.map((sec) => (
        <section key={sec.head} className="os-read">
          <h5 className="t-mono t-mono-xs os-read__h">{sec.head}</h5>
          {sec.lines.length === 0 ? (
            <p className="t-body-s t-dim os-read__none">{sec.empty}</p>
          ) : (
            <ul className="os-read__list">
              {sec.lines.map((l, i) => (
                <li key={`${sec.head}-${i}`} className="os-read__line" data-p={l.p ?? ''}>
                  {l.p && (
                    <span className="t-mono t-mono-xs os-read__p" aria-label={`${l.p}:`}>
                      {l.p}
                    </span>
                  )}
                  <span className="t-body-s">{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

/** The doors. A separate component because it needs the experience and the
    sections above deliberately do not. */
function Doors({ doors }: { doors: ReturnType<typeof assemble>['doors'] }) {
  const { enterMode } = useExperience();
  return (
    <>
      <section className="os-read">
        <h5 className="t-mono t-mono-xs os-read__h">WHAT YOU CAN DO NEXT</h5>
        {doors.length === 0 ? (
          <p className="t-body-s t-dim os-read__none">
            Nothing follows from what is here. Every reality is on the index and none of them
            needs anything from this session to be worth opening.
          </p>
        ) : (
          <ul className="os-read__doors">
            {doors.map((d) => (
              <li key={d.product}>
                <button
                  type="button"
                  className="os-read__door"
                  onClick={() => enterMode(d.product)}
                >
                  <span className="t-mono t-mono-xs os-read__doorname">{d.title}</span>
                  <span className="t-body-s os-read__why">{d.because}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/**
 * WHOSE PROJECT THIS IS, AND WHERE IT LIVES.
 *
 * The header of the project view, and the first thing that has ever needed to
 * exist in this product: a project that survives being closed has to be able to
 * say what it is, when it was last touched, and — plainly, without a claim —
 * where its data is.
 *
 * The name is editable in place and may be empty. An unnamed project shows its
 * opening sentence with DERIVED beside it, so nobody mistakes a fallback for a
 * name somebody chose.
 */
function Identity({ project }: { project: ReturnType<typeof useProject> }) {
  const ws = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const title = projectTitle(project);
  const status = projectStatus(project);

  const begin = useCallback(() => {
    setDraft(project.title ?? '');
    setEditing(true);
  }, [project.title]);

  const commit = useCallback(() => {
    setTitle(draft);
    setEditing(false);
  }, [draft]);

  return (
    <section className="os-prj">
      {editing ? (
        <form
          className="os-prj__name-form"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <label className="t-mono t-mono-xs t-dim" htmlFor="os-prj-name">
            NAME THIS PROJECT
          </label>
          <input
            id="os-prj-name"
            className="t-body-s os-prj__name-input"
            value={draft}
            autoComplete="off"
            placeholder="Leave it empty to go back to no name"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <div className="os-offer__row">
            <button type="submit" className="t-mono t-mono-xs artifact__btn artifact__btn--send">
              SAVE NAME
            </button>
            <button type="button" className="t-mono t-mono-xs artifact__btn" onClick={() => setEditing(false)}>
              CANCEL
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="os-prj__name" onClick={begin}>
          <span className="t-display t-display-s os-prj__title">{title.text}</span>
          <span className="t-mono t-mono-xs t-dim os-prj__rename">
            {title.named ? 'RENAME' : 'DERIVED · NAME IT'}
          </span>
        </button>
      )}

      <dl className="os-kv os-prj__kv">
        <div>
          <dt className="t-mono t-mono-xs">STATE</dt>
          <dd className="t-mono t-mono-xs">{status}</dd>
        </div>
        <div>
          <dt className="t-mono t-mono-xs">SAVED</dt>
          <dd className="t-mono t-mono-xs">
            {ws.storage.kind !== 'READY' ? 'NO' : ws.saved ? 'YES · IN THIS BROWSER' : 'NOT YET'}
          </dd>
        </div>
      </dl>

      {/* Never a security claim. Only what is true about where the bytes are. */}
      <p className="t-body-s t-dim os-prj__where">{storageSentence(ws.storage)}</p>

      {ws.notice && (
        <p className="t-body-s os-prj__notice" role="status">
          {ws.notice}{' '}
          <button type="button" className="t-mono t-mono-xs os-prj__dismiss" onClick={dismissNotice}>
            UNDERSTOOD
          </button>
        </p>
      )}
    </section>
  );
}

/**
 * The other projects this browser holds.
 *
 * Not a dashboard: a list of things that exist, with the two operations that
 * make sense on one you are not currently in. It is not shown at all when there
 * is nothing else, which is most visitors most of the time.
 */
function SavedProjects({ currentId }: { currentId: string }) {
  const ws = useWorkspace();
  const others = ws.projects.filter((p) => p.id !== currentId);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!ws.ready && !others.length) return null;
  if (!others.length) return null;

  return (
    <section className="os-read">
      <h5 className="t-mono t-mono-xs os-read__h">ALSO SAVED IN THIS BROWSER</h5>
      <ul className="os-saved">
        {others.map((p) => {
          /* The summary carries an excerpt rather than the whole statement, so
             the title is derived from that. Same rule, less to read. */
          const t = projectTitle({ title: p.title, statement: p.excerpt });
          return (
            <li key={p.id} className="os-saved__row">
              <span className="t-body-s os-saved__title">
                {t.text}
                {t.named ? null : <span className="t-mono t-mono-xs t-dim"> · DERIVED</span>}
              </span>
              <span className="t-mono t-mono-xs t-dim os-saved__meta">
                {p.artifactCount} MADE · {new Date(p.updatedAt).toLocaleDateString()}
              </span>
              <span className="os-saved__acts">
                <button
                  type="button"
                  className="t-mono t-mono-xs artifact__btn"
                  onClick={() => void openProject(p.id)}
                >
                  OPEN
                </button>
                {confirming === p.id ? (
                  <>
                    <button
                      type="button"
                      className="t-mono t-mono-xs artifact__btn os-saved__danger"
                      onClick={() => {
                        void forgetProject(p.id);
                        setConfirming(null);
                      }}
                    >
                      DELETE FOR GOOD
                    </button>
                    <button
                      type="button"
                      className="t-mono t-mono-xs artifact__btn"
                      onClick={() => setConfirming(null)}
                    >
                      KEEP IT
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="t-mono t-mono-xs artifact__btn"
                    onClick={() => setConfirming(p.id)}
                  >
                    DELETE
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * ---- THE FOUR THINGS THAT ARE NOT THE SAME OPERATION ----------------------
 *
 * A visitor has several ways to get rid of something, and they are different
 * sizes. Treating them as one control is how people lose work:
 *
 *   START AGAIN      inside the Simulator. Clears that tool's run. The project,
 *                    its statement and everything made are untouched.
 *   NEW PROJECT      starts a second project. The first one is saved, listed,
 *                    and can be opened again. Nothing is deleted.
 *   DELETE           removes ONE saved project from this browser, for good.
 *   CLEAR EVERYTHING removes every saved project from this browser, for good.
 *
 * The two that destroy require a second, differently worded press. The two that
 * do not, do not — a confirmation on a safe action teaches people to click
 * through confirmations.
 */
function ProjectActions({ project }: { project: ReturnType<typeof useProject> }) {
  const ws = useWorkspace();
  const [confirm, setConfirm] = useState<'none' | 'this' | 'all'>('none');

  const startOver = useCallback(() => {
    beginProject();
  }, []);

  return (
    <>
      <ArtifactBar
        formats={['copy', 'markdown', 'json']}
        label="THE WHOLE PROJECT"
        build={() => {
          const out = exportProject(project);
          note('PROJECT_EXPORTED', 'The whole project was exported.');
          return { name: out.name, text: out.markdown, data: out.json };
        }}
      >
        <button type="button" className="t-mono t-mono-xs artifact__btn" onClick={startOver}>
          NEW PROJECT
        </button>
      </ArtifactBar>

      <div className="os-offer__row os-prj__danger-row">
        {confirm === 'this' ? (
          <>
            <span className="t-body-s os-prj__warn">
              Delete “{projectTitle(project).text}” from this browser? Everything in it goes, and
              nothing here can bring it back. Export it first if you want to keep it.
            </span>
            <button
              type="button"
              className="t-mono t-mono-xs artifact__btn os-saved__danger"
              onClick={() => {
                void forgetProject(project.id);
                setConfirm('none');
              }}
            >
              DELETE FOR GOOD
            </button>
            <button type="button" className="t-mono t-mono-xs artifact__btn" onClick={() => setConfirm('none')}>
              KEEP IT
            </button>
          </>
        ) : confirm === 'all' ? (
          <>
            <span className="t-body-s os-prj__warn">
              Remove all {ws.projects.length} saved{' '}
              {ws.projects.length === 1 ? 'project' : 'projects'} from this browser? This is
              everything, not just the one you are looking at.
            </span>
            <button
              type="button"
              className="t-mono t-mono-xs artifact__btn os-saved__danger"
              onClick={() => {
                void forgetEverything();
                setConfirm('none');
              }}
            >
              CLEAR EVERYTHING
            </button>
            <button type="button" className="t-mono t-mono-xs artifact__btn" onClick={() => setConfirm('none')}>
              KEEP THEM
            </button>
          </>
        ) : (
          <>
            {ws.saved && (
              <button type="button" className="t-mono t-mono-xs artifact__btn" onClick={() => setConfirm('this')}>
                DELETE THIS PROJECT
              </button>
            )}
            {ws.projects.length > 0 && (
              <button type="button" className="t-mono t-mono-xs artifact__btn" onClick={() => setConfirm('all')}>
                CLEAR ALL LOCAL DATA
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
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

  const history = handoffsForCurrentProject();

  /*
   * The session read back as five answers plus the ledger.
   *
   * `assemble` deliberately omits "what was made" — the ledger below is the
   * better answer to it, and two lists of the same things would eventually
   * disagree. So the reading is rendered in two halves with the ledger sitting
   * between them, in the order somebody would actually ask the questions.
   *
   * Nothing renders at all until there is a session to read back. `statement`
   * alone is enough: somebody who has described a problem and made nothing yet
   * still has something to be told.
   */
  const read = assemble(project);
  const has = project.statement !== null || project.artifacts.length > 0;
  const before = read.sections.filter((x) => x.head === 'WHAT YOU TOLD US' || x.head === 'WHAT THIS WORKED OUT');
  const after = read.sections.filter((x) => !before.includes(x));

  return (
    <>
      <h4 className="os-app__h t-mono t-mono-xs">PROJECT</h4>

      <Identity project={project} />

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

      {has && <Sections sections={before} />}

      <h5 className="t-mono t-mono-xs os-read__h">WHAT WAS MADE</h5>
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
                    MADE FROM {a.sourceIds.length} EARLIER{' '}
                    {a.sourceIds.length === 1 ? 'RESULT' : 'RESULTS'}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {/* Counted in plain words. "3 ARTIFACTS · 2 HANDOFFS" was the
              machinery describing itself to somebody who never asked how it
              was built. */}
          <p className="t-mono t-mono-xs t-dim os-app__foot">
            {project.artifacts.length} MADE · {history.length} CARRIED BETWEEN TOOLS · HELD IN
            THIS TAB ONLY
          </p>
        </>
      )}

      {has && (
        <>
          <Sections sections={after} />
          <Doors doors={read.doors} />
        </>
      )}

      {has && <ProjectActions project={project} />}

      <SavedProjects currentId={project.id} />
    </>
  );
}
