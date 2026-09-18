import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@launchpad-ui/tokens/fonts.css';
import '@launchpad-ui/tokens/index.css';
import '@launchpad-ui/tokens/themes.css';
import '@launchpad-ui/components/style.css';
import './styles/app.css';
import { App } from './App';
import { installIconSprite } from './lib/iconSprite';

// Fired, not awaited: icons fill in a beat after the first paint.
void installIconSprite();

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
