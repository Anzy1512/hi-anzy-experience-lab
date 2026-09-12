import { APP_SERVICE, FUTURE_PROCESSES, type AppId } from '../../content/os';
import { ArtifactBar } from '../../artifacts/ArtifactBar';
import { briefJson, briefMarkdown, resetBrief, useBrief } from '../../system/brief';
import { ProjectPanel } from './ProjectPanel';
import { DISCLAIMER } from '../../system/diagnose';
import { METHOD, NETWORK_CAPABILITIES, SERVICES } from '../../content/canonical';
import { MODES } from '../../content/lab';
import { STATUS_LABEL } from '../../experience/types';
import { SpecimenPlate } from '../../components/Specimen/SpecimenPlate';
import { specimen } from '../../content/specimens';
import type { CleanupScope } from '../../core/cleanup';
import type { OsLine } from './commands';

/**
 * APPLICATION CONTENT.
 *
 * Every resident process shows the consultancy's own service language. Nothing
 * here reports a client, an award, a metric, a testimonial or a result — the
 * OS describes what the company *does*, never what it claims to have achieved.
 *
 * SYSTEM.app is the exception in kind: it reports values this session actually
 * measured, which is the only reason it is allowed to speak in mono.
 *
 * ── WHY THERE ARE SIX BODIES AND NOT ONE ────────────────────────────────────
 *
 * There used to be one `ServiceBody` rendering four applications as the same
 * numbered list, which meant STRATEGY, DESIGN, TECHNOLOGY and NETWORK were the
 * same document with different nouns in it. Identity now comes from structure,
 * density and scale — a drawn overlay, a mounted specimen, a ruled schedule, a
 * printed directory, five punched leaves — and never from a colour theme.
 *
 * It also recovered content the flattening had thrown away. `MethodStage` has
 * carried three `outputs` per stage since Phase 6 and the METHOD sheet printed
 * none of them: five stages, fifteen concrete deliverables, collapsed into five
 * one-line strings because the sheet could only render pairs.
 */

function cat(slug: string) {
  return SERVICES.find((c) => c.slug === slug);
}

/* ==========================================================================
   STRATEGY.app — tracing stock

   A strategy is an overlay drawn on top of the business that already exists,
   so this sheet is the one you can see the bench through and the one that is
   drawn rather than typeset: a margin rule, construction numbers hanging in
   the margin, and the widest leading in the OS.
   ========================================================================== */
export function StrategyBody() {
  const c = cat(APP_SERVICE.strategy);
  if (!c) return null;
  return (
    <div className="os-app os-trace">
      <p className="t-mono t-mono-xs os-trace__label">
        {c.num} · {c.label}
      </p>
      <p className="t-body os-trace__copy">{c.copy}</p>
      <ol className="os-trace__list">
        {c.capabilities.map((k, i) => (
          <li key={k}>
            <span className="t-mono t-mono-xs os-trace__n">{String(i + 1).padStart(2, '0')}</span>
            <span className="t-body-s os-trace__k">{k}</span>
          </li>
        ))}
      </ol>
      <p className="t-mono t-mono-xs t-dim os-trace__foot">
        STAGE {c.stage} · TYPICALLY {c.typical.toUpperCase()}
      </p>
    </div>
  );
}

/* ==========================================================================
   DESIGN.app — mount board, with an aperture cut in it

   The one sheet holding a specimen, so the one sheet that needs a mount. The
   window is bevelled and the plate sits behind it on a dark backing board,
   which is how a piece of finished work is actually presented — and it is the
   only place in the OS where the bone stock is cut through.
   ========================================================================== */
export function DesignBody({
  specimenId,
  reduced,
  scope,
}: {
  specimenId?: string;
  reduced: boolean;
  scope: CleanupScope;
}) {
  const c = cat(APP_SERVICE.design);
  const spec = specimenId ? specimen(specimenId) : undefined;
  if (!c) return null;
  return (
    <div className="os-app os-mount">
      {spec && (
        <div className="os-mount__window">
          <SpecimenPlate
            id={spec.id}
            reduced={reduced}
            scope={scope}
            separation={0.75}
            width={230}
            maxHeight={252}
            marks={false}
            className="os-mount__plate"
          />
        </div>
      )}
      {spec && (
        <p className="t-mono t-mono-xs t-dim os-mount__accession">
          {spec.family} · {spec.w}×{spec.h} · COMPANY LIBRARY
        </p>
      )}
      <p className="t-mono t-mono-xs os-app__note">
        {c.num} · {c.label}
      </p>
      <p className="t-body os-mount__copy">{c.copy}</p>
      <ul className="os-mount__set">
        {c.capabilities.map((k) => (
          <li key={k} className="t-body-s">
            {k}
          </li>
        ))}
      </ul>
      <p className="t-mono t-mono-xs t-dim os-mount__foot">
        STAGE {c.stage} · TYPICALLY {c.typical.toUpperCase()}
      </p>
    </div>
  );
}

/* ==========================================================================
   TECHNOLOGY.app — engineering grid

   A specification is drawn on squared paper before it is anything else. This
   is the tightest sheet in the OS: a ruled schedule with dotted leaders, set
   small, on a grid that shows through the type.
   ========================================================================== */
export function TechnologyBody() {
  const c = cat(APP_SERVICE.technology);
  if (!c) return null;
  return (
    <div className="os-app os-sched">
      <p className="t-body-s os-sched__copy">{c.copy}</p>
      {/*
       * Two columns, not three.
       *
       * The first version ruled a dotted leader across to a right-hand column
       * carrying the stage — which is the same word on all ten rows. A column
       * that never varies is not data, it is a shape pretending to be one, and
       * a leader that guides the eye to it is worse than no leader. The stage
       * is stated once, in the caption, because it is true once.
       */}
      <table className="os-sched__table">
        <caption className="t-mono t-mono-xs t-dim os-sched__caption">
          {c.num} · {c.label} · SCHEDULE OF WORK · STAGE {c.stage}
        </caption>
        <tbody>
          {c.capabilities.map((k, i) => (
            <tr key={k}>
              <td className="t-mono t-mono-xs os-sched__n">{String(i + 1).padStart(2, '0')}</td>
              <td className="t-body-s os-sched__k">{k}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-mono t-mono-xs t-dim os-sched__foot">
        {c.capabilities.length} ITEMS · TYPICALLY {c.typical.toUpperCase()}
      </p>
    </div>
  );
}

/* ==========================================================================
   NETWORK.app — printed screen stock

   A directory is a printed object, so this one is set the way a trade
   directory is set: two columns, sixteen headings, the smallest type in the
   OS, on a dot screen. The cut-out specimen at the head is the argument — a
   network is people scissored out of their own contexts and brought into one.
   ========================================================================== */
export function NetworkBody({
  specimenId,
  reduced,
  scope,
}: {
  specimenId?: string;
  reduced: boolean;
  scope: CleanupScope;
}) {
  const c = cat(APP_SERVICE.network);
  const spec = specimenId ? specimen(specimenId) : undefined;
  if (!c) return null;
  const entries = Object.entries(NETWORK_CAPABILITIES);
  return (
    <div className="os-app os-dir">
      <div className="os-dir__head">
        {spec && (
          <SpecimenPlate
            id={spec.id}
            reduced={reduced}
            scope={scope}
            separation={0.5}
            width={132}
            maxHeight={176}
            marks={false}
            className="os-dir__plate"
          />
        )}
        <div>
          <p className="t-mono t-mono-xs os-app__note">
            {c.num} · {c.label}
          </p>
          <p className="t-body-s os-dir__copy">{c.copy}</p>
        </div>
      </div>
      <p className="t-mono t-mono-xs t-dim os-dir__label">
        {entries.length} DISCIPLINES · NOBODY IS NAMED
      </p>
      <ul className="os-dir__cols">
        {entries.map(([discipline, subs], i) => (
          <li key={discipline}>
            <span className="t-mono t-mono-xs os-dir__n">{String(i + 1).padStart(2, '0')}</span>
            <span className="t-mono t-mono-xs os-dir__k">{discipline.toUpperCase()}</span>
            <span className="os-dir__v">{subs.join(' · ')}</span>
          </li>
        ))}
      </ul>
      <p className="t-mono t-mono-xs t-dim os-dir__foot">
        STAGE {c.stage} · TYPICALLY {c.typical.toUpperCase()}
      </p>
    </div>
  );
}

/* ==========================================================================
   METHOD.app — punched leaves

   Five stages, so five leaves on one register spine rather than five rows in a
   list. The largest and most spaced sheet in the OS, and the one that finally
   prints the fifteen outputs the method actually names — the old pair-based
   sheet could not hold them.
   ========================================================================== */
export function MethodBody() {
  return (
    <div className="os-app os-leaves">
      {METHOD.map((m, i) => (
        <section className="os-leaf" key={m.label}>
          <div className="os-leaf__spine" aria-hidden="true">
            <span className="t-mono t-mono-xs">{String(i + 1).padStart(2, '0')}</span>
            <span className="os-leaf__reg" />
          </div>
          <div className="os-leaf__body">
            <h4 className="t-display t-display-s os-leaf__label">{m.label}</h4>
            <p className="t-body os-leaf__title">{m.title}</p>
            <ul className="os-leaf__outputs">
              {m.outputs.map((o) => (
                <li key={o} className="t-body-s">
                  {o}
                </li>
              ))}
            </ul>
            <p className="t-mono t-mono-xs t-dim os-leaf__dur">{m.duration.toUpperCase()}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

/* ==========================================================================
   SYSTEM.app — plain stock

   The only sheet with no stock character at all, and that is the argument: an
   instrument's own readout is uncoated, unruled and unscreened. Everything
   here was measured in this session, which is also why this is the one sheet
   set entirely in mono.
   ========================================================================== */
export function CapabilityBody({
  profile,
  webgl,
  viewport,
  sheets,
}: {
  profile: string;
  webgl: boolean;
  viewport: { w: number; h: number };
  sheets: number;
}) {
  const online = MODES.filter((m) => m.status === 'online');
  const brief = useBrief();
  const f = brief.frame;
  return (
    <div className="os-app">
      <p className="t-mono t-mono-xs t-dim os-app__note">
        MEASURED IN THIS SESSION. NOTHING BELOW IS STORED OR SENT.
      </p>

      {/*
        THE ASSEMBLY SURFACE.

        SYSTEM.app was a readout of the machine. It is also the sheet the rest
        of the bench reports to: whatever the Terminal framed, or the Agency
        Simulator ran, arrives here as one brief that can leave the building.
        It appears only once there is something to assemble — an empty
        scaffolding with placeholder headings would be the exact "beautiful
        screen with controls" this pass exists to remove.
      */}
      <h4 className="os-app__h t-mono t-mono-xs">PROJECT BRIEF</h4>
      {f ? (
        <>
          <dl className="os-kv">
            <Row k="STATED" v={f.statement} />
            <Row k="AREAS" v={f.areas.join(' · ')} />
            <Row k="SEQUENCE" v={f.sequence.map((m) => m.label).join(' → ')} />
            <Row k="CATEGORIES" v={String(f.services.length)} />
            <Row k="EVIDENCE REQUIRED" v={String(f.evidence.length)} />
            <Row k="OPEN QUESTIONS" v={String(f.questions.length)} />
            <Row k="FROM" v={(brief.origin ?? 'unknown').toUpperCase()} />
          </dl>
          <ArtifactBar
            formats={['copy', 'markdown', 'json']}
            label="THE BRIEF"
            build={() => ({
              name: 'Hi Anzy System Brief',
              text: briefMarkdown(brief),
              data: briefJson(brief),
            })}
          >
            <button
              type="button"
              className="t-mono t-mono-xs artifact__btn"
              onClick={resetBrief}
            >
              RESET
            </button>
          </ArtifactBar>
          <p className="t-body-s t-dim os-app__foot">{DISCLAIMER}</p>
        </>
      ) : (
        <p className="t-body-s t-dim os-app__foot">
          Nothing framed yet. In TERMINAL, type{' '}
          <span className="t-mono t-mono-xs">diagnose</span> followed by the situation in your
          own words, and it arrives here as a brief you can take away.
        </p>
      )}
      <dl className="os-kv">
        <Row k="RENDER PROFILE" v={profile.toUpperCase()} />
        <Row k="WEBGL" v={webgl ? 'AVAILABLE' : 'UNAVAILABLE'} />
        <Row k="VIEWPORT" v={`${viewport.w} × ${viewport.h}`} />
        <Row k="SHEETS OPEN" v={String(sheets)} />
        <Row k="NETWORK" v="NONE" />
        <Row k="STORAGE" v="NONE" />
      </dl>

      {/* What this session has produced, and what is waiting to be taken. */}
      <ProjectPanel />

      <h4 className="os-app__h t-mono t-mono-xs">REALITIES</h4>
      <ul className="os-list">
        {MODES.map((m) => (
          <li key={m.id} data-on={m.status === 'online' ? 'true' : 'false'}>
            <span className="t-mono t-mono-xs os-list__n">{m.index}</span>
            <span className="t-mono t-mono-s os-list__name">{m.title}</span>
            <span className="t-mono t-mono-xs os-list__status">{STATUS_LABEL[m.status]}</span>
          </li>
        ))}
      </ul>
      <p className="t-body-s t-dim os-app__foot">
        {online.length === MODES.length
          ? `All ${MODES.length} realities are enterable from this shell.`
          : `${online.length} of ${MODES.length} realities are enterable. The rest are roadmap entries, not software — this OS will not pretend to launch them.`}
      </p>

      <h4 className="os-app__h t-mono t-mono-xs">NOT RUNNING</h4>
      <p className="t-body-s t-dim">
        {FUTURE_PROCESSES.join(' · ')} are named in the plan and are not built.
      </p>
    </div>
  );
}

/* ==========================================================================
   TERMINAL — docket roll

   Output, torn off a continuous roll. The perforation down the left edge is
   the whole difference between a printout and a window.
   ========================================================================== */
export function TerminalBody({ lines }: { lines: OsLine[] }) {
  return (
    <div className="os-term">
      {lines.length === 0 ? (
        <p className="t-mono t-mono-xs t-faint">
          NO OUTPUT YET. TYPE <span className="t-signal">help</span> BELOW.
        </p>
      ) : (
        lines.map((l) => (
          <p key={l.id} className="os-term__line t-mono t-mono-xs" data-kind={l.kind}>
            {l.kind === 'in' && <span className="os-term__caret">{'›'} </span>}
            {l.text || ' '}
          </p>
        ))
      )}
    </div>
  );
}

/**
 * The one sheet a service application renders through.
 *
 * A router rather than a template: each capability application has its own
 * body above, and this only decides which. It exists so `OsMode` does not grow
 * a five-branch conditional in the middle of its render.
 */
export function ServiceBody({
  id,
  specimenId,
  reduced,
  scope,
}: {
  id: Exclude<AppId, 'terminal' | 'system'>;
  specimenId?: string;
  reduced: boolean;
  scope: CleanupScope;
}) {
  switch (id) {
    case 'strategy':
      return <StrategyBody />;
    case 'design':
      return <DesignBody specimenId={specimenId} reduced={reduced} scope={scope} />;
    case 'technology':
      return <TechnologyBody />;
    case 'network':
      return <NetworkBody specimenId={specimenId} reduced={reduced} scope={scope} />;
    case 'method':
      return <MethodBody />;
  }
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="os-kv__row">
      <dt className="t-mono t-mono-xs">{k}</dt>
      <dd className="t-mono t-mono-xs">{v}</dd>
    </div>
  );
}
