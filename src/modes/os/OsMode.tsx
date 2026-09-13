import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useExperience } from '../../experience/context';
import {
  useCapability,
  useCoarsePointer,
  useLatest,
  useMediaQuery,
  useReducedMotion,
} from '../../core/hooks';
import { setPointerIntent } from '../../core/pointer';
import { spatialQuality } from '../../spatial/quality';
import { APPS, BOOT_LINES, OS_COPY, type AppId } from '../../content/os';
import { complete, execute, type OsLine } from './commands';
import { runFormat } from '../../artifacts/artifact';
import { briefJson, briefMarkdown } from '../../system/brief';
import { offered } from '../../system/handoff';
import { Sheet } from './Sheet';
import { CapabilityBody, ServiceBody, TerminalBody } from './AppBody';
import './os.css';

/**
 * ANZY.OS — RUN HI ANZY.
 *
 * The operating metaphor is a print workshop's job system, not a computer
 * desktop: an ink desk, paper sheets laid on it, capabilities as resident
 * processes, and a job ticket along the bottom of the bench where instructions
 * are written. There is no dock, no menu bar, no traffic lights, no wallpaper,
 * no start menu, no file manager, no window chrome pretending to be glass and
 * no retro-terminal green.
 *
 * The shell is fictional by construction. It maps a fixed table of words onto
 * this mode's own state and can reach nothing else — no evaluation, no
 * filesystem, no environment, no network, no storage. See `commands.ts`.
 *
 * The one thing it can do beyond itself is start another reality, which is the
 * point of building it last: this is the only mode that can operate the Lab.
 */

/**
 * Sheet widths, which are a measure and not a layout convenience.
 *
 * Six of seven used to be 430 or 470, so every application arrived at the same
 * size and the bench read as a window manager. A schedule set on grid wants a
 * narrow measure; a two-column directory wants a wide one; a mount wants
 * whatever the plate needs plus its margins. The numbers are also chosen so
 * that the two sheets the OS opens for you — SYSTEM and TERMINAL — still sit
 * side by side on a 1440 bench rather than starting the session on a pile.
 */
const WIDTH: Record<AppId, number> = {
  terminal: 540, // a docket roll: fixed measure, monospaced
  system: 456, // an instrument readout
  strategy: 408, // a tracing overlay: the narrowest, most open sheet
  design: 456, // mount board: plate width plus its margins
  technology: 400, // a ruled schedule: the tightest measure in the OS
  network: 516, // a two-column printed directory
  method: 520, // five leaves, the most spaced sheet
};

const PLATE: Record<AppId, string> = {
  strategy: 'P.01',
  design: 'P.02',
  technology: 'P.03',
  network: 'P.04',
  method: 'P.05',
  system: 'P.06',
  terminal: 'P.07',
};

/** Rail width and bench gutter, shared with os.css. */
const RAIL = 316;
const GUTTER = 26;

interface Pos {
  x: number;
  y: number;
}

let lineId = 0;

export default function OsMode({ onReady, scope }: ModeViewProps) {
  const capability = useCapability();
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const stacked = useMediaQuery('(max-width: 900px)');
  const quality = useMemo(() => spatialQuality(capability), [capability]);
  const { enterMode } = useExperience();

  const [bootShown, setBootShown] = useState(0);
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState<AppId[]>([]);
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const [lines, setLines] = useState<OsLine[]>([]);
  const [input, setInput] = useState('');
  const [clock, setClock] = useState('--:--:--');

  const inputRef = useRef<HTMLInputElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);
  const histIndex = useRef(-1);
  const cascade = useRef(0);

  const draggable = !coarse && !stacked;

  /* ---- boot: authored, brief, and never blocking ------------------------- */
  useEffect(() => {
    setPointerIntent('default');
    if (reduced) {
      const t = window.setTimeout(() => {
        setArmed(true);
        onReady();
      }, 140);
      return () => window.clearTimeout(t);
    }
    const timers: number[] = [];
    BOOT_LINES.forEach((_, i) => {
      timers.push(window.setTimeout(() => setBootShown(i + 1), 90 + i * 105));
    });
    timers.push(
      window.setTimeout(() => {
        setArmed(true);
        onReady();
      }, 160 + BOOT_LINES.length * 105),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [onReady, reduced]);

  /* ---- the clock is real, which is why it is allowed to be mono ---------- */
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    scope.add(() => window.clearInterval(id));
    return () => window.clearInterval(id);
  }, [scope]);

  /* ---- sheets ------------------------------------------------------------
     `pos` holds only the sheets actually on the bench, so the placement logic
     can read it straight out of the `setPos` updater and be right even when
     two sheets open in the same tick. `parked` is where a sheet was when it
     was taken off — the desk remembering where you put things, which is a
     separate fact from what is on it now. */
  const parked = useRef<Record<string, Pos>>({});

  const focusSheet = useCallback((id: AppId) => {
    setOpen((o) => (o[o.length - 1] === id ? o : [...o.filter((x) => x !== id), id]));
  }, []);

  /**
   * Placement is a bench layout, not a window cascade.
   *
   * A new sheet takes the first free column on the bench; only when the bench
   * is full does it start overlapping. Positions persist after a sheet is
   * closed, so reopening returns it to the slot it had — the desk remembers
   * where you put things, which a pile of cascading windows never does.
   */
  const openSheet = useCallback(
    (id: AppId) => {
      setPos((p) => {
        if (p[id]) return p;
        const w = WIDTH[id];
        // Desk-relative. `.os-desk` is the grid cell that begins after the
        // rail, so the rail must not be counted again here — doing so pushed
        // every sheet one rail-width to the right, off the end of the bench.
        const w0 = capability.viewport.w - RAIL;
        const left = 44;
        const right = w0 - 40;
        const top = 112;
        /*
         * `p` is exactly what is on the bench, so this needs no other source
         * of truth. It used to hold every position the desk had ever handed
         * out, closed sheets included, which meant a bench you had cleared
         * still read as full and the next sheet opened onto the cascade pile
         * over nothing at all.
         */
        const placed = Object.entries(p) as [AppId, Pos][];

        // Shelf packing along one row: the next free slot starts where the
        // sheets already on the bench end — not one incoming width along, which
        // is what pushed the second sheet off the bench and onto the first.
        //
        // There is deliberately no second row. Sheets are tall and their height
        // is content-driven, so a row-two slot chosen from x alone lands on top
        // of a tall row-one sheet while claiming to sit beside it.
        const row = placed.filter(([, t]) => Math.abs(t.y - top) < 48);
        const free = (x: number) =>
          x + w <= right && !row.some(([tid, t]) => x < t.x + WIDTH[tid] + 8 && t.x < x + w + 8);

        // Where this sheet was when it was last taken off the bench, if that
        // slot is still clear. The desk remembers.
        const mine = parked.current[id];
        if (mine && Math.abs(mine.y - top) < 48 && free(mine.x)) {
          return { ...p, [id]: mine };
        }

        const xs = [left, ...row.map(([tid, t]) => t.x + WIDTH[tid] + GUTTER)].sort((a, b) => a - b);
        for (const x of xs) {
          if (free(x)) return { ...p, [id]: { x, y: top } };
        }

        // Bench full: the sheet goes on the pile, offset far enough that it
        // reads as placed on top rather than as a botched alignment.
        const n = cascade.current++;
        const maxX = Math.max(left, right - w);
        return {
          ...p,
          [id]: { x: Math.min(left + 44 + (n % 5) * 40, maxX), y: top + 62 + (n % 5) * 40 },
        };
      });
      focusSheet(id);
    },
    [capability.viewport.w, focusSheet],
  );

  /** Taken off the bench, and its slot remembered for when it comes back. */
  const closeSheet = useCallback((id: AppId) => {
    setOpen((o) => o.filter((x) => x !== id));
    setPos((p) => {
      if (!p[id]) return p;
      parked.current[id] = p[id];
      const next = { ...p };
      delete next[id];
      return next;
    });
  }, []);

  /** A dragged sheet stays on the bench: never over the rail, never off the
      bottom, and never over the mode host's chrome. */
  const moveSheet = useCallback(
    (id: AppId, x: number, y: number) => {
      const deskW = capability.viewport.w - RAIL;
      setPos((p) => ({
        ...p,
        [id]: {
          x: Math.min(Math.max(0, x), Math.max(0, deskW - 140)),
          y: Math.min(Math.max(52, y), Math.max(52, capability.viewport.h - 190)),
        },
      }));
    },
    [capability.viewport.w, capability.viewport.h],
  );

  /* ---- the shell --------------------------------------------------------- */
  const print = useCallback((texts: string[], kind: OsLine['kind'] = 'out') => {
    if (texts.length === 0) return;
    setLines((l) => [...l, ...texts.map((text) => ({ id: lineId++, kind, text }))].slice(-220));
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      setInput('');
      if (!text) return;
      historyRef.current = [...historyRef.current.slice(-40), text];
      histIndex.current = -1;
      openSheet('terminal');
      print([text], 'in');
      const out = execute(text, {
        open: openSheet,
        close: closeSheet,
        openIds: open,
        clear: () => setLines([]),
        run: (realityId) => enterMode(realityId),
        profile: quality.profile,
        webgl: quality.webgl,
        history: historyRef.current,
        /*
         * The shell asks for the export; the artifact layer decides whether it
         * happened. Its answer is printed when it arrives rather than assumed,
         * so a refused clipboard write reads as a refusal in the transcript
         * instead of a line claiming the brief was copied.
         */
        exportBrief: (how) => {
          const art = {
            name: 'hi-anzy-problem-brief',
            text: briefMarkdown(),
            data: briefJson(),
          };
          void runFormat(how === 'copy' ? 'copy' : how, art).then((r) => {
            print([
              r.ok
                ? how === 'copy'
                  ? 'brief copied to the clipboard.'
                  : `brief saved as ${how === 'json' ? '.json' : '.md'}.`
                : `export failed: ${r.reason.toLowerCase()}`,
            ]);
          });
        },
      });
      print(out);
    },
    [open, openSheet, closeSheet, print, enterMode, quality.profile, quality.webgl],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit(input);
        return;
      }
      /*
       * Tab completes rather than leaving the field, which is the behaviour
       * anybody who has used a shell expects and the reason the command names
       * can afford to be words rather than abbreviations. Shift+Tab is left
       * alone so the keyboard can still get back out of the input.
       */
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const { line, options } = complete(input);
        if (line !== input) setInput(line);
        if (options.length > 1) {
          print([input], 'in');
          print([options.join('  ')]);
        }
        return;
      }
      const h = historyRef.current;
      if (!h.length) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        histIndex.current =
          histIndex.current < 0 ? h.length - 1 : Math.max(0, histIndex.current - 1);
        setInput(h[histIndex.current]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (histIndex.current < 0) return;
        histIndex.current += 1;
        if (histIndex.current >= h.length) {
          histIndex.current = -1;
          setInput('');
        } else {
          setInput(h[histIndex.current]);
        }
      }
    },
    [input, submit, print],
  );

  const submitRef = useLatest(submit);

  /* ---- first sheets: a bench with work already on it ---------------------
     The shell runs `help` for you once, so the terminal opens holding the
     command table rather than an empty sheet of paper telling you to type. */
  const seeded = useRef(false);
  useEffect(() => {
    if (!armed || seeded.current) return;
    seeded.current = true;
    /*
     * ARRIVING WITH SOMETHING IN HAND.
     *
     * A visitor sent here by another tool's CONTINUE is not arriving to type a
     * command — they are arriving to see what they sent. The bench seeds the
     * terminal with `help` and hands it the caret, which is right for somebody
     * who came here on purpose and exactly wrong for somebody handed a brief:
     * the offer renders on the SYSTEM sheet, and with the terminal opened last
     * it sat underneath, so the continuation looked like it had done nothing.
     *
     * Order is the whole fix. `openSheet` brings its sheet to the front, so
     * running `help` first and opening SYSTEM after leaves SYSTEM on top with
     * the terminal still open behind it holding its command table. No second
     * state write, and nothing to keep in step.
     */
    const waiting = Boolean(offered('anzy-os'));
    if (waiting) {
      submitRef.current('help');
      openSheet('system');
      return;
    }

    openSheet('system');
    submitRef.current('help');
    if (!coarse) inputRef.current?.focus({ preventScroll: true });
  }, [armed, openSheet, coarse, submitRef]);

  /* ---- keep the terminal at its newest line ------------------------------ */
  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const topId = open[open.length - 1];
  /* Reduced motion gets the whole boot block at once. Derived, not a second
     state write racing the arm timer inside the same effect. */
  const shown = reduced ? BOOT_LINES.length : bootShown;

  return (
    <div
      className="os"
      data-armed={armed ? 'true' : 'false'}
      data-stacked={stacked ? 'true' : 'false'}
      data-open={open.length > 0 ? 'true' : 'false'}
    >
      {/* ---- process rail ---------------------------------------------------
           There is no second system bar: the mode host already prints the
           reality's number and name at the top of the sheet, and repeating it
           would be chrome about chrome. The rail carries the state instead. */}
      <nav className="os-rail" aria-label="Resident processes">
        <div className="os-rail__head">
          <h1 className="t-display t-display-s os-rail__wordmark">{OS_COPY.tagline}</h1>
          <p className="t-mono t-mono-xs t-faint os-rail__state">
            <span>SHEETS {String(open.length).padStart(2, '0')}</span>
            <span className="os-rail__clock">{clock}</span>
          </p>
        </div>
        <h2 className="t-mono t-mono-xs t-faint os-rail__label">RESIDENT PROCESSES</h2>
        <ul className="os-rail__list">
          {APPS.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                className="os-proc"
                data-on={open.includes(a.id) ? 'true' : 'false'}
                onClick={() => openSheet(a.id)}
                onPointerEnter={() => setPointerIntent('discover')}
                onPointerLeave={() => setPointerIntent('default')}
              >
                <span className="t-mono t-mono-xs os-proc__n">{String(i + 1).padStart(2, '0')}</span>
                <span className="t-mono t-mono-s os-proc__name">{a.name}</span>
                <span className="t-body-s t-dim os-proc__line">{a.line}</span>
                <span className="os-proc__dot" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---- the desk -------------------------------------------------------
           The bench is drawn in three registers by os.css: a datum measure at
           the back, the sheets in the middle at real depth, and the job ticket
           in front. Sheets render in APPS order and stack with z-index, never
           by reordering the DOM — a keyed child that moves in the tree can
           restart its own CSS animation, which would mean a sheet re-laying
           itself every time you picked up another one. */}
      <div className="os-desk">
        {APPS.map((app) => {
          const i = open.indexOf(app.id);
          if (i < 0) return null;
          const id = app.id;
          return (
            <Sheet
              key={id}
              plate={PLATE[id]}
              title={app.name}
              subtitle={id === 'terminal' ? 'OUTPUT' : undefined}
              x={pos[id]?.x ?? 340}
              y={pos[id]?.y ?? 120}
              w={WIDTH[id]}
              maxH={Math.max(200, capability.viewport.h - (pos[id]?.y ?? 120) - 126)}
              z={10 + i}
              top={id === topId}
              depth={open.length - 1 - i}
              stock={app.stock}
              draggable={draggable}
              onFocus={() => focusSheet(id)}
              onClose={() => closeSheet(id)}
              onMove={(x, y) => moveSheet(id, x, y)}
            >
              {id === 'terminal' ? (
                <div
                  className="os-term__scroll"
                  ref={termRef}
                  onClick={() => inputRef.current?.focus()}
                >
                  <TerminalBody lines={lines} />
                </div>
              ) : id === 'system' ? (
                <CapabilityBody
                  profile={quality.profile}
                  webgl={quality.webgl}
                  viewport={capability.viewport}
                  sheets={open.length}
                />
              ) : (
                <ServiceBody
                  id={id}
                  specimenId={app.specimen}
                  reduced={reduced}
                  scope={scope}
                />
              )}
            </Sheet>
          );
        })}
      </div>

      {/* ---- the job ticket -------------------------------------------------- */}
      <form
        className="os-cmd"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label className="t-mono t-mono-s os-cmd__prompt" htmlFor="os-input">
          {OS_COPY.prompt}
          <span className="t-signal"> {'›'}</span>
        </label>
        <input
          id="os-input"
          ref={inputRef}
          className="t-mono t-mono-s os-cmd__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="type help"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Command"
        />
        <span className="t-mono t-mono-xs t-faint os-cmd__hint">
          {coarse ? OS_COPY.hintTouch : OS_COPY.hintPointer}
        </span>
      </form>

      {/* ---- boot ------------------------------------------------------------ */}
      {!armed && (
        <div className="os-boot" role="status" aria-live="polite">
          <ol className="os-boot__list">
            {BOOT_LINES.slice(0, shown).map((l) => (
              <li key={l} className="t-mono t-mono-s">
                {l}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
