// biome-ignore lint/style/useImportType: loadable type interface is not exported
import { loadable } from 'jotai/utils'
import type { Connection } from '../connection/Connection'
import type { Methods, RemoteProxy } from '../connection/types'

// ==================== Bridge Configuration ====================

export interface ConnectionConfig<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
> {
  allowedOrigins: string[]
  methods?: TLocalMethods
  timeout?: number
  log?: (...args: unknown[]) => void
}

// ==================== Bridge Types ====================

// Helper type representing ReturnType<typeof loadable<T>>
export type LoadableAtom<T> = ReturnType<typeof loadable<T>>

export interface Bridge<
  _TLocalMethods extends Record<keyof _TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
> {
  id: string
  connect(targetWindow?: Window): void
  isInitialized(): boolean
  getConnectionPromise(): Promise<Connection<TRemoteMethods>>
  getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>>
  getConnectionAtom(): LoadableAtom<Connection<TRemoteMethods>>
  getRemoteProxyAtom(): LoadableAtom<RemoteProxy<TRemoteMethods>>
  destroy(): void
  retry(): void
}
