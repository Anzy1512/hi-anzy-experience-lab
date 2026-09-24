import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/design-system/tokens.css';
import '@/design-system/fonts.css';
import '@/design-system/base.css';
import '@/design-system/typography.css';
import './product.css';

import { App } from './App.tsx';
import { ServiceProvider } from './ServiceProvider.tsx';

/**
 * THE AUDIT SURFACE'S ENTRY.
 *
 * Four stylesheets from the design system and one of its own. It imports
 * nothing from `src/app`, `src/experience`, `src/modes`, `src/spatial` or
 * `src/core` — no mode host, no RAF loop, no pointer record, no cleanup scope.
 * Those exist to run sixteen realities inside one document; this is a reading
 * surface for a backend, and borrowing that machinery would couple two things
 * that have no reason to move together.
 */

const root = document.getElementById('audit-root');
if (root === null) throw new Error('#audit-root is missing from product.html');

createRoot(root).render(
  <StrictMode>
    <ServiceProvider>
      <App />
    </ServiceProvider>
  </StrictMode>,
);
