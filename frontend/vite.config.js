import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // En dev (npm run dev), les appels /api partent vers le backend Flask.
    proxy: { '/api': 'http://localhost:8001' },
  },
})
