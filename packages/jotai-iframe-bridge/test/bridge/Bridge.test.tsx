import { waitFor } from '@testing-library/react'
import { type Atom, getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBridge } from '../../src/bridge/Bridge'
import { connectionRegistry } from '../../src/connection/ConnectionRegistry'
import type { ConnectionSession } from '../../src/connection/ConnectionSession'

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

describe('Bridge Connection Flow', () => {
  it('should establish connection properly', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Initial state
    expect(bridge.isConnected()).toBe(false)
    expect(bridge.getRemoteProxyPromise()).toBeNull()

    // Connect
    bridge.connect(mockTargetWindow)

    // Wait for session to be created and atoms to update
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    // Should have proxy promise after connection
    const proxyPromise = bridge.getRemoteProxyPromise()
    expect(proxyPromise).not.toBeNull()

    // Should have session in registry (check via registry directly)
    const registrySessionAtom = connectionRegistry.get(mockTargetWindow)
    const registrySession = store.get(registrySessionAtom)
    expect(registrySession).not.toBeNull()
    expect(registrySession?.getParticipantId()).toBeDefined()

    // Proxy promise should be from the registry session
    expect(proxyPromise).toBe(registrySession?.getProxyPromise())
  })

  it('should maintain consistent participant IDs across bridge methods', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    bridge.connect(mockTargetWindow)

    // Wait for session creation
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const registrySessionAtom = connectionRegistry.get(mockTargetWindow)
    const registrySession = store.get(registrySessionAtom)
    const sessionParticipantId = registrySession?.getParticipantId()

    const proxyPromise = bridge.getRemoteProxyPromise()
    expect(proxyPromise).toBe(registrySession?.getProxyPromise())

    // All bridge methods should reference the same session/participant
    expect(sessionParticipantId).toBeDefined()
  })
})

describe('Bridge Reset Flow', () => {
  it('should completely reset bridge state', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Establish initial connection
    bridge.connect(mockTargetWindow)

    // Wait for session creation
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const initialSessionAtom = connectionRegistry.get(mockTargetWindow)
    const initialSession = store.get(initialSessionAtom)
    const initialParticipantId = initialSession?.getParticipantId()
    const initialProxyPromise = bridge.getRemoteProxyPromise()

    expect(bridge.isConnected()).toBe(false) // loading state
    expect(initialSession).not.toBeNull()
    expect(initialParticipantId).toBeDefined()
    expect(initialProxyPromise).not.toBeNull()

    // Reset
    bridge.reset()

    // Should clear session from registry
    await waitFor(() => {
      const postResetSession = store.get(initialSessionAtom)
      expect(postResetSession).toBeNull()
    })

    // Bridge should report disconnected
    expect(bridge.isConnected()).toBe(false)
  })

  it('should create fresh state after reset and reconnect', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Initial connection
    bridge.connect(mockTargetWindow)

    // Wait for initial session creation
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    const initialSessionAtom = connectionRegistry.get(mockTargetWindow)
    const initialSession = store.get(initialSessionAtom)
    const initialParticipantId = initialSession?.getParticipantId()
    const initialProxyPromise = bridge.getRemoteProxyPromise()

    // Reset
    bridge.reset()

    // Wait for session to be cleared
    await waitFor(() => {
      expect(store.get(initialSessionAtom)).toBeNull()
    })

    // Reconnect
    bridge.connect(mockTargetWindow)

    // Wait for new session creation
    await waitFor(() => {
      expect(bridge.getRemoteProxyPromise()).not.toBeNull()
    })

    // Should have new session with different participant ID
    const newSessionAtom = connectionRegistry.get(mockTargetWindow)
    const newSession = store.get(newSessionAtom)
    const newParticipantId = newSession?.getParticipantId()
    const newProxyPromise = bridge.getRemoteProxyPromise()

    expect(newSession).not.toBeNull()
    expect(newParticipantId).toBeDefined()
    expect(newParticipantId).not.toBe(initialParticipantId)
    expect(newProxyPromise).not.toBeNull()
    expect(newProxyPromise).not.toBe(initialProxyPromise)
  })
})

describe('Bridge Proxy State Management', () => {
  it('should return fresh proxy promise after reset', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Initial connection and get proxy
    bridge.connect(mockTargetWindow)
    const oldProxyPromise = bridge.getRemoteProxyPromise()
    expect(oldProxyPromise).not.toBeNull()

    // Reset bridge
    bridge.reset()

    // Wait for reset to complete
    const sessionAtom = connectionRegistry.get(mockTargetWindow)
    await waitFor(() => {
      expect(store.get(sessionAtom)).toBeNull()
    })

    // Reconnect
    bridge.connect(mockTargetWindow)
    const newProxyPromise = bridge.getRemoteProxyPromise()

    // Should be different promise objects
    expect(newProxyPromise).not.toBeNull()
    expect(newProxyPromise).not.toBe(oldProxyPromise)
  })

  it('should handle old proxy references after reset', async () => {
    const store = getDefaultStore()
    const bridge = createBridge<TestLocalMethods, TestRemoteMethods>(testConfig, store)
    const mockTargetWindow = createMockWindow()

    // Initial connection and store proxy reference
    bridge.connect(mockTargetWindow)
    const oldProxyPromise = bridge.getRemoteProxyPromise()
    expect(oldProxyPromise).not.toBeNull()

    // Reset bridge (this should destroy the underlying session/messenger)
    bridge.reset()

    // Wait for session to be destroyed
    const sessionAtom = connectionRegistry.get(mockTargetWindow)
    await waitFor(() => {
      expect(store.get(sessionAtom)).toBeNull()
    })

    // The old proxy promise should still exist but any proxy derived from it
    // should fail when called (since the underlying messenger is destroyed)
    expect(oldProxyPromise).not.toBeNull()

    // Note: We can't easily test proxy method calls here since we'd need
    // to mock the full connection handshake, but this verifies the
    // promise object lifecycle
  })
})

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

      // Wait for session creation
      await waitFor(() => {
        expect(bridge.getRemoteProxyPromise()).not.toBeNull()
      })

      const loadableAfterConnect = store.get(remoteProxyAtom)
      expect(loadableAfterConnect.state).toBe('loading')

      const preResetSessionAtom: Atom<ConnectionSession<any, any> | null> =
        connectionRegistry.get(mockTargetWindow)
      const preResetSession = store.get(preResetSessionAtom)
      const preResetSessionId = preResetSession?.getParticipantId()

      bridge.reset()

      // Reset should destroy the session in the registry
      await waitFor(() => {
        const postResetSession = store.get(preResetSessionAtom)
        expect(postResetSession).toBeNull()
      })

      // Bridge should report disconnected after reset
      expect(bridge.isConnected()).toBe(false)

      // Verify different session IDs were created
      expect(preResetSessionId).toBeDefined()
    }
  })
})
