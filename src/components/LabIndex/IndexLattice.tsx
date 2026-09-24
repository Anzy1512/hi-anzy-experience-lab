import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MODES } from '../../content/lab';
import { EDGES } from '../../content/graph';
import { useDisposable } from '../../spatial/disposal';

/**
 * THE CROSS-REFERENCE LATTICE — the sixteen realities, meshed.
 *
 * WHERE THIS CAME FROM
 * `components/three/SystemCore.js` in the commercial frontend. Sixteen nodes
 * start scattered, assemble into a lattice around one core, and each meshes
 * with its two nearest neighbours; its own comment states the argument as
 * "disconnected things, meshed into one system". That component has sixteen
 * nodes, and this product had sixteen realities when the figure was built —
 * a coincidence nobody planned. Layer 7 added a seventeenth, so the counts no
 * longer match and the lattice draws one node per mode rather than sixteen. It
 * is
 * too good a coincidence to leave on the floor.
 *
 * WHY IT IS HERE AND NOT BEHIND THE WHOLE INDEX
 * The plate list is the Lab's strongest single composition and a field of
 * drifting nodes behind it would be exactly the decoration this product bans.
 * So the lattice sits with the CROSS-REFERENCES section instead, as the twin
 * of that block and nothing else: the list states twelve edges one at a time,
 * and the geometry says the thing a list structurally cannot — that they are
 * one connected structure rather than twelve separate observations.
 *
 * THE DOM IS STILL THE SOURCE
 * Every edge here is also a row in the list beside it, and every reality is a
 * row further up the same sheet. `Constellation.js` states this rule on the
 * canonical side — "the scene is never the only source of info" — and it is
 * the Lab's DOM/WebGL twin rule word for word. Turn WebGL off and nothing is
 * lost but the drawing.
 *
 * COST
 * One instanced mesh for the nodes, one LineSegments buffer for the mesh, one
 * for the graph edges. Three draw calls. `frameloop="demand"` with a bounded
 * assembly: it invalidates while it assembles and then stops, so an index left
 * open holds no frame loop.
 */

const NODE_COUNT = 16;

/**
 * SIZED BY THE FRAME, NOT BY THE PROJECTION.
 *
 * `spatial/projection.ts` fixes one world unit to one CSS pixel so DOM and
 * WebGL can share a projection, and every other scene in the Lab depends on
 * that. This one does not: it is a self-contained figure with no DOM element
 * to line up against, and the parity numbers only made it hard to reason about
 * — ported from SystemCore's own scene units it drew a lattice a pixel and a
 * half across, and hand-converting to pixels landed it at a third of the size
 * the arithmetic predicted.
 *
 * So the geometry stays in SystemCore's normalised units and the group is
 * scaled to whatever fraction of the frame it should occupy, read from R3F's
 * own viewport. That is exact at any fov, any dpr and any canvas size, and it
 * is one line instead of a conversion nobody can check by eye.
 */
const LATTICE_RADIUS = 1.85;
const SCATTER_SPREAD = 1.5;
const NODE_RADIUS = 0.068;
const ASSEMBLE_MS = 1500;
/** How much of the frame's shorter side the assembled lattice spans. */
const FILL = 0.86;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Deterministic. A lattice that rearranges itself on reload reads as noise. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Evenly distributed points on a sphere — the resolved, meshed state. */
function fibonacciSphere(n: number, radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const offset = 2 / n;
  const increment = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i += 1) {
    const y = i * offset - 1 + offset / 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * increment;
    pts.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r).multiplyScalar(radius));
  }
  return pts;
}

interface Props {
  /** Ids of realities this visitor has entered. Marked, not hidden. */
  visited: string[];
  /** Reduced motion arrives as an argument, never inferred from a quality tier. */
  reduced: boolean;
}

export function IndexLattice({ visited, reduced }: Props) {
  const nodesRef = useRef<THREE.InstancedMesh>(null);
  /* World units visible at z=0, straight from the renderer. */
  const view = useThree((s) => s.viewport);
  const scale = (Math.min(view.width, view.height) * FILL) / (LATTICE_RADIUS * 2);
  const started = useRef(0);
  const done = useRef(false);

  /* The order the index prints is the order the lattice uses, so a row and a
     node are the same object seen twice. */
  const ids = useMemo(() => MODES.map((m) => m.id), []);

  const { lattice, scatter } = useMemo(() => {
    const lattice = fibonacciSphere(NODE_COUNT, LATTICE_RADIUS);
    const rnd = seeded(53);
    const scatter = lattice.map((p) =>
      p
        .clone()
        .multiplyScalar(SCATTER_SPREAD)
        .add(new THREE.Vector3((rnd() - 0.5) * 1.3, (rnd() - 0.5) * 1.3, (rnd() - 0.5) * 1.3)),
    );
    return { lattice, scatter };
  }, []);

  /* Two meshes, drawn differently because they mean different things.

     The lattice links are structural — every node's two nearest neighbours,
     exactly as SystemCore builds them — and say "these are all part of one
     object". The graph links are the twelve edges from `content/graph.ts`,
     the ones a visitor can actually travel, and they are what the list beside
     this is enumerating. */
  const geometry = useMemo(() => {
    const nodeGeo = new THREE.SphereGeometry(NODE_RADIUS, 8, 6);

    const latticePairs: [number, number][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const d = lattice
        .map((p, j) => [j, lattice[i].distanceTo(p)] as [number, number])
        .filter(([j]) => j !== i)
        .sort((a, b) => a[1] - b[1]);
      for (const [j] of d.slice(0, 2)) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        latticePairs.push([i, j]);
      }
    }

    const graphPairs: [number, number][] = [];
    for (const e of EDGES) {
      const a = ids.indexOf(e.from);
      const b = ids.indexOf(e.to);
      if (a >= 0 && b >= 0) graphPairs.push([a, b]);
    }

    const build = (pairs: [number, number][]) => {
      const pos = new Float32Array(pairs.length * 6);
      pairs.forEach(([a, b], k) => {
        pos.set([lattice[a].x, lattice[a].y, lattice[a].z], k * 6);
        pos.set([lattice[b].x, lattice[b].y, lattice[b].z], k * 6 + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return g;
    };

    return { nodeGeo, latticeGeo: build(latticePairs), graphGeo: build(graphPairs) };
  }, [ids, lattice]);

  useDisposable(geometry.nodeGeo, geometry.latticeGeo, geometry.graphGeo);

  /* Colour per node, not per frame: bone for a reality still unopened, signal
     for one this visitor has been inside. The index marks the same thing with
     a struck register mark on the row, so the two agree. */
  const colours = useMemo(() => {
    const bone = new THREE.Color('#e0d8c1');
    const signal = new THREE.Color('#f19020');
    return ids.map((id) => (visited.includes(id) ? signal : bone));
  }, [ids, visited]);

  useFrame(({ clock, invalidate }) => {
    const mesh = nodesRef.current;
    if (!mesh) return;

    if (started.current === 0) started.current = clock.elapsedTime;
    // Wall time via the clock R3F already owns. Nothing here reads the shared
    // RAF loop's dt, which is clamped and would make this run long.
    const t = reduced ? 1 : clamp01(((clock.elapsedTime - started.current) * 1000) / ASSEMBLE_MS);
    const e = easeOutCubic(t);

    const m = new THREE.Matrix4();
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const p = scatter[i].clone().lerp(lattice[i], e);
      m.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colours[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // The links only mean anything once the nodes have arrived.
    mesh.parent?.children.forEach((c) => {
      if (c.type === 'LineSegments') {
        const line = c as THREE.LineSegments;
        (line.material as THREE.LineBasicMaterial).opacity =
          (line.userData.baseOpacity as number) * e;
      }
    });

    if (t < 1) {
      invalidate();
    } else if (!done.current) {
      done.current = true;
      // Assembled. Nothing further is requested, so the loop stops here and an
      // index left open on screen costs no frames at all.
    }
  });

  return (
    <group scale={scale}>
      <instancedMesh ref={nodesRef} args={[geometry.nodeGeo, undefined, NODE_COUNT]}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <lineSegments geometry={geometry.latticeGeo} userData={{ baseOpacity: 0.16 }}>
        <lineBasicMaterial color="#e0d8c1" transparent opacity={0} toneMapped={false} />
      </lineSegments>

      <lineSegments geometry={geometry.graphGeo} userData={{ baseOpacity: 0.55 }}>
        <lineBasicMaterial color="#f19020" transparent opacity={0} toneMapped={false} />
      </lineSegments>
    </group>
  );
}
