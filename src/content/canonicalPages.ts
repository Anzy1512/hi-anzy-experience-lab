/**
 * CANONICAL PAGES — real commercial pages, read at a known commit.
 *
 * GENERATED. Do not edit by hand.
 *   scripts/capture-canonical-pages.mjs
 *   source  Anzy1512/hi-anzy-platform @ eac2282 (origin/main)
 *   read    2026-09-12
 *
 * Every string below is quoted from the commercial frontend's own source. Text
 * the page computes at runtime appears as ⟨DYNAMIC⟩ rather than being guessed
 * at, which is why some headings are part prose and part marker: that is
 * genuinely what the source says at that point.
 *
 * This is a STRUCTURAL READ, not a screenshot. See the capture script for why —
 * the Compiler's subject is the grid, the layers and the depth order, and none
 * of those survive rasterisation.
 */

export interface CanonicalHeading {
  level: number;
  text: string;
}

export interface CanonicalSection {
  index: string;
  /** The site's own `data-index-label`, or the component it mounts. */
  label: string;
  /**
   * The label the page's own `SectionConnector` gives the move *into* this
   * section — "SYMPTOM → QUESTION", "CAPABILITY → METHOD". The commercial
   * page states the logic of its own reading order, so the Compiler does not
   * have to invent one.
   */
  transition: string | null;
  /** False when the part is real but this script could not open its file. */
  read: boolean;
  /**
   * Canonical data exports this part renders from, where its copy is not
   * literal in the JSX. These are the same names `content/canonical.ts`
   * mirrors, so a plane with no quotable text still says what fills it.
   */
  data: string[];
  headings: CanonicalHeading[];
  copy: string[];
  /** Typography by role, as the site's own classes encode it. */
  roles: string[];
  /** Hex values written into this section's own markup. */
  colours: string[];
  /**
   * Brand asset stems this part actually renders, read from its own markup.
   * The Lab serves the same owned files from public/brand; nothing is
   * hotlinked and nothing is inferred from a section's subject.
   */
  images: string[];
  /** Real component names this section mounts. */
  components: string[];
  /** Columns of the real twelve-column grid this section spans. */
  columns: number | null;
  ground: 'PAPER' | 'INK';
  /** File and section ordinal in the canonical repository. */
  source: string;
}

export interface CanonicalPage {
  route: string;
  name: string;
  title: string | null;
  description: string | null;
  file: string;
  sections: CanonicalSection[];
}

export const CANONICAL_PAGES_COMMIT = 'eac2282';

export const CANONICAL_PAGES: CanonicalPage[] = [
  {
    "route": "/",
    "name": "HOME",
    "title": "hiAnzy | We Build Brand Operating Systems",
    "description": "hiAnzy is a Business Systems & Transformation Consultancy. We find what is disconnected in your business, figure out what belongs together and build the system around it. From ABC to ROI.",
    "file": "frontend/src/pages/Home.js",
    "sections": [
      {
        "transition": null,
        "read": false,
        "data": [],
        "index": "01",
        "label": "HALFTONE BACKDROP",
        "headings": [],
        "copy": [],
        "roles": [],
        "colours": [],
        "images": [],
        "components": [],
        "columns": null,
        "ground": "PAPER",
        "source": "frontend/src/pages/Home.js → <HalftoneBackdrop> (not resolvable to a file)"
      },
      {
        "transition": null,
        "read": true,
        "data": [],
        "index": "02",
        "label": "HALFTONE STATIC",
        "headings": [],
        "copy": [],
        "roles": [],
        "colours": [],
        "images": [],
        "components": [],
        "columns": null,
        "ground": "PAPER",
        "source": "frontend/src/components/three/HalftoneStatic.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [],
        "index": "03",
        "label": "HERO",
        "headings": [],
        "copy": [
          "Strategy. Brand. Technology. Growth. Operations. They look like separate departments until you realise they are all working on the same business. hiAnzy finds what is disconnected, figures out what belongs together and builds the system around it."
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F7F5EE",
          "#1D2424"
        ],
        "images": [],
        "components": [
          "RouteLine",
          "MagneticButton",
          "ArrowRight",
          "Link",
          "SystemCoreFallback",
          "ThreeSafe",
          "Suspense",
          "SystemCore"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/pages/home/Hero.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "BRAND_REFS",
          "ROTATING_QUOTES"
        ],
        "index": "04",
        "label": "PROOF STRIP",
        "headings": [],
        "copy": [
          "⟨DYNAMIC⟩ · NOTES FROM THE WORK",
          "CAMPAIGN, PLACEMENT &amp; COLLABORATION CREDITS · hiAnzy &amp; NETWORK",
          "Credits span hiAnzy and network collaborations. We label who did what, always."
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F7F5EE",
          "#F19020"
        ],
        "images": [],
        "components": [
          "React"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/components/ProofStrip.js"
      },
      {
        "transition": null,
        "read": false,
        "data": [],
        "index": "05",
        "label": "PUN ROW",
        "headings": [],
        "copy": [],
        "roles": [],
        "colours": [],
        "images": [],
        "components": [],
        "columns": null,
        "ground": "PAPER",
        "source": "frontend/src/components/PunPop.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "SOMETHINGS_OFF"
        ],
        "index": "06",
        "label": "SOMETHINGS OFF",
        "headings": [],
        "copy": [
          "We find the gap. Then we decide whether it needs fixing, rebuilding or simply getting out of the way.",
          "More activity is not always more progress."
        ],
        "roles": [
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#E54A25",
          "#F7F5EE"
        ],
        "images": [],
        "components": [
          "SectionHeading",
          "SystemDiagnostic"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/pages/home/SomethingsOff.js"
      },
      {
        "transition": "SYMPTOM → QUESTION",
        "read": true,
        "data": [
          "WHY_HOW_NOW"
        ],
        "index": "07",
        "label": "WHY HOW NOW",
        "headings": [],
        "copy": [],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F7F5EE"
        ],
        "images": [
          "pop-cube-thinker"
        ],
        "components": [
          "SectionHeading",
          "PopIllustration",
          "RouteLine"
        ],
        "columns": 3,
        "ground": "INK",
        "source": "frontend/src/pages/home/WhyHowNow.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "CATEGORIES"
        ],
        "index": "08",
        "label": "WHAT WE DO GRID",
        "headings": [],
        "copy": [],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F7F5EE",
          "#F19020"
        ],
        "images": [],
        "components": [
          "SectionHeading",
          "MagneticButton",
          "ArrowRight",
          "Link"
        ],
        "columns": 12,
        "ground": "PAPER",
        "source": "frontend/src/pages/home/WhatWeDoGrid.js"
      },
      {
        "transition": "CAPABILITY → METHOD",
        "read": true,
        "data": [],
        "index": "09",
        "label": "PINNED SEQUENCE",
        "headings": [],
        "copy": [
          "WHAT THIS STAGE NEEDS FROM YOU",
          "WHAT YOU END UP WITH"
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#1D2424",
          "#F7F5EE",
          "#F19020",
          "#232A2A"
        ],
        "images": [],
        "components": [
          "Check"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/components/PinnedSequence.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "DIAGNOSTIC_AREAS",
          "DIAGNOSTIC_OUTCOMES"
        ],
        "index": "10",
        "label": "DIAGNOSTIC",
        "headings": [],
        "copy": [
          "BUSINESS SYSTEMS DIAGNOSTIC",
          "WHAT WE LOOK AT",
          "YOU LEAVE KNOWING"
        ],
        "roles": [
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#F7F5EE",
          "#F19020"
        ],
        "images": [
          "art-thinker"
        ],
        "components": [
          "MagneticButton",
          "ArrowRight",
          "Picture"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/pages/home/Diagnostic.js"
      },
      {
        "transition": "METHOD → PROOF",
        "read": true,
        "data": [],
        "index": "11",
        "label": "WORK PREVIEW",
        "headings": [],
        "copy": [
          "⟨DYNAMIC⟩ · ⟨DYNAMIC⟩",
          "GAP: ⟨DYNAMIC⟩ …",
          "RESULT: ⟨DYNAMIC⟩ …",
          "The final screen is nice. The thinking that made it useful is nicer."
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F7F5EE"
        ],
        "images": [],
        "components": [
          "SectionHeading",
          "MagneticButton",
          "ArrowRight",
          "Link",
          "ProvenanceTag"
        ],
        "columns": null,
        "ground": "PAPER",
        "source": "frontend/src/pages/home/WorkPreview.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "NETWORK_CATEGORIES_HOME",
          "NETWORK_SUBCATS"
        ],
        "index": "12",
        "label": "NETWORK PREVIEW",
        "headings": [],
        "copy": [],
        "roles": [
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#1D2424",
          "#F7F5EE",
          "#F19020",
          "#232A2A"
        ],
        "images": [],
        "components": [
          "SectionHeading",
          "MagneticButton",
          "ArrowRight",
          "Link",
          "ThreeSafe",
          "ConstellationFallback",
          "Suspense",
          "Constellation"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/pages/home/NetworkPreview.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "TRUST_PRINCIPLES"
        ],
        "index": "13",
        "label": "TRUST",
        "headings": [],
        "copy": [],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)"
        ],
        "colours": [
          "#232A2A",
          "#F7F5EE"
        ],
        "images": [
          "pop-hands-a"
        ],
        "components": [
          "SectionHeading",
          "ProgressRule",
          "PopIllustration"
        ],
        "columns": 3,
        "ground": "PAPER",
        "source": "frontend/src/pages/home/Trust.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "AUDIENCES"
        ],
        "index": "14",
        "label": "WHO WITH",
        "headings": [],
        "copy": [
          "Not every business is the right fit, and we would rather say so early than three months in. ⟨DYNAMIC⟩ The full filter, and where we tend to earn our fee ."
        ],
        "roles": [],
        "colours": [
          "#232A2A"
        ],
        "images": [],
        "components": [
          "SectionHeading",
          "MagneticButton",
          "ArrowRight",
          "MarqueeRow",
          "Link",
          "FitQuadrant"
        ],
        "columns": 12,
        "ground": "PAPER",
        "source": "frontend/src/pages/home/WhoWith.js"
      },
      {
        "transition": null,
        "read": true,
        "data": [],
        "index": "15",
        "label": "CLOSING",
        "headings": [],
        "copy": [
          "Brands are not campaigns. They are businesses people experience through hundreds of small interactions ."
        ],
        "roles": [
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#F7F5EE"
        ],
        "images": [
          "pop-hat-balloon"
        ],
        "components": [
          "RouteLine",
          "TouchpointTicker",
          "PopIllustration",
          "MagneticButton",
          "ArrowRight",
          "Link"
        ],
        "columns": null,
        "ground": "INK",
        "source": "frontend/src/pages/home/Closing.js"
      }
    ]
  },
  {
    "route": "/what-we-do",
    "name": "WHAT WE DO",
    "title": "What We Do | Six Capabilities, One System | hiAnzy",
    "description": "Business audit and strategy, brand and experience, technology and automation, growth, media and creators, advisory and scale, run as one connected system.",
    "file": "frontend/src/pages/WhatWeDo.js",
    "sections": [
      {
        "transition": null,
        "read": true,
        "data": [
          "CATEGORIES"
        ],
        "index": "01",
        "label": "WHAT WE DO H1",
        "headings": [
          {
            "level": 1,
            "text": "What does hiAnzy actually do ?"
          },
          {
            "level": 2,
            "text": "track(\"service_explored\", ⟨DYNAMIC⟩ )} > ⟨DYNAMIC⟩"
          }
        ],
        "copy": [
          "Why it matters: ⟨DYNAMIC⟩",
          "CAPABILITIES",
          "One business. One system. One brief away."
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F19020",
          "#F7F5EE",
          "#A8351A",
          "#FF7A52",
          "#D8CFB4"
        ],
        "images": [
          "art-cube-head"
        ],
        "components": [
          "ArrowRight",
          "Link",
          "Picture",
          "RouteLine",
          "MagneticButton",
          "Packages",
          "PackageBuilder",
          "CharacterQuote",
          "NextSteps"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/pages/WhatWeDo.js#section-1"
      }
    ]
  },
  {
    "route": "/how-we-work",
    "name": "HOW WE WORK",
    "title": "How We Work | Five Stages, One Method | hiAnzy",
    "description": "The hiAnzy operating model: Audit, Architect, Build, Connect, Scale. Less ceremony. More consequence.",
    "file": "frontend/src/pages/HowWeWork.js",
    "sections": [
      {
        "transition": null,
        "read": true,
        "data": [
          "METHOD_STAGES"
        ],
        "index": "01",
        "label": "HOW WE WORK H1",
        "headings": [
          {
            "level": 1,
            "text": "How does this work ?"
          }
        ],
        "copy": [],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F19020"
        ],
        "images": [],
        "components": [
          "InboxUnfold"
        ],
        "columns": 12,
        "ground": "PAPER",
        "source": "frontend/src/pages/HowWeWork.js#section-1"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "METHOD_STAGES"
        ],
        "index": "02",
        "label": "THE FIVE STAGES",
        "headings": [],
        "copy": [
          "Less ceremony. More consequence."
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#F7F5EE",
          "#D8CFB4",
          "#232A2A"
        ],
        "images": [
          "pop-clock-watch"
        ],
        "components": [
          "RouteLine",
          "Clock",
          "ScrollInfoPanel",
          "PopIllustration",
          "MagneticButton",
          "ArrowRight",
          "CharacterQuote",
          "NextSteps"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/pages/HowWeWork.js#section-2"
      }
    ]
  },
  {
    "route": "/network",
    "name": "NETWORK",
    "title": "The hiAnzy Network | Strategists, Creators, Technologists, Operators",
    "description": "A consultancy doesn't need to own every skill. It needs to know what the problem demands and who is exceptionally good at solving it.",
    "file": "frontend/src/pages/Network.js",
    "sections": [
      {
        "transition": null,
        "read": true,
        "data": [
          "DISCIPLINES",
          "NETWORK_SUBCATS",
          "ORBIT_CATEGORIES"
        ],
        "index": "01",
        "label": "NETWORK H1",
        "headings": [
          {
            "level": 1,
            "text": "The hiAnzy Network"
          }
        ],
        "copy": [
          "NETWORK AT A GLANCE",
          "DISCIPLINES",
          "⟨DYNAMIC⟩ +",
          "SPECIALIST SKILLS"
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#1D2424",
          "#F7F5EE",
          "#F19020",
          "#232A2A"
        ],
        "images": [],
        "components": [
          "Maximize2",
          "ThreeSafe",
          "ConstellationFallback",
          "Suspense",
          "Constellation",
          "Minimize2",
          "React"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/pages/Network.js#section-1"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "DISCIPLINES",
          "NETWORK_SUBCATS",
          "ORBIT_CATEGORIES"
        ],
        "index": "02",
        "label": "NETWORK DISCIPLINES",
        "headings": [
          {
            "level": 2,
            "text": "Sixteen disciplines. One question each."
          }
        ],
        "copy": [],
        "roles": [
          "SYSTEM (Rajdhani)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F19020",
          "#F7F5EE"
        ],
        "images": [
          "pop-camera-duo"
        ],
        "components": [
          "PopIllustration",
          "CardCarousel",
          "Link",
          "ArrowRight"
        ],
        "columns": null,
        "ground": "PAPER",
        "source": "frontend/src/pages/Network.js#section-2"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "DISCIPLINES",
          "NETWORK_SUBCATS",
          "ORBIT_CATEGORIES"
        ],
        "index": "03",
        "label": "THE ROSTERS",
        "headings": [
          {
            "level": 2,
            "text": "Four ways the network shows up."
          }
        ],
        "copy": [],
        "roles": [
          "SYSTEM (Rajdhani)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F19020"
        ],
        "images": [],
        "components": [
          "CircularCarousel"
        ],
        "columns": null,
        "ground": "PAPER",
        "source": "frontend/src/pages/Network.js#section-3"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "DISCIPLINES",
          "NETWORK_SUBCATS",
          "ORBIT_CATEGORIES"
        ],
        "index": "04",
        "label": "THE SPECIALISTS",
        "headings": [],
        "copy": [
          "Nothing public in this category yet. The relationships exist. The write-ups are being verified.",
          "VERIFIED ⟨DYNAMIC⟩",
          "A network relationship is not the same thing as hiAnzy-delivered client work, which is why every card says which one it is."
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F7F5EE"
        ],
        "images": [],
        "components": [
          "ProvenanceTag",
          "PunPop",
          "NextSteps"
        ],
        "columns": 4,
        "ground": "PAPER",
        "source": "frontend/src/pages/Network.js#section-4"
      }
    ]
  },
  {
    "route": "/why-hi-anzy",
    "name": "WHY HI ANZY",
    "title": "Why hiAnzy | The Name, The Instinct, The Work",
    "description": "Anzy began as a signature under poems. It grew into a way of seeing businesses: see differently, make thoughtfully.",
    "file": "frontend/src/pages/WhyHiAnzy.js",
    "sections": [
      {
        "transition": null,
        "read": true,
        "data": [
          "CHARACTERS",
          "TEAM_QUOTE"
        ],
        "index": "01",
        "label": "WHY H1",
        "headings": [
          {
            "level": 1,
            "text": "Who is Anzy, anyway ?"
          }
        ],
        "copy": [],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#232A2A",
          "#F19020",
          "#A85A12"
        ],
        "images": [],
        "components": [],
        "columns": 12,
        "ground": "PAPER",
        "source": "frontend/src/pages/WhyHiAnzy.js#section-1"
      },
      {
        "transition": null,
        "read": true,
        "data": [
          "CHARACTERS",
          "TEAM_QUOTE"
        ],
        "index": "02",
        "label": "WHY SECTION HI",
        "headings": [
          {
            "level": 2,
            "text": "Why “Hi”?"
          },
          {
            "level": 2,
            "text": "Dreamers + Doers"
          },
          {
            "level": 2,
            "text": "Compass + Engine"
          },
          {
            "level": 2,
            "text": "Meet the architects of our crazy dream."
          }
        ],
        "copy": [
          "THE GREETING",
          "Because most good things begin with a conversation. A partnership. A new idea. A question someone finally asked out loud. “Hi” is the smallest possible unit of beginning, and beginnings are our favourite part of the work.",
          "The name is approachable. The work is rigorous. The contrast is intentional.",
          "We take the brief seriously. Ourselves, slightly less."
        ],
        "roles": [
          "SYSTEM (Rajdhani)",
          "HUMAN (Newsreader)",
          "TECHNICAL (spaced Rajdhani)"
        ],
        "colours": [
          "#F7F5EE",
          "#232A2A",
          "#D8CFB4",
          "#F19020"
        ],
        "images": [],
        "components": [
          "RouteLine",
          "MagneticButton",
          "ArrowRight",
          "PunPop",
          "DissolveImage",
          "NextSteps"
        ],
        "columns": 12,
        "ground": "INK",
        "source": "frontend/src/pages/WhyHiAnzy.js#section-2"
      }
    ]
  }
];

export function canonicalPage(route: string): CanonicalPage | undefined {
  return CANONICAL_PAGES.find((p) => p.route === route);
}
