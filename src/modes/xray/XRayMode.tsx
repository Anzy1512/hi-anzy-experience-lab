import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanonicalSubject } from './CanonicalSubject';
import { CANONICAL_PAGES, CANONICAL_PAGES_COMMIT } from '../../content/canonicalPages';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { toMarkdown } from '../../artifacts/artifact';
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { overlayBudget } from '../../core/capability';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { useStoreValue } from '../../core/store';
import { XRAY_COPY } from '../../content/brand';
import { Specimen } from './Specimen';
import { Layers, Inspector } from './Layers';
import { ControlStrip } from './ControlStrip';
import { Readout } from './Readout';
import { hitTest, useMeasure, type MeasuredObject } from './useMeasure';
import { LAYER_KEYS, LAYER_HOTKEY, type LayerKey } from './notation';
import {
  applyPreset,
  PRESET_ALL,
  PRESET_DEFAULT,
  PRESET_MINIMAL,
  PRESET_OFF,
  resetXRay,
  setStep,
  toggleLayer,
  xrayStore,
} from './xrayStore';
import type { PlateProcess } from '../../graphics/ContourPlate';
import './xray.css';

/**
 * X-RAY — SEE BENEATH THE INTERFACE.
 *
 * Not a DevTools pastiche. The idea is that the sheet can be turned to its own
 * construction: the grid it was composed on, the boxes it resolved to, the type
 * metrics the browser actually chose, the space between things, and the depth
 * of the stack. Every number on screen was measured off a live node.
 *
 * Entry is progressive on purpose. Switching nine overlays on at once produces
 * noise; revealing them in the order a sheet is actually built — structure,
 * then boundaries, then type, then measurement — produces an argument.
 */

const DepthField = lazy(() => import('./DepthField'));

/**
 * Entry choreography, ms from mount. Index = the step it reveals:
 *   0 SURFACE  the specimen arrives as paper
 *   1 DRAIN    the stock loses its colour
 *   2 GRID     3 BOX      4 STRUCTURE
 *   5 TYPE     6 SPACE    7 MOTION
 *   8 ARMED    the scanner takes the pointer; the mode reports ready
 */
const SEQUENCE = [0, 520, 800, 1050, 1280, 1500, 1700, 1880, 2080];

export default function XRayMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();

  const rootRef = useRef<HTMLDivElement>(null);
  const [plateProcess, setPlateProcess] = useState<PlateProcess>('normal');
  /*
   * The acquired object is stored as its ELEMENT, and the measured record is
   * derived during render. Storing the record itself meant every re-measure
   * left a stale copy that had to be corrected by a setState inside an effect —
   * a cascading render on a path that runs while the pointer moves.
   */
  const [scannedEl, setScannedEl] = useState<HTMLElement | null>(null);

  /*
   * WHAT IS UNDER THE LENS.
   *
   * `-1` is the Lab's own specimen sheet, which stays: it is the only subject
   * whose every property was chosen to be worth measuring, and it is the right
   * first thing a visitor sees. The rest are real commercial pages. Changing
   * subject re-measures, because the object table is derived from whatever DOM
   * is actually mounted.
   */
  const [subject, setSubject] = useState(-1);
  const canonPage = subject >= 0 ? CANONICAL_PAGES[subject] : null;

  /* Swapping subject drops the acquired object with it: the record on the
     faceplate describes an element that is about to leave the document, and a
     readout of a node that no longer exists is the one number this instrument
     must never print. */
  const chooseSubject = useCallback((i: number) => {
    setSubject(i);
    setScannedEl(null);
  }, []);

  const step = useStoreValue(xrayStore, (s) => s.step);
  const held = useStoreValue(xrayStore, (s) => s.held);
  const layers = useStoreValue(xrayStore, (s) => s.layers);
  const selfAware = useStoreValue(xrayStore, (s) => s.selfAware);

  const active = step >= SEQUENCE.length - 1;
  const { objects, remeasure } = useMeasure(rootRef, true, subject);
  const scanned: MeasuredObject | null = useMemo(
    () => (scannedEl ? (objects.find((o) => o.el === scannedEl) ?? null) : null),
    [scannedEl, objects],
  );
  const budget = overlayBudget(capability.profile);

  const trim = useMemo(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--trim');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 32;
  }, []);

  /* ---- progressive entry -------------------------------------------------- */
  useEffect(() => {
    resetXRay();

    if (reduced) {
      // The concept survives: every layer arrives, just without the staging.
      setStep(SEQUENCE.length - 1);
      const id = window.setTimeout(onReady, 160);
      return () => window.clearTimeout(id);
    }

    const timers = SEQUENCE.map((ms, i) =>
      window.setTimeout(() => {
        setStep(i);
        if (i === SEQUENCE.length - 1) onReady();
      }, ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reduced, onReady]);

  /* Leaving X-Ray must not leave the store dirty for the next entry. */
  useEffect(() => {
    scope.add(() => {
      resetXRay();
      setPointerIntent('default');
    });
    return () => {
      resetXRay();
      setPointerIntent('default');
    };
  }, [scope]);

  /* ---- the pointer becomes the instrument -------------------------------- */
  useEffect(() => {
    if (coarse || !active) return;
    setPointerIntent('scan');
  }, [coarse, active]);

  /* ---- scanning ----------------------------------------------------------- */
  // Hit-testing is polled once per frame from the shared loop rather than run on
  // every pointermove, and only commits to state when the acquired object
  // actually changes — so a fast sweep across the sheet is a handful of renders,
  // not hundreds.
  useEffect(() => {
    if (coarse || !active || held) return;
    let lastEl: HTMLElement | null = null;
    return onFrame(() => {
      const hit = hitTest(objects, pointer.x, pointer.y);
      const el = hit?.el ?? null;
      if (el !== lastEl) {
        lastEl = el;
        setScannedEl(el);
      }
    });
  }, [coarse, active, held, objects]);

  useEffect(() => {
    remeasure();
  }, [selfAware, remeasure]);

  const onSurfacePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      if (coarse) {
        // Touch: tap to acquire, tap the same object again to release.
        const hit = hitTest(objects, e.clientX, e.clientY);
        if (!hit) {
          setScannedEl(null);
          xrayStore.set({ held: false });
          return;
        }
        const sameAgain = scannedEl === hit.el && held;
        setScannedEl(sameAgain ? null : hit.el);
        xrayStore.set({ held: !sameAgain });
        return;
      }
      xrayStore.set({ held: !held });
    },
    [active, coarse, objects, scannedEl, held],
  );

  /* ---- keyboard ----------------------------------------------------------- */
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();

      const layerKey = LAYER_KEYS.find((k: LayerKey) => LAYER_HOTKEY[k] === e.key);
      if (layerKey) {
        e.preventDefault();
        toggleLayer(layerKey);
        return;
      }
      if (key === 'a') applyPreset(PRESET_ALL);
      else if (key === 's') applyPreset(PRESET_DEFAULT);
      else if (key === 'm') applyPreset(PRESET_MINIMAL);
      else if (key === 'o') applyPreset(PRESET_OFF);
      else if (key === 'h') xrayStore.set({ held: !xrayStore.get().held });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const showDepth = layers.depth && active && capability.webgl && capability.profile !== 'lite';

  return (
    <div className="xr" ref={rootRef} data-step={step} data-active={active ? 'true' : 'false'}>
      {/* ---- the subject ---------------------------------------------------- */}
      <div
        className="xr-surface"
        onPointerDown={onSurfacePointerDown}
        data-drained={step >= 1 ? 'true' : 'false'}
      >
        {canonPage ? (
          <CanonicalSubject page={canonPage} />
        ) : (
          <Specimen plateProcess={plateProcess} />
        )}
      </div>

      {/* ---- depth : the only WebGL in Phase 1 ----------------------------- */}
      {showDepth && (
        <Suspense fallback={null}>
          <div className="xr-depth-wrap">
            <DepthField
              objects={objects}
              viewport={capability.viewport}
              scannedId={scanned?.id ?? null}
              dpr={capability.dpr}
              reduced={reduced}
            />
          </div>
        </Suspense>
      )}

      {/* ---- diagnostics ---------------------------------------------------- */}
      <div className="xr-overlay">
        <Layers
          objects={objects}
          layers={layers}
          step={step}
          scanned={scanned}
          budget={budget}
          trim={trim}
          viewport={capability.viewport}
        />
      </div>

      {/*
       * THE INSTRUMENT BAND.
       *
       * Title, live readout and the acquired object's record, in one band along
       * the foot of the sheet. These began as three floating panels and they
       * collided with each other and covered the specimen — which is the one
       * thing an inspection tool must never do. Docked, they read as the
       * instrument's own faceplate and the sheet above stays clear.
       */}
      <div className="xr-band">
        <header className="xr-band__title">
          <h2 className="t-display t-display-m xr-title__text">{XRAY_COPY.title}</h2>
          <p className="t-mono t-mono-xs t-dim xr-title__tag">{XRAY_COPY.tagline}</p>
        </header>

        <Readout
          capability={capability}
          objectCount={objects.length}
          showRender={layers.render && active}
          showPointer={layers.pointer && active && !coarse}
        />

        <div className="xr-band__inspector">
          {scanned && step >= 3 ? (
            <Inspector object={scanned} held={held} />
          ) : (
            <p className="xr-hint t-mono t-mono-xs t-faint">
              {coarse ? XRAY_COPY.hintTouch : XRAY_COPY.hintPointer}
            </p>
          )}
        </div>
      </div>

      {/*
        THE SUBJECT SELECTOR.

        Only once the instrument is actually running. Before that the mode is
        still assembling its own overlays, and offering a choice of subject
        while the lens is warming up would invite a re-measure mid-sequence.
      */}
      {active && (
        <nav className="xr-subject" aria-label="What to inspect">
          <p className="t-mono t-mono-xs t-dim xr-subject__label">{XRAY_COPY.subjectLabel}</p>
          <ul className="xr-subject__list">
            <li>
              <button
                type="button"
                className="t-mono t-mono-xs xr-subject__btn"
                data-on={subject === -1 ? 'true' : 'false'}
                onClick={() => chooseSubject(-1)}
              >
                THE SHEET
              </button>
            </li>
            {CANONICAL_PAGES.map((p, i) => (
              <li key={p.route}>
                <button
                  type="button"
                  className="t-mono t-mono-xs xr-subject__btn"
                  data-on={subject === i ? 'true' : 'false'}
                  onClick={() => chooseSubject(i)}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>

          {/*
            THE REPORT.

            Two kinds of line, never mixed: SOURCED is quoted from the
            commercial repository, MEASURED came off a live node in this window
            a moment ago. Both are true; only one of them is true about the
            live site, and a report that blurred them would be worse than no
            report at all.
          */}
          <ArtifactBar
            formats={['copy', 'markdown', 'json']}
            label={XRAY_COPY.reportLabel}
            build={() => {
              const subjectName = canonPage ? `${canonPage.name} (${canonPage.route})` : 'THE SHEET';
              const measured = objects.map(
                (o) =>
                  `**MEASURED** — ${o.name} · ${o.kind} · ${Math.round(o.w)}×${Math.round(o.h)} at ${Math.round(o.x)},${Math.round(o.y)} · depth ${o.depth}` +
                  (o.type
                    ? ` · ${o.type.set} ${o.type.family} ${o.type.size}px/${o.type.lineHeight} ${o.type.weight} ${o.type.tracking}`
                    : ''),
              );
              return {
                name: `hi-anzy-specimen-report-${canonPage ? canonPage.route.replace(/\W+/g, '-') || 'home' : 'sheet'}`,
                text: toMarkdown({
                  title: 'HI ANZY — SYSTEM SPECIMEN REPORT',
                  standfirst: `Subject: ${subjectName}. MEASURED lines were read off live nodes in this browser window and describe this layout at this viewport — they are not measurements of the live site. SOURCED lines are quoted from the commercial repository at ${CANONICAL_PAGES_COMMIT}.`,
                  sections: [
                    {
                      head: 'SUBJECT',
                      items: [
                        `Subject — ${subjectName}`,
                        canonPage ? `**SOURCED** — file ${canonPage.file}` : '**SOURCED** — the Lab’s own specimen sheet (no canonical file)',
                        canonPage ? `**SOURCED** — title ${canonPage.title ?? 'UNKNOWN'}` : '',
                        `**MEASURED** — viewport ${capability.viewport.w}×${capability.viewport.h} at dpr ${capability.dpr.toFixed(2)}`,
                        `**MEASURED** — ${objects.length} objects in the measured tree`,
                      ].filter(Boolean),
                    },
                    ...(canonPage
                      ? [
                          {
                            head: 'SOURCED STRUCTURE',
                            body: 'Facts about the real page, quoted from its own source.',
                            items: canonPage.sections.map(
                              (s) =>
                                `**SOURCED** — ${s.index} ${s.label}` +
                                (s.columns ? ` · ${s.columns}-col` : '') +
                                ` · ${s.ground}` +
                                (s.roles.length ? ` · ${s.roles.join(', ')}` : '') +
                                (s.colours.length ? ` · ${s.colours.join(' ')}` : '') +
                                ` · ${s.source}`,
                            ),
                          },
                        ]
                      : []),
                    {
                      head: 'MEASURED OBJECTS',
                      body: 'Read from this DOM, in this window, just now.',
                      items: measured,
                    },
                  ],
                  footer: {
                    'CANONICAL SOURCE': CANONICAL_PAGES_COMMIT,
                    METHOD: 'SOURCED = quoted from committed source. MEASURED = live DOM in this window.',
                    STORAGE: 'NONE — nothing was written to this device',
                  },
                }),
                data: {
                  subject: subjectName,
                  canonicalSource: CANONICAL_PAGES_COMMIT,
                  sourcedFile: canonPage?.file ?? null,
                  viewport: capability.viewport,
                  dpr: capability.dpr,
                  sourced: canonPage?.sections ?? null,
                  measured: objects.map((o) => ({
                    name: o.name,
                    kind: o.kind,
                    x: Math.round(o.x),
                    y: Math.round(o.y),
                    w: Math.round(o.w),
                    h: Math.round(o.h),
                    depth: o.depth,
                    type: o.type ?? null,
                  })),
                },
              };
            }}
          />
        </nav>
      )}

      <ControlStrip
        plateProcess={plateProcess}
        onPlateProcess={setPlateProcess}
        disabled={!active}
      />
    </div>
  );
}
