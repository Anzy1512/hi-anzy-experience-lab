import { useEffect, useState } from 'react';

import type { MapBody } from '../client.ts';
import { Measure, ServiceGate } from '../components.tsx';
import { useService } from '../state.ts';

/**
 * WHERE THE BUSINESSES ARE, AND HOW MANY ARE NOT ON THIS PLATE.
 *
 * ── AN HONEST MAP SHOWS ITS OWN GAPS ────────────────────────────────────────
 *
 * A map draws what it has coordinates for. Read without a count of what it
 * could not place, that reads as a complete picture of a territory, which is
 * the single most misleading thing this surface could do — a sparse plate looks
 * like a sparse market rather than like a thin dataset. So the unplaced count
 * sits beside the plate, at the same size, always.
 *
 * ── AND NOTHING HERE IS A BASEMAP ───────────────────────────────────────────
 *
 * There is no tile layer, no country outline, no projection beyond a linear
 * plot of the coordinates that exist. Borrowing a basemap would put a
 * cartographic authority behind a handful of points that came from whatever
 * pages happened to publish an address — and a plate with no coastline cannot
 * be mistaken for one.
 */
export function MapView(): React.JSX.Element {
  const { client } = useService();
  const [map, setMap] = useState<MapBody | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await client.get<MapBody>('/v1/map');
      if (res.ok) setMap(res.data);
    })();
  }, [client]);

  return (
    <ServiceGate>
      <section className="section section--wide">
        <h2 className="section__title">Located businesses</h2>
        {map === null ? (
          <p className="prose dim">Reading…</p>
        ) : (
          <>
            <p className="finding__meta">
              <Measure label="placed" value={map.located.length} />
              <Measure label="not placed" value={map.unlocated} />
            </p>
            <Plate map={map} selected={selected} onSelect={setSelected} />
            <p className="prose dim">{map.note}</p>
            {map.unlocated > 0 ? (
              <p className="prose dim">
                {map.unlocated} business{map.unlocated === 1 ? '' : 'es'} in the store{' '}
                {map.unlocated === 1 ? 'has' : 'have'} no resolved coordinate and {map.unlocated === 1 ? 'is' : 'are'}{' '}
                absent from this plate. A thin plate is a thin dataset before it is a thin market.
              </p>
            ) : null}
          </>
        )}
      </section>

      {map === null || map.located.length === 0 ? null : (
        <section className="section section--wide">
          <h2 className="section__title">The same list, readable</h2>
          {/* The plate is a picture; this is the accessible record of the same
              data, which is the version a screen reader and a keyboard get. */}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">Type</th>
                  <th scope="col">Place</th>
                  <th scope="col">Latitude</th>
                  <th scope="col">Longitude</th>
                </tr>
              </thead>
              <tbody>
                {map.located.map((l) => (
                  <tr key={l.id} onMouseEnter={() => setSelected(l.id)} onMouseLeave={() => setSelected(null)}>
                    <td>{l.name}</td>
                    <td>{l.type}</td>
                    <td>{[l.city, l.country].filter(Boolean).join(', ') || '—'}</td>
                    <td>{l.latitude.toFixed(4)}</td>
                    <td>{l.longitude.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ServiceGate>
  );
}

function Plate({
  map,
  selected,
  onSelect,
}: {
  map: MapBody;
  selected: string | null;
  onSelect: (id: string | null) => void;
}): React.JSX.Element {
  if (map.located.length === 0) {
    return (
      <div className="plate">
        <p className="plate__empty">
          No business in this store has a resolved coordinate yet.
          <br />
          Nothing is plotted rather than plotting a guess.
        </p>
      </div>
    );
  }

  const lats = map.located.map((l) => l.latitude);
  const lons = map.located.map((l) => l.longitude);
  /*
   * The extent, with a floor.
   *
   * Three businesses on one street have a span of a few thousandths of a
   * degree, and normalising to that spreads them across the plate as though
   * they were a region. The floor keeps a tight cluster looking like a cluster.
   */
  const pad = 0.02;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLon = Math.min(...lons) - pad;
  const maxLon = Math.max(...lons) + pad;
  const spanLat = Math.max(maxLat - minLat, 0.05);
  const spanLon = Math.max(maxLon - minLon, 0.05);

  return (
    <div className="plate" aria-hidden="true">
      {map.located.map((l) => (
        <span
          className="plate__mark"
          key={l.id}
          data-selected={selected === l.id}
          onMouseEnter={() => onSelect(l.id)}
          onMouseLeave={() => onSelect(null)}
          style={{
            left: `${((l.longitude - minLon) / spanLon) * 100}%`,
            /* North up: latitude increases as the plate goes up. */
            top: `${(1 - (l.latitude - minLat) / spanLat) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
