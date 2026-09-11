import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ModeViewProps } from '../../experience/types';
import {
  useCapability,
  useCoarsePointer,
  useLatest,
  useMediaQuery,
  useReducedMotion,
} from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { spatialFallbackReason } from '../../content/brand';
import { spatialQuality, type SpatialQuality } from '../../spatial/quality';
import { SpatialCanvas } from '../../spatial/SpatialCanvas';
import { damp, lerp } from '../../spatial/projection';
import { DISTRICTS, WORLD_COPY, type District } from '../../content/world';
import { Territory } from './Territory';
import { groundAt } from './geography';
import { districtTop } from './districtForms';
import { WorldIndex } from './WorldIndex';
import './world.css';

/**
 * LIVING WORLD — ENTER HI ANZY.
 *
 * Not a place you walk around in: a **territory you read**. The visitor arrives
 * on an establishing view of the whole plan and travels to districts, which is
 * navigable by anyone regardless of whether they have ever used a game.
 *
 * The world is what Reality Compiler leaves behind. Ground is the specimen
 * plate's contour field; districts are the compiler's separated page layers,
 * standing as stacked plates; routes are the sheet's rules run along the land.
 * Every form in it is derived from a 2D form that preceded it.
 *
 * Architecture notes:
 *  - **The camera never moves.** The territory does — the same trick the
 *    Compiler uses, which keeps one transform authoritative and avoids writing
 *    to renderer-owned state.
 *  - **Labels are DOM.** District names are real HTML, positioned by projecting
 *    world points to screen. Crisp at any size, selectable, and in the
 *    accessibility tree — where a texture-atlas of typography would be none of
 *    those things.
 *  - Nothing re-renders while travelling: the view lives in refs and the scene
 *    reads a stable mutable object.
 */

const EXTENT = 3400;
const GROUND_HEIGHT = 420;

/** A camera station: where the territory sits when a district is in focus. */
interface View {
  x: number;
  y: number;
  z: number;
  tilt: number;
  turn: number;
  scale: number;
}

/**
 * THE OVERVIEW STATION, FITTED TO THE SHAPE OF THE SCREEN.
 *
 * ── DESKTOP: A HORIZON. PHONE: A PLAN. ──────────────────────────────────────
 *
 * One fixed station used to serve both, and on a 390-wide screen it was not an
 * overview at all: the survey spans ±1450 units and a portrait viewport holds
 * roughly a third of that at this distance, so a visitor arriving on a phone
 * landed *inside* the territory looking at two and a half districts with no way
 * to know there were nine. Pulling straight back is not the fix either — the
 * distance needed to fit a landscape horizon into a portrait frame is far
 * enough to put the whole world inside the fog.
 *
 * The answer is that the two screens want different *readings* of the same
 * place. A wide screen holds a horizon, which is what the 46° station gives.
 * A tall screen cannot, but it holds a **plan** better than a wide one does —
 * the territory is roughly square in plan — so the phone tips the land toward
 * the viewer and reads it as a map. Same world, same station type, same code
 * path; the angle is the thing that changes.
 */
function overviewFor(narrow: boolean): View {
  return narrow
    ? { x: 0, y: -40, z: -4200, tilt: 64, turn: 0, scale: 1 }
    : { x: 0, y: -260, z: -2100, tilt: 46, turn: 0, scale: 1 };
}

/**
 * Fog, scaled to how far away the world is being held.
 *
 * The haze is a depth cue measured in world units from the camera, so a station
 * that stands two and a half times further off needs its fog moved with it or
 * the cue stops being a cue and becomes a curtain: at the phone's station the
 * fixed 1800–6200 band put the middle of the survey three quarters of the way
 * into the fog and the far half of it out of sight entirely. Same effect, same
 * colour, same job — measured from where the viewer actually is.
 */
function fogFor(narrow: boolean): [number, number] {
  return narrow ? [3800, 10400] : [1800, 6200];
}

function viewForDistrict(d: District, narrow: boolean): View {
  return {
    // Bring the district to the middle of the sheet and stand close to it.
    x: -d.x * 0.86,
    /* On a phone the index takes the bottom two fifths of the screen, so the
       station lifts the world clear of it — otherwise the district you have
       just travelled to arrives underneath its own readout. Found by looking:
       300 left it under the index, 720 pushed its name into the mode chrome at
       the top, and the band between the two is about 250 screen pixels wide. */
    y:
      -groundAt(d.x, d.z, EXTENT, GROUND_HEIGHT) -
      districtTop(d) * (narrow ? 0.62 : 0.45) -
      130 +
      (narrow ? 600 : 0),
    /* A phone stands further off: the same district at the same distance fills
       a portrait frame edge to edge and stops being a place you are looking at. */
    z: -d.z * 0.86 - (narrow ? 1080 : 780),
    tilt: narrow ? 34 : 26,
    turn: 0,
    scale: 1,
  };
}

interface WorldState {
  view: View;
  biasX: number;
  biasY: number;
  /** Drag-to-look offsets, in degrees, applied on top of the station. */
  lookX: number;
  lookY: number;
}

/**
 * Authored look bounds.
 *
 * Drag turns the territory, it does not hand over the camera. The limits are
 * tight enough that the visitor can always see where they are and can always
 * find their way back, and releasing eases the view home rather than leaving it
 * wherever the hand stopped. That is the difference between a directed world and
 * orbit controls.
 */
const LOOK_LIMIT_X = 26;
const LOOK_LIMIT_Y = 11;
const LOOK_RETURN = 0.34;

export default function WorldMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const quality = useMemo(() => spatialQuality(capability), [capability]);
  /* Not `coarse`: what changes the station is the *shape* of the frame, not the
     input device. A narrow desktop window wants the plan reading too. */
  const narrow = useMediaQuery('(max-width: 900px)');

  const rootRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [arrived, setArrived] = useState(true);
  const [glFailed, setGlFailed] = useState(false);
  const [armed, setArmed] = useState(false);

  const targetRef = useRef<View>(overviewFor(narrow));
  const [worldState] = useState<WorldState>(() => ({
    view: { ...overviewFor(narrow) },
    biasX: 0,
    biasY: 0,
    lookX: 0,
    lookY: 0,
  }));
  const invalidateRef = useRef<(() => void) | null>(null);
  const draggingRef = useRef(false);

  const active = useMemo(() => DISTRICTS.find((d) => d.id === activeId) ?? null, [activeId]);
  const visible = useMemo(
    () => DISTRICTS.slice(0, Math.max(5, quality.maxStructures)),
    [quality.maxStructures],
  );

  /* ---- travel ------------------------------------------------------------ */
  const travelTo = useCallback(
    (id: string | null) => {
      setActiveId(id);
      setArrived(false);
      const d = id ? DISTRICTS.find((x) => x.id === id) : null;
      targetRef.current = d ? viewForDistrict(d, narrow) : overviewFor(narrow);
      window.setTimeout(() => setArrived(true), reduced ? 120 : 1500);
    },
    [reduced, narrow],
  );

  /* A rotated phone, or a window dragged narrow, re-fits the station it is
     currently holding. The view loop eases to it like any other travel. */
  const activeIdRef = useLatest(activeId);
  useEffect(() => {
    const id = activeIdRef.current;
    const d = id ? DISTRICTS.find((x) => x.id === id) : null;
    targetRef.current = d ? viewForDistrict(d, narrow) : overviewFor(narrow);
  }, [narrow, activeIdRef]);

  /* ---- the view loop ----------------------------------------------------- */
  useEffect(() => {
    const stop = onFrame((dt) => {
      const v = worldState.view;
      const t = targetRef.current;
      // Directed movement: a single damped rate for every station, so travel
      // always feels like the same vehicle.
      const k = reduced ? 1 : damp(0.0018, dt);
      v.x = lerp(v.x, t.x, k);
      v.y = lerp(v.y, t.y, k);
      v.z = lerp(v.z, t.z, k);
      v.tilt = lerp(v.tilt, t.tilt, k);
      v.turn = lerp(v.turn, t.turn, k);

      // Released look eases home; held look is left exactly where the hand put it.
      if (!draggingRef.current && (worldState.lookX !== 0 || worldState.lookY !== 0)) {
        const rk = reduced ? 1 : damp(0.25, dt) * LOOK_RETURN;
        worldState.lookX = lerp(worldState.lookX, 0, rk);
        worldState.lookY = lerp(worldState.lookY, 0, rk);
      }

      if (quality.pointerBias > 0 && !coarse) {
        const pk = damp(0.02, dt);
        worldState.biasX = lerp(worldState.biasX, (pointer.nx * 2 - 1) * 7 * quality.pointerBias, pk);
        worldState.biasY = lerp(worldState.biasY, (pointer.ny * 2 - 1) * 4 * quality.pointerBias, pk);
      }

      invalidateRef.current?.();
    });
    scope.add(stop);
    return stop;
  }, [reduced, coarse, quality.pointerBias, scope, worldState]);

  /* ---- drag to look ------------------------------------------------------ */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Reduced motion opts out entirely: the territory holds still.
    if (reduced) return;

    let last = { x: 0, y: 0 };
    const scale = coarse ? 0.13 : 0.09;

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      draggingRef.current = true;
      last = { x: e.clientX, y: e.clientY };
      root.setPointerCapture?.(e.pointerId);
      setPointerIntent('drag');
    };
    const move = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      const limX = coarse ? LOOK_LIMIT_X * 0.6 : LOOK_LIMIT_X;
      const limY = coarse ? LOOK_LIMIT_Y * 0.6 : LOOK_LIMIT_Y;
      worldState.lookX = Math.max(-limX, Math.min(limX, worldState.lookX + dx * scale));
      worldState.lookY = Math.max(-limY, Math.min(limY, worldState.lookY - dy * scale));
      invalidateRef.current?.();
    };
    const up = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      root.releasePointerCapture?.(e.pointerId);
      setPointerIntent('default');
    };

    root.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      root.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      draggingRef.current = false;
    };
  }, [reduced, coarse, worldState]);

  /* ---- entry ------------------------------------------------------------- */
  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 180 : 900,
    );
    return () => window.clearTimeout(id);
  }, [onReady, reduced]);

  /* ---- keyboard: step through districts ---------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = activeId ? visible.findIndex((d) => d.id === activeId) : -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        travelTo(visible[Math.min(visible.length - 1, i + 1)].id);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (i <= 0) travelTo(null);
        else travelTo(visible[i - 1].id);
      } else if (e.key === 'Home') {
        e.preventDefault();
        travelTo(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, visible, travelTo]);

  const onInvalidator = useCallback((fn: () => void) => {
    invalidateRef.current = fn;
  }, []);
  const onGlFailure = useCallback((reason: string) => {
    console.warn('[lab] living world WebGL unavailable:', reason);
    setGlFailed(true);
  }, []);

  const showCanvas = quality.webgl && !glFailed;

  return (
    <div className="lw" ref={rootRef} data-armed={armed ? 'true' : 'false'}>
      {showCanvas ? (
        <div className="lw-canvas">
          <SpatialCanvas
            quality={quality}
            viewport={capability.viewport}
            onInvalidator={onInvalidator}
            onFailure={onGlFailure}
          >
            <WorldScene
              worldState={worldState}
              quality={quality}
              activeId={activeId}
              visible={visible}
              narrow={narrow}
              onLabelPositions={(m) => {
                labelPositions.current = m;
              }}
            />
          </SpatialCanvas>
          <WorldLabels
            visible={visible}
            activeId={activeId}
            narrow={narrow}
            positions={labelPositions}
            onSelect={travelTo}
          />
        </div>
      ) : (
        <p className="lw-fallback t-mono t-mono-xs" role="status">
          {`${spatialFallbackReason(WORLD_COPY.fallbackSubject, capability)} ${WORLD_COPY.fallbackRemains}`}
        </p>
      )}

      {/*
        The index lists EVERY district, not just the ones the current quality
        tier draws. Capability tiers may reduce what is rendered; they must not
        reduce what exists. On a lite device — or with no WebGL at all — this
        list *is* the territory, and a visitor there should still be told the
        whole of it.
      */}
      <WorldIndex
        districts={DISTRICTS}
        active={active}
        arrived={arrived}
        coarse={coarse}
        plan={narrow || !showCanvas}
        onSelect={travelTo}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* labels: DOM typography anchored to world points                             */
/* -------------------------------------------------------------------------- */
type LabelMap = Map<string, { x: number; y: number; z: number }>;
const labelPositions: { current: LabelMap } = { current: new Map() };

/**
 * On a wide screen these are full district names standing in the air above the
 * territory. On a phone they are the survey's own plate numbers and nothing
 * else — D1, D2, M1 — with the name appearing only on the district you are
 * travelling to.
 *
 * They used to be hidden outright on a phone, on the grounds that names at that
 * size sit on top of the thing they name. True of names; not true of a two
 * character index, and the difference matters: without them the plan was
 * unnamed geometry, and the visitor had to match shapes against a list to know
 * what they were looking at. A printed survey solves this the same way — numbers
 * on the plan, a key beneath it — and the key was already there, because the
 * index strip below reads "D1 STRATEGY · D2 DESIGN".
 */
function WorldLabels({
  visible,
  activeId,
  narrow,
  positions,
  onSelect,
}: {
  visible: District[];
  activeId: string | null;
  narrow: boolean;
  positions: { current: LabelMap };
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stop = onFrame(() => {
      const root = ref.current;
      if (!root) return;

      /*
       * Place nearest-first and drop any label that would land on one already
       * placed. Without this, districts that line up along the view axis print
       * their names on top of each other — "TECHNOLOGIMKAAN" — which is worse
       * than showing one name, and the index below lists every district anyway.
       */
      const placed: Array<{ l: number; t: number; r: number; b: number }> = [];
      const order = visible
        .map((d) => ({ d, p: positions.current.get(d.id) }))
        .filter((e) => e.p && e.p.z <= 1)
        .sort((a, b) => a.p!.z - b.p!.z);

      const hidden = new Set(visible.map((d) => d.id));

      for (const { d, p } of order) {
        const el = root.querySelector<HTMLElement>(`[data-lbl="${d.id}"]`);
        if (!el || !p) continue;
        const w = el.offsetWidth || 120;
        const h = el.offsetHeight || 30;
        const box = { l: p.x - 14, t: p.y - 10, r: p.x - 14 + w, b: p.y - 10 + h };
        const clash = placed.some(
          (q) => box.l < q.r + 6 && box.r > q.l - 6 && box.t < q.b + 4 && box.b > q.t - 4,
        );
        if (clash) continue;
        placed.push(box);
        hidden.delete(d.id);
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        el.style.opacity = '1';
      }

      for (const id of hidden) {
        const el = root.querySelector<HTMLElement>(`[data-lbl="${id}"]`);
        if (el) el.style.opacity = '0';
      }
    });
    return stop;
  }, [visible, positions]);

  return (
    <div className="lw-labels" ref={ref} data-narrow={narrow ? 'true' : 'false'}>
      {visible.map((d) => (
        <button
          key={d.id}
          type="button"
          className="lw-label"
          data-lbl={d.id}
          data-on={activeId === d.id ? 'true' : 'false'}
          data-status={d.status}
          onClick={() => onSelect(d.id)}
          onPointerEnter={() => setPointerIntent('enter')}
          onPointerLeave={() => setPointerIntent('default')}
        >
          <span className="lw-label__tick" aria-hidden="true" />
          <span className="lw-label__idx t-mono t-mono-xs">{d.index}</span>
          <span className="lw-label__name t-display t-display-s">{d.name}</span>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* the scene                                                                   */
/* -------------------------------------------------------------------------- */
function WorldScene({
  worldState,
  quality,
  activeId,
  visible,
  narrow,
  onLabelPositions,
}: {
  worldState: WorldState;
  quality: SpatialQuality;
  activeId: string | null;
  visible: District[];
  narrow: boolean;
  onLabelPositions: (m: LabelMap) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const projected = useRef<LabelMap>(new Map());
  const vec = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    onLabelPositions(projected.current);
  }, [onLabelPositions]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const v = worldState.view;
    g.position.set(v.x, v.y, v.z);
    g.rotation.x = ((v.tilt + worldState.biasY + worldState.lookY) * Math.PI) / 180;
    g.rotation.y = ((v.turn + worldState.biasX + worldState.lookX) * Math.PI) / 180;

    // Project each district's crown to screen space for its DOM label.
    for (const d of visible) {
      // Well clear of the crown, so the name sits in air rather than on plates.
      const top = groundAt(d.x, d.z, EXTENT, GROUND_HEIGHT) + districtTop(d) + 150;
      vec.set(d.x, top, d.z);
      g.localToWorld(vec);
      vec.project(camera);
      projected.current.set(d.id, {
        x: (vec.x * 0.5 + 0.5) * size.width,
        y: (-vec.y * 0.5 + 0.5) * size.height,
        z: vec.z,
      });
    }
  });

  return (
    <>
      {/*
        Distance haze. Without it every line in the territory is drawn at the
        same weight and the survey reads flat — the far markers as loud as the
        district you are standing in front of. Fog is the cheapest honest depth
        cue there is, and line materials respect it for free.
      */}
      {quality.atmosphere && <fog attach="fog" args={['#16191a', ...fogFor(narrow)]} />}
      <group ref={groupRef}>
        <Territory
          quality={quality}
          extent={EXTENT}
          groundHeight={GROUND_HEIGHT}
          activeId={activeId}
        />
      </group>
    </>
  );
}
