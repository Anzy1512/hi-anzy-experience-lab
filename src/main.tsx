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

createRoot(container).render(
  <StrictMode>
    <ExperienceProvider>
      <App />
    </ExperienceProvider>
  </StrictMode>,
);
