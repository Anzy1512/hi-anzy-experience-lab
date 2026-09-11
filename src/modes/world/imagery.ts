import type { District } from '../../content/world';
import { groundAt } from './geography';

/**
 * IMAGERY — the company's own collages, standing in the territory.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 *
 * Living World was the one major reality with zero contact with the fourteen
 * specimens `content/specimens.ts` mirrors from the company's own library.
 * Anzy.OS holds two, Director holds four, X-Ray and Memory hold more still —
 * and the territory, the reality that exists specifically to turn the sheet
 * into a place, had none. A survey with contour ground, nine drawn districts
 * and a monument, and nowhere in it that a visitor could find a photograph.
 *
 * ── NOT A SECOND KIND OF LANDMARK ────────────────────────────────────────────
 *
 * `landmarks.ts` built one skyline-scale object — a mast the height of the
 * tallest district — and was explicit that the territory gets exactly one of
 * those: "a dozen small objects read as set dressing... One monument, visible
 * from everywhere, does the whole job." A stand is not that. It is small,
 * ground-level and human-scale — closer to a plaque than a building — and it
 * disobeys `MotifFrame.js`'s refusal in the other direction the datum does
 * not: a photograph blown up to skyline size *would* be exactly the hero-scale
 * mistake the commercial site already declined ("would look like a screenshot
 * of a PDF"), so a stand is never drawn above native pixel size and fades
 * toward nothing at the distance a real photograph would. See `standScale`.
 *
 * ── WHY FIVE DISTRICTS AND NOT SEVEN ─────────────────────────────────────────
 *
 * Every stand exists because a specific specimen argues the specific line the
 * district already states — the same discipline Director's four shots use,
 * and the same one that kept two of Director's slots from being filled with
 * whatever was left over. STRATEGY and TECHNOLOGY get nothing: nothing in the
 * set depicts positioning or software without being forced into the reading,
 * and a specimen chosen because a district needed a picture is worse than a
 * district with none.
 *
 *   DESIGN      char-fixer            a combinatorial object, mid-solution
 *   PRODUCTION  pop-camera-duo        the instrument walks into the frame
 *   GROWTH      char-trendsetter      a burst of foliage, before it is pruned
 *   CULTURE     char-expressionist    the microphone, not the face
 *   IMKAAN      pop-hands-a           two hands, holding one another up
 *
 * `char-fixer` already stands in Anzy.OS (DESIGN.app) and `pop-camera-duo`
 * already stands in NETWORK.app there, with a different argument each time —
 * a company's own material recurring across registers is not filler, it is
 * the way "orange means signal" recurs: the same object, doing real work in
 * more than one place, is a stronger claim than never repeating anything.
 *
 * ── PLACEMENT ─────────────────────────────────────────────────────────────
 *
 * A stand is not planted at the district's centre — the wireframe silhouette
 * already occupies that ground and a flat photograph fighting a machine-drawn
 * structure for the same few square metres reads as a collision, not a
 * composition. It stands just outside the footprint instead, at a hand-picked
 * compass angle clear of both the structure and the route line running past
 * it, the way a site plaque stands beside the building it describes rather
 * than inside the doorway.
 */

export interface Stand {
  /** A `SPECIMENS` id. */
  specimen: string;
  /** Why this specimen, in this district. Printed as the standing caption. */
  line: string;
  /** Direction from the district's own centre, in degrees (0 = +x, 90 = +z). */
  angle: number;
  /** Clearance beyond the district's own half-extent, in territory units. */
  clear: number;
}

/**
 * Angles and clearances were placed once by formula — pointing each stand away
 * from the map's own centre, past the larger of the district's two footprint
 * axes — and then adjusted by looking: DESIGN's fan widens as it rises, so its
 * stand needed pushing further out than the formula gave it, or the tallest
 * plate leaned into the frame.
 */
export const STANDS: Record<string, Stand> = {
  design: {
    specimen: 'char-fixer',
    line: 'A COMBINATORIAL OBJECT, MID-SOLUTION.',
    angle: 152,
    clear: 50,
  },
  production: {
    specimen: 'pop-camera-duo',
    line: 'THE INSTRUMENT WALKS INTO THE FRAME.',
    angle: 22,
    clear: 40,
  },
  growth: {
    specimen: 'char-trendsetter',
    line: 'GROWTH, BEFORE A FUNNEL PRUNES IT.',
    angle: 82,
    clear: 45,
  },
  culture: {
    specimen: 'char-expressionist',
    line: 'SPEAKING TO PEOPLE WHO ARE NOT BEING SOLD TO.',
    angle: 145,
    clear: 45,
  },
  imkaan: {
    specimen: 'pop-hands-a',
    line: 'TWO HANDS, HOLDING ONE ANOTHER UP.',
    angle: -52,
    clear: 40,
  },
};

export interface StandAnchor {
  x: number;
  y: number;
  z: number;
}

/** Where a stand's specimen touches the ground, in territory space. */
export function standAnchor(
  d: District,
  stand: Stand,
  extent: number,
  groundHeight: number,
): StandAnchor {
  const half = Math.max(d.w, d.d) / 2 + stand.clear;
  const rad = (stand.angle * Math.PI) / 180;
  const x = d.x + Math.cos(rad) * half;
  const z = d.z + Math.sin(rad) * half;
  // A hair off the terrain — the same lift the registration beacons use — so
  // the plate's own foot never clips into the ground it is standing on.
  const y = groundAt(x, z, extent, groundHeight) + 3;
  return { x, y, z };
}

/*
 * DISTANCE → SCALE.
 *
 * `SpecimenPlate` already refuses to draw above native pixel size; this is the
 * other half of the same refusal, applied to a camera that moves instead of a
 * frame that doesn't. `BASE_DIST` is roughly the distance a district sits from
 * the camera once travel there has settled — at that range a stand reads at
 * close to its own native size, a specimen actually held and examined.
 *
 * A straight inverse-distance falloff was tried first and rendered every stand
 * near-legible even from the overview station: the overview camera sits only
 * about 1.7x further out than an arrived one, which is nowhere near enough
 * range for true-perspective falloff to read as "small and far" rather than
 * "the same picture, slightly reduced." A stand should recede past the point
 * where fine perspective is honest, the same way `standOpacity` already fades
 * a plate out before it would turn into an unreadable smear — both curves are
 * choosing legibility over strict physical accuracy, and saying so. The extra
 * power below is what buys that: near BASE_DIST it behaves like a normal lens,
 * beyond it the fall is steeper than real optics, on purpose.
 */
const BASE_DIST = 2000;
const FALLOFF_POWER = 4;
const MIN_SCALE = 0.02;
const MAX_SCALE = 1;

export function standScale(dist: number): number {
  const ratio = BASE_DIST / Math.max(1, dist);
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, ratio ** FALLOFF_POWER));
}

/**
 * A stand this small is a mark, not a picture — full opacity would print a
 * hard, legible-looking rectangle at a size where nothing in it can actually
 * be read, which is a worse lie than fading it. Opacity follows scale down to
 * nothing well before the image would be unrecognisable, so what a visitor
 * sees at any distance is honest about how much of it they could see.
 */
export function standOpacity(scale: number): number {
  const t = (scale - 0.04) / (0.26 - 0.04);
  return Math.max(0, Math.min(1, t));
}
