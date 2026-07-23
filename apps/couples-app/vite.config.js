import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version

// Short commit hash of whatever's actually checked out — reflects reality
// automatically on every deploy without needing anyone to remember to bump
// a version number by hand. Falls back gracefully if git isn't available
// (e.g. a source tarball with no .git directory).
function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/YouAreMyHome/',
  // .env.local lives at the monorepo root and is shared with apps/home-game
  // (both apps read the same Firebase project config).
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion),
    'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(gitCommit()),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        id: '/YouAreMyHome/',
        name: 'You Are My Home',
        short_name: 'Home',
        description: 'A little corner of the internet, just for the two of us.',
        start_url: '/YouAreMyHome/',
        scope: '/YouAreMyHome/',
        display: 'standalone',
        background_color: '#fbf2e9',
        theme_color: '#fbf2e9',
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
        // Android/Chrome only — Apple has never implemented Web Share
        // Target in Safari. Lets this installed PWA appear in the OS share
        // sheet; src/sw.js intercepts the resulting POST since this is a
        // static site with no server to actually receive it.
        share_target: {
          action: '/YouAreMyHome/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'images', accept: ['image/*'] }],
          },
        },
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2}'],
      },
    }),
  ],
})
