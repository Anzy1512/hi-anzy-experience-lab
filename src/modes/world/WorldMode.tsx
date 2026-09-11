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
import { STANDS, standAnchor, standScale, standOpacity } from './imagery';
import {
  advance,
  clampPitch,
  dolly,
  initialStance,
  nearestDistrict,
  stanceFacing,
  viewForStance,
  type ExploreState,
} from './explore';
import { SpecimenPlate } from '../../components/Specimen/SpecimenPlate';
import type { CleanupScope } from '../../core/cleanup';
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

  /* ---- explore -----------------------------------------------------------
   *
   * A second way of being in the territory, not a second territory. `nav` only
   * decides which policy produces `targetRef`; everything after that — the
   * damped loop, the fog, the projection — is the same code that serves guided
   * travel, which is why adding this reopened none of it.
   *
   * Offered on a fine pointer, on a frame wide enough to hold the world at
   * close range, with enough capability to draw it. A phone keeps guided
   * travel and the key plan: walking a territory through a 390px portrait
   * window with no keyboard is a worse reading of it than the map, and
   * pretending otherwise would be a feature that exists for the feature list.
   *
   *  is in the gate as well as  because the two are not the
   * same test and only one of them was enough. A desktop window dragged to
   * phone width has a fine pointer and a keyboard, so  let it through —
   * and below 900px the instruction line is hidden, so what arrived was a
   * control offering a mode with no way to learn it. Measured at 390, not
   * assumed: the control was there.
   */
  const canExplore = !coarse && !reduced && !narrow && quality.scaffold;
  const [nav, setNav] = useState<'guided' | 'explore'>('guided');
  const exploreRef = useRef<ExploreState>(initialStance());
  const keysRef = useRef<Set<string>>(new Set());
  const navRef = useLatest(nav);

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

      /*
       * In Explore the target is solved from where the visitor is standing,
       * every frame, rather than read from a station. Held keys are integrated
       * here rather than in the key handler so movement is frame-rate
       * independent and so a key held across a dropped frame does not teleport.
       */
      const exploring = navRef.current === 'explore';
      if (exploring) {
        /* Held here rather than cleared on entry: the drag offsets belong to
           guided travel, and zeroing them once would let a stray pointer bias
           accumulate a lean the visitor never asked for and cannot see the
           cause of. In Explore the stance is the only thing that aims. */
        worldState.lookX = 0;
        worldState.lookY = 0;
        const s = exploreRef.current;
        const keys = keysRef.current;
        const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
        const str = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        advance(s, fwd, str, dt, keys.has('shift'));
        targetRef.current = viewForStance(s, EXTENT, GROUND_HEIGHT);
      }

      const t = targetRef.current;
      /*
       * Directed movement: a single damped rate for every station, so travel
       * always feels like the same vehicle. Explore is the exception and has to
       * be — at a walking pace the station rate reads as the world sliding
       * after you rather than you moving through it.
       */
      const k = reduced ? 1 : damp(exploring ? 0.00002 : 0.0018, dt);
      v.x = lerp(v.x, t.x, k);
      v.y = lerp(v.y, t.y, k);
      v.z = lerp(v.z, t.z, k);
      v.tilt = lerp(v.tilt, t.tilt, k);
      v.turn = lerp(v.turn, t.turn, k);

      /* Released look eases home; held look is left exactly where the hand put
         it. Explore has no look offset at all — the drag writes yaw and pitch
         into the stance instead, because in Explore where you are looking *is*
         where you are facing, and a decaying offset would quietly turn the
         visitor back around. */
      if (!exploring && !draggingRef.current && (worldState.lookX !== 0 || worldState.lookY !== 0)) {
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
  }, [reduced, coarse, quality.pointerBias, scope, worldState, navRef]);

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
      /* In Explore the drag turns the visitor, not the sheet: it writes the
         stance's own yaw and pitch, which the loop then solves a station from.
         Yaw wraps freely because turning all the way round in a place you are
         standing in is not a violation of anything; pitch is clamped in
         `explore.ts`, which is also the only place that knows the limits. */
      if (navRef.current === 'explore') {
        const s = exploreRef.current;
        s.yaw += dx * scale * 1.9;
        s.pitch = clampPitch(s.pitch - dy * scale * 1.1);
        invalidateRef.current?.();
        return;
      }
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
  }, [reduced, coarse, worldState, navRef]);

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

  /* ---- explore: enter, leave, and the keys that drive it ------------------ */
  const enterExplore = useCallback(
    (fromId: string | null) => {
      const s = (fromId && stanceFacing(fromId)) || initialStance();
      exploreRef.current = s;
      keysRef.current.clear();
      setNav('explore');
      setArrived(true);
      setPointerIntent('drag');
    },
    [],
  );

  const leaveExplore = useCallback(() => {
    /* Leaving keeps the place: the guided station it returns to is the district
       the visitor was standing nearest, so stepping out of Explore does not
       also undo where walking took them. */
    const near = nearestDistrict(exploreRef.current);
    keysRef.current.clear();
    setNav('guided');
    setPointerIntent('default');
    travelTo(near);
  }, [travelTo]);

  useEffect(() => {
    if (nav !== 'explore') return;
    const keys = keysRef.current;

    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        /*
         * Capture phase, and the propagation stops here. `useEscape` in the
         * mode host is on window in the bubble phase, so without this the one
         * key press would leave Explore *and* the whole reality — a visitor
         * who wanted to stop walking would find themselves back on the index.
         * Escape now means "one step back": Explore first, the reality second.
         */
        e.preventDefault();
        e.stopPropagation();
        leaveExplore();
        return;
      }
      if (k === 'r') {
        // Orientation reset: level the horizon without moving the visitor.
        e.preventDefault();
        exploreRef.current.pitch = 4;
        return;
      }
      if ('wasd'.includes(k) || k.startsWith('arrow') || k === 'shift') {
        e.preventDefault();
        keys.add(k);
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => keys.clear();

    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      keys.clear();
    };
  }, [nav, leaveExplore]);

  /* The wheel walks, rather than zooming: there is no zoom in a place you are
     standing in, and a scroll that changed field of view would be the one
     control that broke the projection contract. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || nav !== 'explore') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dolly(exploreRef.current, -e.deltaY * 1.15);
      invalidateRef.current?.();
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [nav]);

  /* ---- keyboard: step through districts ---------------------------------- */
  useEffect(() => {
    if (nav === 'explore') return;
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
  }, [activeId, visible, travelTo, nav]);

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
              onStandPositions={(m) => {
                standPositions.current = m;
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
          {quality.scaffold && (
            <WorldSpecimens visible={visible} reduced={reduced} scope={scope} positions={standPositions} />
          )}
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
      {/*
        The two ways of being here, offered as one control rather than a mode
        switch with its own panel. It is not shown where it would be a lie: a
        coarse pointer has no keys to walk with, reduced motion has asked for
        the territory to hold still, and the lite tier is not carrying the
        world at close range. Those visitors keep guided travel and the key
        plan, which is a complete reading of the place and not a consolation.
      */}
      <WorldIndex
        districts={DISTRICTS}
        active={active}
        arrived={arrived}
        coarse={coarse}
        plan={narrow || !showCanvas}
        /* In Explore the index becomes a way of walking to a district rather
           than cutting to it: same list, same control, different vehicle. */
        onSelect={nav === 'explore' ? (id) => { const s = id && stanceFacing(id); if (s) { exploreRef.current = s; setActiveId(id); } } : travelTo}
        aside={
          showCanvas && canExplore ? (
            <div className="lw-nav">
              <button
                type="button"
                className="lw-nav__btn t-mono t-mono-xs"
                onClick={nav === 'guided' ? () => enterExplore(activeId) : leaveExplore}
                onPointerEnter={() => setPointerIntent('enter')}
                onPointerLeave={() => setPointerIntent('default')}
              >
                {nav === 'guided' ? WORLD_COPY.exploreEnter : WORLD_COPY.exploreLeave}
              </button>
              {nav === 'explore' && (
                <p className="lw-nav__keys t-mono t-mono-xs" role="status">
                  {WORLD_COPY.exploreKeys}
                </p>
              )}
            </div>
          ) : null
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* labels: DOM typography anchored to world points                             */
/* -------------------------------------------------------------------------- */
type LabelMap = Map<string, { x: number; y: number; z: number }>;
const labelPositions: { current: LabelMap } = { current: new Map() };

/** Screen position, projected depth and distance-derived scale/opacity for
    each district that has a stand — see `imagery.ts`. */
type StandMap = Map<string, { x: number; y: number; z: number; scale: number; opacity: number }>;
const standPositions: { current: StandMap } = { current: new Map() };

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
/* stands: the company's own collages, projected to screen space               */
/* -------------------------------------------------------------------------- */
/**
 * Every stand is a real `SpecimenPlate` — a real `<img>` with real alt text —
 * positioned the same way `WorldLabels` positions district names: the scene's
 * own `useFrame` projects a world point to screen space every frame, and this
 * component writes the result straight to the DOM, bypassing React state so a
 * moving camera never triggers a render. `tilt={{ rx: 0, ry: 0 }}` is supplied
 * fixed rather than omitted, so the plate does not also subscribe to pointer
 * parallax on top of the world's own camera motion — one signal, not two
 * fighting each other, and one fewer `onFrame` subscriber per stand.
 *
 * Distance drives both `scale` and `opacity`, written together in one
 * `transform`/`style` pair per frame; see `imagery.ts` for the curve and why
 * it never lets a stand grow past native size.
 */
function WorldSpecimens({
  visible,
  reduced,
  scope,
  positions,
}: {
  visible: District[];
  reduced: boolean;
  scope: CleanupScope;
  positions: { current: StandMap };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stands = useMemo(() => visible.filter((d) => STANDS[d.id]), [visible]);

  useEffect(() => {
    const stop = onFrame(() => {
      const root = ref.current;
      if (!root) return;
      for (const d of stands) {
        const el = root.querySelector<HTMLElement>(`[data-stand="${d.id}"]`);
        const p = positions.current.get(d.id);
        if (!el || !p) continue;
        // Behind the camera: park it rather than let it flash across the frame.
        if (p.z > 1) {
          el.style.opacity = '0';
          continue;
        }
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${p.scale.toFixed(3)})`;
        el.style.opacity = p.opacity.toFixed(2);
      }
    });
    return stop;
  }, [stands, positions]);

  if (stands.length === 0) return null;

  return (
    <div className="lw-stands" ref={ref}>
      {stands.map((d) => {
        const stand = STANDS[d.id];
        return (
          <div className="lw-stand" key={d.id} data-stand={d.id}>
            <div className="lw-stand__body">
              <SpecimenPlate
                id={stand.specimen}
                reduced={reduced}
                scope={scope}
                tilt={{ rx: 0, ry: 0 }}
                separation={0.7}
              />
              <p className="t-mono t-mono-xs lw-stand__line">{stand.line}</p>
            </div>
          </div>
        );
      })}
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
  onStandPositions,
}: {
  worldState: WorldState;
  quality: SpatialQuality;
  activeId: string | null;
  visible: District[];
  narrow: boolean;
  onLabelPositions: (m: LabelMap) => void;
  onStandPositions: (m: StandMap) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const projected = useRef<LabelMap>(new Map());
  const projectedStands = useRef<StandMap>(new Map());
  const vec = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    onLabelPositions(projected.current);
    onStandPositions(projectedStands.current);
  }, [onLabelPositions, onStandPositions]);

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

    // Project each district's stand, where one exists — see `imagery.ts`.
    for (const d of visible) {
      const stand = STANDS[d.id];
      if (!stand) continue;
      const anchor = standAnchor(d, stand, EXTENT, GROUND_HEIGHT);
      vec.set(anchor.x, anchor.y, anchor.z);
      g.localToWorld(vec);
      // Captured before `.project()` below, which overwrites `vec` in place
      // with clip-space coordinates — there is no distance left to read after.
      const dist = camera.position.distanceTo(vec);
      vec.project(camera);
      const raw = standScale(dist);
      /*
       * A ceiling for every stand that is not the travel target.
       *
       * "The camera never moves; the world does" turns travel into a rotation
       * of the whole group, not a pure translation — and a rotation can swing
       * a district that is nowhere near where the visitor is standing to a
       * world position that happens to sit close to the camera. Measured: with
       * distance alone, arriving at IMKAAN put DESIGN, PRODUCTION, GROWTH and
       * CULTURE — none of them anywhere near IMKAAN — at full native scale,
       * because the rotation that framed IMKAAN happened to carry their local
       * points near the lens. Distance is honest about foreshortening but
       * blind to *why* something is close, and "the view rotated past it" is
       * not the same claim as "you travelled here." Only the stand you have
       * actually arrived at is allowed to read at full richness; every other
       * one is capped low regardless of what the raw geometry says, so a
       * coincidence of rotation can dim a stand but never falsely spotlight it.
       */
      const scale = d.id === activeId ? raw : Math.min(raw, 0.22);
      projectedStands.current.set(d.id, {
        x: (vec.x * 0.5 + 0.5) * size.width,
        y: (-vec.y * 0.5 + 0.5) * size.height,
        z: vec.z,
        scale,
        opacity: standOpacity(scale),
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
