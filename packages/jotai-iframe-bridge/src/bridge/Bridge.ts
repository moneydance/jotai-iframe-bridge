import type { Atom } from 'jotai'
import { atom, getDefaultStore } from 'jotai'
import { connectionRegistry } from '../connection/ConnectionRegistry'
import type { ConnectionConfig } from '../connection/ConnectionSession'
import { ConnectionSession } from '../connection/ConnectionSession'
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

    // Always get the atom first to establish dependency
    const windowSessionAtom = connectionRegistry.get<TLocalMethods, TRemoteMethods>(targetWindow)
    let session = get(windowSessionAtom)

    // Create session if it doesn't exist
    if (!session) {
      const participantId = generateId()
      const newSession = new ConnectionSession<TLocalMethods, TRemoteMethods>(
        targetWindow,
        config,
        participantId,
        connectionRegistry
      )
      connectionRegistry.setSession(targetWindow, newSession)
      session = newSession
    }
    return session
  })

  const remoteProxyPromiseAtom = atom((get) => {
    const session = get(sessionAtom)
    const proxyPromise = session?.getProxyPromise() ?? null
    return proxyPromise
  })

  const remoteProxyAtom = lazyLoadable(remoteProxyPromiseAtom)

  const isConnectedAtom = atom((get) => {
    const proxyLoadable = get(remoteProxyAtom)
    const isConnected = proxyLoadable.state === 'hasData'
    return isConnected
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
      config.log?.(`✅ Bridge ${bridgeId} connected to target window`)
    },

    isConnected(): boolean {
      const connected = store.get(isConnectedAtom)
      return connected
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
