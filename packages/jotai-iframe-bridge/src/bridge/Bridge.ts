import type { Atom } from 'jotai'
import { atom, getDefaultStore } from 'jotai'
import { connectionRegistry } from '../connection/ConnectionRegistry'
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
  const bridgeId = generateId()
  config.log?.(`🌉 Bridge: Creating Bridge with ID: ${bridgeId}`)

  const targetWindowAtom = atom<Window | null>(null)

  const sessionAtom = atom((get) => {
    const targetWindow = get(targetWindowAtom)
    if (!targetWindow) return null
    return get(
      connectionRegistry.get(targetWindow) as Atom<ConnectionSession<
        TLocalMethods,
        TRemoteMethods
      > | null>
    )
  })

  const remoteProxyPromiseAtom = atom((get) => {
    const session = get(sessionAtom)
    console.log('remoteProxyPromiseAtom', session?.getProxyPromise())
    return session?.getProxyPromise() ?? null
  })

  const remoteProxyAtom = lazyLoadable(remoteProxyPromiseAtom)

  const isConnectedAtom = atom((get) => {
    const proxyLoadable = get(remoteProxyAtom)
    return proxyLoadable.state === 'hasData'
  })

  const bridge: Bridge<TLocalMethods, TRemoteMethods> = {
    id: bridgeId,
    connect(window?: Window): void {
      const win = window || (self.parent !== self ? self.parent : undefined)
      if (!win) {
        throw new Error('No target window provided and not in iframe context')
      }

      config.log?.(`🚀 Bridge ${bridgeId} connecting to target window`)

      store.set(targetWindowAtom, win)

      connectionRegistry.getOrCreate<TLocalMethods, TRemoteMethods>(
        win,
        () => {
          const participantId = generateId()
          const newSession = new ConnectionSession<TLocalMethods, TRemoteMethods>(
            win,
            config,
            participantId,
            connectionRegistry
          )
          config.log?.(
            `📝 Created new session for bridge ${bridgeId} with participant: ${participantId}`
          )
          return newSession
        },
        config.log
      )

      config.log?.(`✅ Bridge ${bridgeId} connected to target window`)
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
      const currentSession = store.get(sessionAtom)
      currentSession?.destroy()
      store.set(targetWindowAtom, null)
    },
  }

  return bridge
}
