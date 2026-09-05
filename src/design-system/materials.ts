/**
 * THE CANONICAL MATERIAL VOCABULARY.
 *
 * Not a second design system. `tokens.css` owns colour, type and space, and
 * nothing here duplicates it. This is the layer above: what each material
 * *is*, so that a spatial reality can ask "how does paper behave in depth"
 * and get the same answer everywhere.
 *
 * Ten of the thirteen are derived from something the commercial frontend
 * actually does, and `origin` names the file. The other three are the Lab's
 * own and `inherited: false` says so — a heritage is not something to claim by
 * implication.
 *
 *   canonical repo   Anzy1512/hi-anzy-platform @ 6e36db1
 *
 * WHY A TABLE AND NOT CSS
 * A material's colour is CSS and stays there. Its *behaviour* — whether it can
 * be cut, whether it accumulates, what it does when motion is unwanted — is
 * read by TypeScript when a reality decides how a thing should move. Putting
 * that in a comment would mean every mode re-deciding it privately, which is
 * how a system ends up with six different ideas about what ink does.
 */

export type MaterialId =
  | 'PAPER'
  | 'INK'
  | 'SIGNAL'
  | 'GRAPHITE'
  | 'RULE'
  | 'REGISTRATION'
  | 'BLUEPRINT'
  | 'ARCHIVE'
  | 'GRAIN'
  | 'HALFTONE'
  | 'CUT'
  | 'TRACE'
  | 'PROVENANCE';

export interface Material {
  id: MaterialId;
  /** What it looks like. One sentence, no hex — colour lives in tokens.css. */
  appearance: string;
  /** How it moves. "Nothing" is a valid and often correct answer. */
  motion: string;
  /** What it does when pulled into depth. The whole reason this file exists. */
  depth: string;
  /**
   * Whether it implies sound, and what kind. Most materials do not. The audio
   * engine only ever runs after a gesture, so this is a description of a voice
   * a mode *may* synthesise, never a promise that anything is playing.
   */
  audio: string | null;
  /** What is shown when WebGL is unavailable. Never "nothing". */
  fallback: string;
  /** What survives when motion is not wanted. Never "it disappears". */
  reducedMotion: string;
  /** Where this comes from. Always stated, even when the answer is "here". */
  origin: string;
  /**
   * Whether the canonical frontend is the actual source, or whether the Lab
   * arrived at this itself.
   *
   * A separate flag rather than `origin: null`, because all three of the Lab's
   * own materials have a lineage worth writing down — and prose saying "the Lab
   * invented this" is not something a count can read. PERFORMANCE prints the
   * tally, and on its first run it reported zero inventions while three of
   * these described themselves as inventions in their own text.
   */
  inherited: boolean;
}

export const MATERIALS: Record<MaterialId, Material> = {
  PAPER: {
    id: 'PAPER',
    inherited: true,
    appearance: 'Warm bone stock with a visible fibre. The company’s own --paper, #E0D8C1.',
    motion: 'Planar. It slides, folds and tears; it never bends on a curve or floats.',
    depth: 'A sheet has two sides and a thickness. Stacked, sheets occlude; separated, the gap between them is the information.',
    audio: null,
    fallback: 'The ground colour. Paper is the one material that needs no renderer.',
    reducedMotion: 'Sheets are already in position. Nothing has to travel for a stack to read as a stack.',
    origin: 'frontend/src/index.css --paper, and the printed-page composition the whole site is built on.',
  },
  INK: {
    id: 'INK',
    inherited: true,
    appearance: 'Near-black with a green cast. The company’s own --ink, #232A2A.',
    motion: 'Accumulates and dissolves. It never fades uniformly — it breaks into its own grain first.',
    depth: 'Ink has no volume. In depth it is a stain on a surface, so it acquires the geometry of whatever it is printed on.',
    audio: 'A low, short attack. The sound of something being set down rather than played.',
    fallback: 'The figure colour. Type is ink whether or not anything is rendering.',
    reducedMotion: 'The dissolved and resolved states both exist; reduced motion shows the resolved one.',
    origin: 'frontend/src/index.css --ink; DissolveImage, which resolves an image out of displacement rather than fading it in.',
  },
  SIGNAL: {
    id: 'SIGNAL',
    inherited: true,
    appearance: 'The brand orange, #F19020. On paper it is printed heavier (see --signal-text) because the light stock cannot carry it at reading size.',
    motion: 'Arrives, holds, leaves. It is never ambient and never decorative.',
    depth: 'Signal does not recede. A marked object stays marked at any distance, which is what makes it findable in a world.',
    audio: 'A single struck tone. One event, one sound.',
    fallback: 'The mark stays. Orange is information, so it survives every tier.',
    reducedMotion: 'The mark is present rather than arriving.',
    origin: 'frontend/src/index.css --orange; used across the site for the active route, the acquired object and nothing else.',
  },
  GRAPHITE: {
    id: 'GRAPHITE',
    inherited: true,
    appearance: 'Provisional grey line work. Construction that was never meant to be inked.',
    motion: 'Drawn, and erasable. It appears in the order a hand would draw it.',
    depth: 'Graphite describes structure it is not part of — in depth it hangs slightly off the surface it measures.',
    audio: null,
    fallback: 'Rendered as ordinary rules and labels. The measurements are the content.',
    reducedMotion: 'The drawing is complete rather than being drawn.',
    origin: 'frontend/src/components/CaseAnatomy.js — a diagram of a shape, drawn as a spine whether or not the sections beneath it are filled.',
  },
  RULE: {
    id: 'RULE',
    inherited: true,
    appearance: 'A hairline. The thinnest mark the display can hold without becoming grey.',
    motion: 'Extends from one end. A rule that fades in has not been drawn, it has been revealed.',
    depth: 'A rule in space is a plane seen edge-on. Turn it and it disappears, which is a fact worth using.',
    audio: null,
    fallback: 'A border. Identical.',
    reducedMotion: 'Full length immediately — it is a relationship, and the relationship exists either way.',
    origin: 'frontend/src/components/RouteLine.js — an SVG path that draws itself on scroll and renders complete under reduced motion.',
  },
  REGISTRATION: {
    id: 'REGISTRATION',
    inherited: false,
    appearance: 'Corner marks, crosses and colour bars. The furniture of a press, not of a screen.',
    motion: 'Slips and pulls back into register. Misalignment is the state; alignment is the event.',
    depth: 'Registration is how separated plates admit they came from one sheet. In depth it is the only thing that makes the separation legible.',
    audio: 'A mechanical seat — the sound of a plate locating.',
    fallback: 'The marks are drawn. They are furniture, not effects.',
    reducedMotion: 'Registered, and the offset state is skipped rather than animated through.',
    origin: 'The Lab’s own logotype device. The canonical site has no press furniture — this is one of the places the Lab goes further than its source, and says so.',
  },
  BLUEPRINT: {
    id: 'BLUEPRINT',
    inherited: false,
    appearance: 'Bone line work on the darkest ground in the product. Deliberately not cyan.',
    motion: 'Nothing moves. A construction drawing that animates is a diagram of a lie.',
    depth: 'Blueprint is the section through a thing, so depth is what it is *for*: it shows the layers a finished surface hides.',
    audio: null,
    fallback: 'The drawing is the fallback. It was never a render.',
    reducedMotion: 'Unchanged. There was nothing to reduce.',
    origin: 'The Lab’s X-Ray. Its lineage is the canonical site’s willingness to show its own structure — SystemDiagnostic draws the wiring rather than the result.',
  },
  ARCHIVE: {
    id: 'ARCHIVE',
    inherited: true,
    appearance: 'Preserved, labelled, and incomplete. Gaps are marked, never filled.',
    motion: 'Reconstructs. It arrives out of its own residue rather than appearing.',
    depth: 'An archive in depth is a corridor: records at distance are legible as records before they are legible as content.',
    audio: 'Room tone. The sound of a space that is holding something.',
    fallback: 'The records in full, as a document. An archive that needs a renderer is not an archive.',
    reducedMotion: 'Reconstructed. The record is complete and the reconstruction is stated rather than performed.',
    origin: 'frontend/src/components/ProvenanceTag.js and the Work/ecosystem structures — material that carries who made it and admits what is not known.',
  },
  GRAIN: {
    id: 'GRAIN',
    inherited: true,
    appearance: 'The particulate a printed surface is actually made of, visible only at the wrong distance.',
    motion: 'Drifts a few pixels a second. Any faster and it becomes noise, which is the failure mode.',
    depth: 'Grain has no depth of its own; it takes the depth of the surface it belongs to, which is how it proves the surface is real.',
    audio: null,
    fallback: 'Omitted. Grain is texture, and texture is the first thing a lite tier should lose.',
    reducedMotion: 'Static. A still grain field is still a grain field.',
    origin: 'frontend/src/components/three/HalftoneBackdrop.js — “texture, never noise”, at 2–5% effective alpha.',
  },
  HALFTONE: {
    id: 'HALFTONE',
    inherited: true,
    appearance: 'A dot screen at a fixed cell. Tone made of countable marks rather than of continuous value.',
    motion: 'Dots breathe on a slow travelling wave; the screen itself crawls diagonally, as a scanned page does.',
    depth: 'A halftone is a surface pretending to be a tone. Seen at an angle it stops pretending, which is the whole trick.',
    audio: null,
    fallback: 'A flat tone at the same value. The image survives; the process is what is lost.',
    reducedMotion: 'The screen holds still. The dot structure is the information, not the wave.',
    origin: 'frontend/src/components/three/HalftoneBackdrop.js and HalftoneStatic.js — the brand deck’s dot collage language, rendered as a field.',
  },
  CUT: {
    id: 'CUT',
    inherited: false,
    appearance: 'An edge where material has been removed. The absence has a thickness.',
    motion: 'Opens. A cut that fades was never a cut.',
    depth: 'A cut is the only way a flat material admits there is something behind it — the aperture is the depth.',
    audio: 'A short, dry separation.',
    fallback: 'A hard-edged hole with the ground behind it. No renderer required.',
    reducedMotion: 'Open. The aperture exists; the opening of it does not have to be watched.',
    origin: 'The Lab’s Portal. Nearest canonical relative is three/SparkGap.js — two things approaching, and the gap between them being the subject.',
  },
  TRACE: {
    id: 'TRACE',
    inherited: true,
    appearance: 'Evidence that something moved through here. Fainter than the thing that made it.',
    motion: 'Decays. A trace that persists at full strength is a path, which is a different material.',
    depth: 'A trace lies on the ground plane. It is how a world remembers a route without drawing a road.',
    audio: null,
    fallback: 'The route drawn complete, at rest.',
    reducedMotion: 'The full trace, undecayed. Losing the decay costs nothing; losing the route costs the relationship.',
    origin: 'frontend/src/components/RouteLine.js, and motion/ScrollVelocity.js — which publishes how fast the reader is moving and lets consumers decide what to do with it.',
  },
  PROVENANCE: {
    id: 'PROVENANCE',
    inherited: true,
    appearance: 'A typed label attached to material, stating where it came from. Set in the system voice, never the human one.',
    motion: 'None. A label that animates is advertising, not attribution.',
    depth: 'Provenance stays parallel to the viewer at any depth. It is metadata about the object, not part of it.',
    audio: null,
    fallback: 'The label. It was always just a label.',
    reducedMotion: 'Unchanged.',
    origin: 'frontend/src/components/ProvenanceTag.js and PROVENANCE_STYLES — where a piece of work is marked direct, with a partner, or through the network, and the distinction is kept.',
  },
};

export function material(id: MaterialId): Material {
  return MATERIALS[id];
}

/** Materials the Lab arrived at itself rather than inheriting. */
export function labOriginated(): Material[] {
  return Object.values(MATERIALS).filter((m) => !m.inherited);
}
