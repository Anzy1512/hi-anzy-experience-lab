/**
 * THE ARTIFACT LAYER — what a visitor gets to keep.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Measured before writing it: the Lab contained no `navigator.clipboard` call
 * and no `createObjectURL` outside the audio engine and a font declaration.
 * Sixteen realities, and not one of them could hand a visitor anything. That
 * is the structural reason several of them read as demonstrations of an
 * interface rather than as products — a tool whose entire output is that the
 * screen changed has not finished the sentence it started.
 *
 * So this is the smallest layer that lets a reality end with an object rather
 * than a state, written once instead of six times. It is deliberately not a
 * framework: four functions and a component, no registry, no persistence, no
 * account, nothing that survives a reload.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
 *
 * It never uploads. Every format below is produced in the tab, from values the
 * tool already has, and handed to the browser's own download path. There is no
 * endpoint, so there is nothing to leak and nothing to keep online.
 *
 * It never claims success it did not get. `writeText` needs a secure context
 * and a live user gesture, and it rejects for reasons a caller cannot predict
 * (a denied permission, a window that lost focus mid-click, a browser that
 * simply does not implement it). Every entry point below returns an explicit
 * result rather than a boolean, so a UI can say COPY FAILED instead of
 * pretending — the same rule PERFORMANCE follows when it prints UNKNOWN.
 */

/** Formats a tool may offer. A tool exposes only the ones that mean something. */
export type ArtifactFormat = 'copy' | 'markdown' | 'json' | 'image';

export interface Artifact {
  /**
   * File stem, no extension. Slugged on the way out, so a caller may pass a
   * human title and still get a filename that survives every OS.
   */
  name: string;
  /** The text body. Used by `copy` and, as-is, by `markdown`. */
  text?: string;
  /** Structured payload for `json`. */
  data?: unknown;
  /**
   * Resolved at click time, never held. A canvas captured at declaration would
   * be a stale frame by the time anybody pressed the button, and holding a
   * reference to a renderer's drawing buffer across a mode exit is exactly the
   * kind of retention `useDisposable` exists to prevent.
   */
  canvas?: () => HTMLCanvasElement | null | undefined;
  /**
   * An async source for the still, for renderers that cannot be read from an
   * event handler.
   *
   * A WebGL drawing buffer is cleared the moment its frame is presented, so
   * `canvas.toBlob()` called from a click returns a blank image unless the
   * context was created with `preserveDrawingBuffer` — which taxes every frame
   * to serve a button that may never be pressed. A mode that would rather pay
   * nothing until asked supplies this instead and fulfils it inside its own
   * frame loop. Resolving `null` is a refusal and is reported as one.
   */
  canvasBlob?: () => Promise<Blob | null>;
}

export type ArtifactResult =
  | { ok: true }
  /** `reason` is shown to the visitor, so it is written for them, not for a log. */
  | { ok: false; reason: string };

const OK: ArtifactResult = { ok: true };

/** Lowercase, hyphenated, no path separators, never empty. */
export function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'hi-anzy';
}

/** `YYYY-MM-DD`, for filenames. Local date on purpose: it is the visitor's. */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Hand a blob to the browser's download path.
 *
 * The object URL is revoked on the next task rather than immediately: revoking
 * it in the same tick as the click cancels the download in Chromium, because
 * the navigation has not been started yet when the URL stops resolving. A
 * timeout of zero is enough and is the documented shape of this workaround —
 * the anchor is never added to the document, so there is nothing else to undo.
 */
function save(blob: Blob, filename: string): ArtifactResult {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return OK;
  } catch {
    return { ok: false, reason: 'DOWNLOAD BLOCKED BY THIS BROWSER' };
  }
}

export async function copyText(text: string): Promise<ArtifactResult> {
  if (!text) return { ok: false, reason: 'NOTHING TO COPY' };
  /*
   * `navigator.clipboard` is undefined outright on an insecure origin, which
   * is a different failure from a rejected write and deserves a different
   * sentence: one the visitor can act on by loading the page over https, the
   * other they cannot act on at all.
   */
  if (!window.isSecureContext) {
    return { ok: false, reason: 'CLIPBOARD NEEDS A SECURE CONTEXT' };
  }
  if (!navigator.clipboard?.writeText) {
    return { ok: false, reason: 'CLIPBOARD UNAVAILABLE IN THIS BROWSER' };
  }
  try {
    await navigator.clipboard.writeText(text);
    return OK;
  } catch {
    return { ok: false, reason: 'COPY REFUSED — SELECT AND COPY MANUALLY' };
  }
}

export function downloadMarkdown(a: Artifact): ArtifactResult {
  if (!a.text) return { ok: false, reason: 'NOTHING TO SAVE' };
  return save(
    new Blob([a.text], { type: 'text/markdown;charset=utf-8' }),
    `${slug(a.name)}-${stamp()}.md`,
  );
}

export function downloadJson(a: Artifact): ArtifactResult {
  if (a.data === undefined) return { ok: false, reason: 'NOTHING TO SAVE' };
  let body: string;
  try {
    body = JSON.stringify(a.data, null, 2);
  } catch {
    /* A cycle here is a bug in the caller's payload, not in the visitor's
       browser, so it says which of the two is at fault. */
    return { ok: false, reason: 'THIS RESULT CANNOT BE SERIALISED' };
  }
  return save(
    new Blob([body], { type: 'application/json;charset=utf-8' }),
    `${slug(a.name)}-${stamp()}.json`,
  );
}

/**
 * Still-capture a live canvas.
 *
 * `toBlob` returns null when the drawing buffer cannot be read — most often
 * because the context was created without `preserveDrawingBuffer` and the
 * frame has already been presented, which is the normal state of a WebGL
 * canvas and not an error anybody can fix from here. It is reported as the
 * limitation it is rather than retried.
 */
export function downloadImage(a: Artifact): Promise<ArtifactResult> {
  if (a.canvasBlob) {
    return a.canvasBlob().then((blob) =>
      blob ? save(blob, `${slug(a.name)}-${stamp()}.png`) : { ok: false as const, reason: 'THIS FRAME CANNOT BE READ BACK' },
    );
  }
  return new Promise((resolve) => {
    const canvas = a.canvas?.();
    if (!canvas) {
      resolve({ ok: false, reason: 'NOTHING TO CAPTURE' });
      return;
    }
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve({ ok: false, reason: 'THIS FRAME CANNOT BE READ BACK' });
          return;
        }
        resolve(save(blob, `${slug(a.name)}-${stamp()}.png`));
      }, 'image/png');
    } catch {
      /* A tainted canvas throws rather than returning null. Same sentence: the
         visitor can do nothing either way, and a wrong one would be worse. */
      resolve({ ok: false, reason: 'THIS FRAME CANNOT BE READ BACK' });
    }
  });
}

/** Run one format against one artifact. The component below is the only caller. */
export function runFormat(format: ArtifactFormat, a: Artifact): Promise<ArtifactResult> {
  switch (format) {
    case 'copy':
      return copyText(a.text ?? '');
    case 'markdown':
      return Promise.resolve(downloadMarkdown(a));
    case 'json':
      return Promise.resolve(downloadJson(a));
    case 'image':
      return downloadImage(a);
  }
}

/* -------------------------------------------------------------------------- */
/* MARKDOWN COMPOSITION                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A section of a document a tool is building. Kept this narrow on purpose: every
 * brief the Lab produces is a title, an intro, and a list of headed blocks that
 * are either prose or bullets. Anything richer belongs to the tool, not here.
 */
export interface DocSection {
  head: string;
  body?: string;
  items?: readonly string[];
}

export interface DocSpec {
  title: string;
  /** Printed under the title in italics — the standing disclaimer, usually. */
  standfirst?: string;
  sections: readonly DocSection[];
  /** Key/value pairs printed as a trailing provenance block. */
  footer?: Readonly<Record<string, string>>;
}

/**
 * Compose markdown once, so six tools cannot disagree about what a Hi Anzy
 * document looks like. Empty sections are dropped rather than printed as a
 * heading with nothing under it — a brief with a hollow heading reads as a
 * broken export, and a tool that genuinely has nothing for a section is better
 * off not claiming it.
 */
export function toMarkdown(doc: DocSpec): string {
  const out: string[] = [`# ${doc.title}`, ''];
  if (doc.standfirst) out.push(`*${doc.standfirst}*`, '');
  for (const s of doc.sections) {
    const items = s.items?.filter(Boolean) ?? [];
    if (!s.body && items.length === 0) continue;
    out.push(`## ${s.head}`, '');
    if (s.body) out.push(s.body, '');
    for (const i of items) out.push(`- ${i}`);
    if (items.length) out.push('');
  }
  if (doc.footer) {
    out.push('---', '');
    for (const [k, v] of Object.entries(doc.footer)) out.push(`**${k}:** ${v}  `);
    out.push('');
  }
  return out.join('\n');
}
