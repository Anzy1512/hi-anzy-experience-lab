import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDisposable } from '../spatial/disposal';
import { buildDelays, buildSeeds } from './particles';

/**
 * THE FIELD — one draw call, N particles, no physics sandbox.
 *
 * ARCHITECTURE, and why it is this and not a GPGPU ping-pong:
 *
 * Every particle's position is computed **analytically in the vertex shader**
 * from two authored target formations and a transition value. There is no
 * simulation state to store, so there are no float render targets, no
 * ping-ponging, no readback, and no per-frame CPU work at all — the entire
 * update is `mix(from, to, t)` plus a pointer force term.
 *
 * That is the right trade for this mode specifically. Matter Engine's brief is
 * *authored material states*, not emergent physics: matter is always on its way
 * from one arrangement the Lab has already made to another. A GPGPU integrator
 * would buy emergent behaviour we deliberately do not want, at the cost of two
 * float textures, an extra pass, and a WebGL2-float-render-target requirement
 * that would exclude devices this runs fine on today.
 *
 * WebGPU: not used. Three's WebGPU path is a different renderer with its own
 * node material system; adopting it would fork `SpatialCanvas` and every other
 * spatial mode for a workload that is already GPU-bound in the right place.
 * Capability detection reports whether WebGPU exists so the claim is honest, and
 * the readout says plainly that this build does not use it.
 */

interface Props {
  /**
   * The two formations, as flat xyz buffers of the same length.
   *
   * Prebuilt by the caller rather than named. This used to take Matter
   * Engine's `MatterState` vocabulary and call its `buildTargets` itself,
   * which meant Presence — a mode that draws one static field and has no
   * states at all — imported a sibling mode to get a renderer. The formations
   * are the caller's domain; arranging them is this component's.
   *
   * Identity matters: the geometry is rebuilt when `to` changes, so a caller
   * that builds a new array every render would rebuild every frame. Memoise.
   */
  from: Float32Array;
  to: Float32Array;
  /** 0 → `from`, 1 → `to`. */
  progressRef: { current: number };
  /** Pointer in world space plus force sign: +1 attract, −1 repel, 0 off. */
  forceRef: { current: { x: number; y: number; sign: number } };
  spread: number;
  reduced: boolean;
  /**
   * Set to a callback to request one still. The frame loop clears it, renders,
   * reads the buffer in the same tick and hands back the blob — or `null` when
   * the browser refuses, which the caller reports rather than swallowing.
   */
  captureRef: { current: ((blob: Blob | null) => void) | null };
}

const VERT = /* glsl */ `
  attribute vec3 tFrom;
  attribute vec3 tTo;
  attribute float delay;
  attribute float seed;

  uniform float uProgress;
  uniform float uTime;
  uniform vec3  uPointer;
  uniform float uForce;
  uniform float uSize;
  uniform float uDrift;

  varying float vDepth;
  varying float vSeed;

  // Per-particle eased transition, staggered by delay so a state change sweeps.
  float staged(float p, float d) {
    float t = clamp((p - d) / max(0.0001, 1.0 - d), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  void main() {
    float t = staged(uProgress, delay);
    vec3 pos = mix(tFrom, tTo, t);

    // A small, slow breath so settled matter is not dead. Amplitude is tiny and
    // scales with the particle's own seed, so it never reads as noise.
    pos += vec3(
      sin(uTime * 0.35 + seed * 43.0),
      cos(uTime * 0.29 + seed * 71.0),
      sin(uTime * 0.23 + seed * 17.0)
    ) * uDrift * (0.4 + seed * 0.6);

    // Pointer force: inverse-square-ish falloff, clamped so nothing explodes.
    if (abs(uForce) > 0.001) {
      vec3 d = pos - uPointer;
      float dist = max(length(d), 1.0);
      float fall = clamp(180.0 / dist, 0.0, 1.6);
      pos += normalize(d) * fall * uForce * 60.0 * (0.6 + seed * 0.8);
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    // Perspective-correct point size, with a floor so distant matter stays visible.
    gl_PointSize = max(1.0, uSize * (300.0 / max(1.0, -mv.z)));
    vDepth = clamp(-mv.z / 2600.0, 0.0, 1.0);
    vSeed = seed;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying float vDepth;
  varying float vSeed;
  uniform vec3 uNear;
  uniform vec3 uFar;

  void main() {
    // Round points, cheaply. No texture, no alpha atlas.
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    vec3 col = mix(uNear, uFar, vDepth);
    float a = (0.55 + vSeed * 0.45) * (1.0 - vDepth * 0.55);
    gl_FragColor = vec4(col, a);
  }
`;

export function ParticleField({
  from,
  to,
  progressRef,
  forceRef,
  spread,
  reduced,
  captureRef,
}: Props) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const count = to.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(to.slice(), 3));
    g.setAttribute('tFrom', new THREE.Float32BufferAttribute(from, 3));
    g.setAttribute('tTo', new THREE.Float32BufferAttribute(to, 3));
    g.setAttribute('delay', new THREE.Float32BufferAttribute(buildDelays(count), 1));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(buildSeeds(count), 1));
    // The analytic shader means the CPU-side bounds are meaningless; give three
    // a generous sphere so nothing is wrongly frustum-culled.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), spread * 3);
    return g;
    // `from` deliberately excluded: the geometry is rebuilt when the
    // DESTINATION changes, reading whatever `from` was at that moment — which
    // is what makes a transition start from where the last one ended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, spread]);

  useDisposable(geometry);

  const uniforms = useMemo(
    () => ({
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector3() },
      uForce: { value: 0 },
      uSize: { value: 1.7 },
      uDrift: { value: reduced ? 0 : 3.2 },
      uNear: { value: new THREE.Color('#f4ecd8') },
      uFar: { value: new THREE.Color('#6d6a5e') },
    }),
    [reduced],
  );

  useEffect(() => {
    if (matRef.current) matRef.current.uniforms.uDrift.value = reduced ? 0 : 3.2;
  }, [reduced]);

  useFrame((three, dt) => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uProgress.value = progressRef.current;
    m.uniforms.uTime.value += Math.min(dt, 0.05);
    const f = forceRef.current;
    m.uniforms.uPointer.value.set(f.x, f.y, 0);
    m.uniforms.uForce.value = f.sign;

    /*
     * CAPTURING A STILL WITHOUT PRESERVING THE BUFFER.
     *
     * A WebGL drawing buffer is cleared the moment the frame is presented, so
     * `canvas.toBlob()` from an event handler returns a blank image. The usual
     * fix is `preserveDrawingBuffer: true`, and it is the wrong trade here:
     * this mode draws 160,000 points continuously, and making every frame
     * readable to serve a button nobody has pressed yet taxes the one mode in
     * the Lab that genuinely needs its frame budget.
     *
     * Instead the request is fulfilled here, inside the loop: render on demand
     * and read the buffer in the same tick, before it is presented. Costs
     * nothing until somebody asks, and what comes back is the frame that was on
     * screen rather than a re-creation of it.
     */
    const want = captureRef.current;
    if (want) {
      captureRef.current = null;
      three.gl.render(three.scene, three.camera);
      three.gl.domElement.toBlob((blob) => want(blob), 'image/png');
    }
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
