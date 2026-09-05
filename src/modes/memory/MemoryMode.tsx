import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { spatialFallbackReason } from '../../content/brand';
import { onFrame } from '../../core/raf';
import { setPointerIntent } from '../../core/pointer';
import { spatialQuality } from '../../spatial/quality';
import { SpatialCanvas } from '../../spatial/SpatialCanvas';
import { clamp01, damp, lerp } from '../../spatial/projection';
import { MEMORY_COPY, RECORDS, phaseFor } from '../../content/memory';
import { MemoryField } from './MemoryField';
import './memory.css';

/**
 * MEMORY — WALK THROUGH RECONSTRUCTED IDEAS.
 *
 * Living World is structure as territory. Memory is **information as residue**:
 * the archive is not drawn, it is *reassembled from its own remains* as you get
 * close to it, and it comes apart again when you leave.
 *
 * Three things keep this from being a floating photo gallery:
 *
 *  1. There are no images and no cards. Every point is a sample of the record's
 *     own typography, taken off a canvas raster — the cloud's silhouette is the
 *     word itself.
 *  2. Damage is structural. A record with low integrity keeps fewer of its own
 *     pixels and scatters them further, so it reads as damaged from a distance,
 *     before a single letter is legible.
 *  3. Missing fields stay missing. A record that has lost its names says so and
 *     does not reconstruct them.
 *
 * Navigation is a corridor, not free flight: one axis, damped, snapping to the
 * record you are nearest.
 */

const COUNTS: Record<string, number> = {
  ultra: 120000,
  high: 70000,
  balanced: 30000,
  lite: 0,
};

const SPACING = 620;

/**
 * The archive is sized to the viewport, not to a constant.
 *
 * A fixed world scale is a desktop assumption: at 390px the same 980 units ran
 * off both edges and cropped the record's own typography, which is the one
 * thing this mode cannot afford to crop. The camera sits at PERSPECTIVE, so a
 * world unit is a pixel at z = 0 — the width is simply a fraction of the
 * viewport.
 */
function archiveScale(viewportW: number): number {
  return Math.max(240, Math.min(1040, viewportW * 0.72));
}
const LAST = RECORDS.length - 1;

export default function MemoryMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const quality = useMemo(() => spatialQuality(capability), [capability]);
  const count = COUNTS[quality.profile] ?? 0;
  const scale = useMemo(() => archiveScale(capability.viewport.w), [capability.viewport.w]);

  const [armed, setArmed] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [holding, setHolding] = useState(false);

  // Depth is a ref, never state: it changes every frame.
  const focusRef = useRef(0);
  const wantRef = useRef(0);
  const holdRef = useRef(0);
  const invalidateRef = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const live = quality.webgl && count > 0 && !glFailed;

  const goTo = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(LAST, i));
    wantRef.current = -clamped * SPACING;
  }, []);

  /* ---- the corridor ------------------------------------------------------- */
  useEffect(() => {
    const stopFrame = onFrame((dt) => {
      const k = damp(reduced ? 0.001 : 0.06, dt);
      focusRef.current = lerp(focusRef.current, wantRef.current, k);
      holdRef.current = lerp(holdRef.current, holding ? 1 : 0, damp(0.05, dt));

      // Which record the visitor is nearest, and how well it has resolved.
      const at = -focusRef.current / SPACING;
      const near = Math.max(0, Math.min(LAST, Math.round(at)));
      const conf = clamp01(1 - Math.abs(at - near) / 1.15);
      setActive((prev) => (prev === near ? prev : near));
      const rounded = Math.round((conf + holdRef.current * 0.34) * 20) / 20;
      setConfidence((prev) => (Math.abs(prev - rounded) > 0.049 ? Math.min(1, rounded) : prev));

      invalidateRef.current?.();
    });
    scope.add(stopFrame);
    return stopFrame;
  }, [reduced, holding, scope]);

  /* ---- entry -------------------------------------------------------------- */
  useEffect(() => {
    setPointerIntent('scan');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 160 : 620,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- controlled navigation: one axis, no free flight -------------------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      wantRef.current = Math.max(-LAST * SPACING, Math.min(0, wantRef.current - e.deltaY * 1.5));
    };
    root.addEventListener('wheel', wheel, { passive: false });

    let dragging = false;
    let lastY = 0;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragging = true;
      lastY = e.clientY;
      root.setPointerCapture(e.pointerId);
      setHolding(true);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - lastY;
      lastY = e.clientY;
      wantRef.current = Math.max(-LAST * SPACING, Math.min(0, wantRef.current + dy * 4.2));
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      root.releasePointerCapture?.(e.pointerId);
      setHolding(false);
      // Release snaps to the nearest record. The corridor has stations.
      goTo(Math.round(-wantRef.current / SPACING));
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    return () => {
      root.removeEventListener('wheel', wheel);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [goTo]);

  /* ---- keyboard: records are addressable ---------------------------------- */
  useEffect(() => {
    const at = () => Math.round(-wantRef.current / SPACING);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goTo(at() + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goTo(at() - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        setHolding(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setHolding(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [goTo]);

  const record = RECORDS[active];
  const phase = phaseFor(confidence, holding);

  return (
    <div
      className="mem"
      ref={rootRef}
      data-armed={armed ? 'true' : 'false'}
      data-phase={phase}
    >
      {live ? (
        <div className="mem-canvas">
          <SpatialCanvas
            quality={quality}
            viewport={capability.viewport}
            onInvalidator={(inv) => {
              invalidateRef.current = inv;
            }}
            onFailure={(r) => {
              console.warn('[lab] memory WebGL unavailable:', r);
              setGlFailed(true);
            }}
          >
            <MemoryField
              count={count}
              spacing={SPACING}
              scale={scale}
              focusRef={focusRef}
              holdRef={holdRef}
              reduced={reduced}
            />
          </SpatialCanvas>
        </div>
      ) : (
        <MemoryDocument capability={capability} />
      )}

      {/* ---- the record, as an archive card ------------------------------- */}
      {live && (
        <article className="mem-card" data-conf={confidence > 0.5 ? 'high' : 'low'}>
          <header className="mem-card__head">
            <span className="t-mono t-mono-xs mem-card__index">{record.index}</span>
            <span className="t-mono t-mono-xs t-dim mem-card__cat">{record.category}</span>
            <span className="t-mono t-mono-xs mem-card__phase t-signal">{phase}</span>
          </header>

          {/* Holding a key is a pointer-shaped gesture in disguise. The same
              reconstruction is a latching control, reachable by Tab, whose
              pressed state is exposed rather than implied by the field. */}
          <button
            type="button"
            className="mem-hold"
            aria-pressed={holding}
            onClick={() => setHolding((h) => !h)}
          >
            {holding ? 'RELEASE' : 'RECONSTRUCT'}
          </button>

          <h2 className="t-display t-display-m mem-card__title">{record.title}</h2>

          <div className="mem-card__body" aria-live="polite">
            {record.lines.map((l) => (
              <p key={l} className="t-body-s mem-card__line">
                {l}
              </p>
            ))}
          </div>

          <div className="mem-card__meter" aria-hidden="true">
            <span
              className="mem-card__meter-fill"
              style={{ transform: `scaleX(${record.integrity})` }}
            />
          </div>
          <p className="t-mono t-mono-xs t-faint mem-card__integrity">
            INTEGRITY {Math.round(record.integrity * 100).toString().padStart(3, '0')}
            <span className="mem-card__sep">·</span>
            RECONSTRUCTION {Math.round(confidence * 100).toString().padStart(3, '0')}
          </p>

          {record.lost.length > 0 && (
            <ul className="mem-card__lost">
              {record.lost.map((f) => (
                <li key={f} className="t-mono t-mono-xs">
                  <span className="mem-card__rule" aria-hidden="true" />
                  {f}
                  <span className="t-faint"> {MEMORY_COPY.unrecovered}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      {/* ---- the corridor position --------------------------------------- */}
      <nav className="mem-rail" aria-label="Archive records">
        {RECORDS.map((r, i) => (
          <button
            key={r.id}
            type="button"
            className="mem-rail__stop"
            data-on={i === active ? 'true' : 'false'}
            aria-current={i === active}
            onClick={() => goTo(i)}
          >
            <span className="t-mono t-mono-xs mem-rail__n">{r.index}</span>
            <span className="mem-rail__tick" aria-hidden="true" />
          </button>
        ))}
      </nav>

      <header className="mem-head">
        <h1 className="t-mono t-mono-xs mem-head__title">
          <span className="t-signal">{MEMORY_COPY.title}</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">{MEMORY_COPY.tagline}</span>
        </h1>
      </header>

      <p className="t-mono t-mono-xs t-faint mem-hint">
        {coarse ? MEMORY_COPY.hintCoarse : MEMORY_COPY.hintFine}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* No WebGL — the archive is a document, and stays complete                    */
/* -------------------------------------------------------------------------- */
function MemoryDocument({ capability }: { capability: { webgl: boolean; reducedMotion: boolean } }) {
  return (
    <div className="mem-doc">
      <p className="t-mono t-mono-xs mem-doc__note">
        {`${spatialFallbackReason(MEMORY_COPY.fallbackSubject, capability)} ${MEMORY_COPY.fallbackRemains}`}
      </p>
      <ol className="mem-doc__list">
        {RECORDS.map((r) => (
          <li key={r.id}>
            <div className="mem-doc__head">
              <span className="t-mono t-mono-xs t-signal">{r.index}</span>
              <span className="t-mono t-mono-xs t-dim">{r.category}</span>
              <span className="t-mono t-mono-xs t-faint">
                INTEGRITY {Math.round(r.integrity * 100)}
              </span>
            </div>
            <h3 className="t-display t-display-s">{r.title}</h3>
            {r.lines.map((l) => (
              <p key={l} className="t-body-s t-dim">
                {l}
              </p>
            ))}
            {r.lost.length > 0 && (
              <p className="t-mono t-mono-xs t-faint mem-doc__lost">
                {r.lost.join(' · ')} — {MEMORY_COPY.unrecovered}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
