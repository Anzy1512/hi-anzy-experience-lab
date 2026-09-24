import { useEffect, useState } from 'react';

import type { Metrics, PilotCandidate, PilotDetail, PilotSummary } from '../client.ts';
import { Limitations, Measure, Notice, ServiceGate } from '../components.tsx';
import { formatCost, formatDuration, useService } from '../state.ts';

/**
 * A BOUNDED RUN AGAINST A REAL AREA.
 *
 * ── THE REJECTED CANDIDATES ARE THE MAIN TABLE ──────────────────────────────
 *
 * A pilot that lists only the businesses it researched is the most misleading
 * thing this surface could show. Sixteen breweries were found in Leeds; three
 * were researched; the other thirteen had no website anyone had recorded, sat
 * outside the radius, or fell past the subject cap. Show only the three and a
 * reader concludes something about the Leeds beer trade. Show all sixteen with
 * the reason beside each, and they learn something about the dataset instead —
 * which is the true thing.
 *
 * So `use` is the first column, the table is sorted by it, and the counts sit
 * above it at the same size as the subject count.
 *
 * ── AND THE FORM STATES ITS OWN CEILINGS ────────────────────────────────────
 *
 * Every budget is a field, because this page points a crawler at real
 * businesses and somebody has to be able to see, before pressing the button,
 * how many pages that will fetch and how much money it may spend. A run whose
 * limits live in configuration is a run nobody can consent to.
 */
export function Pilot(): React.JSX.Element {
  const { client } = useService();
  const [pilots, setPilots] = useState<PilotSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PilotDetail | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [name, setName] = useState('Leeds independent brewers');
  const [question, setQuestion] = useState('Audit the ecommerce capability of these breweries.');
  const [label, setLabel] = useState('Leeds city centre');
  const [lat, setLat] = useState(53.7965);
  const [lon, setLon] = useState(-1.5478);
  const [radiusKm, setRadiusKm] = useState(6);
  const [categories, setCategories] = useState('brewery');
  const [seeds, setSeeds] = useState('');
  const [maxSubjects, setMaxSubjects] = useState(3);
  const [maxSources, setMaxSources] = useState(12);
  const [maxCrawlDepth, setMaxCrawlDepth] = useState(1);
  const [maxModelCalls, setMaxModelCalls] = useState(0);

  useEffect(() => {
    void (async () => {
      const res = await client.get<{ pilots: PilotSummary[] }>('/v1/pilots');
      if (res.ok) setPilots(res.data.pilots);
    })();
  }, [client]);

  /** The same read, after a run. Called from a handler, never from an effect. */
  const load = async (): Promise<void> => {
    const res = await client.get<{ pilots: PilotSummary[] }>('/v1/pilots');
    if (res.ok) setPilots(res.data.pilots);
  };

  const open = async (id: string): Promise<void> => {
    setSelected(id);
    setDetail(null);
    setMetrics(null);
    const [d, m] = await Promise.all([
      client.get<PilotDetail>(`/v1/pilots/${id}`),
      client.get<Metrics>(`/v1/pilots/${id}/metrics`),
    ]);
    if (d.ok) setDetail(d.data);
    if (m.ok) setMetrics(m.data);
  };

  const create = async (): Promise<void> => {
    setBusy(true);
    setRefused(null);
    setNote(null);
    const spec = {
      name,
      question,
      area: { label, latitude: lat, longitude: lon, radiusKm },
      categories: categories
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c !== ''),
      seeds: seeds
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => s !== ''),
      budget: { maxSubjects, maxSources, maxCrawlDepth, maxModelCalls, maxSearches: 20, maxSeconds: 600 },
    };
    const created = await client.post<{ pilotId: string; note: string | null; willDiscover: boolean }>('/v1/pilots', spec);
    if (!created.ok) {
      setRefused(created.detail);
      setBusy(false);
      return;
    }
    setNote(created.data.note);
    const run = await client.post<unknown>(`/v1/pilots/${created.data.pilotId}/run`, { background: false });
    if (!run.ok) setRefused(run.detail);
    await load();
    await open(created.data.pilotId);
    setBusy(false);
  };

  return (
    <ServiceGate>
      <section className="section">
        <h2 className="section__title">Where to look</h2>
        <div className="row">
          <div className="field">
            <label className="field__label" htmlFor="p-name">
              Name for this run
            </label>
            <input id="p-name" className="field__input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="p-cat">
              Category (comma separated)
            </label>
            <input id="p-cat" className="field__input" value={categories} onChange={(e) => setCategories(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-q">
            The commercial question
          </label>
          <textarea id="p-q" className="field__area" value={question} onChange={(e) => setQuestion(e.target.value)} />
        </div>
        <p className="prose dim">
          Discovery has already happened by the time this question is asked, so it should be the characteristic question —
          what to determine about the businesses found — rather than another request to find them. A question that reads as
          both comes back refused with both readings named.
        </p>

        <div className="row">
          <div className="field">
            <label className="field__label" htmlFor="p-label">
              Area
            </label>
            <input id="p-label" className="field__input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="p-lat">
              Latitude
            </label>
            <input
              id="p-lat"
              className="field__input"
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setLat(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="p-lon">
              Longitude
            </label>
            <input
              id="p-lon"
              className="field__input"
              type="number"
              step="0.0001"
              value={lon}
              onChange={(e) => setLon(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="p-rad">
              Radius (km)
            </label>
            <input
              id="p-rad"
              className="field__input"
              type="number"
              min={1}
              max={50}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="p-seeds">
            Seed URLs (optional — used when no geographic provider is configured)
          </label>
          <input id="p-seeds" className="field__input" value={seeds} onChange={(e) => setSeeds(e.target.value)} />
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">What it may spend</h2>
        <div className="row">
          <div className="field">
            <label className="field__label" htmlFor="p-subj">
              Businesses at most
            </label>
            <input
              id="p-subj"
              className="field__input"
              type="number"
              min={1}
              max={100}
              value={maxSubjects}
              onChange={(e) => setMaxSubjects(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="p-src">
              Pages at most
            </label>
            <input
              id="p-src"
              className="field__input"
              type="number"
              min={1}
              max={500}
              value={maxSources}
              onChange={(e) => setMaxSources(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="p-depth">
              Depth (0 = the page only, 1 = + its sitemap)
            </label>
            <input
              id="p-depth"
              className="field__input"
              type="number"
              min={0}
              max={1}
              value={maxCrawlDepth}
              onChange={(e) => setMaxCrawlDepth(Math.max(0, Math.min(1, Number(e.target.value))))}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="p-model">
              Model calls allowed
            </label>
            <input
              id="p-model"
              className="field__input"
              type="number"
              min={0}
              max={50}
              value={maxModelCalls}
              onChange={(e) => setMaxModelCalls(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <button type="button" className="button" onClick={() => void create()} disabled={busy || question.trim().length < 3}>
            {busy ? 'Running' : 'Run pilot'}
          </button>
        </div>
        <p className="prose dim">
          This fetches pages from real businesses. Robots.txt decides every request, a refusal is recorded rather than worked
          around, and nothing here bypasses an access control.
        </p>
      </section>

      {refused !== null ? (
        <Notice title="Not run" refused>
          <p className="notice__body">{refused}</p>
        </Notice>
      ) : null}

      {note !== null ? (
        <Notice title="Nothing to look at">
          <p className="notice__body">{note}</p>
        </Notice>
      ) : null}

      {pilots === null ? null : pilots.length === 0 ? (
        <p className="prose dim">No pilot has been run against this service yet.</p>
      ) : (
        <section className="section section--wide">
          <h2 className="section__title">Runs</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">State</th>
                  <th scope="col">Area</th>
                  <th scope="col">Found</th>
                  <th scope="col">Researched</th>
                  <th scope="col">Geography</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {pilots.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td data-state={p.state === 'COMPLETE' ? 'DONE' : p.state === 'FAILED' ? 'FAILED' : 'PENDING'}>
                      {p.state}
                    </td>
                    <td>
                      {p.area === null ? '—' : `${p.area.label ?? ''} ${p.area.radiusKm}km`.trim()}
                    </td>
                    <td>{p.candidates}</td>
                    <td>{p.subjects}</td>
                    <td>{p.place_provider ?? '—'}</td>
                    <td>
                      <button type="button" className="button button--quiet" onClick={() => void open(p.id)}>
                        {selected === p.id ? 'Shown' : 'Open'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail === null ? null : <Candidates detail={detail} />}
      {metrics === null ? null : <MetricsSheet metrics={metrics} />}
    </ServiceGate>
  );
}

function Candidates({ detail }: { detail: PilotDetail }): React.JSX.Element {
  const byUse = new Map<string, PilotCandidate[]>();
  for (const c of detail.candidates) {
    const list = byUse.get(c.use) ?? [];
    list.push(c);
    byUse.set(c.use, list);
  }
  const subjects = byUse.get('SUBJECT') ?? [];
  const rest = [...byUse.entries()].filter(([use]) => use !== 'SUBJECT');

  return (
    <>
      <section className="section">
        <h2 className="section__title">{detail.pilot.name}</h2>
        <p className="finding__meta">
          <Measure label="candidates" value={detail.candidates.length} />
          <Measure label="researched" value={subjects.length} />
          <Measure label="not researched" value={detail.candidates.length - subjects.length} />
          <Measure label="runs" value={detail.runIds.length} />
          <span data-status={detail.pilot.state === 'BLOCKED' ? 'CONFLICTING' : undefined}>{detail.pilot.state}</span>
        </p>
        {detail.pilot.detail !== null ? <p className="finding__limits">{detail.pilot.detail}</p> : null}
        <p className="prose dim">{detail.note}</p>
      </section>

      <section className="section section--wide">
        <h2 className="section__title">Every candidate, and what became of it</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Outcome</th>
                <th scope="col">Name a provider gave</th>
                <th scope="col">Business resolved from the page</th>
                <th scope="col">Category</th>
                <th scope="col">Distance</th>
                <th scope="col">Precision</th>
                <th scope="col">Website candidate</th>
              </tr>
            </thead>
            <tbody>
              {[['SUBJECT', subjects] as const, ...rest].flatMap(([use, list]) =>
                list.map((c) => (
                  <tr key={c.external_id + use}>
                    <td data-state={use === 'SUBJECT' ? 'DONE' : 'SKIPPED'}>{use}</td>
                    <td>{c.name ?? '—'}</td>
                    {/* The distinction the whole design rests on: a mapper's
                        name is a claim by a stranger, and this column is what
                        the page itself turned out to say. */}
                    <td>{c.resolved_name ?? (use === 'SUBJECT' ? 'not resolved' : '—')}</td>
                    <td>{c.category ?? '—'}</td>
                    <td>{c.distance_km === null ? '—' : `${c.distance_km.toFixed(2)}km`}</td>
                    <td>{c.precision}</td>
                    <td>{c.website_candidate ?? '—'}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <p className="prose dim">
          A name in the third column means the crawler fetched that candidate&rsquo;s site and the entity pipeline decided,
          from the page&rsquo;s own evidence, which business it belongs to. A blank means it did not — a dead link in a map
          database looks exactly like this, and so does a site that refused to be read.
        </p>
      </section>
    </>
  );
}

/** Counts, in the instrument's voice, with nothing derived that cannot be. */
function MetricsSheet({ metrics }: { metrics: Metrics }): React.JSX.Element {
  const m = metrics;
  const bucket = (label: string, values: Record<string, number>): React.JSX.Element | null => {
    const entries = Object.entries(values);
    if (entries.length === 0) return null;
    return (
      <p className="finding__meta">
        <span className="dim">{label}</span>
        {entries.map(([k, v]) => (
          <Measure key={k} label={k} value={v} />
        ))}
      </p>
    );
  };

  return (
    <>
      <section className="section">
        <h2 className="section__title">Discovery</h2>
        <p className="finding__meta">
          <Measure label="candidates" value={m.discovery.candidatesDiscovered} />
          <Measure label="subjects" value={m.discovery.subjectsTaken} />
          <Measure label="urls discovered" value={m.discovery.urlsDiscovered} />
          <Measure label="sources accepted" value={m.discovery.sourcesAccepted} />
          <Measure label="sources rejected" value={m.discovery.sourcesRejected} />
          <Measure label="robots refusals" value={m.discovery.robotsRefusals} />
        </p>
        {bucket('not researched because', m.discovery.rejectedByReason)}
        {bucket('fetch outcomes', m.discovery.fetchOutcomes)}
      </section>

      <section className="section">
        <h2 className="section__title">Retrieval and evidence</h2>
        <p className="finding__meta">
          <Measure label="chunks considered" value={m.retrieval.chunksConsidered} />
          <Measure label="selected" value={m.retrieval.chunksSelected} />
          <Measure label="lexical" value={m.retrieval.lexicalContribution} />
          <Measure label="dense" value={m.retrieval.denseContribution} />
          <Measure label="evidence kept" value={`${m.retrieval.evidenceIncluded} of ${m.retrieval.evidenceConsidered}`} />
        </p>
        {bucket('evidence dropped because', m.retrieval.evidenceDroppedByReason)}
        <p className="finding__meta">
          <Measure label="findings" value={m.evidence.findings} />
          <Measure label="sourced" value={m.evidence.sourced} />
          <Measure label="unknown" value={m.evidence.unknown} />
          <Measure label="conflicting" value={m.evidence.conflicting} />
          <Measure label="rejected" value={m.evidence.unsupported} />
          <Measure label="citations" value={m.evidence.citations} />
          <Measure label="distinct sources" value={m.evidence.sourceDiversity} />
          <span data-status={m.evidence.citationFailures > 0 ? 'CONFLICTING' : undefined}>
            <span className="dim">uncited that should be cited </span>
            {m.evidence.citationFailures}
          </span>
        </p>
      </section>

      <section className="section">
        <h2 className="section__title">Entities and geography</h2>
        <p className="finding__meta">
          <Measure label="organisations" value={m.entity.organisations} />
          <Measure label="merged away" value={m.entity.merged} />
          <Measure label="left ambiguous" value={m.entity.ambiguous} />
          <Measure label="conflicting claims" value={m.entity.conflictingClaims} />
          <Measure label="single source" value={m.entity.singleSourceEntities} />
          <Measure label="placed" value={m.entity.located} />
          <Measure label="unplaced" value={m.entity.unplaced} />
        </p>
        {bucket('resolution decisions', m.entity.decisions)}
        {bucket('placed by', m.entity.geocodeProviders)}
        {bucket('to a precision of', m.entity.geocodePrecision)}
        <p className="prose dim">
          &ldquo;declared&rdquo; means the business&rsquo;s own page published coordinates. A provider name means a gazetteer
          was asked, and a match that resolved only to an area is recorded as unresolved rather than plotted.
        </p>
      </section>

      <section className="section">
        <h2 className="section__title">Model and cost</h2>
        <p className="finding__meta">
          <Measure label="model calls" value={m.model.calls} />
          <Measure label="live calls" value={m.model.liveCalls} />
          <Measure label="failed" value={m.model.failedCalls} />
          <Measure label="tokens" value={`${m.model.tokensIn}/${m.model.tokensOut}`} />
          <Measure label="cost" value={formatCost(m.model.costMicros)} />
          <Measure label="calls per answer" value={m.model.invocationRate === null ? '—' : m.model.invocationRate.toFixed(2)} />
          <Measure label="generations rejected" value={m.model.rejectedGenerations} />
        </p>
        <p className="finding__meta">
          <Measure label="runs" value={m.product.runs} />
          <Measure label="median" value={formatDuration(m.product.medianLatencyMs)} />
          <Measure label="slowest" value={formatDuration(m.product.maxLatencyMs)} />
          <Measure label="pages crawled" value={m.product.pagesCrawled} />
          <Measure label="searches" value={m.product.searches} />
        </p>
        <Limitations
          lines={[
            'No precision or recall is reported. Both need a set of findings a person has judged, and until reviews exist the only available denominator would be the set of findings the system itself chose.',
            'A cost of UNKNOWN means no price is configured for the model that answered. It does not mean the call was free.',
            'Calls per answer is reported because lower is better at equal quality. It is not a quality measure on its own.',
          ]}
        />
      </section>
    </>
  );
}
