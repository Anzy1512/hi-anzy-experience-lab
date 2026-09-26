import { useEffect, useMemo, useState } from 'react';
import RadiusMeter from '../RadiusMeter';
import {
  engine,
  type CatalogueCategory,
  type CatalogueFilter,
  type CatalogueGroup,
  type FormFilter,
  type SearchForm,
} from '../engine';

/**
 * SURVEY BY CATEGORY — the same survey, asked without a sentence (D-066).
 *
 * The visitor picks kinds of business from the engine's catalogue (about a
 * thousand, in eighteen sector groups), a place, and filters: first the ones
 * that apply to those kinds — what their places are recorded with — then the
 * ones that apply to any business. The engine turns the form into the same
 * specification a question becomes, so what follows is the survey the question
 * box starts: the same stages, ledger, relations, review and export.
 *
 * Nothing here is the Lab's own knowledge: every category, filter, option and
 * count is the engine's, asked for as the visitor chooses. Each answer is kept
 * with what it answered, and shown only while that is still what is asked.
 */

const MAX_KINDS = 3;

type Choice = 'any' | 'yes' | 'no';
interface Chosen {
  yesNo: Record<string, Choice>;
  options: Record<string, string[]>;
  min: Record<string, string>;
  max: Record<string, string>;
  values: Record<string, string>;
}
const NONE: Chosen = { yesNo: {}, options: {}, min: {}, max: {}, values: {} };

/** an answer from the engine, with the words, kinds or form it answered */
interface Keyed<T> {
  key: string;
  value: T;
}

export interface CategoryAskProps {
  ready: boolean;
  signal: AbortSignal;
  /** a place handed over from AREAS or LOCATORS */
  initialPlace: string | null;
  /** the form as it stands, or null while it cannot be asked yet */
  onForm: (form: SearchForm | null) => void;
}

export default function CategoryAsk({ ready, signal, initialPlace, onForm }: CategoryAskProps) {
  const [catalogue, setCatalogue] = useState<{ groups: CatalogueGroup[]; total: number } | null>(null);
  const [group, setGroup] = useState('');
  const [words, setWords] = useState('');
  const [found, setFound] = useState<Keyed<CatalogueCategory[]> | null>(null);
  const [kinds, setKinds] = useState<CatalogueCategory[]>([]);
  const [place, setPlace] = useState(initialPlace ?? '');
  const [radius, setRadius] = useState<number | null>(null);
  const [filters, setFilters] = useState<Keyed<CatalogueFilter[]> | null>(null);
  const [chosen, setChosen] = useState<Chosen>(NONE);
  const [reading, setReading] = useState<Keyed<{ description: string; warnings: string[] }> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /* ---- the sector groups, once ----------------------------------------------- */
  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const got = await engine.catalogue(signal);
      if (got.ok) setCatalogue({ groups: got.value.groups, total: got.value.categories });
      else if (got.problem !== 'cancelled') setProblem(got.problem);
    })();
  }, [ready, signal]);

  /* ---- kinds of business, as the visitor types -------------------------------- */
  const searchKey = `${group}|${words.trim().toLowerCase()}`;
  const searching = ready && (words.trim().length >= 2 || group !== '');
  useEffect(() => {
    if (!searching) return;
    const id = window.setTimeout(() => {
      void (async () => {
        const got = await engine.catalogueCategories(words.trim(), group || null, group ? 60 : 8, signal);
        if (got.ok) setFound({ key: searchKey, value: got.value });
      })();
    }, 250);
    return () => window.clearTimeout(id);
  }, [group, searchKey, searching, signal, words]);
  const shown = searching && found?.key === searchKey ? found.value : [];

  /* ---- the filters that apply to the kinds chosen ----------------------------- */
  const kindIds = useMemo(() => kinds.map((k) => k.id), [kinds]);
  const kindsKey = kindIds.join(',');
  useEffect(() => {
    if (!ready || kindIds.length === 0) return;
    void (async () => {
      const got = await engine.catalogueFilters(kindIds, signal);
      if (got.ok) setFilters({ key: kindIds.join(','), value: got.value });
      else if (got.problem !== 'cancelled') setProblem(got.problem);
    })();
  }, [kindIds, ready, signal]);
  const applicable = useMemo(
    () => (kindIds.length > 0 && filters?.key === kindsKey ? filters.value : []),
    [filters, kindIds.length, kindsKey],
  );

  /* ---- the form, and how the engine reads it ----------------------------------- */
  const form = useMemo<SearchForm | null>(() => {
    if (kindIds.length === 0 || place.trim().length < 2) return null;
    const asked: FormFilter[] = [];
    for (const f of applicable) {
      const yn = chosen.yesNo[f.id];
      if ((f.kind === 'yes_no' || f.kind === 'presence') && yn && yn !== 'any') {
        asked.push({ filter: f.id, op: yn === 'yes' ? 'is' : 'is_not', value: true });
      }
      const opts = chosen.options[f.id];
      if (f.kind === 'options' && opts?.length) asked.push({ filter: f.id, op: 'any_of', value: opts });
      const value = chosen.values[f.id];
      if (f.kind === 'values' && value) asked.push({ filter: f.id, op: 'any_of', value: [value] });
      if (f.kind === 'number') {
        const lo = Number.parseFloat(chosen.min[f.id] ?? '');
        const hi = Number.parseFloat(chosen.max[f.id] ?? '');
        if (Number.isFinite(lo)) asked.push({ filter: f.id, op: 'at_least', value: lo });
        if (Number.isFinite(hi)) asked.push({ filter: f.id, op: 'at_most', value: hi });
      }
    }
    return {
      categories: kindIds,
      place: place.trim(),
      ...(radius !== null ? { radius_km: radius } : {}),
      filters: asked,
    };
  }, [applicable, chosen, kindIds, place, radius]);
  const formKey = form ? JSON.stringify(form) : '';

  useEffect(() => onForm(form), [form, onForm]);

  useEffect(() => {
    if (!ready || !form) return;
    const id = window.setTimeout(() => {
      void (async () => {
        const got = await engine.cataloguePreview(form, signal);
        if (got.ok) setReading({ key: formKey, value: got.value });
        else if (got.problem !== 'cancelled') setReading({ key: formKey, value: { description: '', warnings: [got.problem] } });
      })();
    }, 300);
    return () => window.clearTimeout(id);
  }, [form, formKey, ready, signal]);
  const read = form && reading?.key === formKey ? reading.value : null;

  const pick = (c: CatalogueCategory) => {
    setKinds((ks) => (ks.some((k) => k.id === c.id) || ks.length >= MAX_KINDS ? ks : [...ks, c]));
    setWords('');
  };
  const drop = (id: string) => {
    setKinds((ks) => ks.filter((k) => k.id !== id));
    setChosen(NONE);
  };
  const set = <K extends keyof Chosen>(key: K, id: string, value: Chosen[K][string]) =>
    setChosen((c) => ({ ...c, [key]: { ...c[key], [id]: value } }));

  const groups = catalogue?.groups ?? [];
  const specific = applicable.filter((f) => f.applies_to !== null);
  const general = applicable.filter((f) => f.applies_to === null);

  return (
    <>
      <h3 className="t-mono t-mono-xs sv-step">1 · WHAT</h3>
      <div className="sv-ask__row">
        <label className="t-mono t-mono-xs sv-field">
          SECTOR
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">EVERY SECTOR</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label.toUpperCase()} · {g.categories}
              </option>
            ))}
          </select>
        </label>
        {catalogue && (
          <p className="t-mono t-mono-xs sv-place">
            <span className="t-faint">THE ENGINE KNOWS </span>
            {catalogue.total.toLocaleString('en-IN')}
            <span className="t-faint"> KINDS OF BUSINESS</span>
          </p>
        )}
      </div>
      <label className="t-mono t-mono-xs sv-label" htmlFor="sv-kind">
        KIND OF BUSINESS
      </label>
      <input
        id="sv-kind"
        className="sv-question"
        type="text"
        value={words}
        maxLength={100}
        autoComplete="off"
        spellCheck={false}
        placeholder={kinds.length >= MAX_KINDS ? `up to ${MAX_KINDS} kinds` : 'dentist, atm, banquet hall, tyre shop…'}
        disabled={kinds.length >= MAX_KINDS}
        onChange={(e) => setWords(e.target.value)}
      />
      {shown.length > 0 && kinds.length < MAX_KINDS && (
        <ul className="sv-examples" aria-label="Kinds of business the engine knows">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" className="sv-example t-body-s" onClick={() => pick(c)}>
                {c.label}
                {c.overture_places_in > 0 && (
                  <span className="t-mono t-mono-xs t-faint">
                    {' '}
                    · {c.overture_places_in.toLocaleString('en-IN')} IN INDIA
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {kinds.map((k) => (
        <p key={k.id} className="t-mono t-mono-xs sv-place">
          <span className="t-faint">KIND · </span>
          {k.label.toUpperCase()}
          <span className="t-faint">
            {' '}
            — {(groups.find((g) => g.id === k.group)?.label ?? k.group).toUpperCase()} · ASKED OF{' '}
            {k.sources.map((s) => (s === 'openstreetmap' ? 'OPENSTREETMAP' : 'OVERTURE')).join(' AND ') ||
              'NAMES ONLY'}{' '}
            ·{' '}
          </span>
          <button type="button" className="sv-link" onClick={() => drop(k.id)}>
            DROP IT
          </button>
        </p>
      ))}

      <h3 className="t-mono t-mono-xs sv-step">2 · WHERE</h3>
      <div className="sv-ask__row sv-ask__row--where">
        <label className="t-mono t-mono-xs sv-field">
          PLACE
          <input
            className="sv-field__wide"
            type="text"
            value={place}
            maxLength={200}
            placeholder="NOIDA, 201301, GOA…"
            onChange={(e) => setPlace(e.target.value)}
          />
        </label>
        <RadiusMeter value={radius} onChange={setRadius} />
      </div>

      <h3 className="t-mono t-mono-xs sv-step">3 · CRITERIA</h3>
      {kinds.length === 0 && (
        <p className="t-mono t-mono-xs sv-place">
          <span className="t-faint">THE FILTERS THAT APPLY APPEAR ONCE A KIND OF BUSINESS IS CHOSEN</span>
        </p>
      )}

      {specific.length > 0 && (
        <details className="sv-done" open>
          <summary className="t-mono t-mono-xs">WHAT THESE PLACES ARE RECORDED WITH · {specific.length}</summary>
          <Filters filters={specific} chosen={chosen} set={set} />
        </details>
      )}
      {general.length > 0 && (
        <details className="sv-done">
          <summary className="t-mono t-mono-xs">ANY BUSINESS · {general.length}</summary>
          <Filters filters={general} chosen={chosen} set={set} />
        </details>
      )}

      <p className="t-mono t-mono-xs sv-reading" aria-live="polite">
        {read?.description ? (
          <>
            <span className="t-faint">READ AS · </span>
            {read.description}
          </>
        ) : (
          <span className="t-faint">
            READ AS · {kinds.length === 0 ? 'PICK A KIND OF BUSINESS' : form ? '—' : 'NAME A PLACE'}
          </span>
        )}
      </p>
      {read?.warnings.map((w) => (
        <p key={w} className="t-mono t-mono-xs sv-reading">
          <span className="t-faint">NOTE · </span>
          {w}
        </p>
      ))}
      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}
    </>
  );
}

function Filters({
  filters,
  chosen,
  set,
}: {
  filters: CatalogueFilter[];
  chosen: Chosen;
  set: <K extends keyof Chosen>(key: K, id: string, value: Chosen[K][string]) => void;
}) {
  return (
    <div className="sv-ask__row sv-filters">
      {filters.map((f) => {
        if (f.kind === 'yes_no' || f.kind === 'presence') {
          return (
            <label key={f.id} className="t-mono t-mono-xs sv-field">
              {f.label.toUpperCase()}
              <select value={chosen.yesNo[f.id] ?? 'any'} onChange={(e) => set('yesNo', f.id, e.target.value as Choice)}>
                <option value="any">EITHER</option>
                <option value="yes">{f.kind === 'presence' ? 'HAS ONE' : 'YES'}</option>
                <option value="no">{f.kind === 'presence' ? 'HAS NONE' : 'NO'}</option>
              </select>
            </label>
          );
        }
        if (f.kind === 'number') {
          return (
            <fieldset key={f.id} className="t-mono t-mono-xs sv-field sv-filters__set">
              <legend>
                {f.label.toUpperCase()}
                {f.unit && f.unit.toLowerCase() !== f.label.toLowerCase() ? ` (${f.unit.toUpperCase()})` : ''}
              </legend>
              <input
                type="number"
                inputMode="decimal"
                placeholder="AT LEAST"
                aria-label={`${f.label} at least`}
                value={chosen.min[f.id] ?? ''}
                onChange={(e) => set('min', f.id, e.target.value)}
              />
              <input
                type="number"
                inputMode="decimal"
                placeholder="AT MOST"
                aria-label={`${f.label} at most`}
                value={chosen.max[f.id] ?? ''}
                onChange={(e) => set('max', f.id, e.target.value)}
              />
            </fieldset>
          );
        }
        if (f.kind === 'values') {
          return (
            <label key={f.id} className="t-mono t-mono-xs sv-field">
              {f.label.toUpperCase()}
              <select value={chosen.values[f.id] ?? ''} onChange={(e) => set('values', f.id, e.target.value)}>
                <option value="">ANY</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        const on = chosen.options[f.id] ?? [];
        return (
          <fieldset key={f.id} className="t-mono t-mono-xs sv-filters__set sv-filters__options">
            <legend>{f.label.toUpperCase()} · ANY OF</legend>
            {f.options.map((o) => (
              <label key={o.value} className="sv-check">
                <input
                  type="checkbox"
                  checked={on.includes(o.value)}
                  onChange={(e) =>
                    set('options', f.id, e.target.checked ? [...on, o.value] : on.filter((v) => v !== o.value))
                  }
                />
                {o.label.toUpperCase()}
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}
