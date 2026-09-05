import { useEffect, useRef } from 'react';
import { onFrame } from '../../core/raf';
import { pointer } from '../../core/pointer';
import type { Capability } from '../../core/capability';

/**
 * RENDER + POINTER readouts.
 *
 * Values that change every frame are written straight to text nodes from the
 * shared RAF loop. React renders this panel once. Nothing here is invented and
 * nothing here is sensitive: viewport, DPR, renderer availability, a frame
 * timing average and the pointer's own coordinates.
 *
 * Laid out horizontally because it lives in the instrument band along the foot
 * of the sheet — a floating panel over the specimen was covering the thing the
 * instrument exists to look at.
 */

interface Props {
  capability: Capability;
  objectCount: number;
  showRender: boolean;
  showPointer: boolean;
}

export function Readout({ capability, objectCount, showRender, showPointer }: Props) {
  const fpsRef = useRef<HTMLSpanElement>(null);
  const ptrRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!showRender && !showPointer) return;
    let acc = 0;
    let frames = 0;

    return onFrame((dt) => {
      if (showRender && fpsRef.current) {
        acc += dt;
        frames++;
        if (acc >= 500) {
          fpsRef.current.textContent = String(Math.round(1000 / (acc / frames)));
          acc = 0;
          frames = 0;
        }
      }
      if (showPointer && ptrRef.current) {
        ptrRef.current.textContent = `${Math.round(pointer.sx)},${Math.round(pointer.sy)}`;
      }
    });
  }, [showRender, showPointer]);

  if (!showRender && !showPointer) return null;

  return (
    <dl className="xr-readout" aria-label="Instrument readout">
      {showRender && (
        <>
          <div>
            <dt>VIEW</dt>
            <dd>
              {capability.viewport.w}×{capability.viewport.h}
            </dd>
          </div>
          <div>
            <dt>DPR</dt>
            <dd>{capability.dpr.toFixed(2)}</dd>
          </div>
          <div>
            <dt>GL</dt>
            <dd className={capability.webgl ? 't-signal' : ''}>{capability.webgl ? 'YES' : 'NO'}</dd>
          </div>
          <div>
            <dt>PROFILE</dt>
            <dd>{capability.profile.toUpperCase()}</dd>
          </div>
          <div>
            <dt>OBJ</dt>
            <dd>{String(objectCount).padStart(3, '0')}</dd>
          </div>
          <div>
            <dt>FRAME</dt>
            <dd>
              <span ref={fpsRef}>--</span>
            </dd>
          </div>
        </>
      )}

      {showPointer && (
        <div>
          <dt>PTR</dt>
          <dd>
            <span ref={ptrRef}>--</span>
          </dd>
        </div>
      )}
    </dl>
  );
}
