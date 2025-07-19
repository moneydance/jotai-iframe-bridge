import { type RenderResult, render } from '@testing-library/react'
import { createStore } from 'jotai'
import type { Bridge } from 'jotai-iframe-bridge'
import type { ReactElement, ReactNode } from 'react'
import {
  AppProvider,
  type ChildMethods,
  createDefaultBridge,
  type ParentMethods,
} from '../../src/Provider'

// Test context options
interface RenderAppOptions {
  bridge?: Bridge<ParentMethods, ChildMethods>
  store?: ReturnType<typeof createStore>
}

// Test context component
const TestAppContext = ({
  children,
  bridge,
  store,
}: {
  children: ReactNode
  bridge: Bridge<ParentMethods, ChildMethods>
  store: ReturnType<typeof createStore>
}) => {
  return (
    <AppProvider bridge={bridge} store={store}>
      {children}
    </AppProvider>
  )
}

// Return type for renderApp
interface RenderAppResult extends RenderResult {
  testBridge: Bridge<ParentMethods, ChildMethods>
  testStore: ReturnType<typeof createStore>
}

// Main test utility function
export function renderApp(ui: ReactElement, options: RenderAppOptions = {}): RenderAppResult {
  // Create fresh instances for each test to ensure isolation
  const testStore = options.store || createStore()
  const testBridge = options.bridge || createDefaultBridge(testStore)

  console.log(`🧪 Test renderApp using bridge ID: ${testBridge.id}`)

  const result = render(
    <TestAppContext bridge={testBridge} store={testStore}>
      {ui}
    </TestAppContext>
  )

  return {
    ...result,
    testBridge,
    testStore,
  }
}

export { createDefaultBridge }
export type { ParentMethods, ChildMethods }
export type { Bridge }
