import { DISTRICTS, type District } from '../../content/world';
import { DATUM } from './landmarks';

/**
 * THE KEY PLAN — where this sheet sits in the whole survey.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A MINIMAP ────────────────────────────
 *
 * `WorldIndex` records a decision worth keeping: a game minimap would be the
 * obvious move and the wrong one, because this world is read rather than
 * traversed. That argument holds on a wide screen, where the establishing view
 * *is* the map — you can see all nine districts at once and the plan is the
 * thing you are already looking at.
 *
 * It does not hold on a phone, and the reason is arithmetic rather than taste.
 * The Lab has one projection contract: `fovForViewport` derives the vertical
 * field of view from CSS `perspective: 1400`, and `SpatialCanvas` puts the far
 * plane at six camera distances. At 390 × 844 that leaves a horizontal half
 * angle of about 8°, so fitting a territory 2,900 units across needs the world
 * held roughly 10,400 units away — past the far plane, where it would not be
 * drawn at all. A phone physically cannot show this survey whole without
 * changing a contract that eleven other realities share.
 *
 * So it gets the thing a drawing gives you instead. A key plan is the small
 * orthographic diagram in the corner of an architectural sheet showing where
 * the detail you are reading sits in the building — a printed convention, not a
 * game one, and squarely inside the vocabulary this product already speaks.
 * Nine marks at their true relative positions, the datum, and the route between
 * them. No renderer, no camera, no perspective: a plan is a plan.
 *
 * ── IT IS ALSO THE FALLBACK'S MAP ───────────────────────────────────────────
 *
 * A visitor with no WebGL used to get the district list and a sentence saying
 * the territory could not be drawn. They now get the survey's actual geometry —
 * where the places are, how far apart, which one is sealed — because none of
 * that ever needed a GPU. Same argument as Memory's document fallback carrying
 * its artefacts: a reduced tier may draw less, it may not *know* less.
 */

/* Padded past the outermost district so nothing is cut by the frame. */
const MIN_X = -1180;
const MAX_X = 1560;
const MIN_Z = -1400;
const MAX_Z = 980;
const W = MAX_X - MIN_X;
const H = MAX_Z - MIN_Z;

const px = (d: { x: number; z: number }) => [d.x - MIN_X, d.z - MIN_Z] as const;

export function KeyPlan({ active }: { active: District | null }) {
  const open = DISTRICTS.filter((d) => d.status === 'open');
  const route = open.map((d) => px(d).join(',')).join(' ');
  const [dx, dz] = px(DATUM);

  return (
    <svg
      className="lw-plan"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Key plan of the territory. ${DISTRICTS.length} districts${
        active ? `, showing ${active.name}` : ''
      }.`}
    >
      {/* The frame. A key plan on a drawing sheet is boxed, and here it earns
          its keep twice: the territory's own wireframe runs directly behind
          this thing, and without an edge the plan's marks read as more of it. */}
      <rect className="lw-plan__frame" x={6} y={6} width={W - 12} height={H - 12} />

      {/* The route, drawn first so the places sit on top of it. */}
      <polyline className="lw-plan__route" points={route} />

      {/* The datum: the monument the whole survey is squared from, drawn as the
          register mark it is. */}
      <g className="lw-plan__datum">
        <circle cx={dx} cy={dz} r={78} />
        <line x1={dx - 130} y1={dz} x2={dx + 130} y2={dz} />
        <line x1={dx} y1={dz - 130} x2={dx} y2={dz + 130} />
      </g>

      {DISTRICTS.map((d) => {
        const [x, z] = px(d);
        const on = active?.id === d.id;
        /* Footprint at true relative size, so the plan carries how big a place
           is as well as where — which the written index cannot say at all. */
        const w = d.w * 0.9;
        const h = d.d * 0.9;
        return (
          <g key={d.id} className="lw-plan__mark" data-on={on ? 'true' : 'false'} data-status={d.status}>
            {/*
             * NO LABELS ON THE PLAN.
             *
             * The first draft printed each district's index beside its mark.
             * At the size a key plan actually occupies, 130 viewBox units come
             * out around four screen pixels — nine unreadable smudges crowding
             * nine legible marks. A key plan's job is "where am I in the
             * whole", not "what is everything called": the strip directly
             * below reads "D1 STRATEGY · D2 DESIGN", and the mark you are
             * standing in is the only thing here wearing the accent.
             */}
            {d.status === 'sealed' ? (
              // The aperture, drawn as an aperture. It is a hole in the survey.
              <circle cx={x} cy={z} r={Math.min(w, h) * 0.42} />
            ) : (
              <rect x={x - w / 2} y={z - h / 2} width={w} height={h} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
