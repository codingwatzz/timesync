import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // relative Pfade, damit die App auch unter /timesync/ auf GitHub Pages funktioniert
})
