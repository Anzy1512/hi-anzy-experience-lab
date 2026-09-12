import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useExperience } from '../../experience/context';
import { useCapability, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { setPointerIntent } from '../../core/pointer';
import {
  ACTS,
  DIRECTOR_COPY,
  LONG_EDIT,
  PRIMARY_EDIT,
} from '../../content/director';
import { MODES, onlineCount } from '../../content/lab';
import { specimenSrc } from '../../content/specimens';
import { useAudio } from '../../audio/useAudio';
import { degree, play, type Family } from '../../audio/voices';
import { Shot } from './Shot';
import { gateFor } from './gate';
import './director.css';

/**
 * DIRECTOR — WATCH HI ANZY BECOME A SYSTEM.
 *
 * The browser performs the film. There is no video file, no pre-render, and no
 * sequential loading of other modes — this is a dedicated lightweight
 * composition built from the Lab's own visual language, so it costs a few
 * kilobytes and starts instantly.
 *
 * One clock drives everything. Each shot is handed `p` from 0 to 1 and derives
 * its whole composition from that number, which is what makes PAUSE real: the
 * clock stops, and because nothing is a CSS animation, nothing keeps running.
 *
 * Sound is offered before playback and never assumed. The film is written to
 * work in silence — the audio engine is a layer it can take or leave.
 */

type Stage = 'offer' | 'playing' | 'paused' | 'done';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * The score. One cue per shot, drawn from the Lab's own sonic vocabulary —
 * there is no music file, and the film is written so that losing all of this
 * costs it nothing.
 */
const CUE_FAMILY: Record<string, Family> = {
  slate: 'MACHINE',
  wordmark: 'SIGNAL',
  statement: 'INK',
  scatter: 'PAPER',
  grid: 'STRUCTURE',
  stages: 'STRUCTURE',
  plate: 'INK',
  roster: 'MACHINE',
  mark: 'SIGNAL',
  end: 'CULTURE',
};

export default function DirectorMode({ onReady, onExit, scope }: ModeViewProps) {
  const reduced = useReducedMotion();
  const capability = useCapability();
  const gate = useMemo(() => gateFor(capability.viewport), [capability.viewport]);
  const { enterMode } = useExperience();

  /*
   * WHICH CUT.
   *
   * The primary cut is what a visitor gets. The long edit is not deleted — it
   * is a real piece of work and every shot in it is good — but a film that asks
   * for 1:51 has to need 1:51, and this one restated itself to fill the time.
   * It stays reachable from the offer card for anyone who wants it, chosen
   * before the film starts rather than switchable mid-run: changing the edit
   * under a running clock would land the visitor at an arbitrary point in a
   * different film.
   */
  const [cut, setCut] = useState<'primary' | 'long'>('primary');
  const { shots, cues, runtime } = cut === 'long' ? LONG_EDIT : PRIMARY_EDIT;

  const [stage, setStage] = useState<Stage>('offer');
  const [t, setT] = useState(0);
  const [wantSound, setWantSound] = useState(false);

  /**
   * The film runs on wall time, not on accumulated frame deltas.
   *
   * `core/raf` clamps dt to 64ms so a tab-restore spike cannot teleport an
   * animation. That is right for physics and wrong for a film: on a machine
   * dropping frames, an 88-second cut assembled from clamped deltas plays in
   * slow motion and the edit stops being an edit. `base` holds the seconds
   * already played, `since` is when the current run began.
   */
  const clock = useRef(0);
  const base = useRef(0);
  const since = useRef(0);
  const running = useRef(false);
  const lastCue = useRef(-1);

  const { state: audioState, scene, enable, muted, toggleMute } = useAudio(scope);

  /* ---- one clock ---------------------------------------------------------- */
  useEffect(() => {
    const stop = onFrame(() => {
      if (!running.current) return;
      clock.current = Math.min(runtime, base.current + (performance.now() - since.current) / 1000);
      // React hears about the clock in tenths; the shots interpolate the rest.
      const rounded = Math.round(clock.current * 10) / 10;
      setT((prev) => (prev === rounded ? prev : rounded));
      if (clock.current >= runtime) {
        running.current = false;
        setStage('done');
      }
    });
    scope.add(stop);
    return stop;
  }, [scope, runtime]);

  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(onReady, reduced ? 120 : 320);
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- transport ---------------------------------------------------------- */
  const begin = useCallback(
    async (sound: boolean) => {
      setWantSound(sound);
      // Enabled from the click itself, which is the only place a browser will
      // allow an AudioContext to start.
      if (sound) await enable();
      clock.current = 0;
      base.current = 0;
      since.current = performance.now();
      lastCue.current = -1;
      running.current = true;
      setStage('playing');
    },
    [enable],
  );

  const pause = useCallback(() => {
    base.current += (performance.now() - since.current) / 1000;
    running.current = false;
    setStage('paused');
  }, []);

  const resume = useCallback(() => {
    since.current = performance.now();
    running.current = true;
    setStage('playing');
  }, []);

  const skip = useCallback(() => {
    running.current = false;
    base.current = runtime;
    clock.current = runtime;
    setT(runtime);
    setStage('done');
  }, [runtime]);

  const replay = useCallback(() => {
    clock.current = 0;
    base.current = 0;
    since.current = performance.now();
    setT(0);
    running.current = true;
    setStage('playing');
  }, []);

  /* ---- keyboard transport -------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (stage === 'playing') pause();
        else if (stage === 'paused') resume();
        else if (stage === 'offer') void begin(false);
        else if (stage === 'done') replay();
      } else if (e.key.toLowerCase() === 's' && stage !== 'offer') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, pause, resume, begin, skip, replay]);

  /* ---- which shot ---------------------------------------------------------- */
  const { index, p } = useMemo(() => {
    let i = 0;
    for (let n = 0; n < shots.length; n++) if (t >= cues[n]) i = n;
    const local = (t - cues[i]) / shots[i].dur;
    return { index: i, p: Math.max(0, Math.min(1, local)) };
  }, [t, cues, shots]);

  /*
   * ---- the next plate, fetched while the current one is on screen --------
   *
   * `SpecimenPlate` is `loading="lazy"`, which is right everywhere else and
   * wrong inside a film: the browser did not begin fetching a specimen until
   * its own shot mounted, so the shot opened on an empty halftone card and
   * the photograph arrived late. On localhost that is about 4ms and invisible;
   * on a real connection it is the first thing a visitor sees of an authored
   * shot.
   *
   * So the film reads one shot ahead, which is what a projectionist does. Only
   * the next specimen is warmed — never the Lab's whole image library — and
   * `decode()` takes it all the way to a paintable frame rather than stopping
   * at bytes received. Failures are deliberately swallowed: a warm-up that
   * does not land must never break the performance, the shot simply arrives
   * as it did before.
   */
  useEffect(() => {
    if (stage !== 'playing') return;
    let next: string | undefined;
    for (let n = index + 1; n < shots.length; n++) {
      if (shots[n].specimen) {
        next = shots[n].specimen;
        break;
      }
    }
    if (!next) return;
    let img: HTMLImageElement | null = new Image();
    img.decoding = 'async';
    img.src = specimenSrc(next);
    void img.decode().catch(() => {});
    return () => {
      img = null;
    };
  }, [index, stage, shots]);

  /* ---- the score: one cue per shot, and nothing if sound was declined ---- */
  useEffect(() => {
    if (!scene || lastCue.current === index) return;
    lastCue.current = index;
    const kind = shots[index].kind;
    const family = CUE_FAMILY[kind] ?? 'STRUCTURE';
    const base = 0.28 + (shots[index].act / 6) * 0.5;
    play(scene, family, degree(base), { level: 0.5, pan: (index % 3) * 0.28 - 0.28 });
    // Statements get a second, quieter strike a beat later — the line landing.
    if (kind === 'statement') {
      play(scene, 'SIGNAL', degree(base + 0.2), { level: 0.22, when: 0.42, distance: 0.4 });
    }
  }, [index, scene, shots]);

  const shot = shots[index];
  const act = shot.act;
  const progress = runtime > 0 ? t / runtime : 0;
  const playing = stage === 'playing' || stage === 'paused';

  return (
    <div className="dr" data-stage={stage}>
      {/* ---- the frame ---------------------------------------------------- */}
      {playing && (
        <div className="dr-frame">
          <div className="dr-gate" style={{ width: gate.w, height: gate.h }}>
            {/* Four corner marks. A gate is a full rectangle — unlike a
                specimen plate, which gets two because it is stock that was cut
                rather than a frame something is being shot through. */}
            <span className="dr-gate__marks" aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            {/* Keyed on the shot so each one mounts fresh; the gate itself does
                not remount, or its marks would blink on every cut. */}
            <div className="dr-gate__inner" key={index}>
              <Shot shot={shot} p={p} reduced={reduced} scope={scope} gate={gate} />
            </div>
          </div>
        </div>
      )}

      {/* ---- act slug + transport ------------------------------------------ */}
      {playing && (
        <>
          <p className="t-mono t-mono-xs dr-act" role="status" aria-live="polite">
            <span className="t-signal">ACT {ROMAN[act]}</span>
            <span className="t-faint"> · </span>
            <span className="t-dim">{ACTS[act]}</span>
          </p>

          <div className="dr-transport">
            <button type="button" className="dr-btn" onClick={stage === 'playing' ? pause : resume}>
              {stage === 'playing' ? DIRECTOR_COPY.pause : DIRECTOR_COPY.resume}
            </button>
            <button type="button" className="dr-btn" onClick={skip}>
              {DIRECTOR_COPY.skip}
            </button>
            {audioState === 'on' && (
              <button type="button" className="dr-btn" onClick={toggleMute} aria-pressed={muted}>
                {muted ? 'UNMUTE' : 'MUTE'}
              </button>
            )}
            <span className="t-mono t-mono-xs t-faint dr-time">
              {fmt(t)} / {fmt(runtime)}
            </span>
          </div>

          <div className="dr-progress" aria-hidden="true">
            <span className="dr-progress__fill" style={{ transform: `scaleX(${progress})` }} />
            {cues.map((c) => (
              <span key={c} className="dr-progress__cue" style={{ left: `${(c / runtime) * 100}%` }} />
            ))}
          </div>
        </>
      )}

      {/* ---- before playback: the sound decision, made by the visitor ------ */}
      {stage === 'offer' && (
        <div className="dr-offer">
          <p className="t-mono t-mono-xs t-signal dr-offer__eyebrow">{DIRECTOR_COPY.title}</p>
          <h2 className="t-display t-display-l dr-offer__title">{DIRECTOR_COPY.tagline}</h2>
          <p className="t-mono t-mono-xs t-faint dr-offer__runtime">
            {DIRECTOR_COPY.runtime} {fmt(runtime)} · {shots.length} SHOTS
          </p>

          {/*
            THE CUT, CHOSEN BEFORE THE CLOCK STARTS.

            Not a control inside the film: swapping the edit under a running
            clock would drop the visitor at an arbitrary point in a different
            film. The long edit is not a director's-cut curiosity, it is the
            previous version of this film — kept because every shot in it is
            good and only its length was wrong.
          */}
          <div className="dr-cut" role="group" aria-label="Which cut">
            <button
              type="button"
              className="t-mono t-mono-xs dr-cut__btn"
              data-on={cut === 'primary' ? 'true' : 'false'}
              onClick={() => setCut('primary')}
            >
              {DIRECTOR_COPY.cutPrimary}
            </button>
            <button
              type="button"
              className="t-mono t-mono-xs dr-cut__btn"
              data-on={cut === 'long' ? 'true' : 'false'}
              onClick={() => setCut('long')}
            >
              {DIRECTOR_COPY.cutLong}
            </button>
          </div>

          <p className="t-body-s t-dim dr-offer__note">{DIRECTOR_COPY.soundNote}</p>
          <div className="dr-offer__actions">
            <button type="button" className="dr-btn dr-btn--signal" onClick={() => begin(true)}>
              {DIRECTOR_COPY.soundOn}
            </button>
            <button type="button" className="dr-btn" onClick={() => void begin(false)}>
              {DIRECTOR_COPY.silent}
            </button>
          </div>
        </div>
      )}

      {/* ---- after: where to go next --------------------------------------- */}
      {stage === 'done' && (
        <div className="dr-outro">
          <h2 className="t-display t-display-l dr-outro__title">{DIRECTOR_COPY.endTitle}</h2>
          <p className="t-mono t-mono-xs t-signal">{DIRECTOR_COPY.endSub}</p>
          <p className="t-body-s t-dim dr-outro__line">{DIRECTOR_COPY.endLine(onlineCount(), MODES.length)}</p>
          <div className="dr-outro__actions">
            <button type="button" className="dr-btn dr-btn--signal" onClick={() => enterMode('living-world')}>
              ENTER THE WORLD
            </button>
            <button type="button" className="dr-btn" onClick={replay}>
              {DIRECTOR_COPY.replay}
            </button>
            <button type="button" className="dr-btn" onClick={onExit}>
              BACK TO THE INDEX
            </button>
          </div>
        </div>
      )}

      {/* The film says what the audio is actually doing, including when the
          browser refused — never a speaker icon that means nothing. */}
      {playing && (
        <p className="t-mono t-mono-xs t-faint dr-sound" role="status">
          {audioState === 'on'
            ? muted
              ? 'SCORE MUTED'
              : 'SCORE PLAYING'
            : wantSound
              ? 'BROWSER DECLINED AUDIO · PLAYING SILENT'
              : 'PLAYING SILENT'}
        </p>
      )}
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
