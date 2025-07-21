import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createStore } from 'jotai'
import type { Bridge } from 'jotai-iframe-bridge'
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { AppContent, REMOTE_URL } from '../src/components/Content'
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

// Helper function to wait for UI to show connected state and verify functionality
async function waitForIframeConnection(
  bridge: Bridge<ParentMethods, ChildMethods>,
  oldProxyPromise?: Promise<any>
) {
  try {
    console.log(`⏳ Waiting for bridge ${bridge.id} UI to show connected...`)

    // Wait for the host UI to reflect the connected state
    await waitFor(
      () => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('connected')
      },
      { timeout: 5000 }
    )
    console.log(`✅ Bridge ${bridge.id} host UI shows connected!`)

    // If this is after a reset, give extra time for both sides to reconnect
    if (oldProxyPromise) {
      console.log(`⏳ Allowing extra time for reconnection after reset...`)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Verify the bridge is actually functional by testing a remote method call
    console.log(`⏳ Verifying bridge ${bridge.id} is functional...`)
    const remoteProxy = await bridge.getRemoteProxyPromise()
    if (!remoteProxy) {
      throw new Error('Remote proxy is null')
    }

    // Test that we can actually call a method (this proves iframe is connected)
    const testResult = await remoteProxy.subtract(5, 2)
    if (testResult !== 3) {
      throw new Error(`Remote method call failed, expected 3 but got ${testResult}`)
    }

    console.log(`✅ Bridge ${bridge.id} is fully functional!`)
  } catch (error) {
    console.error(`❌ Bridge ${bridge.id} connection failed:`, error)
    throw error
  }
}

describe('AppContent - Real UI Testing', () => {
  let testBridge: Bridge<ParentMethods, ChildMethods>
  let testStore: ReturnType<typeof createStore>

  beforeAll(async () => {
    if (!(await isRemoteAppRunning())) {
      throw new Error(`Remote app is not running at ${REMOTE_URL}. Please start it with: pnpm dev`)
    }
  })

  beforeEach(() => {
    // Create fresh instances for each test to ensure isolation
    testStore = createStore()
    // Use a small handshake delay for testing to see state transitions
    testBridge = createDefaultBridge(testStore) // 100ms delay
    console.log(`🔬 Test setup created bridge ID: ${testBridge.id}`)
  })

  afterEach(() => {
    testBridge.reset()
  })

  test('renders initial UI correctly', () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    expect(screen.getByText('Host Application')).toBeInTheDocument()
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
    expect(screen.getByText('🔄 Refresh')).toBeInTheDocument()
  })

  test('status goes to connected when iframe is loaded', async () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
    })
    await waitForIframeConnection(testBridge)
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connected')
  })

  test('calculation inputs are present and functional', async () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    await waitForIframeConnection(testBridge)

    // Check that calculation inputs are visible
    expect(screen.getByTestId('number-a-input')).toBeInTheDocument()
    expect(screen.getByTestId('number-b-input')).toBeInTheDocument()
    expect(screen.getByTestId('calculate-subtract-button')).toBeInTheDocument()
  })

  test('calculate button is present and clickable when connected', async () => {
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    await waitForIframeConnection(testBridge)

    const calculateButton = screen.getByTestId('calculate-subtract-button')
    expect(calculateButton).toBeInTheDocument()
    expect(calculateButton).not.toBeDisabled()
  })

  test('calculation workflow produces correct result', async () => {
    const user = userEvent.setup()
    renderApp(<AppContent />, { bridge: testBridge, store: testStore })
    await waitForIframeConnection(testBridge)

    // Set input values
    const inputA = screen.getByTestId('number-a-input')
    const inputB = screen.getByTestId('number-b-input')
    const calculateButton = screen.getByTestId('calculate-subtract-button')

    await user.clear(inputA)
    await user.type(inputA, '15')
    await user.clear(inputB)
    await user.type(inputB, '5')

    // Click calculate button
    await user.click(calculateButton)

    // Wait for result to appear
    await waitFor(() => {
      const result = screen.getByTestId('calculation-result')
      expect(result).toHaveTextContent('10')
    })
  })

  test(
    'refresh button resets bridge and calculations still work',
    async () => {
      const user = userEvent.setup()
      renderApp(<AppContent />, { bridge: testBridge, store: testStore })
      await waitForIframeConnection(testBridge)

      // Test initial calculation works
      const inputA = screen.getByTestId('number-a-input')
      const inputB = screen.getByTestId('number-b-input')
      const calculateButton = screen.getByTestId('calculate-subtract-button')

      await user.clear(inputA)
      await user.type(inputA, '15')
      await user.clear(inputB)
      await user.type(inputB, '5')
      await user.click(calculateButton)

      // Wait for initial result to appear
      await waitFor(() => {
        const result = screen.getByTestId('calculation-result')
        expect(result).toHaveTextContent('10')
      })

      // Click refresh button
      const refreshButton = screen.getByText('🔄 Refresh')
      await user.click(refreshButton)

      // Wait for reconnection - even if it takes time in test environment
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Verify calculations still work after refresh by trying a new calculation
      await user.clear(inputA)
      await user.type(inputA, '20')
      await user.clear(inputB)
      await user.type(inputB, '8')

      // Try to calculate - this will test if the bridge actually reconnected

      // Wait for result - with longer timeout since reconnection might be slow in tests
      await waitFor(
        async () => {
          await user.click(calculateButton)
          const result = screen.getByTestId('calculation-result')
          expect(result).toHaveTextContent('12')
        },
        { timeout: 10000 }
      )
    },
    {
      timeout: 15000,
    }
  )
})
