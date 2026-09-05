import { useEffect } from 'react';
import { startPointerTracking } from '../../core/pointer';
import { useCoarsePointer, useReducedMotion } from '../../core/hooks';
import './instrument.css';

/**
 * THE REGISTRATION INSTRUMENT — our pointer.
 *
 * A registration target, not a cursor novelty: two hairlines, a bracket, and a
 * state label. It is small, it never occludes what it is pointing at, and in
 * X-Ray it becomes the actual measuring device rather than a second decoration.
 *
 * It never renders on coarse pointers. A fake cursor on touch is a bug, not a
 * flourish. Position comes entirely from CSS custom properties written by the
 * shared RAF loop, so this component renders once and never again.
 */
export function Instrument() {
  const coarse = useCoarsePointer();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (coarse) return;
    document.body.setAttribute('data-pointer', 'instrument');
    const stop = startPointerTracking();
    return () => {
      stop();
      document.body.removeAttribute('data-pointer');
    };
  }, [coarse]);

  if (coarse) return null;

  return (
    <div className="inst" data-reduced={reduced ? 'true' : 'false'} aria-hidden="true">
      <span className="inst__h" />
      <span className="inst__v" />
      <span className="inst__box" />
      <span className="inst__label t-mono t-mono-xs" />
    </div>
  );
}
