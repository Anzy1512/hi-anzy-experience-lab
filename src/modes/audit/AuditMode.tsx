import { useEffect } from 'react';

import type { ModeViewProps } from '../../experience/types';
import { ServiceProvider } from '../../product/ServiceProvider';
import { Surface } from '../../product/Surface';
import '../../product/product.css';

/**
 * COMMERCIAL AUDIT — THE ONE REALITY THAT READS THE REAL WORLD.
 *
 * ── WHY IT BELONGS ON THE INDEX ─────────────────────────────────────────────
 *
 * Every other reality is a closed system: it reasons about the Lab's own
 * specimens, the canonical pages, or a territory this repository invented. This
 * one points at businesses nobody here chose, reads what they publish, and
 * reports what it could and could not establish about them. It is the same
 * institution doing the same thing — showing its working — against material it
 * does not control.
 *
 * Kept off the index it became a second product: its own page, its own build,
 * its own vocabulary, drifting away from the thing it is part of. It is a
 * reality. It has a plate number.
 *
 * ── WHAT IT LOADS, AND WHAT IT DOES NOT ─────────────────────────────────────
 *
 * The surface, the service client and one stylesheet. No three, no canvas, no
 * spatial layer, no RAF subscription — it is a document that reads a backend,
 * and it holds no frame callback at all. Because the mode is reached through
 * `load()`, its JavaScript and its CSS are both split out of the entry: a
 * visitor who never opens it never downloads it.
 *
 * ── AND WHY IT STILL RUNS ON ITS OWN ────────────────────────────────────────
 *
 * `product.html` is untouched and still builds to `dist-product/`. The audit is
 * a commercial instrument with a life outside the Lab — a client may need it
 * without sixteen realities attached — and both entries render the same
 * `Surface`, so neither can quietly become the older one.
 */
export default function AuditMode({ onReady }: ModeViewProps): React.JSX.Element {
  /*
   * Ready immediately, and honestly.
   *
   * There is no entry choreography to wait for: the surface renders its own
   * five service states, and whether a backend is answering is its first line
   * rather than something to stall the mode host over. Holding the loading
   * screen until a fetch resolved would make an absent service look like a
   * slow Lab.
   */
  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <ServiceProvider>
      <Surface />
    </ServiceProvider>
  );
}
