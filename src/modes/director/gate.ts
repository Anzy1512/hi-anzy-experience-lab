/**
 * THE GATE.
 *
 * Every shot used to play into `inset: 0` — the whole browser window, with the
 * composition floating somewhere in the middle of it and the rest left over.
 * That is a web page with type on it, not a film: nothing had an edge, so
 * nothing had a frame, so no shot could be composed against one.
 *
 * This is the aperture. Landscape holds a 2:1 gate; a phone holds 3:4, because
 * a letterbox slit on a portrait screen is a worse frame than no frame at all
 * and films have been reframed for vertical formats for as long as the formats
 * have existed. The size is computed here, in one place, and handed to CSS as
 * an inline style — so the lens maths and the drawn frame cannot drift apart,
 * and nothing has to measure the DOM to find out how big the picture is.
 */
export interface Gate {
  w: number;
  h: number;
  portrait: boolean;
}

export function gateFor(v: { w: number; h: number }): Gate {
  const portrait = v.w < 900;
  const ratio = portrait ? 3 / 4 : 2 / 1;
  // What is left after the act slug above and the transport below.
  const availH = Math.max(220, v.h - (portrait ? 236 : 268));
  const availW = Math.max(240, v.w - (portrait ? 32 : 104));
  const w = Math.min(availW, availH * ratio);
  return { w: Math.round(w), h: Math.round(w / ratio), portrait };
}
