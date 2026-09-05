import { MODES } from './lab';
import { METHOD, POSITION, SERVICES } from './canonical';

/**
 * ONE SOURCE, SEVEN INTERFACES.
 *
 * The whole argument of Time Machine is that **content persists and interfaces
 * change**, so the content exists exactly once, here, and every era renders
 * this same object. There is no per-era copy anywhere in the mode — if a line
 * needs editing it is edited once and all seven eras change together, which is
 * the only way the demonstration is honest.
 */

export const SOURCE = {
  company: 'HI ANZY',
  statement: POSITION.statement,
  blurb:
    'A creative consultancy that works as one system rather than four suppliers: strategy, design, technology and culture assembled per problem.',
  /** The real method. Seven interfaces render this one array. */
  method: METHOD.map((m) => ({ name: m.label, line: `${m.title} ${m.page}` })),
  /** The real service taxonomy, shortened to what an era can show. */
  services: SERVICES.map((c) => ({ name: c.title.toUpperCase(), line: c.copy })),
  /** The index, read live — so even the past eras report the real state. */
  get realities() {
    return MODES.map((m) => ({ index: m.index, title: m.title, online: m.status === 'online' }));
  },
} as const;

export type EraId = '1995' | '2000' | '2007' | '2015' | '2020' | '2026' | '2035';

export interface Era {
  id: EraId;
  label: string;
  /** What actually changes, beyond paint. */
  navigation: string;
  interaction: string;
  layout: string;
  typography: string;
  note: string;
}

/**
 * Each era is characterised by its **interaction model** first. A theme swap is
 * not a time machine; what dates an interface is how you are expected to move
 * through it, and what the machine was assumed to be able to do.
 */
export const ERAS: Era[] = [
  {
    id: '1995',
    label: '1995',
    navigation: 'Hyperlinks. Every view is a separate document you navigate to and come back from.',
    interaction: 'Click and wait. No hover state, no state at all — the page is a printed thing that arrives.',
    layout: 'Flow. One column, whatever width the window happens to be.',
    typography: 'System serif at the browser default. Size is a suggestion.',
    note: 'The back button is the primary interface element. Nothing is retained between views because there is nowhere to retain it.',
  },
  {
    id: '2000',
    label: '2000',
    navigation: 'A persistent menu beside a content pane — the frameset habit, kept after frames.',
    interaction: 'Rollovers. The interface acknowledges the pointer for the first time.',
    layout: 'Fixed 760px, centred, because the monitor is 800×600.',
    typography: 'Verdana at 11px. Anti-aliasing is not assumed.',
    note: 'Content changes without the page changing, but only inside one pane.',
  },
  {
    id: '2007',
    label: '2007',
    navigation: 'Tabs. The whole site is one page and the content swaps underneath.',
    interaction: 'Asynchronous. Things load without navigating, and a modal can sit over the page.',
    layout: 'Fixed 960 grid. Rounded panels, gradients, a reflection under the logo.',
    typography: 'Helvetica, with headings set as images when the type mattered.',
    note: 'The first era where the interface has state the visitor can lose.',
  },
  {
    id: '2015',
    label: '2015',
    navigation: 'Scroll. Everything is one long page and the menu collapses to three lines.',
    interaction: 'Touch-first. Big targets, momentum, reveal on scroll.',
    layout: 'Responsive. Full-bleed hero, then a card grid that reflows.',
    typography: 'One geometric sans, very large, very light.',
    note: 'Navigation stops being a place you go and becomes a distance you travel.',
  },
  {
    id: '2020',
    label: '2020',
    navigation: 'Sections with an index that tracks where you are.',
    interaction: 'Motion as feedback. Reveals, parallax, and a preference query that can switch it off.',
    layout: 'A twelve column grid with real editorial asymmetry.',
    typography: 'Variable fonts. Fluid scale set in viewport units.',
    note: 'The first era that treats reduced motion and dark mode as requirements rather than options.',
  },
  {
    id: '2026',
    label: '2026',
    navigation: 'A reality index. Not pages — modes, each with its own physics.',
    interaction: 'Direct. Pointer, touch, keyboard, camera and voice-shaped commands, each a first-class model.',
    layout: 'A sheet with material states, and space behind it.',
    typography: 'Three voices kept apart: display, body, instrument.',
    note: 'This is the Lab you are in. Everything on this row is real and enterable now.',
  },
  {
    id: '2035',
    label: '2035',
    navigation: 'None. There is nothing to browse — you state what you need and a view is assembled.',
    interaction: 'Intent. The interface is a single line and the composition is the answer to it.',
    layout: 'Composed per request. No permanent page exists to design.',
    typography: 'Set by the system to the reader, not to the page.',
    note: 'Extrapolated from this Lab’s own logic — the job ticket in ANZY.OS taken to its conclusion — not from science fiction. It is a proposal, and it is labelled as one.',
  },
];

export const TM_COPY = {
  title: 'TIME MACHINE',
  tagline: 'THE SAME INFORMATION THROUGH DIFFERENT ERAS OF THE WEB.',
  note: 'One source of content, seven interfaces. Nothing on this screen is duplicated per era: every view below renders the same object.',
  speculative: 'SPECULATIVE — a proposal extrapolated from this Lab, not a prediction.',
} as const;
