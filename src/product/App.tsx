import { Surface } from './Surface.tsx';

/**
 * THE STANDALONE PAGE.
 *
 * `product.html` mounts this; the Lab mounts `Surface` directly inside its
 * mode host. Everything that makes the surface what it is lives in `Surface`,
 * so the two entries cannot drift apart — this file only says which of them
 * owns the skip link and the outer frame.
 */
export function App(): React.JSX.Element {
  return <Surface standalone />;
}
