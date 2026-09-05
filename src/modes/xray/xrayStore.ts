import { createStore } from '../../core/store';
import { LAYER_KEYS, type LayerKey } from './notation';

/**
 * X-Ray layer state.
 *
 * Kept out of React context so the control strip, the overlays and the keyboard
 * handler all read the same source without prop-drilling, and so a layer toggle
 * re-renders only what subscribes to that layer.
 */

export type LayerSet = Record<LayerKey, boolean>;

export interface XRayState {
  layers: LayerSet;
  /** Progressive entry step, 0..8. Layers stay gated until the sequence reaches them. */
  step: number;
  /** Held selection — clicking locks the scanner onto an object. */
  held: boolean;
  /** The easter egg: the instrument turning the instrument on itself. */
  selfAware: boolean;
}

const ALL_ON = Object.fromEntries(LAYER_KEYS.map((k) => [k, true])) as LayerSet;
const ALL_OFF = Object.fromEntries(LAYER_KEYS.map((k) => [k, false])) as LayerSet;

/** What the instrument shows by default: structure and measurement, not everything. */
export const PRESET_DEFAULT: LayerSet = {
  ...ALL_OFF,
  grid: true,
  box: true,
  type: true,
  space: true,
  pointer: true,
  structure: true,
};

export const PRESET_MINIMAL: LayerSet = {
  ...ALL_OFF,
  box: true,
  pointer: true,
};

export const PRESET_ALL: LayerSet = { ...ALL_ON };
export const PRESET_OFF: LayerSet = { ...ALL_OFF };

export const xrayStore = createStore<XRayState>({
  layers: { ...PRESET_DEFAULT },
  step: 0,
  held: false,
  selfAware: false,
});

export function toggleLayer(key: LayerKey) {
  const cur = xrayStore.get().layers;
  xrayStore.set({ layers: { ...cur, [key]: !cur[key] } });
}

export function applyPreset(preset: LayerSet) {
  xrayStore.set({ layers: { ...preset } });
}

export function setStep(step: number) {
  xrayStore.set({ step });
}

export function resetXRay() {
  xrayStore.set({ layers: { ...PRESET_DEFAULT }, step: 0, held: false, selfAware: false });
}

/** A layer draws only if it is enabled AND the entry sequence has reached it. */
export const LAYER_STEP: Record<LayerKey, number> = {
  grid: 2,
  box: 3,
  structure: 4,
  type: 5,
  space: 6,
  motion: 7,
  pointer: 8,
  render: 8,
  depth: 8,
};
