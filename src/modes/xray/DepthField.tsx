import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pointer } from '../../core/pointer';
import type { MeasuredObject } from './useMeasure';

/**
 * DEPTH — the one place WebGL earns its seat in Phase 1.
 *
 * Every other diagnostic here is a flat overlay, and rightly so: SVG draws
 * measured geometry better than a shader would. But the z-stack is genuinely
 * three-dimensional information. The DOM knows each object's nesting depth and
 * has no way to show it; lifting the measured boxes onto real z and viewing them
 * through a perspective camera shows the sheet's construction as a stack of
 * plates, which is exactly the idea this whole product is built on.
 *
 * Loaded only when the DEPTH patch is switched on — it is off in the default
 * layer set, so the graphics chunk and its render loop do not exist until asked
 * for. No drei: everything needed here is ~60 lines of three.
 */

const Z_SPACING = 34;

function buildGeometry(
  objects: MeasuredObject[],
  vw: number,
  vh: number,
  scannedId: number | null,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];

  const bone = new THREE.Color('#e4ddca');
  const signal = new THREE.Color('#f2911b');

  for (const o of objects) {
    const c = o.id === scannedId ? signal : bone;
    const alphaByDepth = 1 - Math.min(o.depth, 8) * 0.07;

    const x0 = o.x - vw / 2;
    const x1 = o.x + o.w - vw / 2;
    const y0 = -(o.y - vh / 2);
    const y1 = -(o.y + o.h - vh / 2);
    const z = -o.depth * Z_SPACING;

    const edges: Array<[number, number, number, number]> = [
      [x0, y0, x1, y0],
      [x1, y0, x1, y1],
      [x1, y1, x0, y1],
      [x0, y1, x0, y0],
    ];

    for (const [ax, ay, bx, by] of edges) {
      positions.push(ax, ay, z, bx, by, z);
      for (let i = 0; i < 2; i++) {
        colors.push(c.r * alphaByDepth, c.g * alphaByDepth, c.b * alphaByDepth);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function Stack({
  objects,
  vw,
  vh,
  scannedId,
  reduced,
}: {
  objects: MeasuredObject[];
  vw: number;
  vh: number;
  scannedId: number | null;
  reduced: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const geometry = useMemo(
    () => buildGeometry(objects, vw, vh, scannedId),
    [objects, vw, vh, scannedId],
  );

  // R3F only disposes objects it created; this geometry is ours to release.
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (reduced) {
      // Reduced motion keeps the depth reading — a fixed, gentle three-quarter
      // view — and drops the pointer-driven movement entirely.
      g.rotation.y = 0.22;
      g.rotation.x = -0.1;
      return;
    }
    const tx = (pointer.nx - 0.5) * 0.62;
    const ty = (pointer.ny - 0.5) * 0.34;
    g.rotation.y += (tx - g.rotation.y) * 0.055;
    g.rotation.x += (-ty - g.rotation.x) * 0.055;
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={geometry}>
        {/* Sits behind the flat diagnostics as a spatial ghost. At full opacity
            it competes with the BOX layer and the sheet reads as two drawings. */}
        <lineBasicMaterial vertexColors transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

interface Props {
  objects: MeasuredObject[];
  viewport: { w: number; h: number };
  scannedId: number | null;
  dpr: number;
  reduced: boolean;
}

export default function DepthField({ objects, viewport, scannedId, dpr, reduced }: Props) {
  // Place the camera so one world unit equals one CSS pixel at z = 0.
  const fov = 34;
  const distance = viewport.h / 2 / Math.tan((fov * Math.PI) / 360);

  return (
    <Canvas
      className="xr-depth"
      dpr={Math.min(dpr, 1.75)}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      camera={{ fov, position: [0, 0, distance], near: 1, far: distance * 4 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Stack objects={objects} vw={viewport.w} vh={viewport.h} scannedId={scannedId} reduced={reduced} />
    </Canvas>
  );
}
