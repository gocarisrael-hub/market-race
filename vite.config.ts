import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Three bundles: site (order flow, /), player (/g/:token), admin (/admin).
export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        site: resolve(__dirname, 'src/web/site/index.html'),
        player: resolve(__dirname, 'src/web/player/index.html'),
        admin: resolve(__dirname, 'src/web/admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/admin/api': 'http://localhost:3000',
      '/static': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
})
