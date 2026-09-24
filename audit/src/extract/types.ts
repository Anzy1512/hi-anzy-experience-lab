/**
 * WHAT WAS FOUND, AND HOW — NEVER ONE WITHOUT THE OTHER.
 *
 * The brief's rule is "do not claim inferred values as extracted values", and
 * a shape that carries a bare string cannot keep it. Every value below travels
 * with the method that produced it, because the difference between
 *
 *     a phone number from  <a href="tel:+441234567890">
 *     a phone number from  a regular expression over a paragraph
 *
 * is the difference between a publisher stating something in machine-readable
 * form and this service guessing correctly most of the time. Both are useful.
 * Only one is a fact, and a later layer must be able to tell them apart
 * without re-reading the page.
 *
 * `evidence` and the character span exist for the same reason: a value nobody
 * can check is a value nobody should cite.
 */

export type ExtractionMethod =
  | 'jsonld'
  | 'opengraph'
  | 'meta'
  | 'microdata'
  | 'dom'
  | 'link'
  | 'readability'
  | 'pattern';

/** How much a method's output should be trusted, for ordering rival values. */
export const METHOD_STRENGTH: Record<ExtractionMethod, number> = {
  jsonld: 1.0, /* the publisher said it, as data, on purpose */
  microdata: 0.9,
  link: 0.9, /* a mailto:/tel: href declares its own meaning */
  opengraph: 0.8,
  meta: 0.7,
  dom: 0.6, /* a structural selector — right often, not always */
  readability: 0.6,
  pattern: 0.4, /* a regex over prose. A good guess, and a guess. */
};

export interface ExtractedValue {
  field: string;
  value: string;
  method: ExtractionMethod;
  /** Offsets into the extracted main text, when the method can point at one. */
  charStart: number | null;
  charEnd: number | null;
  /** Surrounding text, so a human can check without refetching. */
  evidence: string | null;
}

export interface Heading {
  level: number;
  text: string;
  /** Offset into the main text where this heading's section begins. */
  charStart: number;
}

export interface ExtractedLink {
  href: string;
  text: string;
  rel: string | null;
  /** True when the link leaves the document's own registrable domain. */
  external: boolean;
}

export interface Extraction {
  url: string;
  /** What the page says its own address is, if it says. */
  canonicalUrl: string | null;
  title: string | null;
  description: string | null;
  lang: string | null;
  siteName: string | null;
  publishedAt: Date | null;
  /** The main prose, boilerplate removed. The only thing that gets chunked. */
  text: string;
  headings: Heading[];
  links: ExtractedLink[];
  /** Every schema.org object found, unmodified. Interpreted by callers. */
  jsonld: unknown[];
  /** Emails, phones, addresses, socials, org names — each with its method. */
  values: ExtractedValue[];
  /** Which strategy produced `text`, since they disagree and it matters. */
  extractor: 'readability' | 'article' | 'main' | 'body';
  /** How much of the raw document survived boilerplate removal, 0..1. */
  density: number;
}
