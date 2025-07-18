import type { Loadable } from 'jotai/vanilla/utils/loadable'
import { safeAssignment } from 'jotai-iframe-bridge'
import { memo, useCallback, useEffect, useState } from 'react'
import { useBridge, useRemoteProxy } from '../Provider'

// Export for testing
export const REMOTE_URL = 'http://localhost:5174'

// Connection Status Helper Component
type ConnectionStatusProps = {
  state: Loadable<unknown>['state']
  className?: string
}

function ConnectionStatus({ state, className = '' }: ConnectionStatusProps) {
  switch (state) {
    case 'hasData':
      return (
        <span
          className={`px-3 py-1 rounded-full text-white text-sm bg-green-500 ${className}`}
          data-testid="connection-status"
          data-status="connected"
        >
          connected
        </span>
      )
    case 'loading':
      return (
        <span
          className={`px-3 py-1 rounded-full text-white text-sm bg-yellow-500 ${className}`}
          data-testid="connection-status"
          data-status="connecting"
        >
          connecting
        </span>
      )
    case 'hasError':
      return (
        <span
          className={`px-3 py-1 rounded-full text-white text-sm bg-red-500 ${className}`}
          data-testid="connection-status"
          data-status="error"
        >
          error
        </span>
      )
    default:
      return (
        <span
          className={`px-3 py-1 rounded-full text-white text-sm bg-red-500 ${className}`}
          data-testid="connection-status"
          data-status="disconnected"
        >
          disconnected
        </span>
      )
  }
}

// Connection Section Helper Component (uses hooks directly)
function ConnectionSection({ result }: { result: number | null }) {
  const bridge = useBridge()
  const remoteProxyLoadable = useRemoteProxy()

  // Derive connection status from remote proxy state
  const isConnected = remoteProxyLoadable.state === 'hasData'
  const isConnecting = remoteProxyLoadable.state === 'loading'

  const handleDestroyConnection = useCallback(() => {
    console.log(`🔥 Destroying connection [${bridge.id}]`)
    bridge.destroy()
  }, [bridge])

  const handleRetryConnection = useCallback(() => {
    console.log(`🔄 Retrying connection [${bridge.id}]`)
    bridge.retry()
  }, [bridge])

  return (
    <>
      {/* Connection Status */}
      <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="font-semibold">Connection Status: </span>
            <ConnectionStatus state={remoteProxyLoadable.state} />
          </div>
          {result !== null && (
            <div>
              <span className="font-semibold">Last Result: </span>
              <span className="text-blue-600 font-bold text-lg" data-testid="calculation-result">
                {result}
              </span>
            </div>
          )}
        </div>

        {/* Connection Control Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDestroyConnection}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
            data-testid="destroy-connection-button"
          >
            Destroy Connection
          </button>
          <button
            type="button"
            onClick={handleRetryConnection}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
            data-testid="retry-connection-button"
          >
            Reconnect
          </button>
        </div>
      </div>

      {/* Connection Control */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-semibold text-gray-700 mb-4">Connection</h3>
        <button
          type="button"
          className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
          data-testid="connect-button"
          disabled={isConnecting}
          onClick={() => {
            if (!isConnecting) {
              console.log(`Manual connection requested [${bridge.id}]`)
              bridge.retry()
            }
          }}
        >
          {isConnecting ? 'Connecting...' : isConnected ? 'Reconnect' : 'Connect'}
        </button>
      </div>
    </>
  )
}

// Calculation Section Helper Component (uses hooks directly)
function CalculationSection({
  numberA,
  numberB,
  onNumberAChange,
  onNumberBChange,
  onCalculate,
}: {
  numberA: number
  numberB: number
  onNumberAChange: (value: number) => void
  onNumberBChange: (value: number) => void
  onCalculate: () => void
}) {
  const remoteProxyLoadable = useRemoteProxy()

  if (remoteProxyLoadable.state !== 'hasData') {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-700 mb-4">Test Remote Subtraction</h3>

      <div className="flex gap-2 mb-4">
        <input
          type="number"
          value={numberA}
          onChange={(e) => onNumberAChange(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded w-24"
          placeholder="A"
          data-testid="number-a-input"
        />
        <span className="py-2">-</span>
        <input
          type="number"
          value={numberB}
          onChange={(e) => onNumberBChange(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded w-24"
          placeholder="B"
          data-testid="number-b-input"
        />
        <button
          type="button"
          onClick={onCalculate}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          data-testid="calculate-subtract-button"
        >
          Calculate in Remote
        </button>
      </div>

      <p className="text-sm text-gray-600">
        This will call the subtract method in the remote iframe
      </p>
    </div>
  )
}

// Iframe Container Helper Component (uses hooks directly)
const IframeContainer = memo(() => {
  const bridge = useBridge()
  const [iframeElement, setIframeElement] = useState<HTMLIFrameElement | null>(null)

  // Handle iframe initialization when element becomes available and loaded
  useEffect(() => {
    if (!iframeElement?.contentWindow) {
      return
    }
    console.log(`🚀 Connecting bridge [${bridge.id}] to iframe content window`)

    const contentWindow = iframeElement.contentWindow
    const [ok, error] = safeAssignment(() => {
      bridge.connect(contentWindow)
    })
    if (!ok) {
      console.error(`Bridge connection failed [${bridge.id}]:`, error)
      return
    }

    return () => {
      const [destroyOk, destroyError] = safeAssignment(() => {
        bridge.destroy()
      })
      if (!destroyOk) {
        console.error(`Bridge destroy failed [${bridge.id}]:`, destroyError)
      }
    }
  }, [bridge, iframeElement])

  const handleIframeRef = useCallback(
    (element: HTMLIFrameElement | null) => {
      console.log(`📎 Iframe ref callback [${bridge.id}]:`, {
        element,
        contentWindow: element?.contentWindow,
      })
      setIframeElement(element)
    },
    [bridge.id]
  )

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-700 mb-4">Remote Application</h3>
      <div className="border-2 border-gray-300 rounded">
        <iframe
          ref={handleIframeRef}
          src={REMOTE_URL}
          className="w-full h-96"
          title="Child Frame"
          onLoad={() => {
            console.log(`📦 Iframe loaded [${bridge.id}]`)
          }}
        />
      </div>
      <div className="mt-4 text-sm text-gray-600">
        <p>
          <strong>Note:</strong> Make sure the remote app is running on localhost:5174
        </p>
      </div>
    </div>
  )
})

IframeContainer.displayName = 'IframeContainer'

export function AppContent() {
  const bridge = useBridge()
  const [result, setResult] = useState<number | null>(null)
  const [numberA, setNumberA] = useState<number>(10)
  const [numberB, setNumberB] = useState<number>(5)
  const remoteProxyLoadable = useRemoteProxy()

  const testSubtraction = async () => {
    if (remoteProxyLoadable.state !== 'hasData') return

    const remoteProxy = remoteProxyLoadable.data

    try {
      const result = await remoteProxy.subtract(numberA, numberB)
      setResult(result)
      console.log(`Remote subtraction [${bridge.id}]: ${numberA} - ${numberB} = ${result}`)
    } catch (error) {
      console.error(`Remote subtract failed [${bridge.id}]:`, error)
      return
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Host Application</h1>
          <p className="text-gray-600">Testing iframe bridge with simple math operations</p>
        </div>

        <ConnectionSection result={result} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-6">
            <CalculationSection
              numberA={numberA}
              numberB={numberB}
              onNumberAChange={setNumberA}
              onNumberBChange={setNumberB}
              onCalculate={testSubtraction}
            />
          </div>

          {/* Iframe */}
          <IframeContainer />
        </div>

        {/* Debug Info */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm">
          <h4 className="font-semibold mb-2">Debug Information:</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>Bridge Initialized: {bridge.isInitialized() ? '✅' : '❌'}</div>
            <div>Connection State: {remoteProxyLoadable.state}</div>
            <div>Remote Proxy State: {remoteProxyLoadable.state}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
