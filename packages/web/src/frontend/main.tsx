/// <reference types="vite/client" />
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import './styles/globals.css';

// Auto-set dashboard token for development
if (import.meta.env.DEV && !localStorage.getItem('codeagora-token')) {
  localStorage.setItem('codeagora-token', 'demo-token-2026');
}

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}
