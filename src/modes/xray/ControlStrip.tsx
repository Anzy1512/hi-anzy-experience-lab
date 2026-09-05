import { useCallback, useRef } from 'react';
import { useStoreValue } from '../../core/store';
import { setPointerIntent } from '../../core/pointer';
import {
  applyPreset,
  PRESET_ALL,
  PRESET_DEFAULT,
  PRESET_MINIMAL,
  PRESET_OFF,
  toggleLayer,
  xrayStore,
} from './xrayStore';
import { LAYER_HOTKEY, LAYER_KEYS, LAYER_LABEL, type LayerKey } from './notation';
import type { PlateProcess } from '../../graphics/ContourPlate';

/**
 * THE CONTROL STRIP.
 *
 * A printer's control strip, not a settings modal — the strip of registration
 * targets, density steps and colour patches that rides along the trim edge of a
 * press sheet. Each diagnostic layer is a patch: filled when the plate is
 * printing, outlined when it is not.
 *
 * It is the reason the X-Ray controls feel like part of the instrument rather
 * than UI bolted onto it, and it is a genuinely appropriate metaphor rather than
 * a decorative one — see docs/EXPERIENCE_LAB_REFERENCES.md §9.
 */

const PROCESSES: PlateProcess[] = ['normal', 'mono', 'threshold', 'halftone', 'edge'];

interface Props {
  plateProcess: PlateProcess;
  onPlateProcess: (p: PlateProcess) => void;
  disabled: boolean;
}

export function ControlStrip({ plateProcess, onPlateProcess, disabled }: Props) {
  const layers = useStoreValue(xrayStore, (s) => s.layers);
  const selfAware = useStoreValue(xrayStore, (s) => s.selfAware);
  const taps = useRef(0);

  /* The one hidden interaction in Phase 1: turn the instrument on itself. */
  const onRegistrationClick = useCallback(() => {
    taps.current += 1;
    if (taps.current >= 3 && !xrayStore.get().selfAware) {
      xrayStore.set({ selfAware: true });
    }
  }, []);

  const hover = (intent: 'discover' | 'scan') => ({
    onPointerEnter: () => setPointerIntent(intent),
    onPointerLeave: () => setPointerIntent('scan'),
    onFocus: () => setPointerIntent(intent),
    onBlur: () => setPointerIntent('scan'),
  });

  return (
    <div
      className="xr-strip"
      data-disabled={disabled ? 'true' : 'false'}
      data-self={selfAware ? 'true' : 'false'}
      {...(selfAware ? { 'data-xr': 'control', 'data-xr-name': 'THE INSTRUMENT' } : {})}
    >
      {/* ---- registration target + density steps: real press furniture ---- */}
      <div className="xr-strip__reg">
        <button
          type="button"
          className="xr-strip__target"
          onClick={onRegistrationClick}
          aria-label="Registration target"
          {...hover('discover')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="12" cy="12" r="7.5" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="0" x2="12" y2="24" />
            <line x1="0" y1="12" x2="24" y2="12" />
          </svg>
        </button>
        <span className="xr-strip__steps" aria-hidden="true">
          {[0.18, 0.36, 0.54, 0.72, 1].map((v) => (
            <i key={v} style={{ opacity: v }} />
          ))}
        </span>
      </div>

      {/* ---- layer patches ------------------------------------------------ */}
      <fieldset className="xr-strip__patches" disabled={disabled}>
        <legend className="u-sr">Diagnostic layers</legend>
        {LAYER_KEYS.map((key: LayerKey) => (
          <button
            key={key}
            type="button"
            className="xr-patch"
            data-on={layers[key] ? 'true' : 'false'}
            aria-pressed={layers[key]}
            onClick={() => toggleLayer(key)}
            {...hover('discover')}
          >
            <span className="xr-patch__swatch" aria-hidden="true" />
            <span className="xr-patch__label t-mono t-mono-xs">{LAYER_LABEL[key]}</span>
            <span className="xr-patch__key t-mono t-mono-xs" aria-hidden="true">
              {LAYER_HOTKEY[key]}
            </span>
          </button>
        ))}
      </fieldset>

      {/* ---- plate processing --------------------------------------------- */}
      <div className="xr-strip__plate">
        <span className="t-mono t-mono-xs t-faint xr-strip__group-label">PLATE</span>
        <div className="xr-strip__processes">
          {PROCESSES.map((p) => (
            <button
              key={p}
              type="button"
              className="xr-proc t-mono t-mono-xs"
              data-on={plateProcess === p ? 'true' : 'false'}
              aria-pressed={plateProcess === p}
              onClick={() => onPlateProcess(p)}
              disabled={disabled}
              {...hover('discover')}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ---- presets ------------------------------------------------------- */}
      <div className="xr-strip__presets">
        <span className="t-mono t-mono-xs t-faint xr-strip__group-label">SET</span>
        <div className="xr-strip__preset-row">
          {(
            [
              ['ALL', PRESET_ALL],
              ['STD', PRESET_DEFAULT],
              ['MIN', PRESET_MINIMAL],
              ['OFF', PRESET_OFF],
            ] as const
          ).map(([label, preset]) => (
            <button
              key={label}
              type="button"
              className="xr-proc t-mono t-mono-xs"
              onClick={() => applyPreset(preset)}
              disabled={disabled}
              {...hover('discover')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selfAware && (
        <p className="xr-strip__self t-mono t-mono-xs" role="status">
          OBJ/000 — THE INSTRUMENT IS ALSO AN OBJECT
        </p>
      )}
    </div>
  );
}
