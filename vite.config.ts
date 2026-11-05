import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/vocab/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 },   // Firebase SDK is most of the bundle
})
