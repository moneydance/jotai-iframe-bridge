import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach, expect, vi } from 'vitest'
import { bridgeRegistry } from './src/bridge/BridgeRegistry'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Setup automatic cleanup after each test in browser mode
afterEach(() => {
  cleanup()
  bridgeRegistry.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
