import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDisposable } from '../../spatial/disposal';
import { buildArchive } from './sampler';

/**
 * THE RECONSTRUCTION FIELD.
 *
 * One geometry, one draw call, the whole archive. Each point knows two things:
 * where it belongs (`aTarget`) and where its residue sits (`aScatter`).
 * Confidence is derived **in the shader** from the point's own depth against the
 * visitor's position, so nothing per-record has to be uploaded per frame and
 * there is no uniform array to index.
 *
 * The result is the mode's argument made mechanical: a record far away is
 * scattered residue; approaching collapses the residue onto the typography it
 * came from; leaving lets it fall apart again. Nothing is faded in — the points
 * are always the same points, in different states of assembly.
 */

const VERT = /* glsl */ `
  attribute vec3 aTarget;
  attribute vec3 aScatter;
  attribute float aSeed;

  uniform float uFocus;      // visitor position on z
  uniform float uRange;      // how far a record stays legible
  uniform float uHold;       // 0..1 — deliberate reconstruction
  uniform float uTime;
  uniform float uSize;
  uniform float uDrift;

  varying float vConf;
  varying float vSeed;
  varying float vFade;

  void main() {
    // Confidence from this point's own depth. Sharpened so the transition from
    // residue to type happens over a readable distance rather than everywhere.
    float d = abs(aTarget.z - uFocus) / uRange;
    float conf = clamp(1.0 - d, 0.0, 1.0);
    // Sharp: the record you are at resolves, the ones beyond it stay trace.
    conf = pow(conf, 2.6);
    conf = clamp(conf + uHold * 0.30 * step(0.10, conf), 0.0, 1.0);

    // Residue never sits still: it remembers previous positions and drifts
    // slowly around them. The drift dies as the memory resolves.
    float t = uTime * 0.18 + aSeed * 6.2831;
    vec3 wander = vec3(sin(t), cos(t * 0.83), sin(t * 0.61)) * uDrift * (1.0 - conf);

    float residue = pow(1.0 - conf, 1.55);
    vec3 pos = aTarget + aScatter * residue + wander;

    // The camera never moves; the world does. Translating the whole archive by
    // the visitor's position turns the z axis into a corridor walked through,
    // rather than a line of records that get literally smaller and further away.
    pos.z -= uFocus;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Unresolved points are larger and softer — grain before it becomes ink.
    float depth = -mv.z;
    float size = uSize * (1.0 + (1.0 - conf) * 1.15) * (0.55 + aSeed * 0.6);
    // Clamped: without a ceiling, residue passing near the camera blew up into
    // dinner-plate blobs that filled the frame and buried the record.
    gl_PointSize = clamp(size * (620.0 / max(240.0, depth)), 0.0, 9.0);

    // Residue fades out both very close and very far, so the corridor reads as
    // depth of field rather than fog.
    vFade = smoothstep(150.0, 620.0, depth) * (1.0 - smoothstep(2600.0, 4600.0, depth));

    vConf = conf;
    vSeed = aSeed;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uInk;
  uniform float uOpacity;
  varying float vConf;
  varying float vSeed;
  varying float vFade;

  void main() {
    // Round grains, soft at the edge. No sprite texture to load or dispose.
    vec2 c = gl_PointCoord - 0.5;
    float r = dot(c, c);
    if (r > 0.25) discard;
    float edge = smoothstep(0.25, 0.045, r);

    // Faint at range, present up close. A floor keeps distant records visible
    // as trace rather than letting the archive go black.
    float a = (0.07 + vConf * 0.9) * edge * uOpacity * vFade;
    // Grain: not every sample carries the same weight of ink.
    a *= 0.62 + vSeed * 0.38;
    gl_FragColor = vec4(uInk, a);
  }
`;

export interface MemoryFieldProps {
  count: number;
  spacing: number;
  scale: number;
  /** Visitor position along z, written every frame without React. */
  focusRef: RefObject<number>;
  /** 0..1 deliberate reconstruction, written every frame without React. */
  holdRef: RefObject<number>;
  reduced: boolean;
}

export function MemoryField({
  count,
  spacing,
  scale,
  focusRef,
  holdRef,
  reduced,
}: MemoryFieldProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const archive = useMemo(() => buildArchive(count, spacing, scale), [count, spacing, scale]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(archive.target.slice(), 3));
    g.setAttribute('aTarget', new THREE.BufferAttribute(archive.target, 3));
    g.setAttribute('aScatter', new THREE.BufferAttribute(archive.scatter, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(archive.seed, 1));
    // The archive is a corridor; a sphere big enough to hold it stops three
    // culling records that are legitimately behind the visitor.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -spacing * 5), spacing * 12);
    return g;
  }, [archive, spacing]);
  useDisposable(geometry);

  const uniforms = useMemo(
    () => ({
      uFocus: { value: 0 },
      uRange: { value: spacing * 2.0 },
      uHold: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 5.8 },
      uDrift: { value: reduced ? 0 : 9 },
      uOpacity: { value: 0 },
      uInk: { value: new THREE.Color('#e9e2d0') },
    }),
    [spacing, reduced],
  );

  const shown = useRef(0);

  useFrame((_, dt) => {
    const m = matRef.current;
    if (!m) return;
    const u = m.uniforms;
    u.uFocus.value = focusRef.current ?? 0;
    u.uHold.value = holdRef.current ?? 0;
    if (!reduced) u.uTime.value += Math.min(dt, 0.05);
    // The archive arrives rather than appearing.
    shown.current = Math.min(1, shown.current + dt / (reduced ? 0.25 : 1.5));
    u.uOpacity.value = shown.current;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}
