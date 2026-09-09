import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative paths so Electron can load dist/index.html via file://
  base: './',
  server: {
    port: 5173,
    strictPort: true, // fail fast if 5173 is taken — Electron always knows the port
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
