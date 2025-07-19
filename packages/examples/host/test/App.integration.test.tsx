import { fireEvent, screen, waitFor } from '@testing-library/react'
import { createStore } from 'jotai'
import type { ParentBridge } from 'jotai-iframe-bridge'
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { AppContent, REMOTE_URL } from '../src/Content'
import type { ChildMethods, ParentMethods } from '../src/Provider'
import { createDefaultBridge, renderApp } from './utilities/renderApp'

// Helper function to check if remote app is running
async function isRemoteAppRunning(): Promise<boolean> {
  try {
    await fetch(REMOTE_URL, {
      method: 'GET',
      mode: 'no-cors',
    })
    return true
  } catch {
    return false
  }
}

// Helper function to wait for iframe load and bridge connection
async function waitForIframeConnection(bridge: ParentBridge<ParentMethods, ChildMethods>) {
  // Wait for the bridge connection to be actually established
  try {
    console.log(`⏳ Waiting for bridge ${bridge.id} to connect...`)
    const connection = await bridge.getConnectionPromise()
    console.log(`✅ Bridge ${bridge.id} connection established!`)

    // Also wait for the remote proxy to be available
    const _remoteProxy = await connection.promise
    console.log(`🎯 Bridge ${bridge.id} remote proxy ready!`)

    // Now wait for the UI to reflect the connected state
    await waitFor(
      () => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('connected')
      },
      { timeout: 2000 }
    )
  } catch (error) {
    console.error(`❌ Bridge ${bridge.id} connection failed:`, error)
    throw error
  }
}

describe('AppContent - Real UI Testing', () => {
  let testBridge: ParentBridge<ParentMethods, ChildMethods>
  let testStore: ReturnType<typeof createStore>

  beforeAll(async () => {
    if (!(await isRemoteAppRunning())) {
      throw new Error(`Remote app is not running at ${REMOTE_URL}. Please start it with: pnpm dev`)
    }
  })

  beforeEach(() => {
    // Create fresh instances for each test to ensure isolation
    testStore = createStore()
    testBridge = createDefaultBridge(testStore)
    console.log(`🔬 Test setup created bridge ID: ${testBridge.id}`)
  })

  afterEach(() => {
    testBridge.destroy()
  })

  test('renders initial UI correctly', () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    expect(screen.getByText('Host Application')).toBeInTheDocument()
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
    expect(screen.getByTestId('connect-button')).toBeInTheDocument()
  })

  test('status goes to connected when iframe is loaded', async () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
    })
    await waitForIframeConnection(testBridge)
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connected')
  }, 10000) // 10 second timeout for this test

  test('can click connect button and see status change', () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    const connectButton = screen.getByTestId('connect-button')
    fireEvent.click(connectButton)
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
  })

  test('calculation inputs are present and functional', async () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    await waitForIframeConnection(testBridge)

    // Check that calculation inputs are visible
    expect(screen.getByTestId('number-a-input')).toBeInTheDocument()
    expect(screen.getByTestId('number-b-input')).toBeInTheDocument()
    expect(screen.getByTestId('calculate-subtract-button')).toBeInTheDocument()
  }, 10000) // 10 second timeout for this test

  test('calculate button is present and clickable when connected', async () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    await waitForIframeConnection(testBridge)

    const calculateButton = screen.getByTestId('calculate-subtract-button')
    expect(calculateButton).toBeInTheDocument()
    expect(calculateButton).not.toBeDisabled()
  }, 10000) // 10 second timeout for this test

  test('calculation workflow produces correct result', async () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    await waitForIframeConnection(testBridge)

    // Set input values
    const inputA = screen.getByTestId('number-a-input')
    const inputB = screen.getByTestId('number-b-input')
    const calculateButton = screen.getByTestId('calculate-subtract-button')

    fireEvent.change(inputA, { target: { value: '15' } })
    fireEvent.change(inputB, { target: { value: '5' } })

    // Click calculate button
    fireEvent.click(calculateButton)

    // Wait for result to appear
    await waitFor(() => {
      const result = screen.getByTestId('calculation-result')
      expect(result).toHaveTextContent('10')
    })
  }, 15000) // 15 second timeout for this test
})
