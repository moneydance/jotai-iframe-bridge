import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach, expect, vi } from 'vitest'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Setup automatic cleanup after each test in browser mode
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
