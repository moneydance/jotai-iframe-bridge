import { getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionRegistry } from '../src/connection/ConnectionRegistry'
import type { ConnectionSession } from '../src/connection/ConnectionSession'

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
