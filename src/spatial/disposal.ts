import { useEffect } from 'react';
import * as THREE from 'three';

/**
 * THREE RESOURCE DISPOSAL.
 *
 * R3F disposes objects **it** created from JSX. Anything built imperatively —
 * a geometry from a `useMemo`, a material, a texture, a render target — belongs
 * to us, and GPU memory is not garbage collected. Phase 1's rule was that a mode
 * cannot outlive its own exit; in Phase 2 that has to include VRAM.
 */

type Disposable = { dispose: () => void } | null | undefined;

/** Disposes the given resources when the effect tears down. */
export function useDisposable(...resources: Disposable[]): void {
  useEffect(
    () => () => {
      for (const r of resources) {
        try {
          r?.dispose();
        } catch (err) {
          console.warn('[lab] dispose failed', err);
        }
      }
    },
    // Each resource identity is the dependency: a new geometry disposes the old.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    resources,
  );
}

/**
 * Walks a scene graph and releases everything it owns.
 *
 * Used as the belt-and-braces pass on mode exit, after React has unmounted the
 * tree — cheap insurance against a resource that escaped a `useDisposable`.
 */
export function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh>;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
    else if (mat) materials.add(mat);
  });

  for (const m of materials) {
    // Any texture-valued uniform or property is ours to release too.
    for (const value of Object.values(m as unknown as Record<string, unknown>)) {
      if (value instanceof THREE.Texture) textures.add(value);
    }
    m.dispose();
  }
  for (const g of geometries) g.dispose();
  for (const t of textures) t.dispose();
}
