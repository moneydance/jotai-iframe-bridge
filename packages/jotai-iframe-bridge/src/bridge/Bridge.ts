import { atom, getDefaultStore } from 'jotai'
import { loadable } from 'jotai/utils'
import { observe } from 'jotai-effect'
import { createHandshakeHandler } from '../connection/handshake'
import { WindowMessenger } from '../connection/messaging'
import type { Methods, RemoteProxy } from '../connection/types'
import { createDeferred, generateId } from '../utils'
import type { Bridge, ConnectionConfig, LoadableAtom } from './types'

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

  // Only remote proxy atoms - connection status is derived from this
  const remoteProxyDeferredAtom = atom(createDeferred<RemoteProxy<TRemoteMethods>>())
  const remoteProxyPromiseAtom = atom(async (get) => get(remoteProxyDeferredAtom).promise)

  // Loadable atom for React integration
  const remoteProxyAtom = loadable(remoteProxyPromiseAtom)

  const reset = (store: Store) => {
    const remoteProxyDeferred = store.get(remoteProxyDeferredAtom)
    if (remoteProxyDeferred.status === 'pending') {
      remoteProxyDeferred.reject(new Error('Bridge destroyed before connection was established'))
    }
    store.set(remoteProxyDeferredAtom, createDeferred<RemoteProxy<TRemoteMethods>>())
    store.set(remoteWindowAtom, null)
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

    // Start handshake process using shared handler
    const participantId = get(atoms.participantIdAtom)
    const handshakeTimeout = config.timeout ?? 10000

    const handshakeCleanup = createHandshakeHandler<TRemoteMethods>({
      ...config,
      messenger,
      participantId,
      timeout: handshakeTimeout,
      onConnectionEstablished: (remoteProxy: RemoteProxy<TRemoteMethods>) => {
        get.peek(atoms.remoteProxyDeferredAtom).resolve(remoteProxy)
      },
      onError: (error: Error) => {
        get.peek(atoms.remoteProxyDeferredAtom).reject(error)
      },
    })

    // Return cleanup function
    return () => {
      handshakeCleanup()
      messenger.destroy()
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
      store.set(atoms.remoteWindowAtom, window)
    },

    isConnected(): boolean {
      return store.get(atoms.remoteProxyAtom).state === 'hasData'
    },

    getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> {
      return store.get(atoms.remoteProxyPromiseAtom)
    },

    getRemoteProxyAtom(): LoadableAtom<RemoteProxy<TRemoteMethods>> {
      return atoms.remoteProxyAtom
    },

    reset(): void {
      config.log?.(`🧹 Resetting Bridge ${bridgeId}`)
      atoms.actions.reset(store)
      unsubscribeFromMessengerChange()
    },
  }
}
