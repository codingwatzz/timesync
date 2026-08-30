import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separat von vite.config.ts, damit "tsc -b" (Teil von "npm run build") nicht über die
// Vitest-spezifischen Typerweiterungen stolpert, die nur zur Testzeit gebraucht werden.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
  },
})
