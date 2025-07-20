import { type createStore, getDefaultStore, Provider } from 'jotai'
import {
  type Bridge,
  type ConnectionConfig,
  createBridge,
  createBridgeProvider,
} from 'jotai-iframe-bridge'
import type { ReactNode } from 'react'
import { useMemo } from 'react'

// Define strict types for type safety (converted from interfaces)
type ChildMethods = {
  subtract: (a: number, b: number) => Promise<number>
}

type ParentMethods = {
  add: (a: number, b: number) => Promise<number>
}

// Create bridge configuration factory with ReturnType pattern
function createBridgeConfig(): ConnectionConfig<ChildMethods> {
  return {
    allowedOrigins: ['*'],
    methods: {
      subtract: async (a: number, b: number) => {
        const result = a - b
        console.log(`Child: ${a} - ${b} = ${result}`)
        return result
      },
    },
    log: (...args: unknown[]) => console.log('🚌 Child Bridge:', ...args),
  }
}

type BridgeConfig = ReturnType<typeof createBridgeConfig>

// Create bridge with improved typing
const createDefaultBridge = (
  store?: ReturnType<typeof createStore>
): Bridge<ChildMethods, ParentMethods> => {
  const bridgeConfig = createBridgeConfig()
  return createBridge<ChildMethods, ParentMethods>(bridgeConfig, store || getDefaultStore())
}

// Create the unified bridge provider
const bridgeProvider = createBridgeProvider<ChildMethods, ParentMethods>()
export const { BridgeProvider, hooks } = bridgeProvider
export const { useBridge, useRemoteProxy } = hooks

// Export the default bridge creator
export { createDefaultBridge }

// App Provider Component with improved typing
type AppProviderProps = {
  children: ReactNode
  bridge?: Bridge<ChildMethods, ParentMethods>
  store?: ReturnType<typeof createStore>
}

export function AppProvider({ children, bridge, store = getDefaultStore() }: AppProviderProps) {
  const defaultBridge = useMemo(() => bridge || createDefaultBridge(), [bridge])
  console.log(`🎯 AppProvider using bridge ID: ${defaultBridge.id}`)

  return (
    <Provider store={store}>
      <BridgeProvider bridge={defaultBridge}>{children}</BridgeProvider>
    </Provider>
  )
}

// Export types for convenience
export type { ParentMethods, ChildMethods, BridgeConfig }
