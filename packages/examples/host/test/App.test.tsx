import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import type { IframeBridge } from '../../../jotai-iframe-bridge/src/index'
import App, {
  type ChildMethods,
  createDefaultBridge,
  type ParentMethods,
  REMOTE_URL,
} from '../src/App'

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
async function waitForIframeConnection(bridge: IframeBridge<ParentMethods, ChildMethods>) {
  // Wait for bridge connection using the actual bridge instance
  await waitFor(
    async () => {
      try {
        await bridge.getConnectionPromise()
      } catch {
        throw new Error('Bridge not connected yet')
      }
    },
    { timeout: 15000 }
  )
}

describe('Host App - Real UI Testing', () => {
  let testBridge: IframeBridge<ParentMethods, ChildMethods>

  beforeAll(async () => {
    if (!(await isRemoteAppRunning())) {
      throw new Error(`Remote app is not running at ${REMOTE_URL}. Please start it with: pnpm dev`)
    }
  })

  beforeEach(() => {
    testBridge = createDefaultBridge()
  })

  afterEach(() => {
    testBridge.destroy()
  })

  test('renders initial UI correctly', () => {
    render(<App bridge={testBridge} />)
    expect(screen.getByText('Host Application')).toBeInTheDocument()
    expect(screen.getByTestId('connection-status')).toHaveTextContent('disconnected')
    expect(screen.getByTestId('connect-button')).toBeInTheDocument()
  })

  test('status goes to connected when iframe is loaded', async () => {
    render(<App bridge={testBridge} />)
    expect(screen.getByTestId('connection-status')).toHaveTextContent('disconnected')
    await waitFor(() => {
      expect(screen.getByTestId('connection-state')).toHaveTextContent('connecting')
    })
    await waitForIframeConnection(testBridge)
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connected')
  })

  test('can click connect button and see status change', () => {
    render(<App bridge={testBridge} />)
    const connectButton = screen.getByTestId('connect-button')
    fireEvent.click(connectButton)
    expect(screen.getByTestId('connection-status')).toHaveTextContent('connecting')
  })

  test('calculation inputs are present and functional', async () => {
    render(<App bridge={testBridge} />)

    await waitForIframeConnection(testBridge)

    const numberAInput = screen.getByTestId('number-a-input')
    const numberBInput = screen.getByTestId('number-b-input')

    expect(numberAInput).toBeInTheDocument()
    expect(numberBInput).toBeInTheDocument()
  })

  test('calculate button is present and clickable when connected', async () => {
    render(<App bridge={testBridge} />)

    await waitForIframeConnection(testBridge)

    const calculateButton = screen.getByTestId('calculate-subtract-button')
    expect(calculateButton).toBeInTheDocument()

    fireEvent.click(calculateButton)
  })

  test('calculation workflow produces correct result', async () => {
    render(<App bridge={testBridge} />)

    await waitForIframeConnection(testBridge)

    // Set up calculation: 25 - 10 = 15
    const numberAInput = screen.getByTestId('number-a-input')
    const numberBInput = screen.getByTestId('number-b-input')
    const calculateButton = screen.getByTestId('calculate-subtract-button')

    fireEvent.change(numberAInput, { target: { value: '25' } })
    fireEvent.change(numberBInput, { target: { value: '10' } })

    // Trigger calculation
    fireEvent.click(calculateButton)

    // Wait for result using bridge directly
    await waitFor(
      async () => {
        const resultElement = screen.getByTestId('calculation-result')
        expect(resultElement).toHaveTextContent('15')
      },
      { timeout: 10000 }
    )
  })
})
