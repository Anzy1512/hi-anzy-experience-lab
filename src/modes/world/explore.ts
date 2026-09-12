import * as THREE from 'three';
import { cameraDistance } from '../../spatial/projection';
import { groundAt } from './geography';
import { DISTRICTS } from '../../content/world';

/**
 * EXPLORE — standing in the territory rather than looking at it.
 *
 * ── IT IS A TARGET POLICY, NOT A SECOND CAMERA ──────────────────────────────
 *
 * Living World's rule has always been that **the camera never moves; the world
 * does**. Guided travel expresses that by easing the territory toward a fixed
 * station per district. Explore does not break the rule and does not add a
 * second rig: it produces the same `View` the stations produce, from a walked
 * position instead of a chosen district, and hands it to the same damped loop.
 * Everything downstream — easing, fog, pointer bias, the projection contract —
 * is untouched, which is why this could be added without reopening any of it.
 *
 * ── THE SOLVE ───────────────────────────────────────────────────────────────
 *
 * `Territory` is transformed as `Rx(tilt) · Ry(turn) · p + v`, and the camera
 * sits at `(0, 0, cameraDistance())` looking down −Z. So to stand a visitor's
 * eye on territory point `q`:
 *
 *      Rx · Ry · q + v = camera        ⇒        v = camera − Rx · Ry · q
 *
 * That is the whole of it. Yaw becomes `turn`, pitch becomes `tilt`, and the
 * position falls out exactly rather than being tuned by hand.
 *
 * ── AUTHORED FREEDOM ────────────────────────────────────────────────────────
 *
 * Every limit here exists so the visitor can feel free without the art
 * direction coming apart. The eye rides a fixed height above the sampled
 * terrain, so it can never sink under the land or float over it. Pitch is
 * clamped well short of vertical, so there is no way to end up looking at the
 * sky or straight down at nothing and no way to acquire roll — there is no roll
 * axis at all. Position is clamped inside the survey, so the world cannot be
 * left behind. Nothing here is a physics body; it is a walked camera station.
 */

/** How far above the sampled land the eye rides, in territory units. */
const EYE = 165;

/**
 * ENTER DEEP — the same walk, at the scale of the thing being walked through.
 *
 * Not a third camera and not a game. Everything below is the same solve, the
 * same bounds and the same damped loop; three numbers change and one rule is
 * added. The eye drops to roughly a third of a district storey, the pace slows
 * to something you could look around at, and the structures stop being
 * furniture you can walk through.
 *
 * What it buys is the one reading Explore cannot give: STRATEGY's frame is
 * eleven plates tall, and standing at 165 units you are looking at its middle.
 * At 62 you are underneath it, which is where a frame is actually legible as a
 * frame. The districts were built to be stood under; this is the state that
 * stands under them.
 */
const EYE_DEEP = 62;
const WALK_DEEP_SCALE = 0.42;

/**
 * How close the visitor may get to a district's own footprint.
 *
 * Soft, not solid: the stance is pushed back out along the vector it came in
 * on rather than stopped dead, so walking into a structure slides you around
 * it instead of pinning you against it. There is no physics here and there is
 * no body — it is the same clamp `clampPos` applies to the survey edge, with a
 * different shape.
 *
 * Only in Deep. In Explore walking through a district is how you see the inside
 * of it, and taking that away to be consistent would be consistency for its
 * own sake.
 */
function pushOutOfDistricts(s: ExploreState): void {
  for (const d of DISTRICTS) {
    const rx = d.w * 0.52;
    const rz = d.d * 0.52;
    const dx = (s.px - d.x) / rx;
    const dz = (s.pz - d.z) / rz;
    const r = Math.hypot(dx, dz);
    if (r >= 1 || r === 0) continue;
    const k = 1 / r;
    s.px = d.x + dx * rx * k;
    s.pz = d.z + dz * rz * k;
  }
}

/**
 * Where the visitor may stand.
 *
 * The survey is 3400 across and the districts occupy roughly x ∈ [−880, 1320],
 * z ∈ [−1180, 760]. The bound is drawn wider than the districts so there is
 * somewhere to stand *outside* them and look back — that view is most of the
 * argument for walking at all — but inside the ground plane, so the land never
 * runs out underfoot.
 */
const BOUND = 1500;

/** Pitch stops short of the horizon in both directions; there is no roll axis. */
const PITCH_MIN = -26;
const PITCH_MAX = 34;

/** Units per second at a walk, and the multiplier while a run key is held. */
const WALK = 620;
const RUN = 2.1;

export interface ExploreState {
  /** Position in territory coordinates. */
  px: number;
  pz: number;
  /** Facing, degrees. Wraps freely — the one axis with no limit. */
  yaw: number;
  /** Look elevation, degrees, clamped. */
  pitch: number;
}

export interface View {
  x: number;
  y: number;
  z: number;
  tilt: number;
  turn: number;
  scale: number;
}

export function clampPitch(p: number): number {
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, p));
}

function clampPos(v: number): number {
  return Math.max(-BOUND, Math.min(BOUND, v));
}

/**
 * A starting stance: just outside the survey on the near side, looking across
 * it. Explore begins with the territory in front of the visitor rather than
 * around them, so the first frame still reads as a place they have arrived at.
 */
export function initialStance(): ExploreState {
  return { px: 120, pz: 1340, yaw: 0, pitch: 6 };
}

/** Stand a short way back from a district, facing it. */
export function stanceFacing(id: string): ExploreState | null {
  const d = DISTRICTS.find((x) => x.id === id);
  if (!d) return null;
  const back = Math.max(d.w, d.d) * 0.9 + 620;
  // Approach from the side the overview already looks from, so travelling to a
  // district in Explore arrives at the reading of it the visitor already has.
  const px = clampPos(d.x);
  const pz = clampPos(d.z + back);
  return { px, pz, yaw: 0, pitch: 4 };
}

/* -------------------------------------------------------------------------- */

const q = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'XYZ');

/**
 * The `View` that puts this stance behind the visitor's eyes.
 *
 * `extent` and `height` are passed rather than imported so this stays in step
 * with whatever `WorldMode` is actually sampling the land with — the two must
 * agree or the eye floats.
 */
export function viewForStance(
  s: ExploreState,
  extent: number,
  height: number,
  deep = false,
): View {
  const eyeY = groundAt(s.px, s.pz, extent, height) + (deep ? EYE_DEEP : EYE);
  q.set(s.px, eyeY, s.pz);

  const tilt = clampPitch(s.pitch);
  /*
   * The same Euler the group is given, applied to the point rather than to the
   * scene. Order matters and must match `Territory`'s own composition: R3F
   * applies rotation.x then rotation.y in 'XYZ', so the point is rotated by the
   * identical Euler and then negated into position.
   */
  euler.set((tilt * Math.PI) / 180, (s.yaw * Math.PI) / 180, 0, 'XYZ');
  q.applyEuler(euler);

  return {
    x: -q.x,
    y: -q.y,
    z: cameraDistance() - q.z,
    tilt,
    turn: s.yaw,
    scale: 1,
  };
}

/**
 * Walk. `forward` and `strafe` are −1…1; `dt` is seconds.
 *
 * Movement is taken in the ground plane along the facing, so looking up or down
 * never makes the visitor climb — the one behaviour that separates walking a
 * place from flying through it, and the reason pitch is not part of this sum.
 */
export function advance(
  s: ExploreState,
  forward: number,
  strafe: number,
  dt: number,
  running = false,
  deep = false,
): void {
  if (!forward && !strafe) return;
  const speed =
    WALK * (running ? RUN : 1) * (deep ? WALK_DEEP_SCALE : 1) * Math.min(dt, 0.05);
  const rad = (s.yaw * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  /*
   * `turn` rotates the world, so the visitor's facing is its inverse. Forward
   * is −z in the visitor's own frame; this is that vector taken back into
   * territory coordinates.
   */
  s.px = clampPos(s.px + (forward * sin + strafe * cos) * speed);
  s.pz = clampPos(s.pz + (-forward * cos + strafe * sin) * speed);
  if (deep) pushOutOfDistricts(s);
}

/** Move along the facing without a key — used by the wheel. */
export function dolly(s: ExploreState, amount: number, deep = false): void {
  const rad = (s.yaw * Math.PI) / 180;
  s.px = clampPos(s.px + Math.sin(rad) * amount);
  s.pz = clampPos(s.pz - Math.cos(rad) * amount);
  if (deep) pushOutOfDistricts(s);
}

/** How far the stance is from a district centre, in territory units. */
export function distanceTo(s: ExploreState, x: number, z: number): number {
  return Math.hypot(s.px - x, s.pz - z);
}

/** The district the visitor is standing in or nearest to, within a radius. */
export function nearestDistrict(s: ExploreState, radius = 900): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const d of DISTRICTS) {
    const dist = distanceTo(s, d.x, d.z);
    if (dist < bestD) {
      bestD = dist;
      best = d.id;
    }
  }
  return best;
}
