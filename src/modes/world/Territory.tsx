import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fieldAt, fieldRange } from '../../graphics/field';
import { useDisposable } from '../../spatial/disposal';
import { DISTRICTS, type District } from '../../content/world';
import { groundAt } from './geography';
import { buildDistrict, type PlateSink } from './districtForms';
import { penFor, plain, type Box } from './pens';
import { DATUM, buildDatum } from './landmarks';
import { buildLandmark } from './districtLandmarks';
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
 *   DATUM     the monument the whole survey is squared from — see landmarks.ts
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
/* The lifted stock. The districts are drawn between 0.18 and 0.52 of the bone
   range; the monument sits above all of them, which is the whole point of it. */
const DATUM_BONE = '#f7f5ee';
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
 * HOW A DISTRICT IS DRAWN — see `pens.ts`.
 *
 * The value/hatch table that used to live here has become a table of pens: a
 * material no longer just sets how bright and how dense its lines are, it sets
 * how they are *made*. Graphite over-runs its corners, halftone breaks its own
 * outline into countable marks, archive leaves measured gaps in it, ink fills
 * with poché. Nine materials, nine techniques, and still not one colour
 * between them.
 */

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
  const { plates, beacons, routes, datum } = useMemo(() => {
    const platePos: number[] = [];
    const plateCol: number[] = [];
    const beaconPos: number[] = [];
    const routePos: number[] = [];
    const datumPos: number[] = [];
    const c = new THREE.Color();

    const visible = DISTRICTS.slice(0, Math.max(5, quality.maxStructures));
    /*
     * Whether the territory is drawn with its pens or with one line.
     *
     * Every technique multiplies the segment count — halftone turns an edge
     * into a dozen marks, poché fills a plate with thirty runs. `scaffold` is
     * already the dial for "this tier can afford connective drawing", so the
     * lite tier reuses it and keeps the topology, which is what carried a
     * district's identity before any of this existed.
     */
    const fine = quality.scaffold;

    for (const dist of visible) {
      const base = groundAt(dist.x, dist.z, extent, groundHeight);
      const top = Math.max(1, (dist.plates - 1) * dist.rise);

      /*
       * Each district builds its own silhouette (districtForms.ts) and is
       * drawn with its own pen (pens.ts). Brightness still rises with height
       * so a tall structure reads as tall in outline, but how much of the
       * value is given and how much is earned by height differs per material —
       * graphite stays provisional all the way up, ink gains weight as it
       * accumulates — and now so does the mark itself.
       */
      const draw = fine ? penFor(dist.material) : plain(penFor(dist.material));

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
        /*
         * The structure between the plates. The form said where; the pen says
         * what of — a graphite post over-runs, an ink one triples, a cut one
         * barely leaves the ground. A material with no riser has no vertical
         * structure at all, which is a statement rather than an omission.
         */
        riser: (x, z, y0, y1) => draw.riser?.(x, z, y0, y1, emit),
        poly: (points) => {
          for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            // An open two-point run is a line, not a closed outline.
            if (points.length === 2 && i === 1) break;
            draw.stroke(a, b, emit);
          }

          /*
           * The material, drawn inside the outline it belongs to — poché,
           * cross-hatch, dots, or nothing at all. Always at a fraction of the
           * outline's value, because infill that competes with its outline has
           * stopped being secondary information and become noise. Closed
           * plates only: an open two-point run has no inside.
           */
          if (draw.fill && points.length > 2) {
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
            const box: Box = { minX, maxX, minZ, maxZ, y };
            draw.fill(box, emit);
          }
        },
      };
      buildDistrict(dist, sink);
      /* And the one thing in this district tall enough to steer by. Same sink,
         so it is drawn by the same pen and lands in the same draw call. */
      buildLandmark(dist, sink);

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

    /*
     * THE SURVEY DATUM.
     *
     * The one object in the territory that is not a district, drawn into its
     * own buffer because it is not a district: it has no material entry, no
     * height-derived value and no status, and giving it one would make it look
     * like a tenth place. It is a monument. See `landmarks.ts` for why the
     * territory needs exactly one and why it is this.
     */
    {
      const dy = groundAt(DATUM.x, DATUM.z, extent, groundHeight);
      const sink: PlateSink = {
        /* The datum is drawn, not built: it is an instrument the survey is
           squared from, and giving it structure would make it a tenth place. */
        riser: () => {},
        poly: (points) => {
          for (let i = 0; i < points.length; i++) {
            if (points.length === 2 && i === 1) break;
            const a = points[i];
            const b = points[(i + 1) % points.length];
            datumPos.push(
              DATUM.x + a[0], dy + a[1], DATUM.z + a[2],
              DATUM.x + b[0], dy + b[1], DATUM.z + b[2],
            );
          }
        },
      };
      buildDatum(sink);
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
      datum: geo(datumPos),
    };
  }, [quality.maxStructures, quality.scaffold, extent, groundHeight]);

  useDisposable(ground, plates, beacons, routes, datum);

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
      {/*
        The datum, drawn at the brightest bone in the territory and at full
        opacity. Nothing else here is allowed to be this bright — that is how
        this product says "most important" without reaching for the accent, and
        orange stays what it has always been.
      */}
      <lineSegments geometry={datum}>
        <lineBasicMaterial color={DATUM_BONE} transparent opacity={0.92} />
      </lineSegments>
      {/* Orange stays signal: these are the routes between capabilities. */}
      <lineSegments geometry={routes}>
        <lineBasicMaterial ref={routesMat} color={SIGNAL} transparent opacity={0.32} />
      </lineSegments>
    </group>
  );
}

export type { District };
