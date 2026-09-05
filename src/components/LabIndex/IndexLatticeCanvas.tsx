import { useCapability, useReducedMotion } from '../../core/hooks';
import { spatialQuality } from '../../spatial/quality';
import { SpatialCanvas } from '../../spatial/SpatialCanvas';
import { IndexLattice } from './IndexLattice';

/**
 * The lazy boundary.
 *
 * This module is the only thing on the Reality Index that reaches `three` and
 * `@react-three/fiber`, and it is imported dynamically so neither reaches the
 * entry chunk. The index itself — the plate list, the cross-reference block,
 * every route out of here — is finished and interactive before this file has
 * been asked for.
 *
 * It renders nothing at all on the `lite` tier, which is also where reduced
 * motion lands. That is correct rather than a compromise: the section it
 * accompanies is a complete written list of the same twelve relationships.
 */
export default function IndexLatticeCanvas({ visited }: { visited: string[] }) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const quality = spatialQuality(capability);

  if (!quality.webgl) return null;

  return (
    <div className="index__lattice" aria-hidden="true">
      {/* The window's viewport, as every other scene passes. This figure does
          not line up against any DOM element, so it sizes itself from the
          renderer's own viewport instead of from the parity contract — see the
          note in IndexLattice. */}
      <SpatialCanvas quality={quality} viewport={capability.viewport}>
        <IndexLattice visited={visited} reduced={reduced} />
      </SpatialCanvas>
    </div>
  );
}
