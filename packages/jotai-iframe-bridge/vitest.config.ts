/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  optimizeDeps: {
    include: ['@testing-library/jest-dom/matchers', 'react/jsx-dev-runtime'],
  },
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
