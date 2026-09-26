import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import type { ModeViewProps } from '../../experience/types';
import { useReducedMotion } from '../../core/hooks';
import { markDeskVisited, takeRequestedDesk } from '../../experience/desk';
import { DESKS, findDesk, type DeskId } from '../../content/intelligence';
import { engine } from './engine';
import { EngineLine } from './EngineLine';
import type { DeskProps, EngineState, Handover } from './link';
import SurveyDesk from './desks/SurveyDesk';
import BrandsDesk from './desks/BrandsDesk';
import AreasDesk from './desks/AreasDesk';
import LocatorsDesk from './desks/LocatorsDesk';
import SitesDesk from './desks/SitesDesk';
import DomainsDesk from './desks/DomainsDesk';
import DatasetsDesk from './desks/DatasetsDesk';
import ArchiveDesk from './desks/ArchiveDesk';
import SourcesDesk from './desks/SourcesDesk';
import AtlasDesk from './desks/AtlasDesk';
import ExtractsDesk from './desks/ExtractsDesk';
import AskDesk from './desks/AskDesk';
import './intelligence.css';

/**
 * INTELLIGENCE — THE COMMERCIAL INTELLIGENCE ENGINE, ON THIS MACHINE.
 *
 * One reality with a desk for each thing the engine can do: survey a place,
 * read a brand, resolve an area, read a store locator, read a site, look up a
 * domain, build a dataset, open what is already known, see every source and
 * the registry behind them, count a brand or a kind of business by state and
 * district, see the maps the engine keeps on its own machine, and ask one
 * question that the engine routes itself — to a search, or to the passages
 * it has read.
 *
 * The rules of the rest of the Lab hold on every desk:
 *
 *  1. **Nothing is invented.** Every name, count and reason is the engine's;
 *     when the engine is not running the reality says so and shows nothing in
 *     its place.
 *  2. **Undetermined is a finding.** What nothing states is listed as such,
 *     with the engine's reason, never as a "no".
 *  3. **Nothing is kept here.** No storage. Every request any desk has in
 *     flight is cancelled when the visitor leaves, and every poll with it.
 *
 * Desks are mounted the first time they are opened and then kept, so a survey
 * keeps running while the visitor reads a brand. Which desk is open is written
 * into the address (`#/intelligence/brands`) by replacing it, so a reload
 * returns to the same desk and Back still leaves the reality.
 */

const DESK_VIEWS: Record<DeskId, ComponentType<DeskProps>> = {
  survey: SurveyDesk,
  brands: BrandsDesk,
  areas: AreasDesk,
  locators: LocatorsDesk,
  sites: SitesDesk,
  domains: DomainsDesk,
  datasets: DatasetsDesk,
  archive: ArchiveDesk,
  sources: SourcesDesk,
  atlas: AtlasDesk,
  extracts: ExtractsDesk,
  ask: AskDesk,
};

const MODE_ID = 'intelligence';

/** Whether the engine answers, and with which sources; null when the asking was cancelled. */
async function reach(signal: AbortSignal): Promise<EngineState | null> {
  const health = await engine.health(signal);
  if (!health.ok) return health.problem === 'cancelled' ? null : { kind: 'unreachable', problem: health.problem };
  const sources = await engine.sources(signal);
  if (signal.aborted) return null;
  return { kind: 'ready', health: health.value, sources: sources.ok ? sources.value : [] };
}

/** The desk to open on: handed over by the index, named in the address, or the first. */
function firstDesk(): DeskId {
  const handed = findDesk(takeRequestedDesk());
  if (handed) return handed.id;
  const [, sub] = window.location.hash.slice(2).split('/');
  return findDesk(sub)?.id ?? 'survey';
}

export default function IntelligenceMode({ onReady, scope }: ModeViewProps) {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<EngineState>({ kind: 'checking' });
  const [desk, setDesk] = useState<DeskId>(firstDesk);
  // the desks opened so far, in the order they were opened: mounted, and kept
  const [opened, setOpened] = useState<DeskId[]>(() => [desk]);

  /* One controller for the life of the reality: leaving cancels every desk's requests.
     Held as state, not a ref — its signal is handed to every desk as it renders. */
  const [controller] = useState(() => new AbortController());
  const signal = controller.signal;

  /* Handovers: to a desk already open, at once; to one not yet opened, when it first renders. */
  const receivers = useRef(new Map<DeskId, (h: Handover) => void>());
  const pending = useRef(new Map<DeskId, Handover>());
  const moved = useRef(false); // whether the visitor has changed desk (focus follows only then)

  useEffect(() => {
    scope.add(() => controller.abort());
    const id = window.setTimeout(
      () => {
        setArmed(true);
        onReady(); // never waits on the engine: an absent engine is a state, not a hang
      },
      reduced ? 120 : 360,
    );
    return () => window.clearTimeout(id);
  }, [controller, onReady, reduced, scope]);

  /* ---- is the engine there? ---------------------------------------------- */
  useEffect(() => {
    // the first state is already CHECKING; the next arrives with the engine's answer
    let live = true;
    void (async () => {
      const found = await reach(signal);
      if (live && found) setState(found);
    })();
    return () => {
      live = false;
    };
  }, [signal]);

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    const found = await reach(signal);
    if (found) setState(found);
  }, [signal]);

  /* ---- desks -------------------------------------------------------------- */
  const go = useCallback((next: DeskId, handover?: Handover) => {
    // the desk moved to takes the keyboard at its heading — unless it was handed words
    // to finish, when it puts the caret there itself
    moved.current = handover?.question === undefined;
    setDesk(next);
    setOpened((prev) => (prev.includes(next) ? prev : [...prev, next]));
    if (!handover) return;
    const apply = receivers.current.get(next);
    if (apply) apply(handover);
    else pending.current.set(next, handover);
  }, []);

  const receive = useCallback((id: DeskId, apply: (h: Handover) => void) => {
    receivers.current.set(id, apply);
    return () => {
      if (receivers.current.get(id) === apply) receivers.current.delete(id);
    };
  }, []);

  const take = useCallback((id: DeskId) => {
    const handed = pending.current.get(id);
    pending.current.delete(id);
    return handed;
  }, []);

  // the address names the desk, replaced rather than pushed: Back leaves the reality;
  // and the index is told, for this session, which desks have been open
  useEffect(() => {
    markDeskVisited(desk);
    const url = `#/${MODE_ID}/${desk}`;
    if (window.location.hash !== url) window.history.replaceState(null, '', url);
  }, [desk]);

  // a desk the visitor moved to takes the keyboard; the first one does not steal it
  useEffect(() => {
    if (!moved.current) return;
    document.getElementById(`sv-desk-${desk}`)?.focus({ preventScroll: false });
  }, [desk]);

  return (
    <div className="sv" data-armed={armed ? 'true' : 'false'}>
      <header className="sv-head">
        <p className="t-mono t-mono-xs sv-head__title">
          <span className="t-signal">INTELLIGENCE</span>
          <span className="t-faint"> · </span>
          <span className="t-dim">THE COMMERCIAL INTELLIGENCE ENGINE, ON THIS MACHINE</span>
        </p>
        <p className="t-body-s sv-head__note">
          Every answer here is the engine’s: it asks public sources under their usage policies — the
          map, Overture’s places, brands’ own store locators, businesses’ own sites, public registries —
          and says what it found, with the evidence, and what it could not decide. The Lab keeps nothing.
        </p>
        <EngineLine state={state} onRetry={() => void check()} />
      </header>

      <nav className="sv-rail" aria-label="Desks">
        <ol>
          {DESKS.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="sv-rail__desk"
                aria-label={d.title}
                aria-current={desk === d.id ? 'page' : undefined}
                onClick={() => go(d.id)}
              >
                <span className="t-mono t-mono-xs sv-rail__n" aria-hidden="true">
                  {d.index}
                </span>
                <span className="t-mono t-mono-xs sv-rail__title">{d.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {opened.map((id) => {
        const View = DESK_VIEWS[id];
        const def = findDesk(id)!;
        const active = id === desk;
        return (
          <section
            key={id}
            className="sv-desk"
            hidden={!active}
            aria-labelledby={`sv-desk-${id}`}
            data-desk={id}
          >
            <header className="sv-desk__head">
              <h1
                id={`sv-desk-${id}`}
                className="t-display t-display-s sv-desk__title"
                tabIndex={-1}
              >
                <span className="t-mono t-mono-xs sv-desk__n">{def.index}</span> {def.title}
              </h1>
              <p className="t-body-s sv-desk__tagline">{def.tagline}</p>
              <p className="t-body-s t-dim sv-desk__desc">{def.description}</p>
            </header>
            <View engineState={state} signal={signal} go={go} active={active} receive={receive} take={take} />
          </section>
        );
      })}
    </div>
  );
}
