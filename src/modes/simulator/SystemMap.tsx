import { SERVICES, SYSTEM_LOOP } from '../../content/canonical';
import { deriveSummary } from '../../content/derivedSummary';
import { CLUSTERS, SIM_COPY } from '../../content/simulator';
import { setPointerIntent } from '../../core/pointer';
import type { SystemReading } from './model';

/**
 * THE SYSTEM MAP — the output.
 *
 * Not a forty-page strategy and not a forecast. It states what the model read,
 * what it thinks leads, what depends on what, one possible order, and — the part
 * that matters most — what it does not know.
 *
 * Every word here is hedged on purpose: LIKELY, POSSIBLE, NEEDS VALIDATION,
 * OPEN QUESTION. There are no numbers, no percentages, no projected outcomes and
 * no claim that this is professional advice. A system map that overstated itself
 * would be worse than no system map.
 */

interface Props {
  reading: SystemReading;
  onDistrict: (districtId: string) => void;
}

const BAND_LABEL: Record<string, string> = {
  lead: 'LIKELY LEAD',
  supporting: 'SUPPORTING',
  watch: 'WATCH',
};

/** The real service category a cluster belongs to, named as the site names it. */
function categoryOf(slug: string): string {
  const cat = SERVICES.find((x) => x.slug === slug);
  return cat ? `${cat.num} ${cat.title.toUpperCase()} · ${cat.stage}` : '';
}

export function SystemMap({ reading, onDistrict }: Props) {
  const nameOf = (id: string) => CLUSTERS.find((c) => c.id === id)?.name ?? id;

  return (
    <section className="sim-map" aria-live="polite">
      <h2 className="t-display t-display-m sim-map__title">{SIM_COPY.mapTitle}</h2>

      {/* ---- priorities ---------------------------------------------------- */}
      <div className="sim-map__block">
        <p className="t-mono t-mono-xs t-dim sim-map__label">LIKELY PRIORITIES</p>
        <ul className="sim-bars">
          {reading.priorities.map((p) => (
            <li key={p.axis}>
              <span className="t-mono t-mono-xs sim-bars__name">{p.label}</span>
              <span className="sim-bars__track" aria-hidden="true">
                <span
                  className="sim-bars__fill"
                  style={{ width: `${Math.max(0, Math.min(100, p.value * 14))}%` }}
                />
              </span>
              <span className="t-mono t-mono-xs t-faint sim-bars__note">
                {p.value >= 4 ? 'STRONG' : p.value >= 2 ? 'PRESENT' : 'WEAK'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ---- capability clusters ------------------------------------------- */}
      <div className="sim-map__block">
        <p className="t-mono t-mono-xs t-dim sim-map__label">CAPABILITY CLUSTERS</p>
        <ul className="sim-clusters">
          {reading.clusters.map((c) => (
            <li className="sim-cluster" key={c.cluster.id} data-band={c.band}>
              <p className="sim-cluster__head">
                <span className="t-mono t-mono-xs sim-cluster__band">{BAND_LABEL[c.band]}</span>
                <span className="t-display t-display-s sim-cluster__name">{c.cluster.name}</span>
              </p>
              <p className="t-body-s t-dim sim-cluster__line">{c.cluster.line}</p>
              {/* Where this capability sits in the company's real service
                  taxonomy, so the reading connects to something buyable
                  rather than ending at a Lab-internal label. */}
              <p className="t-mono t-mono-xs t-faint sim-cluster__cat">
                {categoryOf(c.cluster.category)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* ---- DERIVED_SUMMARY -------------------------------------------------
           PackageBuilder's discipline, applied to a reading instead of a
           basket: what you touched, what method that implies, how long the
           company says that span takes — every one of them looked up rather
           than estimated — and then, in the same block and the same weight,
           the three things it cannot know. A summary that printed only the
           first half would be the exact lie the source component refuses. */}
      {(() => {
        const summary = deriveSummary(reading.clusters.map((c) => c.cluster.category));
        if (summary.systems.length === 0) return null;
        return (
          <div className="sim-map__block">
            <p className="t-mono t-mono-xs t-dim sim-map__label">
              WHAT THAT IMPLIES · DERIVED, NOT STORED
            </p>
            <dl className="sim-derived">
              <div>
                <dt className="t-mono t-mono-xs t-faint">SYSTEMS TOUCHED</dt>
                <dd className="t-body-s">{summary.systems.join(' · ')}</dd>
              </div>
              <div>
                <dt className="t-mono t-mono-xs t-faint">METHOD IMPLIED</dt>
                <dd className="t-mono t-mono-xs">{summary.stages.join(' → ')}</dd>
              </div>
              {summary.span && (
                <div>
                  <dt className="t-mono t-mono-xs t-faint">SPAN</dt>
                  <dd className="t-mono t-mono-xs">{summary.span}</dd>
                </div>
              )}
              <div>
                <dt className="t-mono t-mono-xs t-faint">NOT KNOWN HERE</dt>
                <dd className="t-body-s t-dim">{summary.unknown.join(' · ')}</dd>
              </div>
            </dl>
          </div>
        );
      })()}

      {/* ---- the loop -------------------------------------------------------
           `components/SystemDiagnostic.js` on the commercial site draws five
           parts of a business wired in a loop with one link that gives out, and
           states the point in a sentence this mode has been making since Phase
           3: nothing is broken on its own, the connection between two working
           things is what failed. The nodes and the failing hop are the site's,
           not the Lab's — SALES → OPS is where the source puts it.

           It sits above the reading's own dependencies because it is the frame
           they are read against, not a second opinion about this visitor. */}
      <div className="sim-map__block">
        <p className="t-mono t-mono-xs t-dim sim-map__label">THE LOOP</p>
        <ul className="sim-loop">
          {SYSTEM_LOOP.links.map(([from, to], i) => (
            <li
              className="t-mono t-mono-xs"
              key={`${from}-${to}`}
              data-failing={i === SYSTEM_LOOP.failingLink ? 'true' : 'false'}
            >
              <span>{from}</span>
              <span className="sim-loop__arrow" aria-hidden="true">
                {i === SYSTEM_LOOP.failingLink ? '⇢' : '→'}
              </span>
              <span>{to}</span>
              {i === SYSTEM_LOOP.failingLink && (
                <span className="t-signal sim-loop__note"> THE HOP THAT GIVES OUT</span>
              )}
            </li>
          ))}
        </ul>
        <p className="t-body-s t-dim sim-map__note">
          Nothing in that loop is broken on its own. What fails is the connection
          between two things that are each working.
        </p>
      </div>

      {/* ---- dependencies --------------------------------------------------- */}
      {reading.dependencies.length > 0 && (
        <div className="sim-map__block">
          <p className="t-mono t-mono-xs t-dim sim-map__label">DEPENDENCIES</p>
          <ul className="sim-deps">
            {reading.dependencies.map((d) => (
              <li className="t-mono t-mono-xs" key={`${d.from}-${d.to}`}>
                {nameOf(d.to)} <span className="t-faint">NEEDS</span>{' '}
                <span className="t-signal">{nameOf(d.from)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- sequence ------------------------------------------------------- */}
      <div className="sim-map__block">
        <p className="t-mono t-mono-xs t-dim sim-map__label">POSSIBLE SEQUENCE</p>
        <ol className="sim-seq">
          {reading.sequence.map((wave, i) => (
            <li key={i}>
              <span className="t-mono t-mono-xs t-faint sim-seq__n">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="t-mono t-mono-xs sim-seq__wave">
                {wave.map(nameOf).join(' · ')}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* ---- open questions — the most honest part of the output ----------- */}
      <div className="sim-map__block sim-map__block--open">
        <p className="t-mono t-mono-xs sim-map__label">OPEN QUESTIONS · NEEDS VALIDATION</p>
        <ul className="sim-open">
          {reading.openQuestions.map((q) => (
            <li className="t-body-s" key={q}>
              {q}
            </li>
          ))}
        </ul>
      </div>

      {reading.districts.length > 0 && (
        <div className="sim-map__block">
          <p className="t-mono t-mono-xs t-dim sim-map__label">IN THE TERRITORY</p>
          <button
            type="button"
            className="sim-act sim-act--signal"
            onClick={() => onDistrict(reading.districts[0])}
            onPointerEnter={() => setPointerIntent('enter')}
            onPointerLeave={() => setPointerIntent('default')}
          >
            VISIT {reading.districts.slice(0, 3).map((d) => d.toUpperCase()).join(' · ')}
          </button>
        </div>
      )}

      <p className="t-mono t-mono-xs t-faint sim-map__disclaimer">{SIM_COPY.disclaimer}</p>
    </section>
  );
}
