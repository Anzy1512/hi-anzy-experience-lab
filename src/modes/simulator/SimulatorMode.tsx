import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { setPointerIntent } from '../../core/pointer';
import { useExperience } from '../../experience/context';
import { QUESTIONS, SIM_COPY } from '../../content/simulator';
import { fragmentsFor, run, type Answers } from './model';
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

type Phase = 'brief' | 'asking' | 'system';

export default function SimulatorMode({ onReady, scope }: ModeViewProps) {
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { enterMode } = useExperience();

  const [phase, setPhase] = useState<Phase>('brief');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const question = QUESTIONS[step];
  const fragments = useMemo(() => fragmentsFor(answers), [answers]);
  const reading = useMemo(
    () => (phase === 'system' ? run(answers) : null),
    [phase, answers],
  );

  /* ---- entry ------------------------------------------------------------- */
  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(onReady, reduced ? 150 : 620);
    return () => window.clearTimeout(id);
  }, [onReady, reduced]);

  /* Leaving must not leave the simulation half-run for the next visit. */
  useEffect(() => {
    const reset = () => {
      setPhase('brief');
      setStep(0);
      setAnswers({});
    };
    scope.add(reset);
    return reset;
  }, [scope]);

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
    if (phase === 'system') {
      setPhase('asking');
      setStep(QUESTIONS.length - 1);
      return;
    }
    if (step === 0) {
      setPhase('brief');
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
  }, []);

  /* ---- keyboard ---------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        if (phase === 'brief') return;
        e.preventDefault();
        revise();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, revise]);

  const stageIndex = phase === 'system' ? 4 : phase === 'brief' ? 0 : Math.min(3, step);

  return (
    <div className="sim" ref={rootRef} data-phase={phase}>
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
              onClick={() => setPhase('asking')}
              onPointerEnter={() => setPointerIntent('enter')}
              onPointerLeave={() => setPointerIntent('default')}
            >
              <span className="t-mono">{SIM_COPY.begin}</span>
            </button>
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
          <SystemMap reading={reading} onDistrict={() => enterMode('living-world')} />
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
