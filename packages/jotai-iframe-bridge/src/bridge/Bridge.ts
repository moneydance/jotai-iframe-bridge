import { atom, getDefaultStore } from 'jotai'
import { loadable } from 'jotai/utils'
import { observe } from 'jotai-effect'
import { Connection } from '../connection/Connection'
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

  // Connection state atoms
  const connectionDeferredAtom = atom(createDeferred<Connection<TRemoteMethods>>())
  const connectionPromiseAtom = atom(async (get) => get(connectionDeferredAtom).promise)
  const remoteProxyPromiseAtom = atom(async (get) => {
    const connection = await get(connectionPromiseAtom)
    return connection.promise
  })

  // Loadable atoms for React integration
  const connectionAtom = loadable(connectionPromiseAtom)
  const remoteProxyAtom = loadable(remoteProxyPromiseAtom)

  return {
    remoteWindowAtom,
    participantIdAtom,
    messengerAtom,
    connectionDeferredAtom,
    connectionPromiseAtom,
    remoteProxyPromiseAtom,
    connectionAtom,
    remoteProxyAtom,
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
  return observe((get, set) => {
    const messenger = get(atoms.messengerAtom)

    if (!messenger) {
      // Reset connection when messenger is null
      const connectionDeferred = get.peek(atoms.connectionDeferredAtom)
      if (connectionDeferred.status !== 'pending') {
        set(atoms.connectionDeferredAtom, createDeferred<Connection<TRemoteMethods>>())
      }
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
        const connection = new Connection<TRemoteMethods>(
          Promise.resolve(remoteProxy),
          () => {} // destroy handled by cleanup
        )
        get.peek(atoms.connectionDeferredAtom).resolve(connection)
      },
      onError: (error: Error) => {
        get.peek(atoms.connectionDeferredAtom).reject(error)
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

  // Set up connection lifecycle effect
  const unsubscribeFromMessengerChange = createConnectionEffect(config, atoms, store)

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

    isInitialized(): boolean {
      return store.get(atoms.connectionAtom).state === 'hasData'
    },

    getConnectionPromise(): Promise<Connection<TRemoteMethods>> {
      return store.get(atoms.connectionPromiseAtom)
    },

    getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> {
      return store.get(atoms.remoteProxyPromiseAtom)
    },

    getConnectionAtom(): LoadableAtom<Connection<TRemoteMethods>> {
      return atoms.connectionAtom
    },

    getRemoteProxyAtom(): LoadableAtom<RemoteProxy<TRemoteMethods>> {
      return atoms.remoteProxyAtom
    },

    destroy(): void {
      config.log?.(`🧹 Bridge ${bridgeId} destroying`)
      store.set(atoms.remoteWindowAtom, null)
      unsubscribeFromMessengerChange()
    },

    retry(): void {
      config.log?.(`🔄 Bridge ${bridgeId} retrying connection`)
      const window = store.get(atoms.remoteWindowAtom)
      this.destroy()
      if (!window) {
        return
      }
      this.connect(window)
    },
  }
}
