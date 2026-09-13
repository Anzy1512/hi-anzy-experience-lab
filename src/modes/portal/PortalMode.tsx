import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useExperience } from '../../experience/context';
import { useCapability, useCoarsePointer, useReducedMotion } from '../../core/hooks';
import { onFrame } from '../../core/raf';
import { pointer, setPointerIntent } from '../../core/pointer';
import { damp, lerp } from '../../spatial/projection';
import { CANONICAL_PAGES, CANONICAL_PAGES_COMMIT } from '../../content/canonicalPages';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { useProject } from '../../system/project';
import { buildPackage, deliveryMarkdown } from './delivery';
import './portal.css';

/**
 * PORTAL — BRING HI ANZY INTO YOUR WORLD.
 *
 * An aperture cut in the sheet, with the Lab's territory behind it. Not a
 * glowing sci-fi ring: it is a **rectangle of paper with a hole in it**, trim
 * marks at the corners, and depth on the other side — the same geometry and
 * material language as every other reality.
 *
 * Three tiers, chosen by what the device can actually do:
 *
 *   XR         an immersive session, if `navigator.xr` reports one is supported
 *   SPATIAL    the aperture with parallax from device orientation or the pointer
 *   FLAT       the aperture, composed and still
 *
 * **Support is reported, never assumed.** The readout says exactly what this
 * browser answered, including "not asked yet" and "this browser has no WebXR
 * API at all". The unsupported path is not a dead end — it is the same portal,
 * driven by a different input, and it is what most visitors will see.
 *
 * The immersive path has **not been exercised on a headset in this
 * environment**; there is none here. It is written against the WebXR session
 * API and reports its own failures rather than pretending.
 *
 * ── WHAT THE HOLE IS FOR ────────────────────────────────────────────────────
 *
 * The aperture was well made and meant nothing. It was a rectangle of paper
 * with depth behind it, and a visitor could look through it for a minute
 * without learning what Hi Anzy was claiming — which made it the one reality
 * whose form was finished and whose argument was missing. "The hole is not the
 * feature" was true and was not yet acted on.
 *
 * The crossing is the feature, and it now has a subject on both sides:
 *
 *   BEFORE    a real section of the commercial site, as it reads there —
 *             a heading, a line of copy, set on paper. What a customer sees.
 *   CROSSING  the aperture opens and the same section goes through it.
 *   AFTER     the identical section as this Lab holds it: a plane with a grid
 *             span, a ground, typographic roles, sampled colours, and the
 *             canonical data that fills it. What the system sees.
 *
 * Nothing is invented on either side. Both are the same record out of
 * `canonicalPages.ts`, read from the commercial repository at a known commit;
 * the only thing that changes across the crossing is which facts about it are
 * made visible. That is the whole claim: the website and the Lab are two
 * renderings of one institution, and here they are, one behind the other.
 */

type XrSupport = 'unasked' | 'unavailable' | 'none' | 'ar' | 'vr' | 'both';
type Tier = 'xr' | 'spatial' | 'flat';

interface XrNavigator {
  xr?: { isSessionSupported: (mode: string) => Promise<boolean> };
}

const LAYERS = 7;

export default function PortalMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { enterMode } = useExperience();

  const [armed, setArmed] = useState(false);

  /*
   * THE CROSSING.
   *
   * `before` is the commercial reading, `after` is the system reading, and they
   * are the same record — so crossing cannot be a navigation, only a change of
   * what is shown about one thing. Which subject is being carried across is the
   * visitor's, because the claim is about the whole site rather than one lucky
   * page.
   */
  const [side, setSide] = useState<'before' | 'after'>('before');

  /* What would actually leave the building. Derived from the project rather
     than held here, so crossing back and forth cannot produce two packages
     that disagree about what the project contains. */
  const project = useProject();
  const pkg = useMemo(() => buildPackage(project.artifacts), [project.artifacts]);
  const [subject, setSubject] = useState(0);
  const crossable = useMemo(
    () =>
      CANONICAL_PAGES.flatMap((pg) =>
        pg.sections
          .filter((sec) => sec.headings.length > 0 || sec.copy.length > 0)
          .slice(0, 2)
          .map((sec) => ({ page: pg, sec })),
      ).slice(0, 6),
    [],
  );
  const carried = crossable[subject % crossable.length];
  const [support, setSupport] = useState<XrSupport>('unasked');
  const [sessionNote, setSessionNote] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'idle' | 'on' | 'denied' | 'unsupported'>('idle');

  const apertureRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const tier: Tier = useMemo(() => {
    if (support === 'ar' || support === 'vr' || support === 'both') return 'xr';
    if (reduced || capability.profile === 'lite') return 'flat';
    return 'spatial';
  }, [support, reduced, capability.profile]);

  useEffect(() => {
    setPointerIntent('discover');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 130 : 520,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- ask the browser what it can do, and print the answer -------------- */
  useEffect(() => {
    let cancelled = false;
    const xr = (navigator as Navigator & XrNavigator).xr;
    void (async () => {
      if (!xr?.isSessionSupported) {
        if (!cancelled) setSupport('unavailable');
        return;
      }
      try {
        const [ar, vr] = await Promise.all([
          xr.isSessionSupported('immersive-ar').catch(() => false),
          xr.isSessionSupported('immersive-vr').catch(() => false),
        ]);
        if (cancelled) return;
        setSupport(ar && vr ? 'both' : ar ? 'ar' : vr ? 'vr' : 'none');
      } catch {
        if (!cancelled) setSupport('none');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- the aperture's parallax ------------------------------------------- */
  useEffect(() => {
    if (tier === 'flat') return;
    const stop = onFrame((dt) => {
      const t = tiltRef.current;
      if (orientation !== 'on') {
        // Pointer drives it when the device cannot.
        t.tx = (pointer.sx / Math.max(1, capability.viewport.w) - 0.5) * 2;
        t.ty = (pointer.sy / Math.max(1, capability.viewport.h) - 0.5) * 2;
      }
      const k = damp(0.05, dt);
      t.x = lerp(t.x, t.tx, k);
      t.y = lerp(t.y, t.ty, k);
      const el = apertureRef.current;
      if (el) {
        el.style.setProperty('--tx', t.x.toFixed(4));
        el.style.setProperty('--ty', t.y.toFixed(4));
      }
    });
    scope.add(stop);
    return stop;
  }, [tier, orientation, capability.viewport.w, capability.viewport.h, scope]);

  /* ---- device orientation, only ever after an explicit request ----------- */
  const askOrientation = useCallback(async () => {
    interface Requestable {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    }
    const DOE = (window as unknown as { DeviceOrientationEvent?: Requestable }).DeviceOrientationEvent;
    if (!DOE) {
      setOrientation('unsupported');
      return;
    }
    try {
      if (typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') {
          setOrientation('denied');
          return;
        }
      }
      const handler = (e: DeviceOrientationEvent) => {
        const t = tiltRef.current;
        t.tx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 34));
        t.ty = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 40) / 34));
      };
      window.addEventListener('deviceorientation', handler);
      scope.add(() => window.removeEventListener('deviceorientation', handler));
      setOrientation('on');
    } catch {
      setOrientation('denied');
    }
  }, [scope]);

  /* ---- the immersive path ------------------------------------------------ */
  const enterXr = useCallback(async () => {
    const xr = (navigator as Navigator & XrNavigator).xr as
      | { requestSession?: (m: string, o?: unknown) => Promise<unknown> }
      | undefined;
    if (!xr?.requestSession) {
      setSessionNote('This browser exposes no WebXR session API.');
      return;
    }
    const mode = support === 'vr' ? 'immersive-vr' : 'immersive-ar';
    try {
      const session = (await xr.requestSession(mode, {
        optionalFeatures: ['local-floor', 'hit-test'],
      })) as { end?: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void };
      setSessionNote(`SESSION OPEN · ${mode.toUpperCase()}`);
      // A session must not outlive the mode under any exit path.
      scope.add(() => {
        void session.end?.();
      });
      session.addEventListener?.('end', () => setSessionNote('SESSION ENDED'));
    } catch (err) {
      // The honest outcome: say what the browser said.
      setSessionNote(
        `SESSION REFUSED — ${(err as Error)?.message || 'no reason given by the browser'}`,
      );
    }
  }, [support, scope]);

  const supportLine =
    support === 'unasked'
      ? 'ASKING THIS BROWSER…'
      : support === 'unavailable'
        ? 'NO WEBXR API IN THIS BROWSER'
        : support === 'none'
          ? 'WEBXR PRESENT · NO IMMERSIVE SESSION SUPPORTED HERE'
          : support === 'both'
            ? 'IMMERSIVE AR AND VR REPORTED SUPPORTED'
            : support === 'ar'
              ? 'IMMERSIVE AR REPORTED SUPPORTED'
              : 'IMMERSIVE VR REPORTED SUPPORTED';

  return (
    <div
      className="pt"
      /* PORTAL is a paper mode — the sheet the aperture is cut into. */
      data-material="paper"
      data-armed={armed ? 'true' : 'false'}
      data-tier={tier}
    >
      {/* ---- the aperture: a sheet with a hole cut in it ------------------- */}
      <div className="pt-stage">
        <div className="pt-aperture" ref={apertureRef}>
          {/* Depth: the Lab's own rules, receding through the opening. */}
          <div className="pt-depth" aria-hidden="true">
            {Array.from({ length: LAYERS }, (_, i) => (
              <span
                key={i}
                className="pt-layer"
                style={{
                  ['--i' as string]: i,
                  ['--k' as string]: (i / (LAYERS - 1)).toFixed(3),
                }}
              />
            ))}
            <span className="pt-horizon" />
          </div>

          {/*
            THE THING BEING CARRIED THROUGH.

            One record, two readings. The DOM is the same on both sides — only
            `data-side` changes — so a visitor watching closely can see that
            nothing was swapped: the heading that was editorial copy a moment
            ago is the heading on the plane now.
          */}
          {carried && (
            <div className="pt-carry" data-side={side}>
              <p className="t-mono t-mono-xs pt-carry__origin">
                <span className="t-signal">{carried.page.route}</span>
                <span className="t-faint"> · </span>
                {carried.sec.label}
              </p>

              <h2 className="t-display t-display-m pt-carry__head">
                {carried.sec.headings[0]?.text ?? carried.sec.label}
              </h2>

              {/* BEFORE: what a customer reads. */}
              <p className="t-body pt-carry__copy">
                {carried.sec.copy[0] ?? carried.sec.headings[0]?.text ?? ''}
              </p>

              {/* AFTER: what the system holds about the very same section. */}
              <dl className="pt-carry__system" aria-hidden={side === 'before'}>
                <div>
                  <dt>GRID</dt>
                  <dd>{carried.sec.columns ? `${carried.sec.columns} COLUMNS` : 'NOT DECLARED'}</dd>
                </div>
                <div>
                  <dt>GROUND</dt>
                  <dd>{carried.sec.ground}</dd>
                </div>
                <div>
                  <dt>TYPE</dt>
                  <dd>
                    {carried.sec.roles.length
                      ? carried.sec.roles.map((r) => r.split(' ')[0]).join(' + ')
                      : 'NOT DECLARED'}
                  </dd>
                </div>
                <div>
                  <dt>FILLED BY</dt>
                  <dd>{carried.sec.data.length ? carried.sec.data.join(' + ') : 'LITERAL COPY'}</dd>
                </div>
                <div>
                  <dt>SOURCE</dt>
                  <dd>{carried.sec.source}</dd>
                </div>
              </dl>

              {carried.sec.colours.length > 0 && (
                <p className="pt-carry__swatches" aria-hidden="true">
                  {carried.sec.colours.slice(0, 5).map((c) => (
                    <span key={c} className="pt-carry__swatch" style={{ background: c }} title={c} />
                  ))}
                </p>
              )}
            </div>
          )}

          {/* The paper the hole is cut in. Trim marks, not a glowing ring. */}
          <span className="pt-trim pt-trim--tl" aria-hidden="true" />
          <span className="pt-trim pt-trim--tr" aria-hidden="true" />
          <span className="pt-trim pt-trim--bl" aria-hidden="true" />
          <span className="pt-trim pt-trim--br" aria-hidden="true" />
        </div>
      </div>

      {/*
        THE CROSSING CONTROL.

        One verb, and it reads as the state it is about to produce. The subject
        can be changed only from the near side: carrying a different section
        across without going back first would make the crossing look like a
        filter on a list, which is exactly the "another menu" this must not be.
      */}
      <div className="pt-cross">
        <p className="t-mono t-mono-xs t-dim pt-cross__label">
          {side === 'before' ? 'THE SITE SHOWS YOU THIS' : 'THE SYSTEM HOLDS THIS'}
        </p>
        <div className="pt-cross__row">
          <button
            type="button"
            className="pt-btn pt-btn--signal"
            onClick={() => setSide((v) => (v === 'before' ? 'after' : 'before'))}
            onPointerEnter={() => setPointerIntent('enter')}
            onPointerLeave={() => setPointerIntent('default')}
          >
            {side === 'before' ? 'CROSS' : 'COME BACK'}
          </button>
          {side === 'before' && crossable.length > 1 && (
            <button
              type="button"
              className="pt-btn"
              onClick={() => setSubject((i) => (i + 1) % crossable.length)}
            >
              CARRY SOMETHING ELSE
            </button>
          )}
          {side === 'after' && (
            <button type="button" className="pt-btn" onClick={() => enterMode('reality-compiler')}>
              SEE THE WHOLE PAGE COMPILED
            </button>
          )}
        </div>
        <p className="t-body-s t-dim pt-cross__note">
          {side === 'before'
            ? 'The same section is on the other side of the aperture. Nothing is swapped — only what is shown about it.'
            : `Read from ${carried?.sec.source ?? 'the commercial repository'} at ${CANONICAL_PAGES_COMMIT}. The website and this Lab are two renderings of one institution.`}
        </p>

        {/*
          THE FAR SIDE IS DELIVERY.

          A crossing that ends in an idea is a demonstration. This is the thing
          that would actually leave: everything the project has produced, what
          each piece carries, and what is missing from the package — printed on
          the side of the aperture where the system lives, because that is what
          the crossing has always meant.

          It appears only after the crossing. Offering a package on the near
          side would be the mode answering a question the visitor has not been
          shown yet.
        */}
        {side === 'after' && (
          <div className="pt-package">
            <p className="t-mono t-mono-xs pt-package__state">
              PACKAGED · LOCAL · {pkg.items.length}{' '}
              {pkg.items.length === 1 ? 'ITEM' : 'ITEMS'}
            </p>
            {pkg.items.length > 0 ? (
              <ul className="pt-package__list">
                {pkg.items.map((it) => (
                  <li key={it.title}>
                    <span className="t-mono t-mono-xs pt-package__kind">{it.kind}</span>
                    <span className="t-body-s pt-package__title">{it.title}</span>
                    <span className="t-body-s t-dim pt-package__carries">{it.carries}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-body-s t-dim pt-package__empty">
                This project has produced nothing yet, so there is nothing to package. The
                Agency Simulator, the Reality Compiler and Director all end in something that
                can travel.
              </p>
            )}
            {/*
              WHAT IS NOT IN IT, ON SCREEN.
          
              This lived only in the downloaded manifest, which meant the one
              line that stops the package being read as more than it is —
              "LIVE MEASUREMENT WAS NOT PERFORMED", when the page was taken
              apart but never measured — was invisible to anybody who packaged
              here and never opened the file. A manifest that lists only what
              it has is half a manifest, and the missing half was the half that
              qualifies the other one.
            */}
            <p className="t-mono t-mono-xs pt-package__head">WHAT IS NOT IN IT</p>
            <ul className="pt-package__not">
              {pkg.excluded.map((x) => (
                <li key={x} className="t-body-s">
                  {x}
                </li>
              ))}
            </ul>

            <ArtifactBar
              formats={['copy', 'markdown', 'json']}
              label="THE DELIVERY MANIFEST"
              handoff={{
                kind: 'delivery',
                from: 'portal',
                to: 'anzy-os',
                limits:
                  'A manifest of a LOCAL package. Nothing in it has been uploaded, hosted, published or sent, and this product has no endpoint to send it to. It lists what the project holds, what each piece carries, and what is deliberately not included.',
                sourceIds: project.artifacts.map((a) => a.id),
              }}
              build={() => ({
                name: 'Hi Anzy Delivery Manifest',
                text: deliveryMarkdown(pkg, project.id),
                data: { ...pkg, projectId: project.id },
              })}
            />
          </div>
        )}
      </div>

      <header className="pt-head">
        <h1 className="t-mono t-mono-xs pt-head__title">
          <span className="t-signal">PORTAL</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">BRING HI ANZY INTO YOUR WORLD.</span>
        </h1>
      </header>

      {/* ---- what this device can actually do ----------------------------- */}
      <div className="pt-strip">
        <dl className="pt-read">
          <div>
            <dt>WEBXR</dt>
            <dd>{supportLine}</dd>
          </div>
          <div>
            <dt>RUNNING</dt>
            <dd>
              {tier === 'xr' ? 'XR OFFERED' : tier === 'spatial' ? 'SPATIAL APERTURE' : 'FLAT APERTURE'}
            </dd>
          </div>
          <div>
            <dt>PARALLAX</dt>
            <dd>
              {tier === 'flat'
                ? 'NONE — BY PREFERENCE OR TIER'
                : orientation === 'on'
                  ? 'DEVICE ORIENTATION'
                  : orientation === 'denied'
                    ? 'ORIENTATION DECLINED · POINTER'
                    : orientation === 'unsupported'
                      ? 'NO ORIENTATION API · POINTER'
                      : coarse
                        ? 'TOUCH'
                        : 'POINTER'}
            </dd>
          </div>
        </dl>

        <div className="pt-actions">
          {tier === 'xr' && (
            <button type="button" className="pt-btn pt-btn--signal" onClick={() => void enterXr()}>
              ENTER IMMERSIVE
            </button>
          )}
          {tier !== 'flat' && coarse && orientation === 'idle' && (
            <button type="button" className="pt-btn" onClick={() => void askOrientation()}>
              USE DEVICE TILT
            </button>
          )}
          <button type="button" className="pt-btn" onClick={() => enterMode('living-world')}>
            GO THROUGH
          </button>
        </div>
      </div>

      {sessionNote && (
        <p className="t-mono t-mono-xs pt-session" role="status">
          {sessionNote}
        </p>
      )}

      <p className="t-mono t-mono-xs t-faint pt-hint">
        {tier === 'flat'
          ? 'THE APERTURE IS COMPOSED AND STILL — THE PORTAL IS STILL A PORTAL'
          : coarse
            ? 'TILT OR DRAG TO LOOK THROUGH'
            : 'MOVE TO LOOK THROUGH'}
      </p>
    </div>
  );
}
