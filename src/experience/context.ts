import { createContext, useContext } from 'react';
import type { CleanupScope } from '../core/cleanup';
import type { ModeDefinition, ModePhase } from './types';

/**
 * The engine's context, deliberately in its own module.
 *
 * It used to live beside `ExperienceProvider`, which meant that file exported a
 * component *and* a hook — and React Fast Refresh cannot preserve state for a
 * mixed module. Every edit to the provider produced a second module instance
 * with a second context object, so components that had not been re-evaluated
 * kept the old one and threw "useExperience must be used inside
 * <ExperienceProvider>" against a provider that was plainly mounted.
 *
 * Splitting it fixes hot reloading for the whole application, and is why the
 * lint rule complains about mixed modules in the first place.
 */

export type Stage = 'launcher' | 'index' | 'mode';

export interface ExperienceValue {
  stage: Stage;
  phase: ModePhase;
  activeMode: ModeDefinition | null;
  scope: CleanupScope | null;
  error: string | null;
  enterLab: () => void;
  returnToLauncher: () => void;
  enterMode: (id: string) => void;
  exitMode: () => void;
  reportReady: () => void;
  reportError: (message: string) => void;
}

export const ExperienceContext = createContext<ExperienceValue | null>(null);

export function useExperience(): ExperienceValue {
  const ctx = useContext(ExperienceContext);
  if (!ctx) throw new Error('useExperience must be used inside <ExperienceProvider>');
  return ctx;
}
