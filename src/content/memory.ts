/**
 * THE ARCHIVE.
 *
 * Memory is not a portfolio. Every record here is either the Lab's own history
 * (which it can speak about, because it is the thing that happened) or service
 * language from the source deck. **No record names a client, a person, a
 * project, an award, a result or a partnership** — where a real archive would
 * hold those, this one holds an unrecovered field, which is the honest shape of
 * an incomplete memory and the honest shape of what this product may assert.
 *
 * `integrity` and `lost` are the fiction, and they are fiction about the
 * *archive*, not about the company: they say "this record is incomplete", never
 * "this is what Hi Anzy achieved".
 */

export type MemoryCategory =
  | 'ORIGIN'
  | 'METHOD'
  | 'WORK'
  | 'CULTURE'
  | 'PEOPLE'
  | 'SPACES'
  | 'FUTURE';

export interface MemoryRecord {
  id: string;
  index: string;
  category: MemoryCategory;
  /** The word sampled into points. Short, because it is drawn at scale. */
  title: string;
  /** What the record says once it has reconstructed. */
  lines: string[];
  /** 0..1 — how much of this record survived. Drives the reconstruction. */
  integrity: number;
  /** Fields that did not survive. Shown as unrecovered rather than invented. */
  lost: string[];
}

export const RECORDS: MemoryRecord[] = [
  {
    id: 'source',
    index: 'M.01',
    category: 'ORIGIN',
    title: 'SOURCE',
    lines: [
      'A printed proposal. Twenty-two pages.',
      'Everything the Lab knows about Hi Anzy entered through this one document, and nothing has been added to it since.',
    ],
    integrity: 0.94,
    lost: ['ROOM', 'DATE', 'WHO WAS PRESENT'],
  },
  {
    id: 'register',
    index: 'M.02',
    category: 'ORIGIN',
    title: 'REGISTER',
    lines: [
      'The logotype is already out of register — the bars sit slightly off each other, on purpose.',
      'The whole Lab is built on that: three plates pulling into alignment, and a system that shows you when it has not quite arrived.',
    ],
    integrity: 0.88,
    lost: ['ORIGINAL ARTWORK', 'PRESS'],
  },
  {
    id: 'absorb',
    index: 'M.03',
    category: 'METHOD',
    title: 'ABSORB',
    lines: [
      'Deep-dive consultation. Brand and business audit.',
      'The stage before anything is made, and the one that decides whether the rest is worth making.',
    ],
    integrity: 0.97,
    lost: [],
  },
  {
    id: 'assemble',
    index: 'M.04',
    category: 'METHOD',
    title: 'ASSEMBLE',
    lines: [
      'Handpicked collaborators. Project-specific action pods.',
      'The team is composed for the problem rather than inherited from the last one.',
    ],
    integrity: 0.91,
    lost: ['ROSTER'],
  },
  {
    id: 'surface',
    index: 'M.05',
    category: 'WORK',
    title: 'SURFACE',
    lines: [
      'Identity, typography, colour, iconography. Packaging, unboxing, retail display.',
      'The parts of a company somebody actually holds.',
    ],
    integrity: 0.79,
    lost: ['ARTEFACTS', 'PHOTOGRAPHY', 'OUTCOMES'],
  },
  {
    id: 'system',
    index: 'M.06',
    category: 'WORK',
    title: 'SYSTEM',
    lines: [
      'Brand guidelines. UI/UX blueprints. Merchandising.',
      'The document that lets other people make the work correctly without being in the room.',
    ],
    integrity: 0.85,
    lost: ['DELIVERABLES'],
  },
  {
    id: 'night',
    index: 'M.07',
    category: 'CULTURE',
    title: 'NIGHT',
    lines: [
      'Music, gaming, festivals, the hours a brand is not being explained to anyone.',
      'Culture is not a channel to buy. It is a room to be in.',
    ],
    integrity: 0.62,
    lost: ['VENUE', 'LINE-UP', 'DATE', 'RECORDING'],
  },
  {
    id: 'pods',
    index: 'M.08',
    category: 'PEOPLE',
    title: 'PODS',
    lines: [
      'Not a fixed agency floor. A pod assembled per project and dissolved after it.',
      'The record of who was in which pod is not held here, and is not reconstructed.',
    ],
    integrity: 0.44,
    lost: ['NAMES', 'ROLES', 'CONTACT', 'CONSENT TO PUBLISH'],
  },
  {
    id: 'rooms',
    index: 'M.09',
    category: 'SPACES',
    title: 'ROOMS',
    lines: [
      'Pop-ups, campus festivals, on-ground activations.',
      'A space is the only medium where the audience can leave.',
    ],
    integrity: 0.57,
    lost: ['ADDRESS', 'FOOTFALL', 'IMAGES'],
  },
  {
    id: 'unbuilt',
    index: 'M.10',
    category: 'FUTURE',
    title: 'UNBUILT',
    lines: [
      'The realities that are still index rows: named, specified, and not yet software.',
      'A memory of something that has not happened is still a memory of a decision.',
    ],
    integrity: 0.33,
    lost: ['EVERYTHING ELSE'],
  },
];

export const MEMORY_COPY = {
  title: 'MEMORY',
  tagline: 'WALK THROUGH RECONSTRUCTED IDEAS.',
  hintFine: 'SCROLL OR DRAG TO MOVE · HOLD SPACE TO RECONSTRUCT · ←/→ BETWEEN RECORDS',
  hintCoarse: 'SWIPE TO MOVE THROUGH THE ARCHIVE · TAP AND HOLD TO RECONSTRUCT',
  unrecovered: 'UNRECOVERED',
  note: 'Fields marked unrecovered are not reconstructed and not guessed. An incomplete record stays incomplete.',
  fallback:
    'THIS ARCHIVE RECONSTRUCTS IN WEBGL, WHICH IS UNAVAILABLE HERE. THE RECORDS THEMSELVES ARE BELOW, IN FULL.',
} as const;

/** Reconstruction states, in the order a record passes through them. */
export const PHASES = ['TRACE', 'POINTS', 'RECONSTRUCT', 'HOLD', 'REMEMBER'] as const;
export type Phase = (typeof PHASES)[number];

export function phaseFor(confidence: number, holding: boolean): Phase {
  if (holding && confidence > 0.55) return 'REMEMBER';
  if (confidence > 0.82) return 'HOLD';
  if (confidence > 0.5) return 'RECONSTRUCT';
  if (confidence > 0.2) return 'POINTS';
  return 'TRACE';
}
