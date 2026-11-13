import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every asset path relative, so the built app works from
// any folder on GitHub Pages (e.g. /HHGoogleBookApps/recorder/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
});
