import { FRAGMENTS, STAGES, DIRECTOR_COPY, type Shot as ShotDef } from '../../content/director';
import { MODES, onlineCount } from '../../content/lab';

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

export function Shot({ shot, p, reduced }: { shot: ShotDef; p: number; reduced: boolean }) {
  // Reduced motion cuts to the composed frame: every shot is an editorial
  // tableau that arrives whole. The film keeps its structure and its silence.
  const q = reduced ? 1 : p;

  switch (shot.kind) {
    case 'slate':
      return <Slate p={q} caption={shot.caption ?? ''} reduced={reduced} />;
    case 'wordmark':
      return <Wordmark p={q} reduced={reduced} />;
    case 'statement':
      return <Statement p={q} lines={shot.lines ?? []} still={!!shot.still} reduced={reduced} />;
    case 'scatter':
      return <Scatter p={q} caption={shot.caption ?? ''} reduced={reduced} />;
    case 'grid':
      return <Grid p={q} caption={shot.caption ?? ''} reduced={reduced} />;
    case 'stages':
      return <Stages p={q} caption={shot.caption ?? ''} reduced={reduced} />;
    case 'plate':
      return <Plate p={q} caption={shot.caption ?? ''} reduced={reduced} />;
    case 'roster':
      return <Roster p={q} caption={shot.caption ?? ''} />;
    case 'mark':
      return <Mark p={q} reduced={reduced} />;
    case 'end':
      return <End p={q} />;
  }
}

/* -------------------------------------------------------------------------- */

function Slate({ p, caption, reduced }: { p: number; caption: string; reduced: boolean }) {
  const on = reduced ? 1 : span(p, 0.06, 0.3) * (1 - span(p, 0.82, 1));
  return (
    <div className="dr-shot dr-slate">
      <p className="t-mono t-mono-xs dr-slate__line" style={{ opacity: on }}>
        {caption}
      </p>
    </div>
  );
}

/** Three plates pulling into register — the Lab's own reveal, at film scale. */
function Wordmark({ p, reduced }: { p: number; reduced: boolean }) {
  const k = reduced ? 1 : ease(span(p, 0.05, 0.62));
  const off = (1 - k) * 46;
  const out = span(p, 0.86, 1);
  return (
    <div className="dr-shot dr-wordmark" style={{ opacity: 1 - out }}>
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
}: {
  p: number;
  lines: string[];
  still: boolean;
  reduced: boolean;
}) {
  const out = span(p, 0.88, 1);
  return (
    <div className="dr-shot dr-statement" style={{ opacity: 1 - out }}>
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
function Scatter({ p, caption, reduced }: { p: number; caption: string; reduced: boolean }) {
  const k = reduced ? 0.35 : ease(span(p, 0.1, 0.86));
  const out = span(p, 0.9, 1);
  return (
    <div className="dr-shot dr-scatter" style={{ opacity: 1 - out }}>
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
function Grid({ p, caption, reduced }: { p: number; caption: string; reduced: boolean }) {
  const cols = 12;
  const out = span(p, 0.9, 1);
  return (
    <div className="dr-shot dr-grid" style={{ opacity: 1 - out }}>
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
function Stages({ p, caption, reduced }: { p: number; caption: string; reduced: boolean }) {
  const out = span(p, 0.92, 1);
  const at = reduced ? STAGES.length : Math.floor(span(p, 0.05, 0.92) * STAGES.length);
  return (
    <div className="dr-shot dr-stages" style={{ opacity: 1 - out }}>
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
function Plate({ p, caption, reduced }: { p: number; caption: string; reduced: boolean }) {
  const rings = 9;
  const out = span(p, 0.9, 1);
  return (
    <div className="dr-shot dr-plate" style={{ opacity: 1 - out }}>
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
function Roster({ p, caption }: { p: number; caption: string }) {
  const out = span(p, 0.92, 1);
  const shown = Math.ceil(span(p, 0.04, 0.8) * MODES.length);
  return (
    <div className="dr-shot dr-roster" style={{ opacity: 1 - out }}>
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
function Mark({ p, reduced }: { p: number; reduced: boolean }) {
  const k = reduced ? 1 : ease(span(p, 0.08, 0.5)) * (1 - span(p, 0.78, 1));
  return (
    <div className="dr-shot dr-mark">
      <span className="dr-mark__target" style={{ opacity: k }} aria-hidden="true">
        <span className="dr-mark__h" />
        <span className="dr-mark__v" />
        <span className="dr-mark__o" />
      </span>
    </div>
  );
}

function End({ p }: { p: number }) {
  const k = ease(span(p, 0.02, 0.4));
  return (
    <div className="dr-shot dr-end" style={{ opacity: k }}>
      <h2 className="t-display t-display-l dr-end__title">{DIRECTOR_COPY.endTitle}</h2>
      <p className="t-mono t-mono-xs t-signal dr-end__sub">{DIRECTOR_COPY.endSub}</p>
      <p className="t-body-s t-dim dr-end__line">{DIRECTOR_COPY.endLine(onlineCount(), MODES.length)}</p>
    </div>
  );
}
