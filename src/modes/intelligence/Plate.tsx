import { useMemo } from 'react';
import type { GeoJSONGeometry } from './engine';

/**
 * THE PLATE.
 *
 * An area the engine resolved, drawn as its own outline, and whatever was found
 * in it placed on it — a flat plate, not a map: no tiles, no basemap, nothing
 * fetched. Solid marks are the ones that answered the question, open marks the
 * ones that could not be decided, and the chosen one is the signal. The outline
 * is the engine's geometry; a thing with no location is not drawn anywhere,
 * because a guessed position is an invented one.
 */

export interface Mark {
  id: string;
  lat: number;
  lon: number;
  /** Open: undecided, or simply not the thing asked about. */
  open?: boolean;
}

interface Props {
  area: GeoJSONGeometry | null;
  marks: Mark[];
  selected?: string | null;
  label: string;
  /** What solid and open mean here, in words. */
  legend?: string;
}

type Ring = [number, number][];

const WIDTH = 1000;
const MAX_VERTICES = 4000; // a state's boundary is drawn, not reproduced vertex for vertex

export function Plate({ area, marks, selected = null, label, legend }: Props) {
  const rings = useMemo(() => ringsOf(area), [area]);
  // open marks first, so the solid ones are printed over them
  const ordered = useMemo(() => [...marks.filter((m) => m.open), ...marks.filter((m) => !m.open)], [marks]);

  const frame = useMemo(() => {
    const lons: number[] = [];
    const lats: number[] = [];
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        lons.push(lon);
        lats.push(lat);
      }
    }
    if (lons.length === 0) {
      for (const m of ordered) {
        lons.push(m.lon);
        lats.push(m.lat);
      }
    }
    if (lons.length === 0) return null;
    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const k = Math.cos((((north + south) / 2) * Math.PI) / 180);
    const spanX = Math.max((east - west) * k, 1e-6);
    const spanY = Math.max(north - south, 1e-6);
    const scale = WIDTH / spanX;
    const height = Math.max(160, Math.min(1400, spanY * scale));
    const sy = height / spanY;
    const x = (lon: number) => (lon - west) * k * scale;
    const y = (lat: number) => (north - lat) * sy;
    return { x, y, height };
  }, [rings, ordered]);

  if (!frame) {
    return (
      <figure className="sv-plate">
        <p className="t-body-s t-dim">Nothing placed to draw.</p>
      </figure>
    );
  }
  const { x, y, height } = frame;
  const outline = rings
    .map((ring) => ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${x(lon).toFixed(1)},${y(lat).toFixed(1)}`).join('') + 'Z')
    .join('');
  const chosen = ordered.find((m) => m.id === selected);

  return (
    <figure className="sv-plate">
      <svg viewBox={`-12 -12 ${WIDTH + 24} ${height + 24}`} role="img" aria-label={`${label}: ${ordered.length} placed`}>
        {outline && <path className="sv-plate__area" d={outline} />}
        {ordered.map((m) => (
          <circle
            key={m.id}
            className={m.open ? 'sv-plate__mark sv-plate__mark--open' : 'sv-plate__mark'}
            cx={x(m.lon)}
            cy={y(m.lat)}
            r={m.open ? 3.2 : 3.6}
          />
        ))}
        {chosen && <circle className="sv-plate__chosen" cx={x(chosen.lon)} cy={y(chosen.lat)} r={11} />}
      </svg>
      <figcaption className="t-mono t-mono-xs t-dim">
        {label.toUpperCase()} · {ordered.length} PLACED{legend ? ` · ${legend}` : ''}
      </figcaption>
    </figure>
  );
}

function ringsOf(geometry: GeoJSONGeometry | null): Ring[] {
  if (!geometry) return [];
  const rings: Ring[] = [];
  const coords = geometry.coordinates;
  if (geometry.type === 'Polygon') rings.push(...(coords as Ring[]));
  else if (geometry.type === 'MultiPolygon') for (const poly of coords as Ring[][]) rings.push(...poly);
  const total = rings.reduce((n, r) => n + r.length, 0);
  if (total <= MAX_VERTICES) return rings;
  const step = Math.ceil(total / MAX_VERTICES);
  return rings.map((r) => r.filter((_, i) => i % step === 0 || i === r.length - 1)).filter((r) => r.length > 2);
}
