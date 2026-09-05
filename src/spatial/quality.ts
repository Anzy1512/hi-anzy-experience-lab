import type { Capability, PerformanceProfile } from '../core/capability';

/**
 * SPATIAL QUALITY TIERS.
 *
 * Phase 1's capability profile answered two yes/no questions. Phase 2 needs it to
 * actually shape a scene, so the profile is translated once, here, into a budget
 * every spatial system reads from. One dial, four settings — not four codebases.
 *
 * `webgl: false` is a first-class tier, not an error state. Reality Compiler is
 * designed so the CSS-3D half alone still communicates the whole idea, which
 * makes "no WebGL" a legitimate way to experience it rather than a broken one.
 */

export interface SpatialQuality {
  profile: PerformanceProfile;
  /** Render the WebGL structure layer at all. */
  webgl: boolean;
  /** Device pixel ratio ceiling for the spatial canvas. */
  dpr: number;
  /** Depth separation between compiled planes, in CSS pixels. */
  depthScale: number;
  /** Terrain grid resolution (segments per side). 0 disables terrain. */
  terrainSegments: number;
  /** Draw the connective scaffold between cells. */
  scaffold: boolean;
  /** Atmospheric depth cue (cheap fog). */
  atmosphere: boolean;
  /** Pointer-driven camera bias magnitude. 0 disables it. */
  pointerBias: number;
  /** Maximum simultaneously rendered world structures in Living World. */
  maxStructures: number;
}

export function spatialQuality(cap: Capability): SpatialQuality {
  const base = {
    profile: cap.profile,
    webgl: cap.webgl,
  };

  switch (cap.profile) {
    case 'ultra':
      return {
        ...base,
        dpr: Math.min(cap.dpr, 2),
        depthScale: 190,
        terrainSegments: 88,
        scaffold: true,
        atmosphere: true,
        pointerBias: 1,
        maxStructures: 12,
      };
    case 'high':
      return {
        ...base,
        dpr: Math.min(cap.dpr, 1.75),
        depthScale: 175,
        terrainSegments: 72,
        scaffold: true,
        atmosphere: true,
        pointerBias: 0.85,
        maxStructures: 10,
      };
    case 'balanced':
      return {
        ...base,
        dpr: Math.min(cap.dpr, 1.5),
        depthScale: 140,
        terrainSegments: 52,
        scaffold: true,
        atmosphere: false,
        pointerBias: 0.5,
        maxStructures: 7,
      };
    case 'lite':
    default:
      return {
        ...base,
        // Reduced motion and absent WebGL both land here. The CSS-3D layer still
        // separates the document into depth; it simply does it with less travel
        // and without a canvas.
        webgl: false,
        dpr: 1,
        depthScale: 96,
        terrainSegments: 0,
        scaffold: false,
        atmosphere: false,
        pointerBias: 0,
        maxStructures: 5,
      };
  }
}
