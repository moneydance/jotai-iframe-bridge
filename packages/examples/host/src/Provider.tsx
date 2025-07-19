import { type createStore, getDefaultStore, Provider } from 'jotai'
import {
  type ConnectionConfig,
  createParentBridge,
  makeParentBridgeHooks,
  type ParentBridge,
} from 'jotai-iframe-bridge'
import type { ReactNode } from 'react'

// Define the interfaces for type safety
interface ParentMethods {
  [methodName: string]: (...args: any[]) => any
  add: (a: number, b: number) => Promise<number>
}

interface ChildMethods {
  [methodName: string]: (...args: any[]) => any
  subtract: (a: number, b: number) => Promise<number>
}

// Create the default bridge configuration
const createDefaultBridge = (store?: ReturnType<typeof createStore>) => {
  const config: ConnectionConfig<ParentMethods> = {
    allowedOrigins: ['*'],
    methods: {
      add: async (a: number, b: number) => {
        const result = a + b
        console.log(`Host: ${a} + ${b} = ${result}`)
        return result
      },
    },
    timeout: 15000,
    log: (...args) => console.log('🚌 Host Bridge:', ...args),
  }

  return createParentBridge<ParentMethods, ChildMethods>(config, store)
}

// Create default instances for the app
const defaultStore = getDefaultStore()
const defaultBridge = createDefaultBridge(defaultStore)

// Create the parent bridge hooks using the factory
export const { ParentBridgeProvider, hooks } = makeParentBridgeHooks<ParentMethods, ChildMethods>(
  defaultBridge
)

// Export the specific hooks for convenience
export const { useParentBridge, useRemoteProxy, useConnection, useChildReady } = hooks

// Provider component with dependency injection
interface AppProviderProps {
  children: ReactNode
  bridge?: ParentBridge<ParentMethods, ChildMethods>
  store?: ReturnType<typeof createStore>
}

export const AppProvider = ({
  children,
  store = defaultStore,
  bridge = defaultBridge,
}: AppProviderProps) => {
  console.log(`🎯 AppProvider using bridge ID: ${bridge.id}`)

  return (
    <Provider store={store}>
      <ParentBridgeProvider bridge={bridge}>{children}</ParentBridgeProvider>
    </Provider>
  )
}

// Export types and utilities
export type { ParentMethods, ChildMethods }
export type { ParentBridge }
export { createDefaultBridge, defaultStore, defaultBridge }
