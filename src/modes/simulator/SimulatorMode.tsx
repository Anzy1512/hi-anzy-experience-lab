import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { setPointerIntent } from '../../core/pointer';
import { useExperience } from '../../experience/context';
import { QUESTIONS, SIM_COPY } from '../../content/simulator';
import { fragmentsFor, run, type Answers } from './model';
import { buildRun, chosenLabels, tally } from './report';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { briefJson, briefMarkdown, setRun } from '../../system/brief';
import { DISCLAIMER, frame as buildFrame, type Frame } from '../../system/diagnose';
import { FragmentTable } from './FragmentTable';
import { SystemMap } from './SystemMap';
import './simulator.css';

/**
 * AGENCY SIMULATOR — GIVE HI ANZY A PROBLEM.
 *
 * Deliberately **not** another dark contour screen. This mode returns to the
 * `paper` material, because what it actually is is a strategist's table: loose
 * fragments of a brief, pushed around until they become a system. That single
 * decision gives it its own dominant visual behaviour while keeping it
 * unmistakably the same product.
 *
 * The anti-questionnaire rule is structural, not cosmetic. Choosing an option
 * does not advance a form — it **puts words on the table**, and those words stay
 * there, accumulating, until the table has enough material to sort itself into
 * clusters. The visitor watches ambiguity become structure. That *is* the
 * experience; the questions are only how material gets onto the table.
 *
 * Everything is DOM. There is no canvas here: the content is words and their
 * arrangement, which HTML does better than WebGL and which screen readers can
 * follow. Movement is GSAP over real elements.
 */

/**
 * `state` is where the visitor writes the problem in their own words, and it is
 * the phase that turns this from a questionnaire into a simulator. Everything
 * after it is refinement of something they said, rather than a path through
 * options somebody else wrote.
 */
type Phase = 'brief' | 'state' | 'asking' | 'system' | 'report';

export default function SimulatorMode({ onReady, scope }: ModeViewProps) {
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { enterMode } = useExperience();

  const [phase, setPhase] = useState<Phase>('brief');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [said, setSaid] = useState('');
  const [frame, setFrameState] = useState<Frame | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const question = QUESTIONS[step];
  const fragments = useMemo(() => fragmentsFor(answers), [answers]);
  const reading = useMemo(
    () => (phase === 'system' || phase === 'report' ? run(answers) : null),
    [phase, answers],
  );
  /*
   * The five-stage working. Derived rather than stored: it is a pure function
   * of the frame, the reading and the answers, so holding it in state would
   * only create a second copy that could disagree with the panel above it.
   */
  const stages = useMemo(
    () => (phase === 'report' && frame && reading ? buildRun(frame, reading, answers) : null),
    [phase, frame, reading, answers],
  );
  const counts = useMemo(() => (stages ? tally(stages) : null), [stages]);

  /* ---- entry ------------------------------------------------------------- */
  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(onReady, reduced ? 150 : 620);
    return () => window.clearTimeout(id);
  }, [onReady, reduced]);

  /* Leaving must not leave the simulation half-run for the next visit. The
     session brief is deliberately NOT cleared here: a visitor who framed a
     problem and walked to ANZY.OS to read it there has not withdrawn it. */
  useEffect(() => {
    const reset = () => {
      setPhase('brief');
      setStep(0);
      setAnswers({});
      setSaid('');
      setFrameState(null);
      setNoMatch(false);
    };
    scope.add(reset);
    return reset;
  }, [scope]);

  /* ---- stating the problem ----------------------------------------------- */
  const stateProblem = useCallback(() => {
    const text = said.trim();
    if (!text) return;
    const f = buildFrame(text);
    if (f.empty) {
      /* An unmatched sentence is not an error and is not advanced past. The
         model has nothing to say about it and says so, which is the whole
         reason this is a lookup rather than something that always answers. */
      setNoMatch(true);
      setFrameState(null);
      return;
    }
    setNoMatch(false);
    setFrameState(f);
    setPhase('asking');
  }, [said]);

  /* ---- flow -------------------------------------------------------------- */
  const choose = useCallback(
    (optionId: string) => {
      const q = QUESTIONS[step];
      setAnswers((a) => ({ ...a, [q.id]: optionId }));
      if (step + 1 >= QUESTIONS.length) {
        // A beat before the table sorts itself: the last fragments have to land.
        window.setTimeout(() => setPhase('system'), reduced ? 120 : 700);
      } else {
        setStep((s) => s + 1);
      }
    },
    [step, reduced],
  );

  const revise = useCallback(() => {
    if (phase === 'report') {
      setPhase('system');
      return;
    }
    if (phase === 'system') {
      setPhase('asking');
      setStep(QUESTIONS.length - 1);
      return;
    }
    if (step === 0) {
      setPhase('state');
      return;
    }
    const prev = QUESTIONS[step - 1];
    setAnswers((a) => {
      const next = { ...a };
      delete next[prev.id];
      return next;
    });
    setStep((s) => s - 1);
  }, [phase, step]);

  const restart = useCallback(() => {
    setPhase('brief');
    setStep(0);
    setAnswers({});
    setSaid('');
    setFrameState(null);
    setNoMatch(false);
  }, []);

  /* ---- keyboard ---------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      /*
       * The problem is typed into a real textarea now, so Backspace belongs to
       * whatever has focus before it belongs to this mode. Without this guard
       * deleting a character walks the visitor back a step instead.
       */
      const el = document.activeElement;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        if (phase === 'brief') return;
        e.preventDefault();
        revise();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, revise]);

  const stageIndex =
    phase === 'report' || phase === 'system' ? 4 : phase === 'brief' || phase === 'state' ? 0 : Math.min(3, step);

  return (
    <div className="sim" ref={rootRef} data-material="paper" data-phase={phase}>
      {/* The table is always present. It is the thing that changes. */}
      <FragmentTable
        fragments={fragments}
        reading={reading}
        phase={phase}
        reduced={reduced}
      />

      <div className="sim-panel">
        <header className="sim-panel__head">
          <p className="t-mono t-mono-xs sim-panel__stage">
            {SIM_COPY.stages.map((s, i) => (
              <span key={s} data-on={i <= stageIndex ? 'true' : 'false'}>
                {s}
              </span>
            ))}
          </p>
        </header>

        {phase === 'brief' && (
          <section className="sim-brief">
            <h2 className="t-display t-display-l sim-brief__title">{SIM_COPY.title}</h2>
            <p className="t-body sim-brief__intro">{SIM_COPY.intro}</p>
            <button
              type="button"
              className="sim-begin"
              onClick={() => setPhase('state')}
              onPointerEnter={() => setPointerIntent('enter')}
              onPointerLeave={() => setPointerIntent('default')}
            >
              <span className="t-mono">{SIM_COPY.begin}</span>
            </button>
          </section>
        )}

        {phase === 'state' && (
          <section className="sim-state">
            <h2 className="t-display t-display-m sim-ask__prompt">{SIM_COPY.stateTitle}</h2>
            <p className="t-body-s t-dim sim-ask__note">{SIM_COPY.stateNote}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                stateProblem();
              }}
            >
              <label className="sim-state__label t-mono t-mono-xs t-dim" htmlFor="sim-said">
                THE PROBLEM
              </label>
              <textarea
                id="sim-said"
                className="t-body sim-state__input"
                value={said}
                onChange={(e) => {
                  setSaid(e.target.value);
                  if (noMatch) setNoMatch(false);
                }}
                placeholder={SIM_COPY.statePlaceholder}
                rows={3}
                autoComplete="off"
                /*
                 * Enter submits, Shift+Enter makes a new line. A textarea is
                 * right here — problems arrive as two sentences more often than
                 * one — but a form whose primary action needs a mouse would be
                 * the wrong trade in a mode that is otherwise fully keyboard.
                 */
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    stateProblem();
                  }
                }}
              />
              <div className="sim-state__row">
                <button type="submit" className="sim-begin" disabled={!said.trim()}>
                  <span className="t-mono">{SIM_COPY.stateGo}</span>
                </button>
                <button
                  type="button"
                  className="sim-act"
                  onClick={() => {
                    setSaid(SIM_COPY.statePlaceholder.replace(/^e\.g\. /, ''));
                    setNoMatch(false);
                  }}
                >
                  {SIM_COPY.stateExample}
                </button>
              </div>
            </form>
            {/* Always in the DOM so the region is not announced as it appears. */}
            <p className="t-body-s sim-state__miss" role="status" data-on={noMatch ? 'true' : 'false'}>
              {noMatch ? SIM_COPY.stateEmpty : ''}
            </p>
          </section>
        )}

        {phase === 'asking' && question && (
          <section className="sim-ask" aria-live="polite">
            <p className="t-mono t-mono-xs t-dim sim-ask__meta">
              <span className="t-signal">
                {String(step + 1).padStart(2, '0')}/{String(QUESTIONS.length).padStart(2, '0')}
              </span>
              <span className="t-faint"> · </span>
              {question.stage}
            </p>
            <h2 className="t-display t-display-m sim-ask__prompt">{question.prompt}</h2>
            <p className="t-body-s t-dim sim-ask__note">{question.note}</p>

            <ul className="sim-options">
              {question.options.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="sim-option"
                    onClick={() => choose(o.id)}
                    onPointerEnter={() => setPointerIntent('enter')}
                    onPointerLeave={() => setPointerIntent('default')}
                  >
                    <span className="sim-option__mark" aria-hidden="true" />
                    <span className="t-mono sim-option__label">{o.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {phase === 'system' && reading && (
          <>
            <SystemMap reading={reading} onDistrict={() => enterMode('living-world')} />
            <button type="button" className="sim-begin sim-begin--run" onClick={() => setPhase('report')}>
              <span className="t-mono">{SIM_COPY.runGo}</span>
            </button>
          </>
        )}

        {phase === 'report' && stages && counts && frame && (
          <section className="sim-report">
            <h2 className="t-display t-display-m sim-report__title">{SIM_COPY.runTitle}</h2>
            <p className="t-body-s t-dim sim-report__note">{SIM_COPY.runNote}</p>

            {/* The proportions, stated before the document rather than after it. */}
            <p className="t-mono t-mono-xs sim-report__tally">
              {(['FACT', 'DERIVED', 'UNKNOWN', 'RECOMMENDATION'] as const).map((k) => (
                <span key={k} data-p={k}>
                  {k} {counts[k]}
                </span>
              ))}
            </p>

            <dl className="sim-report__legend">
              {(['FACT', 'DERIVED', 'UNKNOWN', 'RECOMMENDATION'] as const).map((k) => (
                <div key={k}>
                  <dt className="t-mono t-mono-xs" data-p={k}>
                    {k}
                  </dt>
                  <dd className="t-body-s t-dim">{SIM_COPY.legend[k]}</dd>
                </div>
              ))}
            </dl>

            <ol className="sim-report__stages">
              {stages.map((st) => (
                <li key={st.label}>
                  <h3 className="t-mono t-mono-s sim-report__stage">
                    <span className="t-signal">{st.label}</span>
                    <span className="t-faint"> · </span>
                    <span className="t-dim">{st.title}</span>
                  </h3>
                  {/*
                    A stage is blocks, not a list. Each block is a question the
                    stage answers, and the note under a heading says what the
                    block is for where the heading alone will not carry it —
                    "WHAT IS PULLING HARDEST" needs to say that a weight counts
                    answers rather than scoring the business.
                  */}
                  {st.groups.map((grp) => (
                    <section className="sim-report__group" key={`${st.label}-${grp.head}`}>
                      <h4 className="t-mono t-mono-xs sim-report__group-head">{grp.head}</h4>
                      {grp.note && (
                        <p className="t-body-s t-dim sim-report__group-note">{grp.note}</p>
                      )}
                      <ul className="sim-report__lines">
                        {grp.lines.map((l, i) => (
                          <li key={`${grp.head}-${i}`}>
                            <span className="t-mono t-mono-xs sim-report__p" data-p={l.p}>
                              {l.p}
                            </span>
                            <span className="t-body-s sim-report__text">{l.text}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </li>
              ))}
            </ol>

            <ArtifactBar
              formats={['copy', 'markdown', 'json']}
              label="THE BRIEF"
              /*
               * The brief goes to the operating environment.
               *
               * This was a hand-written button that called the brief store's
               * setter and printed SENT, leaving the visitor to walk to Anzy.OS
               * themselves. It now goes through the shared handoff: the brief is
               * recorded as a dated artifact in the project, offered to the
               * environment, and the visitor is taken there. `onSend` keeps the
               * live brief state in step, because SYSTEM.app has drawn from it
               * since Phase 8.6 and that is still the surface it renders.
               */
              handoff={{
                kind: 'brief',
                from: 'agency-simulator',
                to: 'anzy-os',
                limits:
                  'A structured mapping of your words onto Hi Anzy’s own method and service categories. It is not an audit, a forecast or a professional diagnosis, and every line is marked with where it came from — most of them are DERIVED, and the UNKNOWN lines are the work a real audit would still have to do.',
                onSend: () => {
                  if (frame && stages) setRun(frame, stages, chosenLabels(answers));
                },
              }}
              build={() => {
                /* Composed from a state object built here rather than from the
                   store, so the file is what is on screen even if the visitor
                   has not pressed SEND. */
                const s = {
                  frame,
                  stages,
                  selected: chosenLabels(answers),
                  origin: 'simulator' as const,
                };
                return {
                  name: 'Hi Anzy System Brief',
                  text: briefMarkdown(s),
                  data: briefJson(s),
                };
              }}
            />

            <p className="t-body-s t-dim sim-report__disclaimer">{DISCLAIMER}</p>
          </section>
        )}

        <footer className="sim-panel__foot">
          {phase !== 'brief' && (
            <button type="button" className="sim-act" onClick={revise}>
              {SIM_COPY.back}
            </button>
          )}
          {phase !== 'brief' && (
            <button type="button" className="sim-act" onClick={restart}>
              {SIM_COPY.restart}
            </button>
          )}
          <p className="t-mono t-mono-xs t-faint sim-panel__hint">
            {coarse ? SIM_COPY.hintTouch : SIM_COPY.hintPointer}
          </p>
        </footer>
      </div>
    </div>
  );
}
