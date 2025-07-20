import { getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBridge } from '../src/bridge/Bridge'

// Mock window for testing
const createMockWindow = (): Window => {
  const mockWindow = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    origin: 'http://localhost:3000',
    closed: false,
  } as unknown as Window
  return mockWindow
}

describe('Bridge Reactivity', () => {
  let store: ReturnType<typeof getDefaultStore>
  let mockTargetWindow: Window
  let logSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    store = getDefaultStore()
    mockTargetWindow = createMockWindow()
    logSpy = vi.fn()
  })

  it('should have reactive remoteProxyAtom that responds to session changes', async () => {
    // Create bridge with logging
    const bridge = createBridge(
      {
        methods: { testMethod: () => 'test' },
        log: logSpy,
      },
      store
    )

    // Track atom evaluations using existing Bridge interface
    let remoteProxyAtomEvaluationCount = 0

    // Get the public LazyLoadable atom
    const remoteProxyAtom = bridge.getRemoteProxyAtom()

    // Subscribe to atom to track evaluations
    const proxyUnsubscribe = store.sub(remoteProxyAtom, () => {
      remoteProxyAtomEvaluationCount++
      const proxyLoadable = store.get(remoteProxyAtom)
      console.log(
        `📊 remoteProxyAtom evaluation #${remoteProxyAtomEvaluationCount}: state=${proxyLoadable.state}, hasData=${proxyLoadable.state === 'hasData'}`
      )
    })

    try {
      // Initial state - should be uninitialized
      expect(bridge.isConnected()).toBe(false)
      expect(bridge.getRemoteProxyPromise()).toBeNull()

      const initialProxyLoadable = store.get(remoteProxyAtom)
      expect(initialProxyLoadable.state).toBe('uninitialized')

      // Connect bridge - this should trigger session creation and atom updates
      bridge.connect(mockTargetWindow)

      // Check if atoms re-evaluated after connection
      const proxyPromiseAfterConnect = bridge.getRemoteProxyPromise()
      const proxyLoadableAfterConnect = store.get(remoteProxyAtom)

      // Assertions - These should pass if reactivity works
      expect(proxyPromiseAfterConnect).not.toBeNull()

      // CRITICAL TEST: remoteProxyAtom should have re-evaluated after session creation
      expect(remoteProxyAtomEvaluationCount).toBeGreaterThan(0)
      expect(proxyLoadableAfterConnect.state).toBe('loading') // Should be loading state

      // Test reset functionality
      bridge.reset()

      const proxyPromiseAfterReset = bridge.getRemoteProxyPromise()
      const proxyLoadableAfterReset = store.get(remoteProxyAtom)

      // After reset, should be back to initial state
      expect(proxyPromiseAfterReset).toBeNull()
      expect(proxyLoadableAfterReset.state).toBe('uninitialized')
      expect(bridge.isConnected()).toBe(false)
    } finally {
      // Cleanup subscriptions
      proxyUnsubscribe()
    }
  })

  it('should handle multiple connect/reset cycles correctly', () => {
    const bridge = createBridge(
      {
        methods: { testMethod: () => 'test' },
        log: logSpy,
      },
      store
    )

    let evaluationCount = 0
    const remoteProxyAtom = bridge.getRemoteProxyAtom()

    const unsubscribe = store.sub(remoteProxyAtom, () => {
      evaluationCount++
      const loadable = store.get(remoteProxyAtom)
      console.log(`📊 Cycle evaluation #${evaluationCount}: state=${loadable.state}`)
    })

    try {
      // Multiple connect/reset cycles
      for (let i = 0; i < 3; i++) {
        console.log(`🔄 Cycle ${i + 1}`)

        bridge.connect(mockTargetWindow)
        const loadableAfterConnect = store.get(remoteProxyAtom)
        expect(loadableAfterConnect.state).toBe('loading')

        bridge.reset()
        const loadableAfterReset = store.get(remoteProxyAtom)
        expect(loadableAfterReset.state).toBe('uninitialized')
      }

      // Should have evaluated multiple times
      expect(evaluationCount).toBeGreaterThan(6) // At least 2 per cycle
    } finally {
      unsubscribe()
    }
  })
})
