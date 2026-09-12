/**
 * THE COMPILER DOCUMENT.
 *
 * A short authored composition, built to be read flat and to compile well. The
 * six stages are the real progression from the source deck (Vision → Strategy →
 * Identity → Digital → Launch → Growth) with their own one-line definitions;
 * everything else is original Lab copy.
 *
 * Nothing here asserts a client, a result, a metric or a partnership.
 *
 * Why this content: a *sequence* is the right thing to spatialise. Six stages
 * read top-to-bottom on the page become six planes read front-to-back in space,
 * so the document's reading order literally becomes the world's depth order. The
 * transformation is legible because the content already had a direction.
 */

export const COMPILER_DOC_LEGACY = {
  plate: 'DOCUMENT 01',
  kicker: 'THE METHOD',
  title: 'HI ANZY',
  standfirst:
    'A method is a shape. Read down a page it looks like a list; walked through, it turns out to have been a corridor the whole time.',

  stages: [
    { n: '01', name: 'VISION', line: 'Understand ambition and market.' },
    { n: '02', name: 'STRATEGY', line: 'Define positioning and roadmap.' },
    { n: '03', name: 'IDENTITY', line: 'Visualise ideas and framework.' },
    { n: '04', name: 'DIGITAL', line: 'Build ecosystem and channels.' },
    { n: '05', name: 'LAUNCH', line: 'Create buzz and awareness.' },
    { n: '06', name: 'GROWTH', line: 'Scale with advanced levers.' },
  ],

  capabilities: [
    'STRATEGY',
    'DESIGN',
    'TECHNOLOGY',
    'DIGITAL',
    'SOCIAL',
    'PRODUCTION',
    'CREATORS',
    'MEDIA',
    'REPUTATION',
  ],

  figureCaption: 'FIG. 02 — CONTOUR FIELD. THE SAME SEEDED PLATE X-RAY MEASURES.',
  colophon:
    'SET IN RAJDHANI AND IBM PLEX · TEN PLANES · MEASURED AS LAYOUT, NOT AS PIXELS · THE TEXT YOU ARE READING IS THE TEXT IN THE WORLD',
} as const;

export const COMPILER_COPY = {
  title: 'REALITY COMPILER',
  tagline: 'TURN THE INTERFACE INTO A WORLD.',
  hintPointer: 'SCROLL OR DRAG TO COMPILE · ↑↓ TO STEP',
  hintTouch: 'SWIPE UP TO COMPILE',
  returnLabel: 'RETURN TO DOCUMENT',
  enterWorld: 'ENTER THE WORLD',
  fallback:
    'The structural layer needs WebGL, which is unavailable here. The document still compiles into depth — the scaffolding around it is simply not drawn.',
  sourceLabel: 'COMPILING',
  manifestLabel: 'THE TRANSFORMATION MANIFEST',
} as const;
