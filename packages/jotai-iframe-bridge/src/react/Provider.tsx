import { useAtomValue } from 'jotai'
import { createContext, type ReactNode, useContext } from 'react'
import type { Bridge } from '../bridge/types'
import type { Methods } from '../connection/types'

// ==================== React Provider ====================

export interface BridgeProviderProps<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> {
  bridge: Bridge<TLocalMethods, TRemoteMethods>
  children: ReactNode
}

interface BridgeContextValue<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> {
  bridge: Bridge<TLocalMethods, TRemoteMethods>
}

export function createBridgeProvider<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
>() {
  const BridgeContext = createContext<
    BridgeContextValue<TLocalMethods, TRemoteMethods> | undefined
  >(undefined)

  function BridgeProvider({
    bridge,
    children,
  }: BridgeProviderProps<TLocalMethods, TRemoteMethods>) {
    return <BridgeContext.Provider value={{ bridge }}>{children}</BridgeContext.Provider>
  }

  function useBridge(): Bridge<TLocalMethods, TRemoteMethods> {
    const context = useContext(BridgeContext)
    if (!context) {
      throw new Error('useBridge must be used within a BridgeProvider')
    }
    return context.bridge
  }

  function useRemoteProxy() {
    const bridge = useBridge()
    const remoteProxyAtom = bridge.getRemoteProxyAtom()
    return useAtomValue(remoteProxyAtom)
  }

  return {
    BridgeProvider,
    hooks: {
      useBridge,
      useRemoteProxy,
    },
  }
}
