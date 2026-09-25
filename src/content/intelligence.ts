/**
 * THE INTELLIGENCE DESKS.
 *
 * One reality — INTELLIGENCE, the Lab's front end for the Commercial
 * Intelligence Engine — with a desk for each thing the engine can do. The index
 * prints them as their own section, so a visitor can walk straight to the desk
 * they need; inside, they share one engine connection and hand work to each
 * other (a brand to its stores, a business to its website).
 *
 * Copy only. What each desk says about itself names what it actually reads from
 * the engine (`reads`), so the claim can be checked against engine.ts. Nothing
 * here asserts a result: every number a desk shows is the engine's, counted
 * when it answers.
 */

export type DeskId =
  | 'survey'
  | 'brands'
  | 'areas'
  | 'locators'
  | 'sites'
  | 'domains'
  | 'datasets'
  | 'archive'
  | 'sources'
  | 'atlas'
  | 'extracts'
  | 'ask';

export interface DeskDefinition {
  id: DeskId;
  /** Plate number within the section. */
  index: string;
  title: string;
  tagline: string;
  description: string;
  /** The engine's routes this desk reads or writes. */
  reads: string[];
}

export const DESKS: DeskDefinition[] = [
  {
    id: 'survey',
    index: 'I1',
    title: 'SURVEY',
    tagline: 'Every business of a kind, in a place.',
    description:
      'Ask the way you would say it. The engine asks public sources for every business the question names and answers with each one’s evidence, what it shares with the others, the records it could not tell apart, and how far the whole answer can be trusted.',
    reads: ['/api/parse', '/api/searches', '/api/searches/{id}/results', '/api/searches/{id}/graph', '/api/searches/{id}/review', '/api/judgements'],
  },
  {
    id: 'brands',
    index: 'I2',
    title: 'BRANDS',
    tagline: 'What a brand name stands for.',
    description:
      'The brands a name means in the brand index — their kind, their Wikidata id, where they trade, their own websites and store locators — and, when All the Places answers, the spiders holding their stores this week.',
    reads: ['/api/research/brand'],
  },
  {
    id: 'areas',
    index: 'I3',
    title: 'AREAS',
    tagline: 'How a place resolves.',
    description:
      'The boundary a place name stands for, drawn; its size; whether a search can ask for it whole or must go cell by cell; and what else the name could have meant.',
    reads: ['/api/research/area'],
  },
  {
    id: 'locators',
    index: 'I4',
    title: 'LOCATORS',
    tagline: 'A brand’s own store list, for one place.',
    description:
      'Reads a brand’s own store locator under its robots.txt, one page every two seconds, and lists the stores it states inside the place. Nothing is stored.',
    reads: ['/api/research/locator', '/api/tasks/{id}'],
  },
  {
    id: 'sites',
    index: 'I5',
    title: 'SITES',
    tagline: 'What one website is built and marketed with.',
    description:
      'One site’s home page, read once under the same rules as a search: its shop platform, technologies, marketing and analytics accounts, payments, contacts, profiles and listings.',
    reads: ['/api/site'],
  },
  {
    id: 'domains',
    index: 'I6',
    title: 'DOMAINS',
    tagline: 'What a domain’s public records say.',
    description:
      'A domain looked up where the public record is kept: when it was registered and until when, where its mail goes, the certificates issued for its hosts, and when archives first and last saw it.',
    reads: ['/api/research/domain', '/api/tasks/{id}'],
  },
  {
    id: 'datasets',
    index: 'I7',
    title: 'DATASETS',
    tagline: 'Many questions, one table.',
    description:
      'Each question asked as a search, each business kept once with every question that found it. Taken away as the engine writes it: CSV, a workbook, GeoJSON or JSON.',
    reads: ['/api/datasets', '/api/tasks/{id}', '/api/datasets/{id}/rows', '/api/datasets/{id}/export'],
  },
  {
    id: 'archive',
    index: 'I8',
    title: 'ARCHIVE',
    tagline: 'What the engine already knows.',
    description:
      'Local knowledge, when the engine has its database: the searches it has run, reopened as they were saved, and how much it holds — businesses, records, judgements.',
    reads: ['/api/knowledge', '/api/searches'],
  },
  {
    id: 'sources',
    index: 'I9',
    title: 'SOURCES',
    tagline: 'Every source, and the registry behind them.',
    description:
      'What the engine asks, whether each source is ready and under which licence, and the registry of tools reviewed to build it — with the decision on each and why.',
    reads: ['/api/sources', '/api/registry', '/api/registry/tools'],
  },
  {
    id: 'atlas',
    index: 'I10',
    title: 'ATLAS',
    tagline: 'Where a brand trades, or a kind of business is — by state and district.',
    description:
      'Counted from the maps the engine keeps on this machine: a brand’s outlets, or every business of a kind, region by region — each map’s count beside the other’s, never added together. A brand’s offices, works and namesakes are counted apart, never as stores.',
    reads: ['/api/atlas', '/api/atlas/regions'],
  },
  {
    id: 'extracts',
    index: 'I11',
    title: 'EXTRACTS',
    tagline: 'The maps kept on this machine, answering first.',
    description:
      'OpenStreetMap’s regional files and Overture’s monthly places, loaded into the engine’s database: each one’s date, its places and regions, and whether it is young enough to answer a search in place of the live service. Loading one is a task on the engine.',
    reads: ['/api/extracts', '/api/extracts/top', '/api/extracts/load', '/api/tasks/{id}'],
  },
  {
    id: 'ask',
    index: 'I12',
    title: 'ASK',
    tagline: 'One question — the engine decides whether it is a search or a reading.',
    description:
      'A question is planned by rule: a subject and a place become the engine’s own search, served from a fresh enough saved one and refreshed when stale; anything else is read from the passages local knowledge holds — pages the engine read, files brought in here — each with its source and date. A written answer appears only when a model provider is configured and every sentence it writes is cited to a passage shown; otherwise the passages are the answer, and the desk says why.',
    reads: ['/api/ask', '/api/providers', '/api/imports', '/api/feedback'],
  },
];

export function findDesk(id: string | null | undefined): DeskDefinition | undefined {
  return id ? DESKS.find((d) => d.id === id) : undefined;
}
