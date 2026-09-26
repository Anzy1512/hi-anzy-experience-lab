import type { DeskId } from '../../content/intelligence';
import type { EngineHealth, EngineSource } from './engine';

/**
 * WHAT THE DESKS SHARE.
 *
 * One engine connection, probed once by the reality and handed to every desk;
 * one cancellation signal, so leaving the reality cancels every request any
 * desk has in flight; and one way for a desk to hand work to another — words
 * to start from, never a result pretending to be the other desk's own.
 */

export type EngineState =
  | { kind: 'checking' }
  | { kind: 'ready'; health: EngineHealth; sources: EngineSource[] }
  | { kind: 'unreachable'; problem: string };

/** Words one desk hands another to start from. */
export interface Handover {
  /** SURVEY: a question to ask. */
  question?: string;
  /** SURVEY: a place the next question is about (`in <place>` is added when it is not named). */
  place?: string;
  /** SURVEY: a search to open as it was saved or finished. */
  searchId?: string;
  /** BRANDS, LOCATORS: a brand. */
  brand?: string;
  /** SITES: a website. */
  url?: string;
  /** DOMAINS: a domain. */
  domain?: string;
  /** DATASETS: questions to add. */
  questions?: string[];
  /** ATLAS: a kind of business to count (a brand goes in `brand`). */
  category?: string;
}

export interface DeskProps {
  engineState: EngineState;
  /** Aborted when the visitor leaves the reality. */
  signal: AbortSignal;
  /** Open another desk, optionally handing it something to start from. */
  go: (desk: DeskId, handover?: Handover) => void;
  /** What a desk does when handed something while already open. Returns the unregister. */
  receive: (desk: DeskId, apply: (handover: Handover) => void) => () => void;
  /** What was handed to a desk before it first opened — read once, in an initialiser. */
  take: (desk: DeskId) => Handover | undefined;
  /** Whether this desk is the one on screen. */
  active: boolean;
}

export const POLL_MS = 1200;

export function isReady(state: EngineState): state is Extract<EngineState, { kind: 'ready' }> {
  return state.kind === 'ready';
}

/** ISO country codes as typed ("in, gb") → ["IN", "GB"]; nothing typed → the engine's defaults. */
export function countriesOf(text: string): string[] | undefined {
  const codes = text
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return codes.length ? codes : undefined;
}

/** A registrable-looking host from a URL or a bare domain, or null. */
export function domainOf(url: string): string | null {
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname;
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** A count as the engine gave it, with thousands separated. */
export function count(n: number | null | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '—';
}

/** An ISO time from the engine, as a day and minute in this browser's zone. */
export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
