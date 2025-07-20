import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createStore } from 'jotai'
import type { Bridge } from 'jotai-iframe-bridge'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
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

// Helper function to wait for UI to show connected state
async function waitForIframeConnection(bridge: Bridge<ParentMethods, ChildMethods>) {
  try {
    console.log(`⏳ Waiting for bridge ${bridge.id} UI to show connected...`)

    // Wait for the UI to reflect the connected state
    await waitFor(
      () => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('connected')
      },
      { timeout: 5000 }
    )
    console.log(`✅ Bridge ${bridge.id} UI shows connected!`)
  } catch (error) {
    console.error(`❌ Bridge ${bridge.id} UI connection failed:`, error)
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
    'refresh button resets bridge connection',
    async () => {
      const user = userEvent.setup()
      renderApp(<AppContent />, { bridge: testBridge, store: testStore })

      // Step 1: Wait for initial connection
      console.log('🔗 Step 1: Waiting for initial connection...')
      await waitForIframeConnection(testBridge)
      expect(screen.getByTestId('connection-status')).toHaveTextContent('connected')
      console.log('✅ Initial connection established')

      // Step 2: Spy on bridge reset method to verify it's called
      const resetSpy = vi.spyOn(testBridge, 'reset')

      // Step 3: Click refresh button
      console.log('🔄 Step 3: Clicking refresh button...')
      const refreshButton = screen.getByText('🔄 Refresh')
      expect(refreshButton).toBeInTheDocument()
      await user.click(refreshButton)
      console.log('✅ Refresh button clicked')

      // Step 4: Verify reset was called
      expect(resetSpy).toHaveBeenCalledTimes(1)
      console.log('✅ Bridge.reset() was called')

      // Step 5: Wait for status to go to connecting (old session destroyed)
      console.log('⏸️ Step 5: Waiting for status to show connecting...')
      await waitFor(
        () => {
          expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
        },
        { timeout: 2000 }
      )
      console.log('✅ Status correctly shows connecting after reset')

      // Step 6: Wait for status to go back to connected (new session established)
      console.log('🔗 Step 6: Waiting for reconnection...')
      await waitFor(
        () => {
          expect(screen.getByTestId('connection-status')).toHaveTextContent('connected')
        },
        { timeout: 5000 }
      )
      console.log('✅ Connection status confirmed as connected after refresh')

      // Step 7: Test functionality works after refresh
      console.log('🧮 Step 7: Testing functionality after refresh...')
      const inputA = screen.getByTestId('number-a-input')
      const inputB = screen.getByTestId('number-b-input')
      const calculateButton = screen.getByTestId('calculate-subtract-button')

      await user.clear(inputA)
      await user.type(inputA, '20')
      await user.clear(inputB)
      await user.type(inputB, '8')
      await user.click(calculateButton)

      await waitFor(
        () => {
          const result = screen.getByTestId('calculation-result')
          expect(result).toHaveTextContent('12')
        },
        { timeout: 5000 }
      )
      console.log('✅ Calculation works correctly after refresh!')

      // Cleanup spy
      resetSpy.mockRestore()
    },
    { timeout: 15000 }
  )
})
