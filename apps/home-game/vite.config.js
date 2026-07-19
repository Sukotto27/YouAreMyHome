import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: '/YouAreMyHome/game/',
  // .env.local lives at the monorepo root and is shared with apps/couples-app
  // (both apps read the same Firebase project config).
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
})
