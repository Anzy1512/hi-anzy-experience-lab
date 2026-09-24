import { useMemo } from 'react';
import type { GeoJSONGeometry, ResultItem } from './engine';

/**
 * THE SURVEY PLATE.
 *
 * The area the engine searched, drawn as its own outline, and the businesses it
 * found placed on it — a flat plate, not a map: no tiles, no basemap, nothing
 * fetched. Matched businesses are solid marks, undetermined ones open marks, the
 * chosen one the signal. The outline is the engine's geometry; a place with no
 * location is not drawn anywhere, because a guessed position is an invented one.
 */

interface Props {
  area: GeoJSONGeometry | null;
  matched: ResultItem[];
  undetermined: ResultItem[];
  selected: string | null;
  label: string;
}

type Ring = [number, number][];

const WIDTH = 1000;
const MAX_VERTICES = 4000; // a state's boundary is drawn, not reproduced vertex for vertex

export function SurveyPlate({ area, matched, undetermined, selected, label }: Props) {
  const rings = useMemo(() => ringsOf(area), [area]);
  const marks = useMemo(
    () => [
      ...undetermined.filter((r) => r.location).map((r) => ({ r, open: true })),
      ...matched.filter((r) => r.location).map((r) => ({ r, open: false })),
    ],
    [matched, undetermined],
  );

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
      for (const { r } of marks) {
        lons.push(r.location!.lon);
        lats.push(r.location!.lat);
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
  }, [rings, marks]);

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
  const chosen = marks.find((m) => m.r.id === selected);

  return (
    <figure className="sv-plate">
      <svg
        viewBox={`-12 -12 ${WIDTH + 24} ${height + 24}`}
        role="img"
        aria-label={`${label}: ${marks.length} of the businesses read so far, placed`}
      >
        {outline && <path className="sv-plate__area" d={outline} />}
        {marks.map(({ r, open }) => (
          <circle
            key={r.id}
            className={open ? 'sv-plate__mark sv-plate__mark--open' : 'sv-plate__mark'}
            cx={x(r.location!.lon)}
            cy={y(r.location!.lat)}
            r={open ? 3.2 : 3.6}
          />
        ))}
        {chosen && (
          <circle
            className="sv-plate__chosen"
            cx={x(chosen.r.location!.lon)}
            cy={y(chosen.r.location!.lat)}
            r={11}
          />
        )}
      </svg>
      <figcaption className="t-mono t-mono-xs t-dim">
        {label.toUpperCase()} · {marks.length} PLACED · SOLID MATCHED · OPEN UNDETERMINED
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
