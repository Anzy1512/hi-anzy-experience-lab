import { useEffect, useMemo, useRef } from 'react';
import { onFrame } from '../../core/raf';
import { pointer } from '../../core/pointer';
import type { MeasuredObject } from './useMeasure';
import type { LayerSet } from './xrayStore';
import { LAYER_STEP } from './xrayStore';
import { KIND_LABEL, objectId, px, px1, regionId } from './notation';

/**
 * THE DIAGNOSTIC LAYERS.
 *
 * One SVG, drawn from the measurement pass. It re-renders when the measured
 * objects or the selection change — never per frame. The only continuously
 * updating element is the motion trail, and that is written imperatively to a
 * single <polyline> from the shared RAF loop.
 *
 * Restraint is enforced structurally, not by taste:
 *  - SPACE dimensions are drawn for the scanned object only. Measuring
 *    everything at once is how diagnostic overlays become wallpaper.
 *  - TYPE labels are budgeted by capability and by object size.
 *  - Every layer is gated on the entry step, so the sequence reveals rather
 *    than switching on.
 */

interface Props {
  objects: MeasuredObject[];
  layers: LayerSet;
  step: number;
  scanned: MeasuredObject | null;
  budget: number;
  trim: number;
  viewport: { w: number; h: number };
}

const COLUMNS = 12;

export function Layers({ objects, layers, step, scanned, budget, trim, viewport }: Props) {
  const trailRef = useRef<SVGPolylineElement>(null);
  const velRef = useRef<SVGTextElement>(null);

  const on = (key: keyof LayerSet) => layers[key] && step >= LAYER_STEP[key];

  /** Baseline rhythm is derived from the specimen's own body copy, not invented. */
  const baseline = useMemo(() => {
    const body = objects.find((o) => o.kind === 'body' && o.type);
    return Math.max(12, Math.round(body?.type?.lineHeight ?? 24));
  }, [objects]);

  const columnWidth = (viewport.w - trim * 2) / COLUMNS;

  /* ---- MOTION: the pointer's actual trajectory --------------------------- */
  useEffect(() => {
    if (!on('motion')) return;
    const trail = trailRef.current;
    const vel = velRef.current;
    if (!trail) return;

    const pts: number[] = [];
    const MAX = 48;

    return onFrame(() => {
      pts.push(pointer.sx, pointer.sy);
      if (pts.length > MAX * 2) pts.splice(0, 2);
      let d = '';
      for (let i = 0; i < pts.length; i += 2) d += `${pts[i].toFixed(0)},${pts[i + 1].toFixed(0)} `;
      trail.setAttribute('points', d.trim());
      if (vel) {
        vel.setAttribute('x', String(pointer.sx + 16));
        vel.setAttribute('y', String(pointer.sy + 34));
        vel.textContent = `PTR-V ${pointer.velocity.toFixed(2)}`;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.motion, step]);

  /* ---- budgeted subsets --------------------------------------------------- */
  // Baselines are cheap lines and can be drawn for every text object. The
  // *labels* are the expensive thing visually, and printing a type spec above
  // every paragraph turns the sheet into noise — so a spec is shown only for the
  // object currently under the instrument. Scan something, learn its setting.
  const typeObjects = useMemo(() => {
    const withType = objects.filter((o) => o.type);
    const cap = Math.max(3, Math.round(withType.length * budget));
    return [...withType].sort((a, b) => (b.type?.size ?? 0) - (a.type?.size ?? 0)).slice(0, cap);
  }, [objects, budget]);

  // A region whose box hugs its own heading puts its label straight through
  // that heading. Only regions with real vertical room get labelled; the rest
  // still draw their boundary, and scanning one names it in the inspector.
  const regions = useMemo(
    () => objects.filter((o) => o.kind === 'region' && o.h > 150),
    [objects],
  );

  return (
    <svg
      className="xr-layers"
      width={viewport.w}
      height={viewport.h}
      viewBox={`0 0 ${viewport.w} ${viewport.h}`}
      aria-hidden="true"
    >
      {/* ---- GRID : columns, baseline, viewport bounds --------------------- */}
      {on('grid') && (
        <g className="xr-grid">
          <rect
            className="xr-grid__bounds"
            x={trim}
            y={trim}
            width={viewport.w - trim * 2}
            height={viewport.h - trim * 2}
          />
          {Array.from({ length: COLUMNS + 1 }, (_, i) => (
            <line
              key={`c${i}`}
              className={i % 3 === 0 ? 'xr-grid__col xr-grid__col--major' : 'xr-grid__col'}
              x1={trim + i * columnWidth}
              y1={trim}
              x2={trim + i * columnWidth}
              y2={viewport.h - trim}
            />
          ))}
          {Array.from({ length: Math.floor((viewport.h - trim * 2) / baseline) }, (_, i) => (
            <line
              key={`b${i}`}
              className="xr-grid__base"
              x1={trim}
              y1={trim + (i + 1) * baseline}
              x2={viewport.w - trim}
              y2={trim + (i + 1) * baseline}
            />
          ))}
          {/* Inside the top bound, not above it — above it collides with the
              mode chrome that every mode shares. */}
          <text className="xr-note" x={trim + 4} y={trim + 15}>
            {`GRID / COL ${COLUMNS} · ${px(columnWidth)}PX · BASE ${baseline}PX`}
          </text>
        </g>
      )}

      {/* ---- BOX : measured boundaries ------------------------------------ */}
      {on('box') && (
        <g className="xr-box">
          {objects.map((o) => (
            <rect
              key={o.id}
              className={`xr-box__rect xr-box__rect--${o.kind}`}
              x={o.x}
              y={o.y}
              width={o.w}
              height={o.h}
            />
          ))}
        </g>
      )}

      {/* ---- STRUCTURE : semantic regions and their identity --------------- */}
      {on('structure') && (
        <g className="xr-struct">
          {regions.map((o, i) => (
            <g key={o.id}>
              <path
                className="xr-struct__tick"
                d={`M${o.x} ${o.y + 10} L${o.x} ${o.y} L${o.x + 10} ${o.y}`}
              />
              <text className="xr-note xr-note--struct" x={o.x + 14} y={o.y - 6}>
                {`${regionId(i + 1)} ${o.name}`}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* ---- TYPE : baselines and resolved settings ----------------------- */}
      {on('type') && (
        <g className="xr-type">
          {typeObjects.map((o) => {
            const lh = o.type!.lineHeight;
            const lines = Math.max(1, Math.round(o.h / lh));
            return (
              <g key={o.id}>
                {Array.from({ length: lines }, (_, i) => (
                  <line
                    key={i}
                    className="xr-type__base"
                    x1={o.x}
                    y1={o.y + lh * (i + 1) - lh * 0.22}
                    x2={o.x + o.w}
                    y2={o.y + lh * (i + 1) - lh * 0.22}
                  />
                ))}
                {scanned?.id === o.id && (
                  <text className="xr-note xr-note--type" x={o.x} y={o.y - 5}>
                    {`SET ${o.type!.set} · TRK ${o.type!.tracking === 'normal' ? 'NORMAL' : o.type!.tracking.toUpperCase()}`}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* ---- SPACE : dimensions, for the scanned object only --------------- */}
      {/*
        Dimensions sit immediately beside what they measure, not out at the
        sheet edge. Running them to the trim was the textbook drawing-sheet
        convention, but our trim margin is ~52px and the specimen's text block
        starts right at it, so the labels landed on top of the copy. Adjacent
        dimensioning is both correct practice for a nested part and the only
        version that stays legible here.
      */}
      {on('space') && scanned && (() => {
        const right = scanned.x + scanned.w;
        const bottom = scanned.y + scanned.h;
        // Flip to the inside when the object is hard against an edge.
        const hOut = right + 92 < viewport.w - trim;
        const hx = hOut ? right + 14 : scanned.x - 14;
        const vOut = bottom + 34 < viewport.h - trim;
        const vy = vOut ? bottom + 16 : scanned.y - 16;

        return (
          <g className="xr-space">
            {/* height */}
            <line className="xr-space__witness" x1={hOut ? right : scanned.x} y1={scanned.y} x2={hx} y2={scanned.y} />
            <line className="xr-space__witness" x1={hOut ? right : scanned.x} y1={bottom} x2={hx} y2={bottom} />
            <line className="xr-space__dim" x1={hx} y1={scanned.y} x2={hx} y2={bottom} />
            <text
              className="xr-note xr-note--dim"
              x={hOut ? hx + 6 : hx - 6}
              y={scanned.y + scanned.h / 2}
              textAnchor={hOut ? 'start' : 'end'}
            >
              {`DIM-H ${px(scanned.h)}`}
            </text>

            {/* width */}
            <line className="xr-space__witness" x1={scanned.x} y1={vOut ? bottom : scanned.y} x2={scanned.x} y2={vy} />
            <line className="xr-space__witness" x1={right} y1={vOut ? bottom : scanned.y} x2={right} y2={vy} />
            <line className="xr-space__dim" x1={scanned.x} y1={vy} x2={right} y2={vy} />
            <text
              className="xr-note xr-note--dim"
              x={scanned.x + scanned.w / 2}
              y={vOut ? vy + 12 : vy - 6}
              textAnchor="middle"
            >
              {`DIM-W ${px(scanned.w)}`}
            </text>
          </g>
        );
      })()}

      {/* ---- the acquired object ------------------------------------------- */}
      {scanned && step >= LAYER_STEP.box && (
        <g className="xr-acq">
          {/* Leader line to the docked inspector: orthogonal, drafting convention.
              The record sits in the instrument band and this is what ties it to
              its subject without either one covering the other. */}
          <polyline
            className="xr-acq__leader"
            points={(() => {
              const cx = scanned.x + scanned.w;
              const cy = scanned.y + scanned.h;
              const ty = viewport.h - trim * 0.5 - 122;
              const tx = viewport.w - trim - 128;
              return `${cx},${cy} ${cx},${Math.max(cy, ty)} ${tx},${Math.max(cy, ty)}`;
            })()}
          />
          <circle
            className="xr-acq__leader-dot"
            cx={scanned.x + scanned.w}
            cy={scanned.y + scanned.h}
            r={2.5}
          />
          <rect className="xr-acq__rect" x={scanned.x} y={scanned.y} width={scanned.w} height={scanned.h} />
          {/* corner brackets rather than a solid frame — the object stays readable */}
          {(
            [
              [scanned.x, scanned.y, 1, 1],
              [scanned.x + scanned.w, scanned.y, -1, 1],
              [scanned.x, scanned.y + scanned.h, 1, -1],
              [scanned.x + scanned.w, scanned.y + scanned.h, -1, -1],
            ] as const
          ).map(([cx, cy, sx, sy], i) => (
            <path
              key={i}
              className="xr-acq__bracket"
              d={`M${cx} ${cy + sy * 13} L${cx} ${cy} L${cx + sx * 13} ${cy}`}
            />
          ))}
        </g>
      )}

      {/* ---- MOTION : the pointer's real trajectory ------------------------ */}
      {on('motion') && (
        <g className="xr-motion">
          <polyline ref={trailRef} className="xr-motion__trail" points="" />
          <text ref={velRef} className="xr-note xr-note--motion" x={0} y={0} />
        </g>
      )}
    </svg>
  );
}

/**
 * THE INSPECTOR — the acquired object's record.
 *
 * Docked in the instrument band rather than floating beside the object. A
 * floating callout on a dense editorial sheet has nowhere to go that is not on
 * top of something worth reading, and covering the subject is the one thing an
 * inspection tool must never do. Drafting practice already solved this: offset
 * the label, and connect it with a leader line (drawn by the SPACE layer).
 */
export function Inspector({ object, held }: { object: MeasuredObject; held: boolean }) {
  return (
    <div className="xr-callout" data-held={held ? 'true' : 'false'}>
      <p className="t-mono t-mono-xs xr-callout__id">
        <span className="t-signal">{objectId(object.id)}</span>
        <span className="t-faint"> · </span>
        {KIND_LABEL[object.kind]}
      </p>
      <p className="t-mono t-mono-xs xr-callout__name">{object.name}</p>
      <dl className="xr-callout__fields">
        <div>
          <dt>POS-X</dt>
          <dd>{px(object.x)}</dd>
        </div>
        <div>
          <dt>POS-Y</dt>
          <dd>{px(object.y)}</dd>
        </div>
        <div>
          <dt>DIM-W</dt>
          <dd>{px(object.w)}</dd>
        </div>
        <div>
          <dt>DIM-H</dt>
          <dd>{px(object.h)}</dd>
        </div>
        <div>
          <dt>Z</dt>
          <dd>{object.depth}</dd>
        </div>
        {object.type && (
          <div className="xr-callout__wide">
            <dt>SET</dt>
            <dd>{object.type.set}</dd>
          </div>
        )}
        {object.type && (
          <div className="xr-callout__wide">
            <dt>BASE</dt>
            <dd>{px1(object.type.lineHeight)}PX</dd>
          </div>
        )}
      </dl>
      <p className="t-mono t-mono-xs xr-callout__hold">{held ? 'HELD · CLICK TO RELEASE' : 'CLICK TO HOLD'}</p>
    </div>
  );
}
