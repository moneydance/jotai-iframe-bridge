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

  // Override config.log to automatically include bridge ID in ALL logging
  const originalLog = config.log
  config.log = originalLog
    ? (...args: any[]) => originalLog?.(...args, `| Bridge id: ${bridgeId} |`)
    : undefined

  config.log?.(`🌉 Bridge: Creating Bridge with ID: ${bridgeId}`)

  const targetWindowAtom = atom<Window | null>(null)

  const sessionAtom = atom((get) => {
    const targetWindow = get(targetWindowAtom)
    config.log?.(`🔍 sessionAtom re-evaluated: targetWindow=${!!targetWindow}`)

    if (!targetWindow) return null

    const windowSessionAtom = connectionRegistry.get<TLocalMethods, TRemoteMethods>(targetWindow)
    let session = get(windowSessionAtom)

    if (!session) {
      session = connectionRegistry.getOrCreateSession(targetWindow, () => {
        const participantId = generateId()
        config.log?.(`📝 Auto-creating session with participant: ${participantId}`)
        return new ConnectionSession<TLocalMethods, TRemoteMethods>(
          targetWindow,
          config,
          participantId,
          connectionRegistry
        )
      })
      config.log?.(`📝 Session resolved`)
    }
    config.log?.(
      `🔍 sessionAtom re-evaluated: session=${!!session}, destroyed=${session?.isDestroyed()}`
    )
    return session
  })

  const remoteProxyPromiseAtom = atom((get) => {
    const session = get(sessionAtom)
    const proxyPromise = session?.getProxyPromise() ?? null
    config.log?.(
      `🔄 remoteProxyPromiseAtom re-evaluated: session=${!!session}, proxyPromise=${!!proxyPromise}`
    )
    return proxyPromise
  })

  const remoteProxyAtom = lazyLoadable(remoteProxyPromiseAtom)

  const isConnectedAtom = atom((get) => {
    const proxyLoadable = get(remoteProxyAtom)
    const isConnected = proxyLoadable.state === 'hasData'
    config.log?.(
      `📡 isConnectedAtom re-evaluated: state=${proxyLoadable.state}, isConnected=${isConnected}`
    )
    return isConnected
  })

  const bridge: Bridge<TLocalMethods, TRemoteMethods> = {
    id: bridgeId,
    connect(window?: Window): void {
      const win = window || (self.parent !== self ? self.parent : undefined)
      if (!win) {
        throw new Error('No target window provided and not in iframe context')
      }
      config.log?.(`🚀 Connecting to target window`)
      store.set(targetWindowAtom, win)
      config.log?.(`✅ Connected to target window`)
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
      config.log?.(`🧹 Resetting Bridge`)
      const currentSession = store.get(sessionAtom)
      currentSession?.destroy()
    },
  }

  return bridge
}
