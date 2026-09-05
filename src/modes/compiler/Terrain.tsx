import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fieldAt, fieldRange } from '../../graphics/field';
import { useDisposable } from '../../spatial/disposal';
import type { Viewport } from '../../spatial/projection';
import type { CompileState } from './stages';

/**
 * THE GROUND — a real contour map, lying in space.
 *
 * This is `fieldAt`: the same seeded function the printed contour plate
 * rasterises. So the terrain is not *like* the document's figure, it *is* the
 * figure, sampled instead of drawn. Print halftone → contour → geography, with
 * no step that is not derived from the step before it.
 *
 * It traces **isolines with marching squares**, at nine height levels. Two
 * earlier attempts drew a displaced wireframe grid instead, and both failed the
 * same way: a grid of quads reads as a videogame landscape, which is exactly the
 * cliché this world cannot afford. Real contours are closed rings at constant
 * height — they read as a map, they carry the print DNA directly, and because
 * each ring sits at its own altitude the drawing is also the relief.
 *
 * One geometry, one draw call, built once, disposed on unmount.
 */

interface Props {
  viewport: Viewport;
  state: CompileState;
  segments: number;
}

/** Marching-squares edge pairs, indexed by the four-corner mask. */
const CASES: number[][] = [
  [],
  [3, 0],
  [0, 1],
  [3, 1],
  [1, 2],
  [3, 0, 1, 2],
  [0, 2],
  [3, 2],
  [2, 3],
  [2, 0],
  [0, 1, 2, 3],
  [2, 1],
  [1, 3],
  [1, 0],
  [0, 3],
  [],
];

const LEVELS = 9;

export function Terrain({ viewport, state, segments }: Props) {
  const matRef = useRef<THREE.LineBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  const geometry = useMemo(() => {
    const N = Math.max(8, segments);
    /*
     * Extent is deliberately close to the viewport rather than vast. Spread over
     * three-plus screens the isolines separate into a few lonely sweeps; at this
     * scale you see whole rings at once and the ground reads as a *map* — which
     * is the entire point of deriving it from the printed plate.
     */
    const width = viewport.w * 1.9;
    const depth = viewport.w * 1.9;
    const height = viewport.h * 0.34;
    const { min, max } = fieldRange(96);
    const range = max - min || 1;

    // Sample the field once; every level reads the same grid.
    const h = new Float32Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        h[j * (N + 1) + i] = (fieldAt(i / N, j / N) - min) / range;
      }
    }
    const at = (i: number, j: number) => h[j * (N + 1) + i];

    const positions: number[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();

    const CORNERS = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];

    /** Interpolated point along edge k of cell (i,j) at level L. */
    const edgePoint = (i: number, j: number, k: number, L: number) => {
      const a = CORNERS[k];
      const b = CORNERS[(k + 1) % 4];
      const ai = i + a[0];
      const aj = j + a[1];
      const bi = i + b[0];
      const bj = j + b[1];
      const va = at(ai, aj);
      const vb = at(bi, bj);
      const t = Math.abs(vb - va) < 1e-6 ? 0.5 : (L - va) / (vb - va);
      const gi = ai + (bi - ai) * t;
      const gj = aj + (bj - aj) * t;
      return [(gi / N - 0.5) * width, L * height, (gj / N - 0.5) * depth] as const;
    };

    for (let l = 1; l <= LEVELS; l++) {
      const L = l / (LEVELS + 1);
      // Higher ground reads brighter, exactly as the printed plate terraces it.
      const lum = 0.28 + (l / LEVELS) * 0.64;
      c.setRGB(lum * 1.03, lum * 0.99, lum * 0.88);

      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const mask =
            (at(i, j) > L ? 1 : 0) |
            (at(i + 1, j) > L ? 2 : 0) |
            (at(i + 1, j + 1) > L ? 4 : 0) |
            (at(i, j + 1) > L ? 8 : 0);
          const segs = CASES[mask];
          for (let s = 0; s < segs.length; s += 2) {
            positions.push(...edgePoint(i, j, segs[s], L), ...edgePoint(i, j, segs[s + 1], L));
            colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
          }
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [segments, viewport.w, viewport.h]);

  useDisposable(geometry);

  useFrame(() => {
    if (matRef.current) matRef.current.opacity = 0.72 * state.world;
    const g = groupRef.current;
    if (!g) return;
    // The ground arrives from below rather than switching on.
    g.position.y = -viewport.h * 0.62 - (1 - state.world) * 300;
  });

  if (segments <= 0) return null;

  return (
    <group ref={groupRef} position={[0, -viewport.h * 0.62, -viewport.w * 0.36]}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial ref={matRef} vertexColors transparent opacity={0} />
      </lineSegments>
    </group>
  );
}
