import { useId } from 'react';

/**
 * THE RADIUS METER — how far around the place a survey reaches.
 *
 * One control, separate from the question and from the filters, because it is
 * a different kind of decision: not what to look for or what to require, but
 * where the edge of the search is. Its first stop is the place's own outline —
 * the engine's default, an area from the map rather than a circle — and every
 * stop after it is a circle around the place's centre, which the engine then
 * uses instead of the outline.
 *
 * A native range input, drawn with the Lab's tokens: a hairline track, a square
 * thumb, the value read out in the instrument's voice. The stops are not linear
 * — half a kilometre and fifty are both reasonable distances, and a linear scale
 * would spend most of its length on the ones nobody asks for. Arrow keys move one
 * stop; the readout is the accessible value.
 */

const STOPS: (number | null)[] = [
  null,
  0.5, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100,
];

export interface RadiusMeterProps {
  value: number | null;
  onChange: (km: number | null) => void;
  /** what the first stop means here: the place's outline, or the engine's default around a point */
  outlineLabel?: string;
  disabled?: boolean;
}

export default function RadiusMeter({ value, onChange, outlineLabel = 'ITS OUTLINE', disabled = false }: RadiusMeterProps) {
  const id = useId();
  const index = Math.max(0, STOPS.findIndex((s) => s === value));
  const readout = value === null ? outlineLabel : `${value % 1 === 0 ? value : value.toFixed(1)} KM AROUND`;
  return (
    <div className="sv-meter">
      <label className="t-mono t-mono-xs sv-label" htmlFor={id}>
        RADIUS
      </label>
      <input
        id={id}
        className="sv-meter__range"
        type="range"
        min={0}
        max={STOPS.length - 1}
        step={1}
        value={index}
        disabled={disabled}
        aria-valuetext={value === null ? outlineLabel.toLowerCase() : `${value} kilometres around the place`}
        onChange={(e) => onChange(STOPS[Number(e.target.value)] ?? null)}
      />
      <output className="t-mono t-mono-xs sv-meter__value" htmlFor={id} aria-live="polite">
        {readout}
      </output>
    </div>
  );
}
