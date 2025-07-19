import { Provider, type createStore, getDefaultStore } from 'jotai'
import {
  type Bridge,
  type ConnectionConfig,
  createBridge,
  createBridgeProvider,
} from 'jotai-iframe-bridge'
import type { ReactNode } from 'react'

// Define strict types for type safety (converted from interfaces)
type ParentMethods = {
  add: (a: number, b: number) => Promise<number>
}

type ChildMethods = {
  subtract: (a: number, b: number) => Promise<number>
}

// Create bridge configuration factory with ReturnType pattern
function createBridgeConfig(): ConnectionConfig<ParentMethods> {
  return {
    allowedOrigins: ['*'],
    methods: {
      add: async (a: number, b: number) => {
        const result = a + b
        console.log(`Host: ${a} + ${b} = ${result}`)
        return result
      },
    },
    log: (...args: unknown[]) => console.log('🚌 Host Bridge:', ...args),
  }
}

type BridgeConfig = ReturnType<typeof createBridgeConfig>

// Create bridge with improved typing
const createDefaultBridge = (
  store?: ReturnType<typeof createStore>
): Bridge<ParentMethods, ChildMethods> => {
  const bridgeConfig = createBridgeConfig()
  return createBridge<ParentMethods, ChildMethods>(bridgeConfig, store || getDefaultStore())
}

// Create the unified bridge provider
const bridgeProvider = createBridgeProvider<ParentMethods, ChildMethods>()
export const { BridgeProvider, hooks } = bridgeProvider
export const { useBridge, useRemoteProxy } = hooks

// Export the default bridge creator
export { createDefaultBridge }

// App Provider Component with improved typing
type AppProviderProps = {
  children: ReactNode
  bridge?: Bridge<ParentMethods, ChildMethods>
  store?: ReturnType<typeof createStore>
}

export function AppProvider({ children, bridge, store = getDefaultStore() }: AppProviderProps) {
  const defaultBridge = bridge || createDefaultBridge()
  console.log(`🎯 AppProvider using bridge ID: ${defaultBridge.id}`)

  return (
    <Provider store={store}>
      <BridgeProvider bridge={defaultBridge}>{children}</BridgeProvider>
    </Provider>
  )
}

// Export types for convenience
export type { ParentMethods, ChildMethods, BridgeConfig }
