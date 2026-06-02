import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve the workspace package to its real source path (packages/shared) rather than
    // the node_modules symlink, so Vite watches it and HMR picks up scenario/data edits.
    preserveSymlinks: false,
  },
  optimizeDeps: {
    exclude: ['@opviz/shared'],
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..', '../..'],
    },
  },
})

