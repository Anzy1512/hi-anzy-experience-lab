import { fieldAt, fieldRange } from '../../graphics/field';

/**
 * TERRITORY GEOGRAPHY.
 *
 * Sampling the land, kept apart from the components that draw it because both
 * `Territory` (to stand districts on the ground) and `WorldMode` (to aim the
 * view at them) need the same answer, and it must be the same answer.
 */

/** Height of the land under a territory coordinate. */
export function groundAt(x: number, z: number, extent: number, height: number): number {
  const { min, max } = fieldRange(96);
  const u = x / extent + 0.5;
  const v = z / extent + 0.5;
  const n = (fieldAt(u, v) - min) / (max - min || 1);
  return n * height;
}
