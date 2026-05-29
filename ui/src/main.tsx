// ui/src/main.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import App from './App';

import { ErrorBoundary } from './components/ErrorBoundary';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
