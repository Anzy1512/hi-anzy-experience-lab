import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './design-system/fonts.css';
import './design-system/tokens.css';
import './design-system/base.css';
import './design-system/typography.css';

import { ExperienceProvider } from './experience/ExperienceProvider';
import { App } from './app/App';
import { startWorkspace } from './system/projects';

const container = document.getElementById('lab-root');
if (!container) throw new Error('[lab] #lab-root is missing from index.html');

/*
 * Read what this browser has stored, before React mounts.
 *
 * Only the index is read synchronously here — a few hundred bytes of
 * localStorage, so the launcher can say how many projects exist without a
 * frame of saying nothing. The project bodies are read asynchronously, and a
 * browser that cannot store anything reaches the next line just as fast with an
 * empty list and a sentence explaining why.
 *
 * Outside the React tree on purpose: StrictMode double-invokes effects, and a
 * boot that ran twice would resume a project, replace it, and stamp two
 * PROJECT_RESUMED entries in its history. `startWorkspace` is idempotent as
 * well, but not being in the tree is the reason rather than the guard.
 */
startWorkspace();

/*
 * The product manifests, loaded in development only so their guard runs.
 *
 * `system/maturity.ts` records what each reality owns, what it depends on, how
 * far along it is and what stands between it and being its own application. It
 * is not read by any surface yet, which means nothing would ever load it — and
 * a manifest nobody loads is a document pretending to be code. Its dev check,
 * that the manifests still describe the same sixteen things as the index and
 * the registry, would have been dead from the day it was written.
 *
 * `system/release` is imported rather than `system/maturity` because it reads
 * the manifests to apply the release contract, so importing it runs both
 * guards: the manifests still describe the same sixteen things, AND no reality
 * has quietly recorded `N/A` against a dimension its own declarations owe.
 *
 * `import.meta.env.DEV` is statically false in a production build, so this
 * branch and everything it reaches is eliminated: measured, the boot payload
 * does not move.
 */
if (import.meta.env.DEV) void import('./system/release');

createRoot(container).render(
  <StrictMode>
    <ExperienceProvider>
      <App />
    </ExperienceProvider>
  </StrictMode>,
);
