import type { Atom } from 'jotai'
import { atom, getDefaultStore } from 'jotai'
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
  const participantIdAtom = atom(generateId)
  const messengerAtom = atom<WindowMessenger | null>(null)

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
    config.log?.(`🧹 Resetting Bridge`)

    const messenger = store.get(messengerAtom)
    const participantId = store.get(participantIdAtom)

    // Send DestroyMessage to paired participant if we have an active messenger
    if (messenger) {
      const destroyMessage = {
        namespace: 'jotai-iframe-bridge',
        type: 'DESTROY' as const,
        fromParticipantId: participantId,
      }

      try {
        messenger.sendMessage(destroyMessage)
        config.log?.(`📤 Sent DESTROY message to paired participant: ${participantId}`)
      } catch (error) {
        config.log?.(`❌ Failed to send DESTROY message:`, error)
      }
    }

    // Clean up local state
    const remoteProxyDeferred = store.get(remoteProxyDeferredAtom)
    if (remoteProxyDeferred?.status === 'pending') {
      remoteProxyDeferred.reject(new Error('Bridge destroyed before connection was established'))
    }
    store.set(remoteProxyDeferredAtom, null) // Set to null for disconnected state
    store.set(remoteWindowAtom, null)
    store.set(messengerAtom, null)
  }

  const connect = (store: Store, targetWindow: Window) => {
    config.log?.(`🚀 Bridge connecting to target window`)

    // Only create a new deferred if we don't have one or it's already resolved/rejected
    const currentDeferred = store.get(remoteProxyDeferredAtom)
    if (currentDeferred?.status !== 'pending') {
      store.set(remoteProxyDeferredAtom, createDeferred<RemoteProxy<TRemoteMethods>>())
    }
    store.set(remoteWindowAtom, targetWindow)

    // Create messenger and start handshake immediately
    const messenger = new WindowMessenger(targetWindow, config.allowedOrigins, config.log)
    store.set(messengerAtom, messenger) // Store messenger for destroy functionality
    const participantId = store.get(participantIdAtom)
    const handshakeTimeout = config.timeout ?? 10000

    const handshakeCleanup = createHandshakeHandler<TRemoteMethods>({
      ...config,
      messenger,
      participantId,
      timeout: handshakeTimeout,
      onConnectionEstablished: (remoteProxy: RemoteProxy<TRemoteMethods>) => {
        const deferred = store.get(remoteProxyDeferredAtom)
        if (deferred) {
          deferred.resolve(remoteProxy)
        }
      },
      onError: (error: Error) => {
        const deferred = store.get(remoteProxyDeferredAtom)
        if (deferred) {
          deferred.reject(error)
        }
      },
      onDestroy: () => {
        // Reset bridge atoms when DESTROY message is received from paired participant
        config.log?.('🔄 Received DESTROY message, resetting bridge atoms')
        reset(store)
      },
    })

    // Return cleanup function for bridge to store
    return handshakeCleanup
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
  config.log?.(`🚌 Bridge: 🆔 Creating Bridge with ID: ${bridgeId}`)

  // Create atoms with configuration
  const atoms = createBridgeAtoms<TRemoteMethods>(config)

  // Store current handshake cleanup for reset functionality
  let currentHandshakeCleanup: (() => void) | null = null

  const bridge: Bridge<TLocalMethods, TRemoteMethods> = {
    id: bridgeId,

    connect(targetWindow?: Window): void {
      const window = targetWindow || (self.parent !== self ? self.parent : undefined)
      if (!window) {
        throw new Error('No target window provided and not in iframe context')
      }

      config.log?.(`🚀 Bridge ${bridgeId} connecting to target window`)

      // Clean up any existing handshake
      if (currentHandshakeCleanup) {
        currentHandshakeCleanup()
        currentHandshakeCleanup = null
      }

      // Start new handshake
      currentHandshakeCleanup = atoms.actions.connect(store, window)
    },

    isConnected(): boolean {
      const lazyLoadable = store.get(atoms.remoteProxyAtom)
      return lazyLoadable.state === 'hasData'
    },

    getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> | null {
      return store.get(atoms.remoteProxyPromiseAtom)
    },

    getRemoteProxyAtom(): Atom<LazyLoadable<RemoteProxy<TRemoteMethods>>> {
      return atoms.remoteProxyAtom
    },

    reset(): void {
      config.log?.(`🧹 Resetting Bridge ${bridgeId}`)

      // Clean up handshake if active
      if (currentHandshakeCleanup) {
        currentHandshakeCleanup()
        currentHandshakeCleanup = null
      }

      atoms.actions.reset(store)
    },
  }

  return bridge
}
