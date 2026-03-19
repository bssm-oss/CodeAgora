import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:6274',
      '/ws': { target: 'ws://localhost:6274', ws: true },
    },
  },
});
