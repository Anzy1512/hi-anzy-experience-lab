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
            </li>
          ))}
        </ul>
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
