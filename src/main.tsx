import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './design-system/fonts.css';
import './design-system/tokens.css';
import './design-system/base.css';
import './design-system/typography.css';

import { ExperienceProvider } from './experience/ExperienceProvider';
import { App } from './app/App';

const container = document.getElementById('lab-root');
if (!container) throw new Error('[lab] #lab-root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <ExperienceProvider>
      <App />
    </ExperienceProvider>
  </StrictMode>,
);
