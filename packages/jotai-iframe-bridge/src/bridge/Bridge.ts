import type { Atom } from 'jotai'
import { atom, getDefaultStore } from 'jotai'
import { type ConnectionConfig, ConnectionSession } from '../connection/ConnectionSession'
import type { Methods, RemoteProxy } from '../connection/types'
import { generateId } from '../utils'
import type { LazyLoadable } from '../utils/lazyLoadable'
import { lazyLoadable } from '../utils/lazyLoadable'
import type { Bridge } from './types'

// Store type from Jotai
type Store = ReturnType<typeof getDefaultStore>

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
  config.log?.(`🌉 Bridge: Creating Bridge with ID: ${bridgeId}`)

  const currentSessionAtom = atom<ConnectionSession<TLocalMethods, TRemoteMethods> | null>(null)
  const remoteProxyPromiseAtom = atom((get) => {
    const session = get(currentSessionAtom)
    return session?.getProxyPromise() ?? null
  })
  const remoteProxyAtom = lazyLoadable(remoteProxyPromiseAtom)

  const isConnectedAtom = atom((get) => {
    const session = get(currentSessionAtom)
    return session?.isConnected() ?? false
  })

  const bridge: Bridge<TLocalMethods, TRemoteMethods> = {
    id: bridgeId,
    connect(targetWindow?: Window): void {
      const window = targetWindow || (self.parent !== self ? self.parent : undefined)
      if (!window) {
        throw new Error('No target window provided and not in iframe context')
      }

      config.log?.(`🚀 Bridge ${bridgeId} connecting to target window`)

      // Clean up existing session (fresh state approach)
      const currentSession = store.get(currentSessionAtom)
      if (currentSession) {
        currentSession.destroy()
      }
      const participantId = generateId()
      const newSession = new ConnectionSession<TLocalMethods, TRemoteMethods>(
        window,
        config,
        participantId,
        () => {
          config.log?.(`🧹 Bridge ${bridgeId} connection session destroyed`)
          store.set(currentSessionAtom, null)
        }
      )
      store.set(currentSessionAtom, newSession)
      config.log?.(`✅ Bridge ${bridgeId} session created with participant: ${participantId}`)
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
      config.log?.(`🧹 Resetting Bridge ${bridgeId}`)
      const currentSession = store.get(currentSessionAtom)
      if (currentSession) {
        currentSession.destroy()
        config.log?.(`✅ Bridge ${bridgeId} reset complete`)
      } else {
        config.log?.(`🤷 Bridge ${bridgeId} reset called but no active session`)
      }
    },
  }

  return bridge
}
