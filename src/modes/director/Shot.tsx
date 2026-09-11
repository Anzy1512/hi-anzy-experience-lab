import {
  FRAGMENTS,
  STAGES,
  DIRECTOR_COPY,
  type Anchor,
  type Lens,
  type Shot as ShotDef,
} from '../../content/director';
import { MODES, onlineCount } from '../../content/lab';
import { SpecimenPlate } from '../../components/Specimen/SpecimenPlate';
import { specimen } from '../../content/specimens';
import type { CleanupScope } from '../../core/cleanup';
import type { Gate } from './gate';

/**
 * THE SHOTS.
 *
 * Every composition is progress-driven: it receives `p` (0..1 through the shot)
 * and derives everything from it. There is not one CSS `animation` in this mode
 * — which is why PAUSE genuinely stops the film rather than freezing a picture
 * while timelines keep running underneath.
 *
 * The visual language is the Lab's own: plates pulling into register, drawn
 * rules, measured grids, registration marks. Nothing here is a kinetic-type
 * preset.
 */

/** Eased 0..1 over a window inside the shot. */
function span(p: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (p - a) / (b - a)));
}
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function Shot({
  shot,
  p,
  reduced,
  scope,
  gate,
}: {
  shot: ShotDef;
  p: number;
  reduced: boolean;
  scope: CleanupScope;
  gate: Gate;
}) {
  // Reduced motion cuts to the composed frame: every shot is an editorial
  // tableau that arrives whole. The film keeps its structure and its silence.
  const q = reduced ? 1 : p;
  // Where in the gate this shot composes. The default is deliberately NOT
  // centre-for-everything any more — see `Anchor` in content/director.ts.
  const a = shot.anchor ?? 'centre';

  switch (shot.kind) {
    case 'slate':
      return <Slate p={q} caption={shot.caption ?? ''} reduced={reduced} anchor={a} />;
    case 'wordmark':
      return <Wordmark p={q} reduced={reduced} anchor={a} />;
    case 'statement':
      return (
        <Statement
          p={q}
          lines={shot.lines ?? []}
          still={!!shot.still}
          reduced={reduced}
          anchor={a}
        />
      );
    case 'scatter':
      return <Scatter p={q} caption={shot.caption ?? ''} reduced={reduced} anchor={a} />;
    case 'grid':
      return <Grid p={q} caption={shot.caption ?? ''} reduced={reduced} anchor={a} />;
    case 'stages':
      return <Stages p={q} caption={shot.caption ?? ''} reduced={reduced} anchor={a} />;
    case 'plate':
      return <Plate p={q} caption={shot.caption ?? ''} reduced={reduced} anchor={a} />;
    case 'roster':
      return <Roster p={q} caption={shot.caption ?? ''} anchor={a} />;
    case 'mark':
      return <Mark p={q} reduced={reduced} anchor={a} />;
    case 'specimen':
      return (
        <SpecimenShot
          p={q}
          id={shot.specimen ?? ''}
          caption={shot.caption ?? ''}
          lens={shot.lens ?? 'hold'}
          focus={shot.focus ?? 0.5}
          focusTo={shot.focusTo ?? shot.focus ?? 0.5}
          anchor={a}
          reduced={reduced}
          scope={scope}
          gate={gate}
        />
      );
    case 'end':
      return <End p={q} anchor={a} />;
  }
}

/* -------------------------------------------------------------------------- */

/**
 * HOW FAR THE LENS MAGNIFIES A CROPPED SHOT.
 *
 * The scaled plate stands 1.7 gate-heights tall, which puts the crop around
 * 1.8× native on this set and leaves it 0.35 of a gate-height of travel before
 * the window reaches the plate's edge — enough for the two moves the edit asks
 * for and not so much that the film starts roaming around inside a photograph.
 */
const MAG = 1.7;

/**
 * A specimen, and a lens.
 *
 * All four brand plates used to be shown the same way — whole, centred, 330px
 * wide, dropped into a 1440px frame. Four postcards on four black walls. The
 * plate is the best material this film has and it was being presented, not
 * filmed.
 *
 * There are four shots now instead of one, and they are the four moves the
 * captions were already describing. `hold` keeps a plate whole and never above
 * native. `close` crops in and stops. `down` and `up` travel the crop across
 * the plate, so "THE SAME MEASURE, TWICE" is found by moving from the clock to
 * the wristwatch rather than asserted underneath a picture of both.
 *
 * ── WHERE THE MAGNIFICATION LIVES ───────────────────────────────────────────
 *
 * `SpecimenPlate` clamps its drawn width to the specimen's native size and
 * that guarantee is left intact: the plate below is always requested at native
 * and the enlargement is a `scale()` on the carriage that holds it. That is not
 * a workaround, it is the correct model — a lens magnifies, the print does not
 * change size — and it keeps the primitive's promise true for Anzy.OS and
 * Memory, which have no camera and must never be upscaled.
 *
 * Reduced motion falls back to `hold` rather than freezing a travelling crop
 * mid-move: the whole plate contains both the clock and the watch, so the
 * information the move was carrying survives without the movement.
 */
function SpecimenShot({
  p,
  id,
  caption,
  lens,
  focus,
  focusTo,
  anchor,
  reduced,
  scope,
  gate,
}: {
  p: number;
  id: string;
  caption: string;
  lens: Lens;
  focus: number;
  focusTo: number;
  anchor: Anchor;
  reduced: boolean;
  scope: CleanupScope;
  gate: Gate;
}) {
  const spec = specimen(id);
  const settle = ease(span(p, 0.04, 0.62));
  /*
   * The dissolve is its own ramp, not a by-product of `settle`.
   *
   * It used to be `min(settle * 1.8, 1)`, and `settle` is a cubic ease over
   * the first 62% of the shot — so at a tenth of the way in the frame was
   * still at two thousandths of an opacity. Measured on the clock shot: a
   * full second of black at the head of a six-second take, and another half
   * second lost at the tail. A dissolve is half a second at each end; the
   * plate's own arrival easing is a separate thing and stays separate.
   */
  const opacity = reduced ? 1 : span(p, 0, 0.09) * (1 - span(p, 0.94, 1));
  if (!spec) return null;

  /* ---- HOLD — the whole plate, never above native ----------------------- */
  if (lens === 'hold' || reduced) {
    // Off-axis on arrival, square by the middle of the shot. Small numbers:
    // this is a plate being set down, not a card being flipped.
    const rx = reduced ? 0 : (1 - settle) * -6;
    const ry = reduced ? 0 : (1 - settle) * 11;
    return (
      <div className="dr-shot dr-specimen" data-anchor={anchor} data-lens="hold" style={{ opacity }}>
        <SpecimenPlate
          id={id}
          reduced={reduced}
          scope={scope}
          width={spec.w}
          maxHeight={Math.round(gate.h * 0.84)}
          separation={0.85}
          tilt={{ rx, ry }}
        />
        {caption && <p className="t-mono t-mono-xs t-dim dr-specimen__caption">{caption}</p>}
      </div>
    );
  }

  /* ---- CROP — the gate shows part of a magnified plate ------------------- */
  const k = (gate.h * MAG) / spec.h;
  const H = spec.h * k;
  const W = spec.w * k;
  // The window never reaches past the plate's own edges.
  const limit = Math.max(0, (H - gate.h) / 2);
  const travel = lens === 'close' ? 1 : ease(span(p, 0.1, 0.96));
  const f = focus + (focusTo - focus) * travel;
  const dy = Math.max(-limit, Math.min(limit, (0.5 - f) * H));

  return (
    <div className="dr-shot dr-specimen" data-anchor={anchor} data-lens={lens} style={{ opacity }}>
      <div className="dr-lens" style={{ width: Math.round(Math.min(W, gate.w)), height: gate.h }}>
        <div
          className="dr-lens__carriage"
          style={{ transform: `translateY(${dy.toFixed(1)}px) scale(${k.toFixed(3)})` }}
        >
          <SpecimenPlate
            id={id}
            reduced={reduced}
            scope={scope}
            width={spec.w}
            /* Marks off and separation halved: trim corners belong to a plate
               being examined, not to a frame being shot through, and the
               collage's own depth is about to be multiplied by the lens. */
            marks={false}
            separation={0.45}
            tilt={{ rx: 0, ry: 2.5 }}
          />
        </div>
      </div>
      {caption && <p className="t-mono t-mono-xs t-dim dr-specimen__caption">{caption}</p>}
    </div>
  );
}

function Slate({ p, caption, reduced, anchor }: { p: number; caption: string; reduced: boolean; anchor: Anchor }) {
  const on = reduced ? 1 : span(p, 0.06, 0.3) * (1 - span(p, 0.82, 1));
  return (
    <div className="dr-shot dr-slate" data-anchor={anchor}>
      <p className="t-mono t-mono-xs dr-slate__line" style={{ opacity: on }}>
        {caption}
      </p>
    </div>
  );
}

/** Three plates pulling into register — the Lab's own reveal, at film scale. */
function Wordmark({ p, reduced, anchor }: { p: number; reduced: boolean; anchor: Anchor }) {
  const k = reduced ? 1 : ease(span(p, 0.05, 0.62));
  const off = (1 - k) * 46;
  const out = span(p, 0.86, 1);
  return (
    <div className="dr-shot dr-wordmark" data-anchor={anchor} style={{ opacity: 1 - out }}>
      <div className="dr-wordmark__stack">
        <span
          className="t-display dr-wordmark__plate dr-wordmark__plate--a"
          style={{ transform: `translateY(${-off}px)`, opacity: 0.55 + k * 0.45 }}
          aria-hidden="true"
        >
          HI ANZY
        </span>
        <span
          className="t-display dr-wordmark__plate dr-wordmark__plate--b"
          style={{ transform: `translateY(${off}px)`, opacity: 0.55 + k * 0.45 }}
          aria-hidden="true"
        >
          HI ANZY
        </span>
        <span className="t-display dr-wordmark__plate dr-wordmark__plate--k">HI ANZY</span>
      </div>
      <p className="t-mono t-mono-xs t-faint dr-wordmark__reg" style={{ opacity: k }}>
        REGISTRATION {k > 0.98 ? 'IN TOLERANCE' : `${Math.round((1 - k) * 100)}% OUT`}
      </p>
    </div>
  );
}

/** Type revealed by a rising mask, never by a fade-up. */
function Statement({
  p,
  lines,
  still,
  reduced,
  anchor,
}: {
  p: number;
  lines: string[];
  still: boolean;
  reduced: boolean;
  anchor: Anchor;
}) {
  const out = span(p, 0.88, 1);
  return (
    <div className="dr-shot dr-statement" data-anchor={anchor} style={{ opacity: 1 - out }}>
      {lines.map((line, i) => {
        const k = reduced ? 1 : ease(span(p, 0.04 + i * 0.13, 0.42 + i * 0.13));
        return (
          <span className="dr-statement__mask" key={line}>
            <span
              className="t-display dr-statement__line"
              style={{
                transform: `translateY(${(1 - k) * 105}%)`,
                letterSpacing: still ? undefined : `${(1 - k) * 0.06}em`,
              }}
            >
              {line}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Act II: four capabilities that never met, drifting apart. */
function Scatter({ p, caption, reduced, anchor }: { p: number; caption: string; reduced: boolean; anchor: Anchor }) {
  const k = reduced ? 0.35 : ease(span(p, 0.1, 0.86));
  const out = span(p, 0.9, 1);
  return (
    <div className="dr-shot dr-scatter" data-anchor={anchor} style={{ opacity: 1 - out }}>
      <div className="dr-scatter__field">
        {FRAGMENTS.map((f, i) => {
          const dir = [-1, 1, -1, 1][i];
          const lift = [-1, -1, 1, 1][i];
          return (
            <span
              key={f}
              className="t-display t-display-m dr-scatter__frag"
              style={{
                transform: `translate(${dir * k * 210}px, ${lift * k * 96}px) rotate(${dir * k * 2.4}deg)`,
                opacity: 1 - k * 0.45,
              }}
            >
              {f}
            </span>
          );
        })}
      </div>
      <p className="t-mono t-mono-xs t-dim dr-caption">{caption}</p>
    </div>
  );
}

/** Rules drawing themselves. The grid is the argument. */
function Grid({ p, caption, reduced, anchor }: { p: number; caption: string; reduced: boolean; anchor: Anchor }) {
  const cols = 12;
  const out = span(p, 0.9, 1);
  return (
    <div className="dr-shot dr-grid" data-anchor={anchor} style={{ opacity: 1 - out }}>
      <div className="dr-grid__field">
        {Array.from({ length: cols }, (_, i) => {
          const k = reduced ? 1 : ease(span(p, 0.06 + (i / cols) * 0.4, 0.4 + (i / cols) * 0.42));
          return (
            <span
              key={i}
              className="dr-grid__rule"
              style={{ transform: `scaleY(${k})`, opacity: 0.25 + k * 0.55 }}
            />
          );
        })}
        <span
          className="dr-grid__measure"
          style={{ transform: `scaleX(${reduced ? 1 : ease(span(p, 0.3, 0.86))})` }}
        />
      </div>
      <p className="t-mono t-mono-xs t-dim dr-caption">{caption}</p>
    </div>
  );
}

/** The five stages, stepping. One at a time, with air between them. */
function Stages({ p, caption, reduced, anchor }: { p: number; caption: string; reduced: boolean; anchor: Anchor }) {
  const out = span(p, 0.92, 1);
  const at = reduced ? STAGES.length : Math.floor(span(p, 0.05, 0.92) * STAGES.length);
  return (
    <div className="dr-shot dr-stages" data-anchor={anchor} style={{ opacity: 1 - out }}>
      <ol className="dr-stages__list">
        {STAGES.map((s, i) => (
          <li
            key={s}
            className="dr-stages__item"
            data-on={i <= at ? 'true' : 'false'}
            data-now={i === at ? 'true' : 'false'}
          >
            <span className="t-mono t-mono-xs dr-stages__n">{String(i + 1).padStart(2, '0')}</span>
            <span className="t-display t-display-m dr-stages__name">{s}</span>
          </li>
        ))}
      </ol>
      <p className="t-mono t-mono-xs t-dim dr-caption">{caption}</p>
    </div>
  );
}

/** Contour rings resolving out of nothing. The Lab's own field, at film scale. */
function Plate({ p, caption, reduced, anchor }: { p: number; caption: string; reduced: boolean; anchor: Anchor }) {
  const rings = 9;
  const out = span(p, 0.9, 1);
  return (
    <div className="dr-shot dr-plate" data-anchor={anchor} style={{ opacity: 1 - out }}>
      <div className="dr-plate__field" aria-hidden="true">
        {Array.from({ length: rings }, (_, i) => {
          const k = reduced ? 1 : ease(span(p, 0.05 + (i / rings) * 0.5, 0.45 + (i / rings) * 0.45));
          const size = 16 + i * 9;
          return (
            <span
              key={i}
              className="dr-plate__ring"
              style={{
                width: `${size}%`,
                height: `${size * 0.62}%`,
                opacity: k * (i % 3 === 0 ? 0.72 : 0.26),
                transform: `translate(-50%, -50%) scale(${0.86 + k * 0.14})`,
              }}
            />
          );
        })}
      </div>
      <p className="t-mono t-mono-xs t-dim dr-caption">{caption}</p>
    </div>
  );
}

/** The realities, ticking past. Real statuses, read from the index. */
function Roster({ p, caption, anchor }: { p: number; caption: string; anchor: Anchor }) {
  const out = span(p, 0.92, 1);
  const shown = Math.ceil(span(p, 0.04, 0.8) * MODES.length);
  return (
    <div className="dr-shot dr-roster" data-anchor={anchor} style={{ opacity: 1 - out }}>
      <ul className="dr-roster__list">
        {MODES.slice(0, Math.max(1, shown)).map((m) => (
          <li key={m.id} data-on={m.status === 'online' ? 'true' : 'false'}>
            <span className="t-mono t-mono-xs dr-roster__n">{m.index}</span>
            <span className="t-display t-display-s dr-roster__name">{m.title}</span>
            <span className="t-mono t-mono-xs dr-roster__status">
              {m.status === 'online' ? 'ONLINE' : 'NOT BUILT'}
            </span>
          </li>
        ))}
      </ul>
      <p className="t-mono t-mono-xs t-dim dr-caption">{caption}</p>
    </div>
  );
}

/** Silence. One registration mark, breathing. */
function Mark({ p, reduced, anchor }: { p: number; reduced: boolean; anchor: Anchor }) {
  const k = reduced ? 1 : ease(span(p, 0.08, 0.5)) * (1 - span(p, 0.78, 1));
  return (
    <div className="dr-shot dr-mark" data-anchor={anchor}>
      <span className="dr-mark__target" style={{ opacity: k }} aria-hidden="true">
        <span className="dr-mark__h" />
        <span className="dr-mark__v" />
        <span className="dr-mark__o" />
      </span>
    </div>
  );
}

function End({ p, anchor }: { p: number; anchor: Anchor }) {
  const k = ease(span(p, 0.02, 0.4));
  return (
    <div className="dr-shot dr-end" data-anchor={anchor} style={{ opacity: k }}>
      <h2 className="t-display t-display-l dr-end__title">{DIRECTOR_COPY.endTitle}</h2>
      <p className="t-mono t-mono-xs t-signal dr-end__sub">{DIRECTOR_COPY.endSub}</p>
      <p className="t-body-s t-dim dr-end__line">{DIRECTOR_COPY.endLine(onlineCount(), MODES.length)}</p>
    </div>
  );
}
