import { type LazyLoadable, safeAssignment } from 'jotai-iframe-bridge'
import { useCallback, useEffect, useState } from 'react'
import { useBridge, useRemoteProxy } from '../Provider'

// Helper component for connection status display
function ConnectionStatus({ state }: { state: LazyLoadable<unknown>['state'] }) {
  const getStatusColor = () => {
    switch (state) {
      case 'uninitialized':
        return 'bg-slate-500'
      case 'hasData':
        return 'bg-emerald-500'
      case 'loading':
        return 'bg-amber-500 animate-pulse'
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
      className={`px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg ${getStatusColor()}`}
      data-status={getStatusText()}
      data-testid="connection-status"
    >
      {getStatusText()}
    </span>
  )
}

// Connection Section Helper Component
function ConnectionSection({ onRefresh }: { onRefresh: () => void }) {
  const remoteProxyLoadable = useRemoteProxy()

  return (
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">Remote Application</h1>
          <div>
            <span className="font-semibold text-slate-200">Status: </span>
            <ConnectionStatus state={remoteProxyLoadable.state} />
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-violet-500/25"
        >
          🔄 Refresh
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
  result,
}: {
  numberA: number
  numberB: number
  onNumberAChange: (value: number) => void
  onNumberBChange: (value: number) => void
  onCalculate: () => void
  result: number | null
}) {
  const remoteProxyLoadable = useRemoteProxy()

  if (remoteProxyLoadable.state !== 'hasData') {
    return null
  }

  return (
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 p-4 mb-4">
      <h3 className="text-lg font-semibold text-white mb-4">Test Host Addition</h3>

      <div className="flex gap-3 mb-4 items-center">
        <input
          type="number"
          value={numberA === 0 ? '' : numberA}
          onChange={(e) => onNumberAChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg w-20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="A"
          data-testid="number-a-input"
        />
        <span className="py-2 text-slate-300 font-medium">+</span>
        <input
          type="number"
          value={numberB === 0 ? '' : numberB}
          onChange={(e) => onNumberBChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg w-20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="B"
          data-testid="number-b-input"
        />
        <button
          type="button"
          onClick={onCalculate}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-blue-500/25"
          data-testid="calculate-add-button"
        >
          Calculate in Host
        </button>
        {result !== null && (
          <div className="ml-4 flex items-center">
            <span className="text-slate-300 mr-2">=</span>
            <span className="text-emerald-400 font-bold text-xl" data-testid="calculation-result">
              {result}
            </span>
          </div>
        )}
      </div>

      <p className="text-sm text-slate-400">
        This will call the add method in the host application
      </p>
    </div>
  )
}

export function AppContent() {
  const bridge = useBridge()
  const [result, setResult] = useState<number | null>(null)
  const [numberA, setNumberA] = useState<number>(0)
  const [numberB, setNumberB] = useState<number>(0)
  const remoteProxyLoadable = useRemoteProxy()

  // Refresh UI state without disconnecting bridge
  const handleRefresh = useCallback(() => {
    bridge.reset()
  }, [bridge.reset])

  // Auto-connect when bridge is created
  useEffect(() => {
    const connectBridge = async () => {
      const [ok, _error] = await safeAssignment(() => {
        bridge.connect() // Connect to parent window
        return true
      })

      if (!ok) {
        // Connection failed silently
      }
    }

    connectBridge()
  }, [bridge])

  const testAddition = useCallback(async () => {
    if (remoteProxyLoadable.state !== 'hasData') return

    const remoteProxy = remoteProxyLoadable.data

    const [ok, _error, result] = await safeAssignment(() => remoteProxy.add(numberA, numberB))
    if (!ok) {
      return
    }

    setResult(result)
  }, [remoteProxyLoadable, numberA, numberB])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        <ConnectionSection onRefresh={handleRefresh} />

        <CalculationSection
          numberA={numberA}
          numberB={numberB}
          onNumberAChange={setNumberA}
          onNumberBChange={setNumberB}
          onCalculate={testAddition}
          result={result}
        />
      </div>
    </div>
  )
}
