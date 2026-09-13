import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { spatialFallbackReason } from '../../content/brand';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { detectWebGPU } from '../../core/capability';
import { spatialQuality } from '../../spatial/quality';
import { SpatialCanvas } from '../../spatial/SpatialCanvas';
import { clamp01, damp, lerp } from '../../spatial/projection';
import { ParticleField } from './ParticleField';
import {
  STATE_LABEL,
  STATE_NOTE,
  STATE_ORDER,
  TEXT_MAX,
  resetTypedText,
  sanitiseText,
  setTypedText,
  textResolves,
  type MatterState,
} from './targets';
import { MATTER_COPY } from '../../content/matter';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { toMarkdown } from '../../artifacts/artifact';
import './matter.css';
import { useHandoffTarget } from '../../system/work';

/**
 * MATTER ENGINE — CONTROL DIGITAL MATTER.
 *
 * The interface stops being paper and becomes material. Matter is never
 * decorative and never random: every particle is always travelling between two
 * **authored formations**, and every formation is something the Lab has already
 * said — the sheet, the wordmark, the Compiler's planes, the specimen's contour
 * field.
 *
 * Continuous rendering is genuine here, so this is the one mode that opts into
 * `frameloop="always"`. It takes on the corresponding duty: the simulation stops
 * when the tab is hidden, and the canvas is torn down on exit.
 *
 * Particle counts come from measured capability, not from a number that sounded
 * impressive.
 */

const COUNTS: Record<string, number> = {
  ultra: 160000,
  high: 90000,
  balanced: 36000,
  lite: 0,
};

const SPREAD = 900;
const FORCE_LABEL = { attract: 'ATTRACT', repel: 'REPEL', off: 'OFF' } as const;
type ForceMode = keyof typeof FORCE_LABEL;

export default function MatterMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const quality = useMemo(() => spatialQuality(capability), [capability]);
  /* Where the recipe is carried when the visitor sends it on. */
  const recipeTo = useHandoffTarget('matter-engine', ['director', 'anzy-os'], 'anzy-os');

  const count = COUNTS[quality.profile] ?? 0;
  const webgpu = useMemo(() => detectWebGPU(), []);

  const [state, setState] = useState<MatterState>('dust');
  const [previous, setPrevious] = useState<MatterState>('dust');
  const [force, setForce] = useState<ForceMode>('off');
  const [glFailed, setGlFailed] = useState(false);
  const [armed, setArmed] = useState(false);
  const [hidden, setHidden] = useState(false);

  const progressRef = useRef(1);
  /*
   * The still. Left null until a button is pressed; the frame loop clears it,
   * renders and reads the buffer in the same tick. See `ParticleField` for why
   * this is not `preserveDrawingBuffer`.
   */
  const captureRef = useRef<((blob: Blob | null) => void) | null>(null);
  const forceRef = useRef({ x: 0, y: 0, sign: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ---- type matter --------------------------------------------------------
   *
   * `draft` is what is in the field; `typed` is what the matter is actually
   * set in. They are separate so the formation does not re-rasterise on every
   * keystroke — a hundred and sixty thousand targets rebuilt per character is
   * a long task per letter, and it would also mean the visitor watching their
   * own half-finished word assemble and collapse.
   */
  const [draft, setDraft] = useState('');
  const [typed, setTyped] = useState('HI ANZY');
  const [typeStatus, setTypeStatus] = useState<string>(MATTER_COPY.typeReady);

  const active = quality.webgl && count > 0 && !glFailed;

  /* ---- transition + pointer force ---------------------------------------- */
  useEffect(() => {
    const stop = onFrame((dt) => {
      // Reduced motion goes straight to the formation: discrete states, no travel.
      progressRef.current = reduced
        ? 1
        : clamp01(progressRef.current + dt / 1400);

      const f = forceRef.current;
      if (force === 'off' || coarse === undefined) {
        f.sign = lerp(f.sign, 0, damp(0.02, dt));
      } else {
        f.sign = lerp(f.sign, force === 'attract' ? -1 : 1, damp(0.02, dt));
      }
      // Pointer → world space. The camera looks down −z from `cameraDistance`,
      // so screen centre is world origin and one pixel is one unit at z = 0.
      f.x = (pointer.sx - capability.viewport.w / 2) * 1.0;
      f.y = -(pointer.sy - capability.viewport.h / 2) * 1.0;
    });
    scope.add(stop);
    return stop;
  }, [reduced, force, coarse, capability.viewport.w, capability.viewport.h, scope]);

  /* ---- state changes ------------------------------------------------------ */
  const goTo = useCallback(
    (next: MatterState) => {
      setPrevious((p) => (next === p ? p : stateRef.current));
      stateRef.current = next;
      setState(next);
      progressRef.current = reduced ? 1 : 0;
    },
    [reduced],
  );
  const stateRef = useRef<MatterState>('dust');

  /**
   * Set the visitor's phrase, then release the matter and let it re-form.
   *
   * `goTo('type')` from `type` would be a no-op transition, so the formation is
   * restarted by hand: the targets are rebuilt from the new string and progress
   * is reset, which is what makes the old word visibly come apart before the
   * new one assembles rather than snapping between them.
   */
  /**
   * Release the matter, change what it is going to be, then let it re-form.
   *
   * Going straight from `type` to `type` cannot work: both formations would be
   * built from the *new* string, so the old word would not come apart — it
   * would cut. Passing through `dust` is the honest version of the same move
   * and the one the material already knows how to make: the phrase disperses
   * into unformed matter, the targets are recomputed while it is scattered,
   * and it gathers into the new one.
   */
  const reformAs = useCallback(
    (apply: () => void) => {
      apply();
      goTo('dust');
      const id = window.setTimeout(() => goTo('type'), reduced ? 60 : 620);
      scope.add(() => window.clearTimeout(id));
    },
    [goTo, reduced, scope],
  );

  const commitText = useCallback(() => {
    const clean = sanitiseText(draft).trim();
    if (!clean) return;
    if (!textResolves(clean)) {
      setTypeStatus(MATTER_COPY.typeUnsupported);
      return;
    }
    reformAs(() => {
      setTypedText(clean);
      setTyped(clean);
      setTypeStatus(`${MATTER_COPY.typeSetPrefix} ${clean}`);
    });
  }, [draft, reformAs]);

  const restoreWordmark = useCallback(() => {
    reformAs(() => {
      resetTypedText();
      setTyped('HI ANZY');
      setDraft('');
      setTypeStatus(MATTER_COPY.typeRestored);
    });
    inputRef.current?.focus();
  }, [reformAs]);

  /* The wordmark is what this reality opens on, every time. A phrase typed in a
     previous visit surviving into a new one would make the mode's own opening
     statement depend on something the visitor no longer remembers doing. */
  useEffect(() => {
    resetTypedText();
    return () => resetTypedText();
  }, []);

  /* ---- entry --------------------------------------------------------------- */
  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(() => {
      setArmed(true);
      onReady();
      // Arrive as dust, then take the first authored step on its own.
      if (!reduced) window.setTimeout(() => goTo('field'), 900);
    }, reduced ? 160 : 700);
    return () => window.clearTimeout(id);
  }, [onReady, reduced, goTo]);

  /* ---- stop simulating when nobody is looking ----------------------------- */
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    onVis();
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ---- keyboard ------------------------------------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      /*
       * The shortcuts stop at the edge of the text field. 1-6 select a state
       * and A/R/O set the force, which means that before TYPE MATTER existed
       * every one of those keys was free — and the moment a visitor types the
       * letter A into their own phrase, the mode would have yanked the matter
       * toward the pointer. A control surface that fights the input it just
       * offered is worse than no input.
       */
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= STATE_ORDER.length) {
        e.preventDefault();
        goTo(STATE_ORDER[n - 1]);
      } else if (e.key.toLowerCase() === 'a') setForce('attract');
      else if (e.key.toLowerCase() === 'r') setForce('repel');
      else if (e.key.toLowerCase() === 'o') setForce('off');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  /* ---- touch: hold to attract --------------------------------------------- */
  useEffect(() => {
    if (!coarse) return;
    const root = rootRef.current;
    if (!root) return;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      setForce('attract');
      forceRef.current.x = e.clientX - capability.viewport.w / 2;
      forceRef.current.y = -(e.clientY - capability.viewport.h / 2);
    };
    const move = (e: PointerEvent) => {
      forceRef.current.x = e.clientX - capability.viewport.w / 2;
      forceRef.current.y = -(e.clientY - capability.viewport.h / 2);
    };
    const up = () => setForce('off');
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    return () => {
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [coarse, capability.viewport.w, capability.viewport.h]);

  const onGlFailure = useCallback((reason: string) => {
    console.warn('[lab] matter engine WebGL unavailable:', reason);
    setGlFailed(true);
  }, []);

  return (
    <div className="mx" ref={rootRef} data-armed={armed ? 'true' : 'false'}>
      {active ? (
        <div className="mx-canvas">
          <SpatialCanvas
            quality={quality}
            viewport={capability.viewport}
            // The one mode that genuinely evolves every frame — and that stops
            // dead when the tab is hidden.
            frameloop={hidden ? 'demand' : 'always'}
            onFailure={onGlFailure}
          >
            <ParticleField
              count={count}
              state={state}
              previous={previous}
              progressRef={progressRef}
              forceRef={forceRef}
              spread={SPREAD}
              reduced={reduced}
              captureRef={captureRef}
            />
          </SpatialCanvas>
        </div>
      ) : (
        <MatterFallback capability={capability} state={state} />
      )}

      <div className="mx-band">
        <header className="mx-band__head">
          <h2 className="t-display t-display-m mx-title">MATTER ENGINE</h2>
          <p className="t-mono t-mono-xs t-dim mx-tag">CONTROL DIGITAL MATTER.</p>
        </header>

        <div className="mx-band__mid">
          <p className="t-mono t-mono-xs mx-now" role="status">
            <span className="t-signal">{STATE_LABEL[state]}</span>
          </p>
          <p className="t-body-s t-dim mx-note">
            {state === 'type' && typed !== 'HI ANZY' ? MATTER_COPY.typedNote : STATE_NOTE[state]}
          </p>

          {/*
            The instrument's one input, and it belongs to TYPE rather than
            floating above the mode: a text field over a particle demo is a form
            with a toy behind it. Here it is the control for the state it
            changes, and it appears only when that state is the one being read.
          */}
          {state === 'type' && (
            <form
              className="mx-type"
              onSubmit={(e) => {
                e.preventDefault();
                commitText();
              }}
            >
              <label className="t-mono t-mono-xs t-dim mx-type__label" htmlFor="mx-type-input">
                {MATTER_COPY.typeLabel}
              </label>
              <div className="mx-type__row">
                <input
                  id="mx-type-input"
                  ref={inputRef}
                  className="t-mono t-mono-xs mx-type__input"
                  type="text"
                  value={draft}
                  maxLength={TEXT_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="HI ANZY"
                  aria-describedby="mx-type-status"
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="mx-btn t-mono t-mono-xs" disabled={!draft.trim()}>
                  {MATTER_COPY.typeSet}
                </button>
                {typed !== 'HI ANZY' && (
                  <button
                    type="button"
                    className="mx-btn t-mono t-mono-xs"
                    onClick={restoreWordmark}
                  >
                    {MATTER_COPY.typeReset}
                  </button>
                )}
              </div>
              {/* The status is the whole accessibility story for a change that
                  happens in WebGL: a screen reader cannot see a hundred and
                  sixty thousand particles rearrange, so the instrument says
                  what it just set, or why it could not. */}
              <p id="mx-type-status" className="t-mono t-mono-xs mx-type__status" role="status">
                {typeStatus}
              </p>
            </form>
          )}
        </div>

        <dl className="mx-readout">
          <div>
            <dt>PARTICLES</dt>
            <dd>{active ? count.toLocaleString('en') : '—'}</dd>
          </div>
          <div>
            <dt>PROFILE</dt>
            <dd>{quality.profile.toUpperCase()}</dd>
          </div>
          <div>
            <dt>WEBGPU</dt>
            {/* Reported, not used. Saying so is the honest version. */}
            <dd className="t-faint">{webgpu ? 'PRESENT · UNUSED' : 'ABSENT'}</dd>
          </div>
          <div>
            <dt>DRAW</dt>
            <dd>{active ? '1 CALL' : '—'}</dd>
          </div>
        </dl>

        {/*
          WHAT THE VISITOR MADE.

          The phrase and the state are theirs; everything else here describes
          the machine that drew it. The JSON is a recipe rather than a record —
          the same phrase, state and profile rebuild the same formation, because
          the targets are sampled deterministically — and the PNG is the frame
          that was actually on screen when the button was pressed.

          ---- IT IS OFFERED IN THE CALM VERSION TOO -------------------------

          This used to be inside `active`, and `active` is false whenever the
          profile is `lite` — which is what asking for reduced motion selects,
          and what a phone selects, and what a machine without WebGL selects. So
          a visitor who had stated a preference, or was holding a phone, was
          quietly locked out of TURN A MESSAGE INTO MATTER altogether: the index
          promised them a recipe and the mode had no button to make one.

          A recipe is settings. The calm version has every one of them — the
          state, the phrase, the force, the profile — because they are what the
          visitor chose, not what the renderer produced. The one thing it does
          not have is a picture, so the PNG is not offered and the document says
          why rather than leaving somebody to wonder where it went.
        */}
        <ArtifactBar
            formats={active ? ['copy', 'markdown', 'json', 'image'] : ['copy', 'markdown', 'json']}
            label={MATTER_COPY.keepLabel}
            /*
             * Matter's CONTINUE.
             *
             * The recipe travels and the picture does not, and the limits line
             * says so rather than letting somebody discover it in SYSTEM.app.
             * A PNG is handed straight to the browser's download path and never
             * retained — that is the whole reason the capture happens inside the
             * frame loop — so what the project holds is the settings that
             * reproduce the frame, which is the durable half anyway.
             */
            handoff={{
              kind: 'recipe',
              from: 'matter-engine',
              /* DIRECTOR can read the phrase out of this and make it the
                 subject of a film. Nothing else can use it, so nothing else
                 is offered it. */
              to: recipeTo,
              limits: active
                ? 'The settings that produced one frame, not the frame itself. The PNG is downloaded and never kept, so this recipe is what travels — run it again and the same composition comes back, because the targets are sampled deterministically rather than randomly.'
                : 'The settings for a formation this browser did not draw. The field is not rendered here — reduced motion was asked for, or this machine has no WebGL — so there is no picture to keep and none is claimed. Everything a machine that does draw it would need is in the recipe.',
            }}
            build={() => {
              return {
                /* A title a person would write, not a file stem — this is
                   what the project ledger lists. The artifact layer slugs it
                   on the way out to a file. */
                name:
                  state === 'type' && typed.trim()
                    ? `Matter Recipe — “${typed.trim()}”`
                    : `Matter Recipe — ${STATE_LABEL[state]}`,
                text: toMarkdown({
                  title: 'HI ANZY — MATTER',
                  standfirst: active
                    ? 'A formation of the Lab’s particle field. The values below are what produced it; the same ones produce it again, because the targets are sampled deterministically rather than randomly.'
                    : 'A formation of the Lab’s particle field, specified but not drawn here — this browser is running the calm version, which lists the material states rather than rendering them. The values below are what would produce it, and they produce it identically on a machine that draws it, because the targets are sampled deterministically rather than randomly.',
                  sections: [
                    {
                      head: 'THE FORMATION',
                      items: [
                        `State — ${STATE_LABEL[state]}`,
                        state === 'type' ? `Phrase — ${typed}` : '',
                        `Came from — ${STATE_LABEL[previous]}`,
                        `Force — ${force.toUpperCase()}`,
                      ].filter(Boolean),
                    },
                    {
                      head: 'THE MACHINE',
                      items: [
                        active
                          ? `Particles — ${count.toLocaleString('en')}`
                          : 'Particles — NONE DRAWN. The field was not rendered in this browser.',
                        `Quality profile — ${quality.profile.toUpperCase()}`,
                        active ? 'Draw calls — 1' : 'Draw calls — NONE',
                        `Reduced motion — ${reduced ? 'REQUESTED' : 'NOT REQUESTED'}`,
                      ],
                    },
                  ],
                  footer: {
                    GENERATED: new Date().toISOString(),
                    METHOD: 'Deterministic sampling. No randomness is stored because none is used.',
                    STORAGE: 'NONE — nothing was written to this device',
                  },
                }),
                data: {
                  state,
                  previous,
                  phrase: state === 'type' ? typed : null,
                  force,
                  particles: count,
                  profile: quality.profile,
                  reducedMotion: reduced,
                  deterministic: true,
                  generated: new Date().toISOString(),
                },
                /*
                 * Handing the frame loop a request and waiting for it. If the
                 * canvas is gone — WebGL fell over, the mode is unmounting —
                 * the promise resolves null and the bar prints the refusal
                 * rather than saving a blank PNG.
                 */
                canvasBlob: () =>
                  new Promise<Blob | null>((resolve) => {
                    if (!active) {
                      resolve(null);
                      return;
                    }
                    captureRef.current = resolve;
                    window.setTimeout(() => {
                      if (captureRef.current === resolve) {
                        captureRef.current = null;
                        resolve(null);
                      }
                    }, 1200);
                  }),
              };
            }}
          />
      </div>

      <div className="mx-strip" data-disabled={!armed}>
        <div className="mx-strip__group">
          <span className="t-mono t-mono-xs t-faint mx-strip__label">STATE</span>
          <div className="mx-strip__row">
            {STATE_ORDER.map((s, i) => (
              <button
                key={s}
                type="button"
                className="mx-btn t-mono t-mono-xs"
                data-on={state === s ? 'true' : 'false'}
                aria-pressed={state === s}
                onClick={() => goTo(s)}
                onPointerEnter={() => setPointerIntent('discover')}
                onPointerLeave={() => setPointerIntent('default')}
              >
                {STATE_LABEL[s]}
                <span className="mx-btn__key">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mx-strip__group">
          <span className="t-mono t-mono-xs t-faint mx-strip__label">FORCE</span>
          <div className="mx-strip__row">
            {(Object.keys(FORCE_LABEL) as ForceMode[]).map((f) => (
              <button
                key={f}
                type="button"
                className="mx-btn t-mono t-mono-xs"
                data-on={force === f ? 'true' : 'false'}
                aria-pressed={force === f}
                onClick={() => setForce(f)}
              >
                {FORCE_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-strip__group">
          <span className="t-mono t-mono-xs t-faint mx-strip__label">SET</span>
          <div className="mx-strip__row">
            <button
              type="button"
              className="mx-btn t-mono t-mono-xs"
              onClick={() => {
                setForce('off');
                goTo('dust');
              }}
            >
              RESET
            </button>
          </div>
        </div>

        <p className="t-mono t-mono-xs t-faint mx-hint">
          {coarse ? 'HOLD TO PULL MATTER · TAP A STATE' : 'MOVE TO SHAPE · 1–6 STATES · A/R/O FORCE'}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* No WebGL — the states still exist, as a printed plate                        */
/* -------------------------------------------------------------------------- */
function MatterFallback({
  state,
  capability,
}: {
  state: MatterState;
  capability: { webgl: boolean; reducedMotion: boolean };
}) {
  return (
    <div className="mx-fallback">
      <p className="t-mono t-mono-xs mx-fallback__note">
        {`${spatialFallbackReason('This field', capability)} The material states are listed below.`}
      </p>
      <ol className="mx-fallback__list">
        {STATE_ORDER.map((s, i) => (
          <li key={s} data-on={s === state ? 'true' : 'false'}>
            <span className="t-mono t-mono-xs mx-fallback__n">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="t-display t-display-s">{STATE_LABEL[s]}</span>
            <span className="t-body-s t-dim">{STATE_NOTE[s]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
