import { Component, useEffect, useMemo, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { cameraDistance, fovForViewport, type Viewport } from './projection';
import type { SpatialQuality } from './quality';

/**
 * THE SHARED SPATIAL CANVAS.
 *
 * One place that knows how to stand a WebGL layer up safely:
 *
 *  - the camera is configured to match the CSS perspective exactly, so DOM depth
 *    and WebGL depth are the same space (see projection.ts);
 *  - `frameloop="demand"` — nothing renders until something actually changes,
 *    continuing Phase 1's rule that no loop exists while the Lab is idle;
 *  - DPR comes from the quality tier, never from the device unfiltered;
 *  - context loss and scene errors are contained. A WebGL failure must degrade
 *    this layer, never take down the Lab or strand the visitor without an exit.
 */

interface Props {
  quality: SpatialQuality;
  viewport: Viewport;
  children: ReactNode;
  /**
   * Defaults to 'demand' — nothing renders until something changes, which is the
   * rule for the whole Lab. Matter Engine is the one legitimate exception: it is
   * a continuously-evolving simulation, so it opts into 'always' and takes on the
   * responsibility of stopping itself when hidden or exited.
   */
  frameloop?: 'demand' | 'always';
  /** Receives R3F's `invalidate` so the owning mode can request frames. */
  onInvalidator?: (invalidate: () => void) => void;
  /** Called when WebGL is lost or the scene throws. The caller shows a fallback. */
  onFailure?: (reason: string) => void;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* containment                                                                 */
/* -------------------------------------------------------------------------- */
class SceneBoundary extends Component<
  { onFailure?: (reason: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('[lab] spatial scene error', error);
    this.props.onFailure?.(error.message || 'scene error');
  }

  render() {
    // Rendering nothing keeps the canvas alive and the mode's DOM layer intact;
    // the owning mode decides what to say about it.
    return this.state.failed ? null : this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/* inner wiring                                                                */
/* -------------------------------------------------------------------------- */
function CanvasBridge({
  viewport,
  onInvalidator,
  onFailure,
}: {
  viewport: Viewport;
  onInvalidator?: (invalidate: () => void) => void;
  onFailure?: (reason: string) => void;
}) {
  const { invalidate, gl } = useThree();

  useEffect(() => {
    onInvalidator?.(invalidate);
  }, [invalidate, onInvalidator]);

  /*
   * The camera is configured entirely through the `camera` prop on <Canvas>,
   * which R3F re-applies when the prop changes. An earlier version mutated the
   * camera object returned by useThree inside an effect — the common R3F idiom,
   * but it writes to a value the renderer owns, and it meant camera state lived
   * in two places. Driving it from the memoised prop keeps one source of truth
   * and one place where CSS perspective and WebGL fov are kept equal.
   */
  useEffect(() => {
    invalidate();
  }, [viewport.h, viewport.w, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      onFailure?.('webgl context lost');
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [gl, onFailure]);

  return null;
}

/* -------------------------------------------------------------------------- */

export function SpatialCanvas({
  quality,
  viewport,
  children,
  onInvalidator,
  onFailure,
  className,
  frameloop = 'demand',
}: Props) {
  const cameraConfig = useMemo(
    () => ({
      fov: fovForViewport(viewport.h),
      position: [0, 0, cameraDistance()] as [number, number, number],
      near: 1,
      far: cameraDistance() * 6,
    }),
    [viewport.h],
  );

  if (!quality.webgl) return null;

  return (
    <Canvas
      className={className}
      frameloop={frameloop}
      dpr={quality.dpr}
      camera={cameraConfig}
      gl={{
        antialias: quality.profile === 'ultra' || quality.profile === 'high',
        alpha: true,
        powerPreference: 'high-performance',
        // The scene is line work on a flat ground; a depth buffer read-back
        // would buy nothing here.
        stencil: false,
      }}
      style={{ position: 'absolute', inset: 0 }}
      onCreated={({ gl }) => {
        gl.setClearAlpha(0);
      }}
    >
      <CanvasBridge viewport={viewport} onInvalidator={onInvalidator} onFailure={onFailure} />
      <SceneBoundary onFailure={onFailure}>{children}</SceneBoundary>
    </Canvas>
  );
}
