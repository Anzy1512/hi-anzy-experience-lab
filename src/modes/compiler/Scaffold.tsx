import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rectToWorld, type Viewport } from '../../spatial/projection';
import { useDisposable } from '../../spatial/disposal';
import type { SpatialCell } from '../../spatial/useSpatialCells';
import type { CompileState } from './stages';

/**
 * THE SCAFFOLD — the structure the DOM cannot draw.
 *
 * The division of labour in Reality Compiler: the DOM carries the *content* into
 * depth (real text, real image, still selectable), and this layer draws the
 * *structure* around it — the boundary of each region, the thickness it acquires,
 * and the corridor the six method stages form once they are separated.
 *
 * PERFORMANCE, and the reason this is three static geometries rather than a
 * rebuild per frame: every vertex is baked at **unit depth**, with each cell
 * placed at z = −planeIndex. Animating the separation is then a single
 * `scale.z` on the parent group. Nothing is reallocated while compiling, no
 * layout is read, and the whole scaffold costs three draw calls.
 */

interface Props {
  cells: SpatialCell[];
  rootOffset: { x: number; y: number };
  viewport: Viewport;
  state: CompileState;
  showCorridor: boolean;
}

const BONE = new THREE.Color('#e4ddca');
const SIGNAL = new THREE.Color('#f2911b');

/** Cell corners in world space, at unit depth z = −plane. */
function cornersOf(cell: SpatialCell, rootOffset: { x: number; y: number }, view: Viewport) {
  const rect = {
    x: cell.rect.x + rootOffset.x,
    y: cell.rect.y + rootOffset.y,
    w: cell.rect.w,
    h: cell.rect.h,
  };
  const c = rectToWorld(rect, view);
  const hw = rect.w / 2;
  const hh = rect.h / 2;
  const z = -cell.plane;
  return {
    z,
    tl: [c.x - hw, c.y + hh, z] as const,
    tr: [c.x + hw, c.y + hh, z] as const,
    br: [c.x + hw, c.y - hh, z] as const,
    bl: [c.x - hw, c.y - hh, z] as const,
  };
}

export function Scaffold({ cells, rootOffset, viewport, state, showCorridor }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const framesMat = useRef<THREE.LineBasicMaterial>(null);
  const volumeMat = useRef<THREE.LineBasicMaterial>(null);
  const corridorMat = useRef<THREE.LineBasicMaterial>(null);

  /* ---- three baked geometries ------------------------------------------- */
  const { frames, volume, corridor } = useMemo(() => {
    const framePos: number[] = [];
    const volumePos: number[] = [];
    const corridorPos: number[] = [];

    const geometryOf = (arr: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      return g;
    };

    const push = (arr: number[], a: readonly number[], b: readonly number[]) => {
      arr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    };

    // Boundary of every cell.
    for (const cell of cells) {
      const k = cornersOf(cell, rootOffset, viewport);
      push(framePos, k.tl, k.tr);
      push(framePos, k.tr, k.br);
      push(framePos, k.br, k.bl);
      push(framePos, k.bl, k.tl);

      // Depth edges — the thickness a flat region acquires at VOLUME. Baked at a
      // fraction of one plane so it scales with the separation.
      const d = 0.16;
      const back = (p: readonly number[]) => [p[0], p[1], p[2] - d] as const;
      push(volumePos, k.tl, back(k.tl));
      push(volumePos, k.tr, back(k.tr));
      push(volumePos, k.br, back(k.br));
      push(volumePos, k.bl, back(k.bl));
      push(volumePos, back(k.tl), back(k.tr));
      push(volumePos, back(k.tr), back(k.br));
      push(volumePos, back(k.br), back(k.bl));
      push(volumePos, back(k.bl), back(k.tl));
    }

    // The corridor: corner-to-corner links between consecutive method stages.
    // This is the object that makes "the list was a corridor" literal.
    const stages = cells
      .filter((c) => c.key.startsWith('STAGE/'))
      .sort((a, b) => a.plane - b.plane);
    for (let i = 0; i < stages.length - 1; i++) {
      const a = cornersOf(stages[i], rootOffset, viewport);
      const b = cornersOf(stages[i + 1], rootOffset, viewport);
      push(corridorPos, a.tl, b.tl);
      push(corridorPos, a.tr, b.tr);
      push(corridorPos, a.br, b.br);
      push(corridorPos, a.bl, b.bl);
    }

    return {
      frames: geometryOf(framePos),
      volume: geometryOf(volumePos),
      corridor: geometryOf(corridorPos),
    };
  }, [cells, rootOffset, viewport]);

  useDisposable(frames, volume, corridor);

  /* ---- one scale + three opacities per frame ----------------------------- */
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    // Depth separation is a scale, not a rebuild.
    g.scale.z = Math.max(0.0001, state.planeDepth);

    if (framesMat.current) framesMat.current.opacity = 0.34 * state.separate;
    if (volumeMat.current) volumeMat.current.opacity = 0.3 * state.volume;
    if (corridorMat.current) {
      corridorMat.current.opacity = showCorridor ? 0.42 * state.volume : 0;
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={frames}>
        <lineBasicMaterial ref={framesMat} color={BONE} transparent opacity={0} />
      </lineSegments>
      <lineSegments geometry={volume}>
        <lineBasicMaterial ref={volumeMat} color={BONE} transparent opacity={0} />
      </lineSegments>
      {/* Orange stays signal: this is the path the method describes, not decoration. */}
      <lineSegments geometry={corridor}>
        <lineBasicMaterial ref={corridorMat} color={SIGNAL} transparent opacity={0} />
      </lineSegments>
    </group>
  );
}
