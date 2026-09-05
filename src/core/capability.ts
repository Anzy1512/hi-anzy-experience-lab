/**
 * Capability classification.
 *
 * Deliberately coarse and deliberately non-invasive: viewport, pointer type,
 * DPR, reduced-motion and whether WebGL can actually produce a context. No
 * fingerprinting, no UA sniffing, no "desktop therefore fast" assumption.
 *
 * Phase 1 uses the profile for two decisions only — whether to run the WebGL
 * depth field, and how dense the X-Ray overlays are allowed to be. The richer
 * governor belongs to the modes that will actually need it.
 */

export type PerformanceProfile = 'ultra' | 'high' | 'balanced' | 'lite';

export interface Capability {
  profile: PerformanceProfile;
  webgl: boolean;
  reducedMotion: boolean;
  coarsePointer: boolean;
  dpr: number;
  viewport: { w: number; h: number };
  cores: number;
}

let webglResult: boolean | null = null;

/** Probed once; the throwaway context is explicitly released. */
export function detectWebGL(): boolean {
  if (webglResult !== null) return webglResult;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl'));
    if (!gl) {
      webglResult = false;
      return false;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    webglResult = true;
  } catch {
    webglResult = false;
  }
  return webglResult;
}

/**
 * Whether the browser exposes WebGPU at all.
 *
 * Reported so the Lab can say something true about it. Matter Engine does NOT
 * use it: three's WebGPU path is a separate renderer with its own node material
 * system, and adopting it would fork SpatialCanvas and every spatial mode for a
 * workload that is already GPU-bound in the right place. Detecting it and
 * labelling it "PRESENT · UNUSED" is the honest position; claiming a WebGPU
 * pipeline that does not exist would not be.
 */
export function detectWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function hasCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * DEVELOPMENT-ONLY capability overrides, read from the query string.
 *
 *   ?profile=lite|balanced|high|ultra   force a tier
 *   ?webgl=off                          simulate a machine with no WebGL
 *
 * These exist because the fallback tiers are load-bearing product decisions —
 * Reality Compiler and Living World are both designed so their DOM half carries
 * the whole idea — and "we wrote a lite branch" is not the same claim as "we ran
 * the lite branch". Stripped from production along with the rest of the dev
 * tooling, since `import.meta.env.DEV` is statically replaced.
 */
function devOverride(key: string): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

const PROFILES: PerformanceProfile[] = ['ultra', 'high', 'balanced', 'lite'];

export function readCapability(): Capability {
  const reducedMotion = prefersReducedMotion();
  const coarsePointer = hasCoarsePointer();
  const forcedGl = devOverride('webgl');
  const webgl = forcedGl === 'off' ? false : detectWebGL();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const cores = navigator.hardwareConcurrency ?? 4;

  let profile: PerformanceProfile;
  if (reducedMotion || !webgl) {
    // Reduced motion is a stated preference, not a capability. It still caps
    // us: we honour it by choosing the cheapest, calmest tier.
    profile = 'lite';
  } else if (coarsePointer) {
    profile = viewport.w >= 900 && cores >= 6 ? 'balanced' : 'lite';
  } else if (cores >= 8 && dpr <= 2 && viewport.w >= 1440) {
    profile = 'ultra';
  } else if (cores >= 4) {
    profile = 'high';
  } else {
    profile = 'balanced';
  }

  const forced = devOverride('profile');
  if (forced && (PROFILES as string[]).includes(forced)) {
    profile = forced as PerformanceProfile;
  }

  return { profile, webgl, reducedMotion, coarsePointer, dpr, viewport, cores };
}

/** Overlay density budget, so X-Ray layers scale instead of being on/off. */
export function overlayBudget(profile: PerformanceProfile): number {
  switch (profile) {
    case 'ultra':
      return 1;
    case 'high':
      return 0.8;
    case 'balanced':
      return 0.55;
    case 'lite':
      return 0.35;
  }
}
