import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/YouAreMyHome/game/',
  // .env.local lives at the monorepo root and is shared with apps/couples-app
  // (both apps read the same Firebase project config).
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    VitePWA({
      // generateSW (not couples-app's injectManifest) — the game has no
      // push-notification/custom service-worker logic to hand-write, just
      // needs an installable offline-capable shell.
      strategy: 'generateSW',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        id: '/YouAreMyHome/game/',
        name: 'You Are My Home — Game',
        short_name: 'Home Game',
        description: 'A cozy co-op world for the two of us.',
        start_url: '/YouAreMyHome/game/',
        scope: '/YouAreMyHome/game/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Sprite icons/fonts are small and numerous — precache them so the
        // game shell + art is fully ready offline once installed. Music
        // tracks run 5-8MB each (~30 of them) — precaching those would mean
        // a 150MB+ install-time download, so they're runtime-cached instead
        // (cached the first time each track actually plays, not upfront).
        globPatterns: ['**/*.{js,css,html,png,ttf,json}'],
        // Cistercian.ttf is ~2.18MB, just over Workbox's 2MiB default cap —
        // still small next to the music files, and it's needed immediately
        // for UI glyphs so it belongs in the precache, not runtime-cached.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/src\/music\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-music',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            urlPattern: /\/src\/sounds\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-sfx',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
})
