import { createContext, useContext } from 'react';

import type { AuditClient, Reach } from './client.ts';

/**
 * THE CONTEXT, AND NOTHING THAT RENDERS.
 *
 * Separate from the provider component for the reason written into the Lab's
 * own rules: a module that exports both a component and a context cannot be
 * preserved by Fast Refresh, so every edit produces a second context object and
 * live consumers start throwing against a provider that is plainly mounted. The
 * Lab learned that once with `ExperienceProvider`; there is no reason to learn
 * it twice.
 */

export interface ServiceState {
  client: AuditClient;
  reach: Reach;
  /** Re-probe. Called after a key changes, and by the reader on demand. */
  refresh: () => void;
  setKey: (key: string, remember: boolean) => void;
  setBase: (base: string) => void;
}

export const ServiceContext = createContext<ServiceState | null>(null);

export function useService(): ServiceState {
  const ctx = useContext(ServiceContext);
  if (ctx === null) throw new Error('useService must be used inside <ServiceProvider>');
  return ctx;
}

/** The views this surface has. Order is the order they appear. */
export const VIEWS = ['ask', 'pilot', 'jobs', 'evidence', 'map', 'review'] as const;
export type View = (typeof VIEWS)[number];

export const VIEW_LABEL: Record<View, string> = {
  ask: 'ASK',
  pilot: 'PILOT',
  jobs: 'JOBS',
  evidence: 'EVIDENCE',
  map: 'MAP',
  review: 'REVIEW',
};

export const VIEW_DESCRIPTION: Record<View, string> = {
  ask: 'One question, answered from what is already stored. A model is used only where nothing cheaper will do.',
  jobs: 'Research that takes a while. The task graph, what each agent did, and what it cost.',
  evidence: 'Every conclusion, with the passage it rests on.',
  map: 'Where the businesses are, and how many could not be placed.',
  pilot: 'A bounded run against a real area. Every candidate found is listed, with the reason it was or was not researched.',
  review: 'Judge a finding against the passage it cites. Your verdict is added; the finding is never changed.',
};

/**
 * Micros to something a person reads, or the word UNKNOWN.
 *
 * Null is not zero and is never rendered as zero. The service reports cost as
 * unknown when no price is configured for the model it used, and a surface that
 * quietly printed "0.00" would turn a missing fact into a number somebody puts
 * in a budget.
 */
export function formatCost(micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return 'UNKNOWN';
  if (micros === 0) return '0';
  return (micros / 1_000_000).toFixed(micros < 10_000 ? 4 : 2);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
