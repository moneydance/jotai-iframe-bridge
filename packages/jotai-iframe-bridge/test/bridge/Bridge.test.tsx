import { waitFor } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBridge } from '../../src/bridge/Bridge'

// Mock window for testing
function createMockWindow(): Window {
  const mockWindow = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { origin: 'http://localhost:3000' },
  } as unknown as Window

  return mockWindow
}

// Test method interfaces
interface TestLocalMethods extends Record<string, (...args: any[]) => any> {
  localMethod: (data: string) => Promise<string>
}

interface TestRemoteMethods extends Record<string, (...args: any[]) => any> {
  remoteMethod: (data: string) => Promise<string>
}

const testConfig = {
  methods: {
    localMethod: async (data: string) => `local:${data}`,
  } as TestLocalMethods,
  log: (...args: unknown[]) => console.log(...args),
}

describe('Bridge Connection Flow', () => {
  it('should establish connection properly', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Initial state - no proxy promise available
    expect(bridge.getRemoteProxyPromise()).toBeNull()

    // Connect
    bridge.connect(mockTargetWindow)

    // Wait for proxy promise to be available
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const proxyPromise = bridge.getRemoteProxyPromise()
    expect(proxyPromise).not.toBeNull()
  })

  it('should maintain consistent proxy state across multiple calls', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    bridge.connect(mockTargetWindow)

    // Wait for proxy promise
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const proxyPromise1 = bridge.getRemoteProxyPromise()
    const proxyPromise2 = bridge.getRemoteProxyPromise()

    // Multiple calls should return the same promise
    expect(proxyPromise1).toBe(proxyPromise2)
    expect(proxyPromise1).not.toBeNull()
  })
})

describe('Bridge Reset Flow', () => {
  it('should reset and auto-reconnect with fresh proxy promise', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Establish initial connection
    bridge.connect(mockTargetWindow)

    // Wait for initial proxy promise
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const initialProxyPromise = bridge.getRemoteProxyPromise()

    // Reset - this should destroy current session and create a new one
    bridge.refresh()

    // Wait for new proxy promise (different from initial)
    await waitFor(() => {
      const newProxyPromise = bridge.getRemoteProxyPromise()
      expect(newProxyPromise).not.toBeNull()
      expect(newProxyPromise).not.toBe(initialProxyPromise)
    })
  })

  it('should create fresh state after reset', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Initial connection
    bridge.connect(mockTargetWindow)

    // Wait for initial proxy promise
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const initialProxyPromise = bridge.getRemoteProxyPromise()

    // Reset
    bridge.refresh()

    // Should have different proxy promise after reset
    await waitFor(() => {
      const newProxyPromise = bridge.getRemoteProxyPromise()
      expect(newProxyPromise).not.toBeNull()
      expect(newProxyPromise).not.toBe(initialProxyPromise)
    })
  })
})

describe('Bridge Proxy State Management', () => {
  it('should return fresh proxy promise after reset', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Initial connection and get proxy
    bridge.connect(mockTargetWindow)

    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const oldProxyPromise = bridge.getRemoteProxyPromise()

    // Reset bridge - this auto-reconnects
    bridge.refresh()

    // Should have different promise objects
    await waitFor(() => {
      const newProxyPromise = bridge.getRemoteProxyPromise()
      expect(newProxyPromise).not.toBeNull()
      expect(newProxyPromise).not.toBe(oldProxyPromise)
    })
  })

  it('should handle connection lifecycle correctly', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Connect to window
    bridge.connect(mockTargetWindow)

    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const firstProxyPromise = bridge.getRemoteProxyPromise()

    // Connect again to same window - should be idempotent (same session)
    bridge.connect(mockTargetWindow)

    await waitFor(() => {
      const secondProxyPromise = bridge.getRemoteProxyPromise()
      expect(secondProxyPromise).not.toBeNull()
      // Should be the SAME proxy promise (idempotent behavior)
      expect(secondProxyPromise).toBe(firstProxyPromise)
    })
  })
})

describe('Bridge Reactivity', () => {
  it('should have reactive remoteProxyAtom that responds to session changes', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const remoteProxyAtom = bridge.getRemoteProxyAtom()

    let remoteProxyAtomEvaluationCount = 0
    const proxyUnsubscribe = store.sub(remoteProxyAtom, () => {
      remoteProxyAtomEvaluationCount++
      const loadable = store.get(remoteProxyAtom)
      console.log(
        `📊 remoteProxyAtom evaluation #${remoteProxyAtomEvaluationCount}: state=${loadable.state}, hasData=${loadable.state === 'hasData'}`
      )
    })

    try {
      // Initial state
      expect(bridge.getRemoteProxyPromise()).toBeNull()
      const initialLoadable = store.get(remoteProxyAtom)
      expect(initialLoadable.state).toBe('uninitialized')

      // Connect to target window
      const mockTargetWindow = createMockWindow()
      bridge.connect(mockTargetWindow)

      // Wait for proxy promise to be available
      await waitFor(() => {
        expect(bridge.getRemoteProxyPromise()).not.toBeNull()
      })

      const proxyLoadableAfterConnect = store.get(remoteProxyAtom)

      // CRITICAL TEST: remoteProxyAtom should have re-evaluated after session creation
      expect(remoteProxyAtomEvaluationCount).toBeGreaterThan(0)
      expect(proxyLoadableAfterConnect.state).toBe('loading') // Should be loading state

      // Test reset functionality
      bridge.refresh()

      // Should get new proxy promise after reset
      await waitFor(() => {
        const newProxyPromise = bridge.getRemoteProxyPromise()
        expect(newProxyPromise).not.toBeNull()
      })
    } finally {
      // Cleanup subscriptions
      proxyUnsubscribe()
    }
  })

  it('should handle multiple connect/reset cycles correctly', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const remoteProxyAtom = bridge.getRemoteProxyAtom()
    const mockTargetWindow = createMockWindow()

    const proxyPromises: (Promise<any> | null)[] = []

    // Multiple connect/reset cycles
    for (let i = 0; i < 3; i++) {
      console.log(`🔄 Cycle ${i + 1}`)

      bridge.connect(mockTargetWindow)

      // Wait for proxy promise
      await waitFor(() => {
        expect(bridge.getRemoteProxyPromise()).not.toBeNull()
      })

      const currentProxyPromise = bridge.getRemoteProxyPromise()
      proxyPromises.push(currentProxyPromise)

      const loadableAfterConnect = store.get(remoteProxyAtom)
      expect(loadableAfterConnect.state).toBe('loading')

      if (i < 2) {
        // Don't reset on the last iteration
        bridge.refresh()

        // Should get different proxy promise after reset
        await waitFor(() => {
          const newProxyPromise = bridge.getRemoteProxyPromise()
          expect(newProxyPromise).not.toBe(currentProxyPromise)
        })
      }
    }

    // All proxy promises should be different
    expect(new Set(proxyPromises).size).toBe(3)
  })
})
