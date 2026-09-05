/**
 * X-RAY NOTATION
 *
 * An original vocabulary, drawn from print production and architectural
 * drafting rather than from science fiction. Every token below stands for a
 * value the instrument actually measured — there is no decorative notation in
 * this system, which is the whole reason it reads as an instrument.
 *
 *   OBJ/042      an inspected object, numbered in document order
 *   REG/03       a semantic region of the sheet
 *   PLATE 01     the composition being measured
 *   POS-X POS-Y  position, viewport pixels
 *   DIM-W DIM-H  measured box
 *   BASE         computed line box
 *   SET          font stack / size / weight, as resolved
 *   TRK          letter-spacing, as resolved
 *   COL          column index on the 12-column sheet
 *   PTR-V        pointer velocity, px/frame
 *   VIEW / DPR   viewport and device pixel ratio
 *   Z            inspection depth index
 */

export type ObjectKind = 'region' | 'display' | 'body' | 'mono' | 'image' | 'control';

export const KIND_LABEL: Record<ObjectKind, string> = {
  region: 'REGION',
  display: 'DISPLAY',
  body: 'BODY',
  mono: 'MONO',
  image: 'IMAGE',
  control: 'CONTROL',
};

export const pad = (n: number, width = 3) => String(Math.max(0, Math.round(n))).padStart(width, '0');

export const objectId = (n: number) => `OBJ/${pad(n)}`;
export const regionId = (n: number) => `REG/${pad(n, 2)}`;

/** Values are rounded on display only — the measurement itself stays exact. */
export const px = (n: number) => `${Math.round(n)}`;
export const px1 = (n: number) => n.toFixed(1);

export function formatSet(font: string, size: string, weight: string): string {
  const family = font.split(',')[0]?.replace(/["']/g, '').trim() ?? '—';
  return `${family.toUpperCase()} ${Math.round(parseFloat(size))}/${weight}`;
}

export function formatTracking(letterSpacing: string): string {
  if (!letterSpacing || letterSpacing === 'normal') return 'NORMAL';
  const n = parseFloat(letterSpacing);
  if (Number.isNaN(n)) return 'NORMAL';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}PX`;
}

export const LAYER_KEYS = [
  'grid',
  'box',
  'type',
  'space',
  'motion',
  'pointer',
  'structure',
  'render',
  'depth',
] as const;

export type LayerKey = (typeof LAYER_KEYS)[number];

export const LAYER_LABEL: Record<LayerKey, string> = {
  grid: 'GRID',
  box: 'BOX',
  type: 'TYPE',
  space: 'SPACE',
  motion: 'MOTION',
  pointer: 'POINTER',
  structure: 'STRUCT',
  render: 'RENDER',
  depth: 'DEPTH',
};

/** Number key that toggles each layer, shown on the control strip. */
export const LAYER_HOTKEY: Record<LayerKey, string> = {
  grid: '1',
  box: '2',
  type: '3',
  space: '4',
  motion: '5',
  pointer: '6',
  structure: '7',
  render: '8',
  depth: '9',
};
