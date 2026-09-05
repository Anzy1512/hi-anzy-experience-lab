import type { ComponentType } from 'react';

/**
 * A reality's operational state.
 *
 * These are roadmap labels, not claims about a shipped product. Only `online`
 * may be entered; everything else is presented honestly as not yet enterable,
 * and the Lab never renders a fake preview of an unbuilt mode.
 */
export type ModeStatus = 'online' | 'in-development' | 'research' | 'dormant' | 'sealed';

export type ModeCost = 'low' | 'medium' | 'high' | 'extreme';
export type MobileSupport = 'full' | 'adapted' | 'unsupported';
export type ReducedMotionSupport = 'full' | 'adapted' | 'static';

export interface ModeRequirements {
  webgl: boolean;
  /** Enhanced by WebGPU where available, but never dependent on it. */
  webgpu: boolean;
  audio: boolean;
  camera: boolean;
  cost: ModeCost;
  mobile: MobileSupport;
  reducedMotion: ReducedMotionSupport;
}

export interface ModeDefinition {
  id: string;
  /** Plate number on the index sheet. */
  index: string;
  title: string;
  tagline: string;
  description: string;
  status: ModeStatus;
  /** 'flagship' realities are the primary index; 'experiment' is the reverse side. */
  tier: 'flagship' | 'experiment';
  requirements: ModeRequirements;
  /** The material the sheet becomes while this mode is active. */
  material: 'paper' | 'ink' | 'blueprint';
  /**
   * Heavy modes are code-split behind this loader. Absent for modes that are
   * not enterable yet — there is nothing to load and nothing to pretend about.
   */
  load?: () => Promise<{ default: ComponentType<ModeViewProps> }>;
}

/** Every mode component receives exactly this. */
export interface ModeViewProps {
  /** Call when the entry choreography has finished and the mode is interactive. */
  onReady: () => void;
  /** Call to leave. Equivalent to Escape or the EXIT control. */
  onExit: () => void;
  /** Disposed for you on exit. Register every listener/timer/tween here. */
  scope: import('../core/cleanup').CleanupScope;
}

export type ModePhase = 'idle' | 'loading' | 'entering' | 'active' | 'exiting' | 'error';

export const STATUS_LABEL: Record<ModeStatus, string> = {
  online: 'ONLINE',
  'in-development': 'IN DEVELOPMENT',
  research: 'RESEARCH',
  dormant: 'DORMANT',
  sealed: 'SEALED',
};

export function isEnterable(mode: ModeDefinition): boolean {
  return mode.status === 'online' && typeof mode.load === 'function';
}
