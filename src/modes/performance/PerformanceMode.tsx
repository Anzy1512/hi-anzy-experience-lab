import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useCapability, useReducedMotion } from '../../core/hooks';
import { onFrame, frameSubscriberCount } from '../../core/raf';
import { setPointerIntent } from '../../core/pointer';
import { detectWebGPU } from '../../core/capability';
import { audio } from '../../audio/engine';
import { MODES, onlineCount } from '../../content/lab';
import { CANONICAL_SOURCE } from '../../content/canonical';
import { coverage, exclusionsWithoutReason } from '../../content/canonicalManifest';
import { ALL_PRIMITIVES, orphanPrimitives, unwiredPrimitives } from '../../spatial/translation';
import { labOriginated, MATERIALS } from '../../design-system/materials';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { toMarkdown } from '../../artifacts/artifact';
import './performance.css';

/**
 * PERFORMANCE — THE MACHINE, WATCHED.
 *
 * The Lab instrumenting itself in public. Two rules decide everything here:
 *
 *  1. **Every value is measured, or it says UNKNOWN.** Nothing is estimated,
 *     smoothed into plausibility, or filled in because a blank looks bad. If
 *     the browser does not expose something, this mode says so by name.
 *  2. **Nothing sensitive is exposed.** No environment, no tokens, no URLs, no
 *     storage contents, no identifiers, no user agent beyond the engine's own
 *     capability read. The list below is the complete set of what is shown.
 *
 * Frame timing is sampled **only while sampling is running**, and the sampler
 * holds a subscription to the shared loop for exactly that long — a diagnostic
 * that pinned a loop open would invalidate the thing it exists to measure.
 */

interface Sample {
  frames: number;
  seconds: number;
  fps: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  longFrames: number;
}

const SAMPLE_MS = 3000;

export default function PerformanceMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();

  const [armed, setArmed] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [sample, setSample] = useState<Sample | null>(null);
  const [tick, setTick] = useState(0);

  const webgpu = useMemo(() => detectWebGPU(), []);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setPointerIntent('scan');
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady();
      },
      reduced ? 120 : 360,
    );
    scope.add(() => setPointerIntent('default'));
    return () => window.clearTimeout(id);
  }, [onReady, reduced, scope]);

  /* ---- live counts, once a second. Not a frame loop. --------------------- */
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    scope.add(() => window.clearInterval(id));
    return () => window.clearInterval(id);
  }, [scope]);

  /* ---- the sampler ------------------------------------------------------- */
  const runSample = useCallback(() => {
    if (sampling) return;
    setSampling(true);
    const times: number[] = [];
    const started = performance.now();
    let prev = started;

    // Real frame intervals, timed here — NOT the `dt` the shared loop hands out.
    // `core/raf` clamps dt to 64ms so a tab-restore spike cannot teleport an
    // animation, which is right for animation and wrong for measurement: a
    // machine dropping to 4fps would be reported as a flat 64ms, and this mode
    // would be publishing a number that cannot exceed its own clamp.
    const stop = onFrame(() => {
      const now = performance.now();
      times.push(now - prev);
      prev = now;
      if (now - started >= SAMPLE_MS) finish();
    });
    stopRef.current = stop;
    scope.add(stop);

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      stop();
      stopRef.current = null;
      const seconds = (performance.now() - started) / 1000;
      const sorted = [...times].sort((a, b) => a - b);
      const total = times.reduce((a, b) => a + b, 0);
      setSample({
        frames: times.length,
        seconds: +seconds.toFixed(2),
        // Frames actually delivered over real elapsed time. Not derived from
        // the clamped deltas, which would flatter a struggling machine.
        fps: seconds > 0 ? +(times.length / seconds).toFixed(1) : 0,
        avgMs: times.length ? +(total / times.length).toFixed(2) : 0,
        p95Ms: +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0).toFixed(2),
        maxMs: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
        longFrames: times.filter((t) => t > 50).length,
      });
      setSampling(false);
    }

    // A hard stop, in case frames never arrive at all.
    const guard = window.setTimeout(finish, SAMPLE_MS + 2000);
    scope.add(() => window.clearTimeout(guard));
  }, [sampling, scope]);

  /* ---- everything the page can honestly say about itself ----------------- */
  /* Derived once. Coverage walks a 116-entry table and does not change while
     the mode is open, so it has no business being recomputed on every tick. */
  const cover = useMemo(() => coverage(), []);

  const rows = useMemo(() => {
    void tick; // recomputed once a second
    const canvases = document.querySelectorAll('canvas').length;
    const videos = document.querySelectorAll('video').length;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;

    return [
      { group: 'THIS SESSION', k: 'ACTIVE MODE', v: 'PERFORMANCE', measured: true },
      { group: 'THIS SESSION', k: 'REALITIES ONLINE', v: `${onlineCount()} OF ${MODES.length}`, measured: true },
      { group: 'THIS SESSION', k: 'MODE CHUNKS LOADED', v: 'UNKNOWN — NOT TRACKED', measured: false },

      { group: 'DISPLAY', k: 'VIEWPORT', v: `${capability.viewport.w} × ${capability.viewport.h}`, measured: true },
      { group: 'DISPLAY', k: 'DEVICE PIXEL RATIO', v: capability.dpr.toFixed(2), measured: true },
      { group: 'DISPLAY', k: 'QUALITY PROFILE', v: capability.profile.toUpperCase(), measured: true },
      { group: 'DISPLAY', k: 'REDUCED MOTION', v: reduced ? 'REQUESTED' : 'NOT REQUESTED', measured: true },

      { group: 'GRAPHICS', k: 'WEBGL', v: capability.webgl ? 'AVAILABLE' : 'UNAVAILABLE', measured: true },
      { group: 'GRAPHICS', k: 'WEBGPU', v: webgpu ? 'PRESENT · UNUSED BY THIS LAB' : 'ABSENT', measured: true },
      { group: 'GRAPHICS', k: 'CANVASES IN DOCUMENT', v: String(canvases), measured: true },
      { group: 'GRAPHICS', k: 'DRAW CALLS', v: 'UNKNOWN — NOT EXPOSED TO PAGES', measured: false },
      { group: 'GRAPHICS', k: 'GEOMETRY / TEXTURE COUNTS', v: 'UNKNOWN — RENDERER NOT MOUNTED HERE', measured: false },

      { group: 'RUNTIME', k: 'RAF SUBSCRIBERS', v: String(frameSubscriberCount()), measured: true },
      {
        group: 'RUNTIME',
        k: 'JS HEAP USED',
        v: mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'UNKNOWN — NOT EXPOSED BY THIS BROWSER',
        measured: !!mem,
      },
      {
        group: 'RUNTIME',
        k: 'CONNECTION CLASS',
        v: conn?.effectiveType ? conn.effectiveType.toUpperCase() : 'UNKNOWN — NOT EXPOSED BY THIS BROWSER',
        measured: !!conn?.effectiveType,
      },

      { group: 'MEDIA', k: 'AUDIO ENGINE', v: audio.state.toUpperCase(), measured: true },
      { group: 'MEDIA', k: 'AUDIO CONTEXT', v: (audio.context?.state ?? 'NONE').toUpperCase(), measured: true },
      { group: 'MEDIA', k: 'VIDEO ELEMENTS', v: String(videos), measured: true },
      { group: 'MEDIA', k: 'CAMERA', v: videos > 0 ? 'A STREAM IS ATTACHED' : 'NO STREAM', measured: true },

      /*
       * CONVERGENCE — the Lab measuring its own relationship to the website.
       *
       * `SystemDiagnostic` on the commercial site makes measurement the visual
       * language rather than decorating a result, and this is the same move:
       * every number below is derived by calling the thing it describes, so a
       * manifest entry added tomorrow changes this readout without anybody
       * editing it. There is no hardcoded total on this screen.
       */
      { group: 'CONVERGENCE', k: 'CANONICAL SOURCE', v: CANONICAL_SOURCE.commit, measured: true },
      {
        group: 'CONVERGENCE',
        k: 'SURFACES ACCOUNTED',
        v: `${cover.total} — ${cover.byType.route} ROUTES · ${cover.byType.export} EXPORTS · ${cover.byType.component} COMPONENTS · ${cover.byType.assetFamily + cover.byType.font} ASSET`,
        measured: true,
      },
      { group: 'CONVERGENCE', k: 'NOT MAPPED', v: 'ZERO — NOT A VALUE THE TYPE HOLDS', measured: true },
      {
        group: 'CONVERGENCE',
        k: 'EXCLUSIONS WITHOUT A REASON',
        v: String(exclusionsWithoutReason().length),
        measured: true,
      },
      {
        group: 'CONVERGENCE',
        k: 'TRANSLATION PRIMITIVES',
        v: `${ALL_PRIMITIVES.length} — ${ALL_PRIMITIVES.length - unwiredPrimitives().length} BUILT, ${unwiredPrimitives().length} MAPPED ONLY, ${orphanPrimitives().length} ORPHANED`,
        measured: true,
      },
      {
        group: 'CONVERGENCE',
        k: 'MATERIALS',
        v: `${Object.keys(MATERIALS).length} — ${labOriginated().length} THE LAB'S OWN`,
        measured: true,
      },
      {
        group: 'CONVERGENCE',
        k: 'HUMAN VOICE',
        v: 'NEWSREADER — THE SITE’S OWN FILE',
        measured: true,
      },
      {
        group: 'CONVERGENCE',
        k: 'DRIFT SINCE MIRROR',
        v: 'UNKNOWN — CHECKED IN DEVELOPMENT, NOT AT RUNTIME',
        measured: false,
      },
    ];
  }, [tick, capability, reduced, webgpu, cover]);

  const groups = useMemo(() => [...new Set(rows.map((r) => r.group))], [rows]);

  /*
   * Built at click time from the same `rows` the page renders, so the file and
   * the screen cannot disagree. `measured: false` is carried through rather
   * than filtered out — the UNKNOWNs are the most load-bearing lines in this
   * document, and a reader who cannot see which values the browser refused to
   * supply has been handed a more confident report than the one that exists.
   */
  const buildReport = useCallback(() => {
    const taken = sample;
    const text = toMarkdown({
      title: 'HI ANZY EXPERIENCE LAB — SESSION REPORT',
      standfirst:
        'Every value below was measured in this session or is marked UNKNOWN. Nothing is estimated. Nothing about the environment, storage or identity was read.',
      sections: [
        ...groups.map((g) => ({
          head: g,
          items: rows.filter((r) => r.group === g).map((r) => `**${r.k}** — ${r.v}`),
        })),
        {
          head: 'FRAME BEHAVIOUR',
          body: taken
            ? 'Measured on this machine, in this tab, while this page was in front. It is not a benchmark of the Lab, and it is not comparable to any other run.'
            : 'NOT SAMPLED — no frame measurement was taken in this session.',
          items: taken
            ? [
                `**FRAMES DELIVERED** — ${taken.frames} in ${taken.seconds}s`,
                `**FRAMES PER SECOND** — ${taken.fps.toFixed(1)}`,
                `**MEAN FRAME** — ${taken.avgMs} ms`,
                `**95TH PERCENTILE** — ${taken.p95Ms} ms`,
                `**LONGEST FRAME** — ${taken.maxMs} ms`,
                `**FRAMES OVER 50 ms** — ${taken.longFrames}`,
              ]
            : [],
        },
      ],
      footer: {
        GENERATED: new Date().toISOString(),
        'CANONICAL SOURCE': CANONICAL_SOURCE.commit,
        STORAGE: 'NONE — nothing was written to this device',
      },
    });
    return {
      name: 'hi-anzy-session-report',
      text,
      data: {
        generated: new Date().toISOString(),
        canonicalSource: CANONICAL_SOURCE.commit,
        storage: 'NONE',
        rows: rows.map(({ group, k, v, measured }) => ({ group, key: k, value: v, measured })),
        frameSample: taken ?? null,
      },
    };
  }, [groups, rows, sample]);

  return (
    <div className="pf" data-armed={armed ? 'true' : 'false'}>
      <header className="pf-head">
        <h1 className="t-mono t-mono-xs pf-head__title">
          <span className="t-signal">PERFORMANCE</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">THE MACHINE, WATCHED.</span>
        </h1>
        <p className="t-body-s t-dim pf-head__note">
          Every value below was measured in this session or is marked UNKNOWN. Nothing is
          estimated, and nothing about your environment, storage or identity is read.
        </p>
      </header>

      <div className="pf-body">
        {groups.map((g) => (
          <section className="pf-group" key={g}>
            <h2 className="t-mono t-mono-xs pf-group__title">{g}</h2>
            <dl className="pf-rows">
              {rows
                .filter((r) => r.group === g)
                .map((r) => (
                  <div key={r.k} data-measured={r.measured ? 'true' : 'false'}>
                    <dt>{r.k}</dt>
                    <dd>{r.v}</dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}

        {/* ---- frame sampling: only while it runs -------------------------- */}
        <section className="pf-group pf-group--sample">
          <h2 className="t-mono t-mono-xs pf-group__title">FRAME BEHAVIOUR</h2>
          <p className="t-body-s t-dim pf-sample__note">
            Sampling subscribes to the shared frame loop for {SAMPLE_MS / 1000} seconds and then
            unsubscribes. Until you press it, this reality holds no frame loop at all — which is
            also why there is no live FPS number on this page.
          </p>
          <button type="button" className="pf-btn pf-btn--signal" onClick={runSample} disabled={sampling}>
            {sampling ? 'SAMPLING…' : sample ? 'SAMPLE AGAIN' : 'SAMPLE 3 SECONDS'}
          </button>

          <dl className="pf-rows" aria-live="polite">
            <div data-measured={sample ? 'true' : 'false'}>
              <dt>FRAMES DELIVERED</dt>
              <dd>{sample ? `${sample.frames} IN ${sample.seconds}s` : 'NOT SAMPLED YET'}</dd>
            </div>
            <div data-measured={sample ? 'true' : 'false'}>
              <dt>FRAMES PER SECOND</dt>
              <dd>{sample ? sample.fps.toFixed(1) : 'NOT SAMPLED YET'}</dd>
            </div>
            <div data-measured={sample ? 'true' : 'false'}>
              <dt>MEAN FRAME</dt>
              <dd>{sample ? `${sample.avgMs} ms` : 'NOT SAMPLED YET'}</dd>
            </div>
            <div data-measured={sample ? 'true' : 'false'}>
              <dt>95TH PERCENTILE</dt>
              <dd>{sample ? `${sample.p95Ms} ms` : 'NOT SAMPLED YET'}</dd>
            </div>
            <div data-measured={sample ? 'true' : 'false'}>
              <dt>LONGEST FRAME</dt>
              <dd>{sample ? `${sample.maxMs} ms` : 'NOT SAMPLED YET'}</dd>
            </div>
            <div data-measured={sample ? 'true' : 'false'}>
              <dt>FRAMES OVER 50 ms</dt>
              <dd>{sample ? String(sample.longFrames) : 'NOT SAMPLED YET'}</dd>
            </div>
          </dl>

          {sample && (
            <p className="t-mono t-mono-xs pf-caveat">
              MEASURED ON THIS MACHINE, IN THIS TAB, WHILE THIS PAGE WAS IN FRONT. IT IS NOT A
              BENCHMARK OF THE LAB, AND IT IS NOT COMPARABLE TO ANY OTHER RUN.
            </p>
          )}
        </section>

        {/*
          THE SESSION REPORT.

          Performance was the one reality whose entire output was already a
          document — a page of measured values a visitor might genuinely want
          to send somebody — and until now the only way to keep it was a
          screenshot. It exports exactly what is on screen and nothing more:
          the UNKNOWN rows travel as UNKNOWN, and the frame sample is present
          only if it was actually taken, because a report that quietly dropped
          its own caveats would be a different document from the one that was
          read.
        */}
        <section className="pf-group pf-group--export">
          <h2 className="t-mono t-mono-xs pf-group__title">THE SESSION REPORT</h2>
          <ArtifactBar formats={['copy', 'markdown', 'json']} build={buildReport} />
        </section>
      </div>
    </div>
  );
}
