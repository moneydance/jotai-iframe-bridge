import type { Atom } from 'jotai'
import { atom, getDefaultStore } from 'jotai'
import { observe } from 'jotai-effect'
import { createHandshakeHandler } from '../connection/handshake'
import { WindowMessenger } from '../connection/messaging'
import type { Methods, RemoteProxy } from '../connection/types'
import { createDeferred, generateId } from '../utils'
import type { LazyLoadable } from '../utils/lazyLoadable'
import { lazyLoadable } from '../utils/lazyLoadable'
import type { Bridge, ConnectionConfig } from './types'

// Store type from Jotai
type Store = ReturnType<typeof getDefaultStore>

// ==================== Bridge Atoms Creation ====================

function createBridgeAtoms<TRemoteMethods extends Methods>(config: ConnectionConfig) {
  // Core atoms
  const remoteWindowAtom = atom<Window | null>(null)
  const participantIdAtom = atom(generateId())

  // Messenger atom - creates messenger when window is available
  const messengerAtom = atom<WindowMessenger | null>((get) => {
    const remoteWindow = get(remoteWindowAtom)
    if (!remoteWindow) {
      return null
    }

    const messenger = new WindowMessenger(remoteWindow, config.allowedOrigins, config.log)
    return messenger
  })

  // Lazy deferred atom - null when disconnected, creates deferred when connecting
  const remoteProxyDeferredAtom = atom<ReturnType<
    typeof createDeferred<RemoteProxy<TRemoteMethods>>
  > | null>(null)

  const remoteProxyPromiseAtom = atom((get) => {
    const deferred = get(remoteProxyDeferredAtom)
    if (!deferred) {
      return null
    }
    return deferred.promise
  })

  // Use lazyLoadable to handle null promises with uninitialized state
  const remoteProxyAtom = lazyLoadable(remoteProxyPromiseAtom)

  const reset = (store: Store) => {
    const remoteProxyDeferred = store.get(remoteProxyDeferredAtom)
    if (remoteProxyDeferred?.status === 'pending') {
      remoteProxyDeferred.reject(new Error('Bridge destroyed before connection was established'))
    }
    store.set(remoteProxyDeferredAtom, null) // Set to null for disconnected state
    store.set(remoteWindowAtom, null)
  }

  const connect = (store: Store, targetWindow: Window) => {
    // Only create a new deferred if we don't have one or it's already resolved/rejected
    const currentDeferred = store.get(remoteProxyDeferredAtom)
    if (currentDeferred?.status !== 'pending') {
      store.set(remoteProxyDeferredAtom, createDeferred<RemoteProxy<TRemoteMethods>>())
    }
    store.set(remoteWindowAtom, targetWindow)
  }

  return {
    remoteWindowAtom,
    participantIdAtom,
    messengerAtom,
    remoteProxyDeferredAtom,
    remoteProxyPromiseAtom,
    remoteProxyAtom,
    actions: {
      reset,
      connect,
    },
  }
}

type BridgeAtoms<TRemoteMethods extends Methods> = ReturnType<
  typeof createBridgeAtoms<TRemoteMethods>
>

// ==================== Connection Effect ====================

function createConnectionEffect<TRemoteMethods extends Methods>(
  config: ConnectionConfig,
  atoms: BridgeAtoms<TRemoteMethods>,
  store: Store
): () => void {
  return observe((get, _set) => {
    const messenger = get(atoms.messengerAtom)
    if (!messenger) {
      return
    }

    const targetWindow = get(atoms.remoteWindowAtom)
    if (!targetWindow) {
      return
    }

    // Check if we have a deferred that needs a handshake
    const deferred = get(atoms.remoteProxyDeferredAtom)
    if (!deferred || deferred.status !== 'pending') {
      // No pending connection to establish
      return
    }

    // Start handshake process using shared handler
    const participantId = get(atoms.participantIdAtom)
    const handshakeTimeout = config.timeout ?? 10000

    const handshakeCleanup = createHandshakeHandler<TRemoteMethods>({
      ...config,
      messenger,
      participantId,
      timeout: handshakeTimeout,
      onConnectionEstablished: (remoteProxy: RemoteProxy<TRemoteMethods>) => {
        const deferred = get.peek(atoms.remoteProxyDeferredAtom)
        if (deferred) {
          deferred.resolve(remoteProxy)
        }
      },
      onError: (error: Error) => {
        const deferred = get.peek(atoms.remoteProxyDeferredAtom)
        if (deferred) {
          deferred.reject(error)
        }
      },
    })

    // Return cleanup function
    return () => {
      handshakeCleanup()
    }
  }, store)
}

// ==================== Main Bridge Creation ====================

export function createBridge<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
>(
  config: ConnectionConfig<TLocalMethods>,
  store: Store = getDefaultStore()
): Bridge<TLocalMethods, TRemoteMethods> {
  // Generate unique ID for this bridge instance
  const bridgeId = generateId()
  config.log?.(`🆔 Creating Bridge with ID: ${bridgeId}`)

  // Create all bridge atoms
  const atoms = createBridgeAtoms<TRemoteMethods>(config)

  let unsubscribeFromMessengerChange: () => void

  const initialize = () => {
    // Set up connection lifecycle effect
    unsubscribeFromMessengerChange = createConnectionEffect(config, atoms, store)
  }

  initialize()

  // Return bridge implementation
  return {
    id: bridgeId,

    connect(targetWindow?: Window): void {
      const window =
        targetWindow ?? (typeof globalThis !== 'undefined' ? globalThis.parent : undefined)
      if (!window) {
        throw new Error('No target window available for connection')
      }
      config.log?.(`🚀 Bridge ${bridgeId} connecting to target window`)
      atoms.actions.connect(store, window)
    },

    isConnected(): boolean {
      const lazyLoadable = store.get(atoms.remoteProxyAtom)
      return lazyLoadable.state === 'hasData'
    },

    getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> | null {
      const deferred = store.get(atoms.remoteProxyDeferredAtom)
      if (!deferred) return null
      return store.get(atoms.remoteProxyPromiseAtom)
    },

    getRemoteProxyAtom(): Atom<LazyLoadable<RemoteProxy<TRemoteMethods>>> {
      return atoms.remoteProxyAtom
    },

    reset(): void {
      config.log?.(`🧹 Resetting Bridge ${bridgeId}`)
      atoms.actions.reset(store)
      unsubscribeFromMessengerChange()
    },
  }
}
