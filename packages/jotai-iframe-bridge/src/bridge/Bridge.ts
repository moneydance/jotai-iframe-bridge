import { atom, getDefaultStore, type Atom } from 'jotai'
import { ConnectionSession, type ConnectionConfig } from '../connection/ConnectionSession'
import type { Methods, RemoteProxy } from '../connection/types'
import { generateId, lazyLoadable } from '../utils'
import type { LazyLoadable } from '../utils/lazyLoadable'
import { BridgeLifecycle } from './BridgeLifecycle'
import { bridgeRegistry } from './BridgeRegistry'
import type { Bridge } from './types'

const getParentWindow = () => {
  if (self.parent !== self) {
    return self.parent
  }
  return undefined
}

/**
 * Creates a new bridge instance for secure cross-frame communication.
 *
 * The bridge enables type-safe RPC calls between different execution contexts
 * (like parent/child windows, web workers, or iframes) using an event-driven
 * architecture with Jotai atoms as the single source of truth.
 */
export function createBridge<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(
  config: ConnectionConfig<TLocalMethods>,
  store = getDefaultStore()
): Bridge<TLocalMethods, TRemoteMethods> {
  const bridgeId = generateId()
  config.log?.(`🌉 Bridge: Creating Bridge with ID: ${bridgeId}`)

  // Atoms - single source of truth
  const sessionAtom = atom<ConnectionSession<TLocalMethods, TRemoteMethods> | null>(null)
  const targetWindowAtom = atom<Window | null>(null)

  // Derived atoms
  const remoteProxyPromiseAtom = atom((get) => {
    const session = get(sessionAtom)
    const hasSession = !!session
    const proxyPromise = session?.getProxyPromise() || null
    const hasProxyPromise = !!proxyPromise

    config.log?.(
      `🔄 remoteProxyPromiseAtom re-evaluated: session=${hasSession}, proxyPromise=${hasProxyPromise}`
    )

    return proxyPromise
  })

  const remoteProxyAtom = lazyLoadable(remoteProxyPromiseAtom)

  const isConnectedAtom = atom((get) => {
    const loadable = get(remoteProxyAtom)
    return loadable.state === 'hasData'
  })

  // Event-driven lifecycle management
  const lifecycle = new BridgeLifecycle()

  // Reactive atom updates via lifecycle events
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
      const win = window || getParentWindow()
      if (!win) {
        throw new Error('No target window provided and not in iframe context')
      }

      config.log?.(`🚀 Connecting to target window`)

      // Idempotent check: if we're already connected to this exact window, do nothing
      const currentTargetWindow = store.get(targetWindowAtom)
      const currentSession = store.get(sessionAtom)

      if (currentTargetWindow === win && currentSession && !currentSession.isDestroyed()) {
        config.log?.(`⏭️ Already connected to target window, skipping redundant connection`)
        return
      }

      // Register with BridgeRegistry to handle React Strict Mode
      bridgeRegistry.register(bridge, win)

      // Update target window atom
      lifecycle.emit('targetWindowChanged', win)

      // Destroy existing session if any
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
        lifecycle // Pass bridgeLifecycle to session
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
      const targetWindow = store.get(targetWindowAtom)

      store.set(sessionAtom, null)
      store.set(targetWindowAtom, null)

      // Unregister from BridgeRegistry with target window for efficient cleanup
      bridgeRegistry.unregister(bridge, targetWindow || undefined)

      if (currentSession) {
        currentSession.destroy()
      }
      lifecycle.destroy()
      config.log?.(`✅ Bridge destroyed`)
    },
  }

  return bridge
}
