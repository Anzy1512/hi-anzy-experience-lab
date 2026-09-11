import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fieldAt, fieldRange } from '../../graphics/field';
import { useDisposable } from '../../spatial/disposal';
import { DISTRICTS, type District } from '../../content/world';
import { groundAt } from './geography';
import { buildDistrict, type PlateSink } from './districtForms';
import type { SpatialQuality } from '../../spatial/quality';

/**
 * THE TERRITORY.
 *
 * Everything standing here is made of the vocabulary Reality Compiler leaves
 * behind, so the world is recognisably the same material as the sheet:
 *
 *   GROUND    the specimen plate's own contour field, traced as isolines
 *   DISTRICTS stacked plates — the compiler's separated page layers, standing
 *   ROUTES    orange rules running district to district along the ground
 *   BEACONS   registration targets, one per district
 *
 * A district's character is its architecture, not its decoration: STRATEGY is
 * tall and almost perfectly in register, DESIGN shears as it stacks, TECHNOLOGY
 * is dense and machine-regular, CULTURE is low and out of true. Nobody has to
 * be told that — it is legible from the plan.
 *
 * Four static geometries, four draw calls, built once and disposed on unmount.
 * Nothing is rebuilt while the visitor moves; travel only transforms the group.
 */

const BONE = '#e4ddca';
const SIGNAL = '#f2911b';
const LEVELS = 11;

const CASES: number[][] = [
  [], [3, 0], [0, 1], [3, 1],
  [1, 2], [3, 0, 1, 2], [0, 2], [3, 2],
  [2, 3], [2, 0], [0, 1, 2, 3], [2, 1],
  [1, 3], [1, 0], [0, 3], [],
];

const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

interface Props {
  quality: SpatialQuality;
  extent: number;
  groundHeight: number;
  activeId: string | null;
}

/*
 * HOW A DISTRICT IS DRAWN.
 *
 * A section drawing distinguishes materials by hatch and line weight, never by
 * hue — the outline carries the strong weight and the hatch is the thinnest
 * line on the sheet. That is the whole convention, and it is what stops nine
 * differently-shaped districts reading as one thing.
 *
 *   value   how bright the outline sits in the bone range
 *   hatch   0 draws nothing inside a plate; higher draws more infill lines,
 *           always fainter than the outline that contains them
 *   rise    how much of the value is earned by height rather than given
 *
 * No entry here carries a colour. The Lab has one accent and it means signal.
 */
const DRAW: Record<string, { value: number; hatch: number; rise: number }> = {
  // Provisional construction line. Dim, and deliberately unfinished-looking.
  GRAPHITE: { value: 0.3, hatch: 0, rise: 0.3 },
  // The brightest stock in the territory. Sheets, so the infill is sparse and
  // reads as the face of a plate rather than as texture.
  PAPER: { value: 0.52, hatch: 2, rise: 0.4 },
  // The thinnest mark the display holds. Dense infill at low value: a lattice.
  RULE: { value: 0.34, hatch: 5, rise: 0.34 },
  // Heavy and accumulative. Strong outline, heavy poché.
  INK: { value: 0.44, hatch: 4, rise: 0.46 },
  // Evidence that something moved through, fainter than what made it.
  TRACE: { value: 0.26, hatch: 1, rise: 0.5 },
  // Countable marks: a tone at distance, a grid of decisions up close.
  HALFTONE: { value: 0.36, hatch: 3, rise: 0.36 },
  // Preserved, labelled, incomplete. Mid value, gaps left in the infill.
  ARCHIVE: { value: 0.4, hatch: 2, rise: 0.3 },
  // Not yet in register. Dim, and drawn as if the plate missed its mark.
  REGISTRATION: { value: 0.26, hatch: 1, rise: 0.2 },
  // An absence with a thickness. Outline only, and barely that.
  CUT: { value: 0.18, hatch: 0, rise: 0.1 },
};

export function Territory({ quality, extent, groundHeight, activeId }: Props) {
  const routesMat = useRef<THREE.LineBasicMaterial>(null);

  /* ---- ground: isolines of the specimen's own field ---------------------- */
  const ground = useMemo(() => {
    const N = Math.max(24, quality.terrainSegments);
    const { min, max } = fieldRange(96);
    const range = max - min || 1;

    const h = new Float32Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) h[j * (N + 1) + i] = (fieldAt(i / N, j / N) - min) / range;
    }
    const at = (i: number, j: number) => h[j * (N + 1) + i];

    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();

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
      return [(gi / N - 0.5) * extent, L * groundHeight, (gj / N - 0.5) * extent] as const;
    };

    for (let l = 1; l <= LEVELS; l++) {
      const L = l / (LEVELS + 1);
      /*
       * MAJOR / MINOR contour hierarchy — the index-contour convention every
       * printed topographic map uses. At shallow viewing angles a field of
       * equally-weighted isolines compresses into a grey mat; making every
       * third line the strong one gives the eye a structure to read elevation
       * by, and lets the minors drop to a whisper without losing the surface.
       */
      const major = l % 3 === 0;
      const lum = major ? 0.5 + (l / LEVELS) * 0.42 : 0.12 + (l / LEVELS) * 0.14;
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
            pos.push(...edgePoint(i, j, segs[s], L), ...edgePoint(i, j, segs[s + 1], L));
            col.push(c.r, c.g, c.b, c.r, c.g, c.b);
          }
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [quality.terrainSegments, extent, groundHeight]);


  /* ---- districts: stacked plates ---------------------------------------- */
  const { plates, beacons, routes } = useMemo(() => {
    const platePos: number[] = [];
    const plateCol: number[] = [];
    const beaconPos: number[] = [];
    const routePos: number[] = [];
    const c = new THREE.Color();

    const visible = DISTRICTS.slice(0, Math.max(5, quality.maxStructures));

    for (const dist of visible) {
      const base = groundAt(dist.x, dist.z, extent, groundHeight);
      const top = Math.max(1, (dist.plates - 1) * dist.rise);

      /*
       * Each district builds its own silhouette (districtForms.ts) and is drawn
       * in its own material. Brightness still rises with height so a tall
       * structure reads as tall in outline, but how much of the value is given
       * and how much is earned by height now differs per material — graphite
       * stays provisional all the way up, ink gains weight as it accumulates.
       */
      const draw = DRAW[dist.material] ?? DRAW.PAPER;

      const emit = (
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        lumScale: number,
      ) => {
        platePos.push(
          dist.x + a[0], base + a[1], dist.z + a[2],
          dist.x + b[0], base + b[1], dist.z + b[2],
        );
        for (const p of [a, b]) {
          const t = Math.min(1, p[1] / top);
          const lum = (draw.value + t * draw.rise) * lumScale;
          c.setRGB(lum * 1.03, lum * 0.99, lum * 0.88);
          plateCol.push(c.r, c.g, c.b);
        }
      };

      const sink: PlateSink = {
        poly: (points) => {
          for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            // An open two-point run is a line, not a closed outline.
            if (points.length === 2 && i === 1) break;
            emit(a, b, 1);
          }

          /*
           * HATCH — the material, drawn inside the outline it belongs to.
           *
           * Parallel runs across the plate's own span, at a fraction of the
           * outline's value because a hatch that competes with its outline has
           * stopped being secondary information and become noise. Closed
           * plates only: an open two-point run has no inside.
           */
          if (draw.hatch > 0 && points.length > 2) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            let y = 0;
            for (const p of points) {
              if (p[0] < minX) minX = p[0];
              if (p[0] > maxX) maxX = p[0];
              if (p[2] < minZ) minZ = p[2];
              if (p[2] > maxZ) maxZ = p[2];
              y += p[1];
            }
            y /= points.length;
            for (let h = 1; h <= draw.hatch; h += 1) {
              const f = h / (draw.hatch + 1);
              const z = minZ + (maxZ - minZ) * f;
              emit([minX, y, z] as const, [maxX, y, z] as const, 0.42);
            }
          }
        },
      };
      buildDistrict(dist, sink);

      // A registration target planted on the ground at each district.
      const r = 42;
      const y = base + 2;
      for (let a = 0; a < 24; a++) {
        const a0 = (a / 24) * Math.PI * 2;
        const a1 = ((a + 1) / 24) * Math.PI * 2;
        beaconPos.push(
          dist.x + Math.cos(a0) * r, y, dist.z + Math.sin(a0) * r,
          dist.x + Math.cos(a1) * r, y, dist.z + Math.sin(a1) * r,
        );
      }
      beaconPos.push(dist.x - r * 1.6, y, dist.z, dist.x + r * 1.6, y, dist.z);
      beaconPos.push(dist.x, y, dist.z - r * 1.6, dist.x, y, dist.z + r * 1.6);
    }

    // Routes: the rules from the sheet, run along the ground between districts.
    const open = visible.filter((d) => d.status === 'open');
    for (let i = 0; i < open.length - 1; i++) {
      const a = open[i];
      const b = open[i + 1];
      const STEPS = 18;
      for (let s = 0; s < STEPS; s++) {
        const t0 = s / STEPS;
        const t1 = (s + 1) / STEPS;
        const p = (t: number) => {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          return [x, groundAt(x, z, extent, groundHeight) + 6, z] as const;
        };
        routePos.push(...p(t0), ...p(t1));
      }
    }

    const geo = (arr: number[], colors?: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      return g;
    };

    return {
      plates: geo(platePos, plateCol),
      beacons: geo(beaconPos),
      routes: geo(routePos),
    };
  }, [quality.maxStructures, extent, groundHeight]);

  useDisposable(ground, plates, beacons, routes);

  useFrame(() => {
    // The routes carry the only moving light in the world: a slow signal pass.
    if (routesMat.current) {
      routesMat.current.opacity = activeId ? 0.5 : 0.32;
    }
  });

  return (
    <group>
      <lineSegments geometry={ground}>
        <lineBasicMaterial vertexColors transparent opacity={0.62} />
      </lineSegments>
      <lineSegments geometry={plates}>
        <lineBasicMaterial vertexColors transparent opacity={0.9} />
      </lineSegments>
      <lineSegments geometry={beacons}>
        <lineBasicMaterial color={BONE} transparent opacity={0.3} />
      </lineSegments>
      {/* Orange stays signal: these are the routes between capabilities. */}
      <lineSegments geometry={routes}>
        <lineBasicMaterial ref={routesMat} color={SIGNAL} transparent opacity={0.32} />
      </lineSegments>
    </group>
  );
}

export type { District };
