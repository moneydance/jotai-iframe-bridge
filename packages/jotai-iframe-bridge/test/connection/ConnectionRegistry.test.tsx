import { createStore, getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionRegistry } from '../../src/connection/ConnectionRegistry'
import type { ConnectionSession } from '../../src/connection/ConnectionSession'

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

// Mock ConnectionSession for testing
const createMockSession = (id: string) =>
  ({
    isDestroyed: vi.fn().mockReturnValue(false),
    destroy: vi.fn(),
    participantId: id,
  }) as unknown as ConnectionSession<any, any>

describe('ConnectionRegistry Reactivity', () => {
  let store: ReturnType<typeof getDefaultStore>
  let registry: ConnectionRegistry
  let mockWindow: Window

  beforeEach(() => {
    store = getDefaultStore()
    registry = new ConnectionRegistry()
    mockWindow = createMockWindow()
  })

  it('should trigger atom re-evaluation when session is set', () => {
    // Get atom for the window
    const windowAtom = registry.get(mockWindow)

    let evaluationCount = 0
    const unsubscribe = store.sub(windowAtom, () => {
      evaluationCount++
      const session = store.get(windowAtom)
      console.log(`📊 Atom evaluation #${evaluationCount}: session=${!!session}`)
    })

    try {
      // Initial state should be null
      expect(store.get(windowAtom)).toBeNull()
      expect(evaluationCount).toBe(0)

      // Set a session - this should trigger re-evaluation
      const mockSession = createMockSession('test-session-1')
      registry.setSession(mockWindow, mockSession)

      // Check that atom re-evaluated and has the session
      const sessionAfterSet = store.get(windowAtom)
      expect(sessionAfterSet).toBe(mockSession)
      expect(evaluationCount).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  })

  it('should trigger atom re-evaluation when session is deleted', () => {
    // Get atom for the window
    const windowAtom = registry.get(mockWindow)

    // Set initial session
    const mockSession = createMockSession('test-session-2')
    registry.setSession(mockWindow, mockSession)

    // Verify session is set
    expect(store.get(windowAtom)).toBe(mockSession)

    let evaluationCount = 0
    const unsubscribe = store.sub(windowAtom, () => {
      evaluationCount++
      const session = store.get(windowAtom)
      console.log(`📊 Delete evaluation #${evaluationCount}: session=${!!session}`)
    })

    try {
      // Delete the session - this should trigger re-evaluation
      const deleted = registry.delete(mockWindow)
      expect(deleted).toBe(true)

      // Check that atom re-evaluated and session is null
      const sessionAfterDelete = store.get(windowAtom)
      expect(sessionAfterDelete).toBeNull()
      expect(evaluationCount).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  })

  it('should handle multiple windows independently', () => {
    const window1 = createMockWindow()
    const window2 = createMockWindow()

    const atom1 = registry.get(window1)
    const atom2 = registry.get(window2)

    let evaluation1Count = 0
    let evaluation2Count = 0

    const unsubscribe1 = store.sub(atom1, () => {
      evaluation1Count++
      console.log(`📊 Window1 evaluation #${evaluation1Count}`)
    })

    const unsubscribe2 = store.sub(atom2, () => {
      evaluation2Count++
      console.log(`📊 Window2 evaluation #${evaluation2Count}`)
    })

    try {
      // Set session for window1 only
      const session1 = createMockSession('session-1')
      registry.setSession(window1, session1)

      // Only atom1 should have the session
      expect(store.get(atom1)).toBe(session1)
      expect(store.get(atom2)).toBeNull()
      expect(evaluation1Count).toBeGreaterThan(0)

      // Set session for window2
      const session2 = createMockSession('session-2')
      registry.setSession(window2, session2)

      // Both atoms should have their respective sessions
      expect(store.get(atom1)).toBe(session1)
      expect(store.get(atom2)).toBe(session2)
      expect(evaluation2Count).toBeGreaterThan(0)

      // Delete session for window1 only
      registry.delete(window1)

      // Only atom1 should be null
      expect(store.get(atom1)).toBeNull()
      expect(store.get(atom2)).toBe(session2)
    } finally {
      unsubscribe1()
      unsubscribe2()
    }
  })

  it('should return the same atom instance for the same window', () => {
    const atom1 = registry.get(mockWindow)
    const atom2 = registry.get(mockWindow)

    // Should be the exact same atom instance
    expect(atom1).toBe(atom2)
  })

  it('should handle session replacement correctly', () => {
    const windowAtom = registry.get(mockWindow)

    // Set initial session
    const session1 = createMockSession('session-1')
    registry.setSession(mockWindow, session1)
    expect(store.get(windowAtom)).toBe(session1)

    let evaluationCount = 0
    const unsubscribe = store.sub(windowAtom, () => {
      evaluationCount++
      const session = store.get(windowAtom)
      console.log(`📊 Replacement evaluation #${evaluationCount}: session=${!!session}`)
    })

    try {
      // Replace with new session
      const session2 = createMockSession('session-2')
      registry.setSession(mockWindow, session2)

      // Should have new session and trigger re-evaluation
      expect(store.get(windowAtom)).toBe(session2)
      expect(evaluationCount).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  })
})

describe('ConnectionRegistry Race Condition Prevention', () => {
  let registry: ConnectionRegistry
  let mockWindow: Window
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    registry = new ConnectionRegistry()
    mockWindow = { location: { href: 'test' } } as unknown as Window
    store = createStore()
  })

  const createMockSession = (id: string) =>
    ({
      isDestroyed: vi.fn().mockReturnValue(false),
      destroy: vi.fn(),
      participantId: id,
    }) as unknown as ConnectionSession<any, any>

  it('should prevent race conditions when multiple bridges try to create sessions', () => {
    let factoryCallCount = 0
    let sessionCreated: ConnectionSession<any, any> | null = null

    const sessionFactory = () => {
      factoryCallCount++
      sessionCreated = createMockSession(`race-test-${factoryCallCount}`)
      return sessionCreated
    }

    // Simulate two Bridge instances trying to create sessions simultaneously
    const session1 = registry.getOrCreateSession(mockWindow, sessionFactory)
    const session2 = registry.getOrCreateSession(mockWindow, sessionFactory)

    // Should have only called the factory once (no race condition)
    expect(factoryCallCount).toBe(1)

    // Both calls should return the same session instance
    expect(session1).toBe(session2)
    expect(session1).toBe(sessionCreated)

    // Verify the session is properly registered
    const windowAtom = registry.get(mockWindow)
    expect(store.get(windowAtom)).toBe(session1)
  })

  it('should handle multiple windows independently without race conditions', () => {
    const window1 = { location: { href: 'test1' } } as unknown as Window
    const window2 = { location: { href: 'test2' } } as unknown as Window

    let factory1CallCount = 0
    let factory2CallCount = 0

    const sessionFactory1 = () => {
      factory1CallCount++
      return createMockSession(`window1-session-${factory1CallCount}`)
    }

    const sessionFactory2 = () => {
      factory2CallCount++
      return createMockSession(`window2-session-${factory2CallCount}`)
    }

    // Create sessions for different windows
    const session1a = registry.getOrCreateSession(window1, sessionFactory1)
    const session2a = registry.getOrCreateSession(window2, sessionFactory2)
    const session1b = registry.getOrCreateSession(window1, sessionFactory1)
    const session2b = registry.getOrCreateSession(window2, sessionFactory2)

    // Each factory should have been called exactly once
    expect(factory1CallCount).toBe(1)
    expect(factory2CallCount).toBe(1)

    // Same window should return same session
    expect(session1a).toBe(session1b)
    expect(session2a).toBe(session2b)

    // Different windows should have different sessions
    expect(session1a).not.toBe(session2a)
  })
})
