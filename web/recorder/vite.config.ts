import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps every asset path relative, so the built app works from
// any folder on GitHub Pages (e.g. /HHGoogleBookApps/recorder/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.webmanifest
      workbox: {
        // App shell + pdf.js worker are cached up front so the installed app
        // opens offline. The big effects runtime is cached the first time
        // effects are used.
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,tflite}'],
        globIgnores: ['mediapipe/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/mediapipe/'),
            handler: 'CacheFirst',
            options: { cacheName: 'effects-runtime', expiration: { maxEntries: 10 } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022' },
});
