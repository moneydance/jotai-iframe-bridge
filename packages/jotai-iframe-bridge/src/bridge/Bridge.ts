import type { Atom } from 'jotai'
import { atom, getDefaultStore } from 'jotai'
import type { ConnectionConfig } from '../connection/ConnectionSession'
import { ConnectionSession } from '../connection/ConnectionSession'
import type { Methods, RemoteProxy } from '../connection/types'
import { generateId } from '../utils'
import type { LazyLoadable } from '../utils/lazyLoadable'
import { lazyLoadable } from '../utils/lazyLoadable'
import { BridgeLifecycle } from './BridgeLifecycle'
import type { Bridge } from './types'

// Store type from Jotai
type Store = ReturnType<typeof getDefaultStore>

// ==================== Bridge Implementation ====================

export function createBridge<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
>(
  config: ConnectionConfig<TLocalMethods>,
  store: Store = getDefaultStore()
): Bridge<TLocalMethods, TRemoteMethods> {
  const bridgeId = generateId()

  // Override config.log to automatically include bridge ID in ALL logging
  const originalLog = config.log
  config.log = originalLog
    ? (...args: any[]) => originalLog?.(...args, `| Bridge id: ${bridgeId} |`)
    : undefined

  config.log?.(`🌉 Bridge: Creating Bridge with ID: ${bridgeId}`)

  // Event system for immediate state management
  const lifecycle = new BridgeLifecycle()

  // ATOMS as single source of truth
  const targetWindowAtom = atom<Window | null>(null)
  const sessionAtom = atom<ConnectionSession<TLocalMethods, TRemoteMethods> | null>(null)

  const remoteProxyPromiseAtom = atom((get) => {
    const session = get(sessionAtom)
    const proxyPromise = session?.getProxyPromise() ?? null
    config.log?.(
      `🔄 remoteProxyPromiseAtom re-evaluated: session=${!!session}, proxyPromise=${!!proxyPromise}`
    )
    return proxyPromise
  })

  // Use LazyLoadable properly with event-driven cache invalidation
  const remoteProxyAtom = lazyLoadable(remoteProxyPromiseAtom)

  const isConnectedAtom = atom((get) => {
    const proxyLoadable = get(remoteProxyAtom)
    const isConnected = proxyLoadable.state === 'hasData'
    config.log?.(
      `📡 isConnectedAtom re-evaluated: state=${proxyLoadable.state}, isConnected=${isConnected}`
    )
    return isConnected
  })

  // Event handlers for immediate atom updates
  lifecycle.on('sessionCreated', (session: ConnectionSession<TLocalMethods, TRemoteMethods>) => {
    config.log?.(`✅ Session created, updating atoms`)
    store.set(sessionAtom, session as ConnectionSession<TLocalMethods, TRemoteMethods>)
  })

  lifecycle.on(
    'sessionDestroyed',
    (destroyedSession: ConnectionSession<TLocalMethods, TRemoteMethods>) => {
      config.log?.(`🧹 Session destroyed, checking if current session`)
      // Only clear bridge state if this was the current active session
      const currentSession = store.get(sessionAtom)
      if (currentSession === destroyedSession) {
        config.log?.(`✅ Clearing atoms for current session`)
        store.set(sessionAtom, null)
        const targetWindow = store.get(targetWindowAtom)
        if (targetWindow) {
          config.log?.(`🔄 Reconnecting to existing target window after reset`)
          bridge.connect(targetWindow)
        }
      } else {
        config.log?.(`⏭️ Ignoring destroy for old session, keeping current session active`)
      }
    }
  )

  lifecycle.on('targetWindowChanged', (window: Window | null) => {
    config.log?.(`🎯 Target window updated: ${!!window}`)
    store.set(targetWindowAtom, window)
  })

  // Bridge implementation
  const bridge: Bridge<TLocalMethods, TRemoteMethods> = {
    id: bridgeId,

    connect(window?: Window): void {
      const win = window || (self.parent !== self ? self.parent : undefined)
      if (!win) {
        throw new Error('No target window provided and not in iframe context')
      }
      config.log?.(`🚀 Connecting to target window`)
      lifecycle.emit('targetWindowChanged', win)
      // Destroy existing session if any
      const currentSession = store.get(sessionAtom)
      if (currentSession) {
        config.log?.(`🧹 Destroying existing session before creating new one`)
        currentSession.destroy()
      }
      // Create new session directly
      const participantId = generateId()
      config.log?.(`📝 Creating new session with participant: ${participantId}`)
      const newSession = new ConnectionSession<TLocalMethods, TRemoteMethods>(
        win,
        config,
        participantId,
        lifecycle
      )
      // Emit session creation event - this will update atoms
      lifecycle.emit('sessionCreated', newSession)
      config.log?.(`✅ Connected to target window`)
    },

    isConnected(): boolean {
      return store.get(isConnectedAtom)
    },

    getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> | null {
      return store.get(remoteProxyPromiseAtom)
    },

    getRemoteProxyAtom(): Atom<LazyLoadable<RemoteProxy<TRemoteMethods>>> {
      return remoteProxyAtom
    },

    reset(): void {
      config.log?.(`🧹 Resetting Bridge`)

      // Actually destroy the session to send DESTROY message to remote
      const currentSession = store.get(sessionAtom)
      if (currentSession) {
        currentSession.destroy() // This sends DESTROY to remote AND emits sessionDestroyed
      }
    },

    destroy(): void {
      config.log?.(`💥 Destroying Bridge`)
      const currentSession = store.get(sessionAtom)
      store.set(sessionAtom, null)
      store.set(targetWindowAtom, null)
      if (currentSession) {
        currentSession.destroy()
      }
      lifecycle.destroy()
      config.log?.(`✅ Bridge destroyed`)
    },
  }

  return bridge
}
