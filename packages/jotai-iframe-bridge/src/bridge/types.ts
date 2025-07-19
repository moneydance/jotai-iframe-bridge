// biome-ignore lint/style/useImportType: loadable type interface is not exported

import type { Atom } from 'jotai'
import type { loadable } from 'jotai/utils'
import type { Methods, RemoteProxy } from '../connection/types'
import type { LazyLoadable } from '../utils/lazyLoadable'

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
  isConnected(): boolean
  getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> | null
  getRemoteProxyAtom(): Atom<LazyLoadable<RemoteProxy<TRemoteMethods>>>
  reset(): void
}
