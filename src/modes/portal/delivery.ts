import type { ArtifactRecord } from '../../system/project';

/**
 * THE DELIVERY PACKAGE — what would actually leave the building.
 *
 * ── WHY PORTAL NEEDED THIS ──────────────────────────────────────────────────
 *
 * Portal's crossing has been the clearest metaphor in the Lab since Phase 5:
 * paper on the near side, the system on the far side, and a hole between them.
 * What it never had was a reason to exist beyond the metaphor — a visitor
 * crossed, understood the idea, and left with nothing. The index said so, with
 * ARTIFACT as its one NOT YET row.
 *
 * A crossing is delivery. So the far side now also holds the thing that would
 * be delivered: everything this project has produced, what each piece can and
 * cannot say, and — stated plainly — what is missing from the package.
 *
 * ── THE WORD "PUBLISHED" DOES NOT APPEAR ────────────────────────────────────
 *
 * Nothing here is uploaded, hosted, shared or sent. There is no endpoint in
 * this product and there is not going to be one before a phase that explicitly
 * builds it. The manifest says PACKAGED and LOCAL, and the state below is
 * `local` for that reason rather than as a placeholder waiting to be flipped to
 * `published` — a package a visitor can download is a real outcome, and calling
 * it a publication would be the one lie this mode is best positioned to tell.
 */

export interface DeliveryItem {
  title: string;
  kind: string;
  producer: string;
  limits: string;
  /** Whether the payload travels with the manifest, and why when it does not. */
  carries: string;
}

export interface DeliveryPackage {
  /** Always `local`. See the note above. */
  state: 'local';
  items: DeliveryItem[];
  /** Named absences. A package that lists only what it has is half a manifest. */
  excluded: string[];
}

/**
 * A recipe describes a frame that was downloaded and never kept, so the picture
 * is genuinely not in the package. Saying which artifacts carry their payload
 * and which only describe one is the difference between a manifest and a list.
 */
function carriage(a: ArtifactRecord): string {
  if (a.kind === 'recipe') {
    return 'The settings travel. The rendered PNG does not — it was handed to the browser and never retained.';
  }
  if (a.text && a.data) return 'Full document and structured data.';
  if (a.text) return 'Full document.';
  if (a.data) return 'Structured data only.';
  return 'Reference only — this artifact recorded no payload.';
}

export function buildPackage(artifacts: ArtifactRecord[]): DeliveryPackage {
  const items = artifacts.map((a) => ({
    title: a.title,
    kind: a.kind.toUpperCase(),
    producer: a.producer.toUpperCase(),
    limits: a.limits,
    carries: carriage(a),
  }));

  const excluded = [
    'Nothing is uploaded, hosted or shared. This package exists in this tab and in whatever you download from it.',
    'No rendered image travels. Pictures are downloaded individually; a recipe describes how to make one again.',
    'Nothing is scheduled, priced or committed to. No date, cost or availability appears anywhere in it.',
  ];
  if (!artifacts.length) {
    excluded.unshift(
      'This project has produced nothing yet, so the package is empty. Run a tool first — the Agency Simulator, the Reality Compiler or Director all end in something that can travel.',
    );
  }

  return { state: 'local', items, excluded };
}

/** The manifest as a document. One composer, so screen and file agree. */
export function deliveryMarkdown(pkg: DeliveryPackage, projectId: string): string {
  const out: string[] = [
    '# HI ANZY — DELIVERY MANIFEST',
    '',
    '*A local package. Nothing in it has been uploaded, hosted, published or sent —' +
      ' it exists in the browser tab that made it and in whatever you download from there.*',
    '',
    `**STATE:** PACKAGED · LOCAL`,
    `**PROJECT:** ${projectId}`,
    `**ITEMS:** ${pkg.items.length}`,
    '',
    '## WHAT IS IN THE PACKAGE',
    '',
  ];
  if (!pkg.items.length) {
    out.push('Nothing yet.', '');
  } else {
    for (const it of pkg.items) {
      out.push(
        `### ${it.title}`,
        '',
        `- **TYPE** — ${it.kind}`,
        `- **MADE BY** — ${it.producer}`,
        `- **CARRIES** — ${it.carries}`,
        `- **CANNOT TELL YOU** — ${it.limits}`,
        '',
      );
    }
  }
  out.push('## WHAT IS NOT IN IT', '');
  for (const x of pkg.excluded) out.push(`- ${x}`);
  out.push(
    '',
    '---',
    '',
    `**GENERATED:** ${new Date().toISOString()}  `,
    '**STORAGE:** NONE — nothing was written to this device  ',
    '',
  );
  return out.join('\n');
}
