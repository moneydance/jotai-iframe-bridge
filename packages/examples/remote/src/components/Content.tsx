import { type LazyLoadable, safeAssignment } from 'jotai-iframe-bridge'
import { useCallback, useEffect, useState } from 'react'
import { useBridge, useRemoteProxy } from '../Provider'

// Helper component for connection status display
function ConnectionStatus({ state }: { state: LazyLoadable<unknown>['state'] }) {
  const getStatusColor = () => {
    switch (state) {
      case 'uninitialized':
        return 'bg-gray-500'
      case 'hasData':
        return 'bg-green-500'
      case 'loading':
        return 'bg-yellow-500'
      default:
        return 'bg-red-500'
    }
  }

  const getStatusText = () => {
    switch (state) {
      case 'uninitialized':
        return 'disconnected'
      case 'hasData':
        return 'connected'
      case 'loading':
        return 'connecting'
      default:
        return 'error'
    }
  }

  return (
    <span
      className={`px-3 py-1 rounded-full text-white text-sm ${getStatusColor()}`}
      data-status={getStatusText()}
      data-testid="connection-status"
    >
      {getStatusText()}
    </span>
  )
}

// Connection Section Helper Component
function ConnectionSection({ result }: { result: number | null }) {
  const remoteProxyLoadable = useRemoteProxy()
  const bridge = useBridge()

  const handleDestroyConnection = useCallback(() => {
    console.log(`🔥 Destroying connection [${bridge.id}]`)
    bridge.reset()
  }, [bridge])

  const handleRetryConnection = useCallback(() => {
    console.log(`🔄 Retrying connection [${bridge.id}]`)
    bridge.connect() // Connect to parent window
  }, [bridge])

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="font-semibold">Connection Status: </span>
          <ConnectionStatus state={remoteProxyLoadable.state} />
        </div>
        {result !== null && (
          <div>
            <span className="font-semibold">Last Result: </span>
            <span className="text-green-600 font-bold text-lg" data-testid="calculation-result">
              {result}
            </span>
          </div>
        )}
      </div>

      {/* Connection Control Buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={remoteProxyLoadable.state === 'loading'}
          onClick={handleDestroyConnection}
          className="px-4 py-2 bg-red-500 text-white rounded transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-500 hover:bg-red-600"
          data-testid="destroy-connection-button"
        >
          Destroy Connection
        </button>
        <button
          type="button"
          disabled={remoteProxyLoadable.state === 'loading'}
          onClick={handleRetryConnection}
          className="px-4 py-2 bg-blue-500 text-white rounded transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-500 hover:bg-blue-600"
          data-testid="retry-connection-button"
        >
          Reconnect
        </button>
      </div>
    </div>
  )
}

// Calculation Section Helper Component
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
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 className="text-xl font-semibold text-gray-700 mb-4">Test Host Addition</h3>

      <div className="flex gap-2 mb-4">
        <input
          type="number"
          value={numberA}
          onChange={(e) => onNumberAChange(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded w-24"
          placeholder="A"
          data-testid="number-a-input"
        />
        <span className="py-2">+</span>
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
          className="px-4 py-2 bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-500 hover:bg-blue-600"
          data-testid="calculate-add-button"
        >
          Calculate in Host
        </button>
      </div>

      <p className="text-sm text-gray-600">This will call the add method in the host application</p>
    </div>
  )
}

// Export for testing
export const REMOTE_URL = 'http://localhost:5173'

export function AppContent() {
  const bridge = useBridge()
  const [result, setResult] = useState<number | null>(null)
  const [numberA, setNumberA] = useState<number>(15)
  const [numberB, setNumberB] = useState<number>(7)
  const remoteProxyLoadable = useRemoteProxy()

  // Auto-connect when bridge is created
  useEffect(() => {
    console.log(`🚀 Auto-connecting bridge [${bridge.id}] to parent window`)

    const connectBridge = async () => {
      const [ok, error] = await safeAssignment(() => {
        bridge.connect() // Connect to parent window
        return true
      })

      if (!ok) {
        console.error(`Bridge connection failed [${bridge.id}]:`, error)
      }
    }

    connectBridge()
  }, [bridge])

  const testAddition = useCallback(async () => {
    if (remoteProxyLoadable.state !== 'hasData') return

    const remoteProxy = remoteProxyLoadable.data

    const [ok, error, result] = await safeAssignment(() => remoteProxy.add(numberA, numberB))
    if (!ok) {
      console.error(`Remote add failed [${bridge.id}]:`, error)
      return
    }

    setResult(result)
    console.log(`Host addition [${bridge.id}]: ${numberA} + ${numberB} = ${result}`)
  }, [bridge.id, remoteProxyLoadable, numberA, numberB])

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Remote Application</h1>
          <p className="text-gray-600">
            This iframe can call addition in the host and provides subtraction
          </p>
        </div>

        <ConnectionSection result={result} />

        <CalculationSection
          numberA={numberA}
          numberB={numberB}
          onNumberAChange={setNumberA}
          onNumberBChange={setNumberB}
          onCalculate={testAddition}
        />
      </div>
    </div>
  )
}
