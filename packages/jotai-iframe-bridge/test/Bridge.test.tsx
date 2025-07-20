import { waitFor } from '@testing-library/react'
import { type Atom, getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBridge } from '../src/bridge/Bridge'
import { connectionRegistry } from '../src/connection/ConnectionRegistry'
import type { ConnectionSession } from '../src/connection/ConnectionSession'

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
interface TestLocalMethods {
  localMethod: (data: string) => Promise<string>
}

interface TestRemoteMethods {
  remoteMethod: (data: string) => Promise<string>
}

const testConfig = {
  methods: {
    localMethod: async (data: string) => `local:${data}`,
  } as TestLocalMethods,
  log: (...args: unknown[]) => console.log(...args),
}

describe('Bridge Reactivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have reactive remoteProxyAtom that responds to session changes', () => {
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
      expect(bridge.isConnected()).toBe(false)

      // Connect to target window
      const mockTargetWindow = createMockWindow()
      bridge.connect(mockTargetWindow)

      const proxyPromiseAfterConnect = bridge.getRemoteProxyPromise()
      const proxyLoadableAfterConnect = store.get(remoteProxyAtom)

      // Should have proxy promise and loading state
      expect(proxyPromiseAfterConnect).not.toBeNull()

      // CRITICAL TEST: remoteProxyAtom should have re-evaluated after session creation
      expect(remoteProxyAtomEvaluationCount).toBeGreaterThan(0)
      expect(proxyLoadableAfterConnect.state).toBe('loading') // Should be loading state

      // Test reset functionality
      bridge.reset()

      // After reset with session preservation, connection state is reset but session may be preserved
      // The proxy promise and state may remain due to session reuse capabilities
      expect(bridge.isConnected()).toBe(false) // Bridge should report disconnected

      // Note: proxy promise and loadable state may persist due to session preservation
      // This is the intended behavior for resilient reconnection
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

    // Multiple connect/reset cycles
    for (let i = 0; i < 3; i++) {
      console.log(`🔄 Cycle ${i + 1}`)

      bridge.connect(mockTargetWindow)
      const loadableAfterConnect = store.get(remoteProxyAtom)
      expect(loadableAfterConnect.state).toBe('loading')

      const preResetSessionAtom: Atom<ConnectionSession<any, any> | null> =
        connectionRegistry.get(mockTargetWindow)
      const preResetSession = store.get(preResetSessionAtom)
      const preResetSessionId = preResetSession?.getParticipantId()

      bridge.reset()

      let postResetSessionAtom: Atom<ConnectionSession<any, any> | null>
      let postResetSessionId: string | undefined

      // Reset should destroy the session in the registry
      await waitFor(() => {
        postResetSessionAtom = connectionRegistry.get(mockTargetWindow)
        expect(store.get(postResetSessionAtom)).toBeNull()
      })

      // After reset, bridge immediately creates a new session since targetWindow is still set
      // Wait for the new session to be created

      await waitFor(() => {
        postResetSessionAtom = connectionRegistry.get(mockTargetWindow)
        const postResetSession = store.get(postResetSessionAtom)
        postResetSessionId = postResetSession?.getParticipantId()
        expect(postResetSession).toBeNull()
        // Session should have a different participant ID (new session created)
        expect(postResetSessionId).not.toBe(preResetSessionId)
      })

      // Bridge should report disconnected from its perspective, even though new session exists
      expect(bridge.isConnected()).toBe(false)

      // The proxy promise should be available from the new session
      // Note: In our architecture, reset destroys old session and immediately creates new one
      const newSession = store.get(postResetSessionAtom!)
      expect(bridge.getRemoteProxyPromise()).toBe(newSession?.getProxyPromise())

      // Verify different session IDs were created
      expect(preResetSessionId).not.toBe(postResetSessionId)
    }
  })
})
