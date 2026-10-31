import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // The planner app and the static product landing page (served at /about).
      input: { main: 'index.html', landing: 'landing.html' },
    },
  },
});
