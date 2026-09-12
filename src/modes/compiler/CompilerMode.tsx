import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { useExperience } from '../../experience/context';
import { COMPILER_COPY } from '../../content/compiler';
import { spatialQuality, type SpatialQuality } from '../../spatial/quality';
import { SpatialCanvas } from '../../spatial/SpatialCanvas';
import { useSpatialCells, type SpatialCell } from '../../spatial/useSpatialCells';
import { clamp01, damp, lerp, PERSPECTIVE, type Viewport } from '../../spatial/projection';
import { CompilerDocument } from './CompilerDocument';
import { CANONICAL_PAGES, CANONICAL_PAGES_COMMIT } from '../../content/canonicalPages';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { toMarkdown } from '../../artifacts/artifact';
import { Scaffold } from './Scaffold';
import { Terrain } from './Terrain';
import { StageRail } from './StageRail';
import {
  applyCompileState,
  createCompileState,
  STAGES,
  stageIndexAt,
  type CompileState,
} from './stages';
import './compiler.css';

/**
 * REALITY COMPILER — TURN THE INTERFACE INTO A WORLD.
 *
 * The visitor starts on a real, readable, accessible document and watches it
 * reveal the spatial structure it always had. The load-bearing decisions:
 *
 *  1. **The DOM never leaves.** Content moves into depth as actual elements
 *     under CSS 3D, matched pixel-for-pixel to the WebGL camera (projection.ts).
 *     The title in the world is the `<h2>`, not a picture of it — which is what
 *     makes the lineage impossible to fake and keeps the text selectable.
 *  2. **One number drives both renderers.** Progress 0→1. There is no second
 *     source of truth to drift.
 *  3. **Nothing re-renders while compiling.** Progress lives in refs; cell
 *     transforms are written imperatively; the scene reads a stable mutable
 *     object. React only hears about *stage* changes — eight times, not 8,000.
 */

const WHEEL_GAIN = 0.00085;
const DRAG_GAIN = 0.0022;
const KEY_STEP = 0.055;

export default function CompilerMode({ onReady, onExit, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { enterMode } = useExperience();

  const quality = useMemo(() => spatialQuality(capability), [capability]);

  /*
   * WHICH REAL PAGE IS BEING COMPILED.
   *
   * The selector is the whole difference between "here is a transformation" and
   * "here is a transformation *of something you can go and look at*". Changing
   * it remounts the document, so the compilation re-measures against the new
   * page's own cells rather than against a stale plane table.
   */
  const [pageIndex, setPageIndex] = useState(0);
  const page = CANONICAL_PAGES[pageIndex] ?? CANONICAL_PAGES[0];
  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  const { cells, rootRect, remeasure } = useSpatialCells(docRef, true);

  /* ---- progress: refs, not state ---------------------------------------- */
  const targetRef = useRef(0);
  const currentRef = useRef(0);
  // A lazy state initialiser, not a ref: the object is created exactly once and
  // its identity never changes, so the scene never re-renders — and nothing
  // reads mutable ref state during render.
  const [stateObj] = useState(createCompileState);
  const invalidateRef = useRef<(() => void) | null>(null);

  // Only *stage* granularity reaches React.
  const [stageIndex, setStageIndex] = useState(0);
  const [glFailed, setGlFailed] = useState(false);
  const [armed, setArmed] = useState(false);

  const rootOffset = useMemo(() => ({ x: rootRect.x, y: rootRect.y }), [rootRect.x, rootRect.y]);
  const viewport = capability.viewport;

  const setProgress = useCallback(
    (v: number) => {
      targetRef.current = clamp01(v);
    },
    [],
  );

  const stepStage = useCallback((dir: 1 | -1) => {
    const i = stageIndexAt(targetRef.current);
    const next = Math.max(0, Math.min(STAGES.length - 1, i + dir));
    // Land just inside the stage so its span is actually entered.
    targetRef.current = clamp01(STAGES[next].from + 0.001);
  }, []);

  /* ---- the compile loop -------------------------------------------------- */
  useEffect(() => {
    const doc = docRef.current;
    const world = worldRef.current;
    if (!doc || !world) return;

    let lastApplied = -1;
    let lastStage = -1;
    let biasX = 0;
    let biasY = 0;

    const stop = onFrame((dt) => {
      // Reduced motion snaps between stages instead of gliding through them.
      const k = reduced ? 1 : damp(0.0009, dt);
      currentRef.current = lerp(currentRef.current, targetRef.current, k);
      const p = currentRef.current;
      applyCompileState(stateObj, p, quality);

      /*
       * Pointer only *biases* the view; it never owns it — and it is scaled by
       * how far the compilation has actually gone. At DOCUMENT the bias is
       * exactly zero, so returning to the start returns to a pristine page
       * rather than one left permanently a degree or two off-square.
       */
      if (quality.pointerBias > 0 && !coarse) {
        const gate = stateObj.separate * quality.pointerBias;
        const nx = pointer.nx * 2 - 1;
        const ny = pointer.ny * 2 - 1;
        const pk = damp(0.02, dt);
        biasX = lerp(biasX, nx * 3.2 * gate, pk);
        biasY = lerp(biasY, -ny * 2.0 * gate, pk);
      }

      const moved = Math.abs(p - lastApplied) > 0.00025;
      if (!moved && Math.abs(biasX) < 0.001 && Math.abs(biasY) < 0.001) return;
      lastApplied = p;

      // ---- the shared world transform, applied to BOTH renderers ----------
      world.style.transform =
        `translate3d(0,${stateObj.liftY.toFixed(1)}px,${stateObj.pushZ.toFixed(1)}px) ` +
        `rotateX(${(stateObj.tiltX + biasY).toFixed(2)}deg) ` +
        `rotateY(${biasX.toFixed(2)}deg)`;
      doc.style.setProperty('--measure', stateObj.measure.toFixed(3));
      doc.style.setProperty('--separate', stateObj.separate.toFixed(3));

      // ---- per-cell depth: the document's reading order becoming space ----
      for (const cell of cells) {
        const z = -cell.plane * stateObj.planeDepth;
        cell.el.style.transform = `translate3d(0,0,${z.toFixed(1)}px)`;
      }

      invalidateRef.current?.();

      const si = stageIndexAt(p);
      if (si !== lastStage) {
        lastStage = si;
        setStageIndex(si);
      }
    });

    scope.add(stop);
    return stop;
  }, [cells, quality, reduced, coarse, scope, stateObj]);

  /* ---- restore every cell we touched ------------------------------------- */
  useEffect(() => {
    const captured = cells;
    // Captured in the effect body: by cleanup time the ref may point elsewhere.
    const world = worldRef.current;
    return () => {
      for (const c of captured) c.el.style.removeProperty('transform');
      world?.style.removeProperty('transform');
    };
  }, [cells]);

  /* ---- input ------------------------------------------------------------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (reduced) {
        if (Math.abs(e.deltaY) > 24) stepStage(e.deltaY > 0 ? 1 : -1);
        return;
      }
      setProgress(targetRef.current + e.deltaY * WHEEL_GAIN);
    };

    let dragging = false;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      dragging = true;
      lastY = e.clientY;
      root.setPointerCapture?.(e.pointerId);
      setPointerIntent('drag');
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = lastY - e.clientY;
      lastY = e.clientY;
      if (reduced) return;
      setProgress(targetRef.current + dy * DRAG_GAIN);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      root.releasePointerCapture?.(e.pointerId);
      setPointerIntent('default');
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          if (reduced) stepStage(1);
          else setProgress(targetRef.current + KEY_STEP);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          if (reduced) stepStage(-1);
          else setProgress(targetRef.current - KEY_STEP);
          break;
        case 'PageDown':
          e.preventDefault();
          stepStage(1);
          break;
        case 'PageUp':
          e.preventDefault();
          stepStage(-1);
          break;
        case 'Home':
          e.preventDefault();
          setProgress(0);
          break;
        case 'End':
          e.preventDefault();
          setProgress(1);
          break;
      }
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);

    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [reduced, setProgress, stepStage]);

  /* ---- entry: let the document be a document first ----------------------- */
  useEffect(() => {
    setPointerIntent('default');
    const id = window.setTimeout(() => {
      setArmed(true);
      onReady();
    }, reduced ? 180 : 700);
    return () => window.clearTimeout(id);
  }, [onReady, reduced]);

  useEffect(() => {
    remeasure();
  }, [viewport.w, viewport.h, remeasure]);

  const onInvalidator = useCallback((fn: () => void) => {
    invalidateRef.current = fn;
  }, []);

  const onGlFailure = useCallback((reason: string) => {
    console.warn('[lab] compiler WebGL unavailable:', reason);
    setGlFailed(true);
  }, []);

  const showCanvas = quality.webgl && !glFailed && cells.length > 0;
  const atWorld = stageIndex >= STAGES.length - 1;

  return (
    <div
      className="rc"
      ref={rootRef}
      data-stage={STAGES[stageIndex].id}
      data-armed={armed ? 'true' : 'false'}
      style={{ perspective: `${PERSPECTIVE}px` }}
    >
      {/* The shared world transform lives here and is mirrored into the scene. */}
      <div className="rc-world" ref={worldRef}>
        <div className="rc-doc-wrap" ref={docRef}>
          <CompilerDocument
            key={page.route}
            page={page}
            reduced={reduced}
            scope={scope}
          />
        </div>
      </div>

      {showCanvas && (
        <div className="rc-canvas" aria-hidden="true">
          <SpatialCanvas
            quality={quality}
            viewport={viewport}
            onInvalidator={onInvalidator}
            onFailure={onGlFailure}
          >
            {/* The Three group mirrors the CSS world transform, so both spaces
                stay identical. CSS rotateX is y-down, Three is y-up: hence the
                sign flip on x. */}
            <CompilerScene
              cells={cells}
              rootOffset={rootOffset}
              viewport={viewport}
              state={stateObj}
              quality={quality}
            />
          </SpatialCanvas>
        </div>
      )}

      {glFailed && (
        <p className="rc-fallback t-mono t-mono-xs" role="status">
          {COMPILER_COPY.fallback}
        </p>
      )}

      {/*
        THE SOURCE SELECTOR.

        Hidden once the sheet has left the page: changing the subject halfway
        through a transformation would re-measure the planes underneath a world
        that is already standing, and the honest reading of "which page is this"
        belongs at the start of the compilation rather than in the middle of it.
      */}
      {stageIndex === 0 && (
        <nav className="rc-source" aria-label="Which page to compile">
          <p className="t-mono t-mono-xs t-dim rc-source__label">{COMPILER_COPY.sourceLabel}</p>
          <ul className="rc-source__list">
            {CANONICAL_PAGES.map((p, i) => (
              <li key={p.route}>
                <button
                  type="button"
                  className="t-mono t-mono-xs rc-source__btn"
                  data-on={i === pageIndex ? 'true' : 'false'}
                  onClick={() => setPageIndex(i)}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/*
        THE MANIFEST.

        The Compiler's retainable output is the account of what it just did:
        every plane, the file it was read from, the grid it spans, the ground it
        sits on and the colours in it. That is genuinely useful to somebody
        auditing the commercial page, and it is the one artifact in the Lab that
        is *about* the canonical site rather than about the visitor.
      */}
      {atWorld && (
        <div className="rc-manifest">
          <ArtifactBar
            formats={['copy', 'markdown', 'json']}
            label={COMPILER_COPY.manifestLabel}
            /*
             * The Compiler's first CONTINUE.
             *
             * It has always produced a real manifest and there has never been
             * anywhere to put it: a visitor took the Markdown and the tool's
             * relationship with the rest of the Lab ended there. The manifest
             * now goes to the operating environment, where SYSTEM.app holds it
             * beside whatever else this project has produced.
             */
            handoff={{
              kind: 'manifest',
              from: 'reality-compiler',
              to: 'anzy-os',
              limits:
                'A structural read of committed source. It describes what the page is built from, not how it renders, how fast it is, or what it looks like — nothing here was measured in a browser.',
            }}
            build={() => ({
              /* A title, not a file stem. The artifact layer slugs it on the way
                 out, so this can read like something a person named — and it has
                 to, because it is what the project ledger lists. For the home
                 route the old stem rendered as "hi-anzy-compile--". */
              name: `${page.name} — Transformation Manifest`,
              text: toMarkdown({
                title: `HI ANZY — TRANSFORMATION MANIFEST`,
                standfirst: `${page.name} (${page.route}), read from ${page.file} at ${CANONICAL_PAGES_COMMIT}. A structural read of the page's own source, not a screenshot and not a runtime measurement.`,
                sections: [
                  {
                    head: 'PAGE',
                    items: [
                      `Route — ${page.route}`,
                      `Title — ${page.title ?? 'UNKNOWN'}`,
                      `Source — ${page.file}`,
                      `Commit — ${CANONICAL_PAGES_COMMIT}`,
                      `Planes — ${page.sections.length}`,
                    ],
                  },
                  ...page.sections.map((s) => ({
                    head: `PLANE ${s.index} — ${s.label}`,
                    items: [
                      s.transition ? `Transition into — ${s.transition}` : '',
                      s.headings[0] ? `Heading — ${s.headings[0].text}` : '',
                      s.copy[0] ? `Copy — ${s.copy[0]}` : '',
                      s.columns ? `Grid — ${s.columns} columns` : '',
                      `Ground — ${s.ground}`,
                      s.roles.length ? `Type — ${s.roles.join(', ')}` : '',
                      s.colours.length ? `Colour — ${s.colours.join(' ')}` : '',
                      s.components.length ? `Components — ${s.components.join(', ')}` : '',
                      s.data.length ? `Canonical data — ${s.data.join(', ')}` : '',
                      `Source — ${s.source}${s.read ? '' : ' (NOT READ)'}`,
                    ].filter(Boolean),
                  })),
                ],
                footer: {
                  'CANONICAL SOURCE': CANONICAL_PAGES_COMMIT,
                  METHOD: 'Structural read of committed source. No runtime measurement, no screenshot.',
                  STORAGE: 'NONE — nothing was written to this device',
                },
              }),
              data: {
                route: page.route,
                title: page.title,
                description: page.description,
                file: page.file,
                commit: CANONICAL_PAGES_COMMIT,
                method: 'structural-read',
                planes: page.sections,
              },
            })}
          />
        </div>
      )}

      <StageRail
        stageIndex={stageIndex}
        coarse={coarse}
        atWorld={atWorld}
        onStage={(i) => setProgress(STAGES[i].from + 0.001)}
        onReturn={() => setProgress(0)}
        onEnterWorld={() => enterMode('living-world')}
        onExit={onExit}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* the scene, mirroring the CSS world transform                                */
/* -------------------------------------------------------------------------- */
function CompilerScene({
  cells,
  rootOffset,
  viewport,
  state,
  quality,
}: {
  cells: SpatialCell[];
  rootOffset: { x: number; y: number };
  viewport: Viewport;
  state: CompileState;
  quality: SpatialQuality;
}) {
  const worldRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = worldRef.current;
    if (!g) return;
    g.position.z = state.pushZ;
    // CSS is y-down, Three is y-up: both the lift and the rotation flip sign.
    g.position.y = -state.liftY;
    g.rotation.x = -(state.tiltX * Math.PI) / 180;
  });

  return (
    <group ref={worldRef}>
      {quality.scaffold && (
        <Scaffold
          cells={cells}
          rootOffset={rootOffset}
          viewport={viewport}
          state={state}
          showCorridor
        />
      )}
      <Terrain viewport={viewport} state={state} segments={quality.terrainSegments} />
    </group>
  );
}
