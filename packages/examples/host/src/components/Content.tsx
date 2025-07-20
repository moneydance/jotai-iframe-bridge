import type { LazyLoadable } from 'jotai-iframe-bridge'
import { memo, useCallback, useEffect, useState } from 'react'
import { useBridge, useRemoteProxy } from '../Provider'

// Export for testing
export const REMOTE_URL = 'http://localhost:5174'

// Connection Status Helper Component
type ConnectionStatusProps = {
  state: LazyLoadable<unknown>['state']
  className?: string
}

function ConnectionStatus({ state, className = '' }: ConnectionStatusProps) {
  switch (state) {
    case 'uninitialized':
      return (
        <span
          className={`px-4 py-2 rounded-full text-white text-sm font-medium bg-slate-500 shadow-lg ${className}`}
          data-testid="connection-status"
          data-status="disconnected"
        >
          disconnected
        </span>
      )
    case 'hasData':
      return (
        <span
          className={`px-4 py-2 rounded-full text-white text-sm font-medium bg-emerald-500 shadow-lg ${className}`}
          data-testid="connection-status"
          data-status="connected"
        >
          connected
        </span>
      )
    case 'loading':
      return (
        <span
          className={`px-4 py-2 rounded-full text-white text-sm font-medium bg-amber-500 shadow-lg animate-pulse ${className}`}
          data-testid="connection-status"
          data-status="connecting"
        >
          connecting
        </span>
      )
    case 'hasError':
      return (
        <span
          className={`px-4 py-2 rounded-full text-white text-sm font-medium bg-red-500 shadow-lg ${className}`}
          data-testid="connection-status"
          data-status="error"
        >
          error
        </span>
      )
    default:
      return (
        <span
          className={`px-4 py-2 rounded-full text-white text-sm font-medium bg-red-500 shadow-lg ${className}`}
          data-testid="connection-status"
          data-status="unknown"
        >
          unknown
        </span>
      )
  }
}

// Connection Section Helper Component (uses hooks directly)
function ConnectionSection({ onRefresh }: { onRefresh: () => void }) {
  const remoteProxyLoadable = useRemoteProxy()

  return (
    <>
      {/* Connection Status */}
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Host Application</h1>
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
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Test Remote Subtraction</h3>

      <div className="flex gap-3 mb-4 items-center">
        <input
          type="number"
          value={numberA === 0 ? '' : numberA}
          onChange={(e) => onNumberAChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg w-20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
          placeholder="A"
          data-testid="number-a-input"
        />
        <span className="py-2 text-slate-300 font-medium">-</span>
        <input
          type="number"
          value={numberB === 0 ? '' : numberB}
          onChange={(e) => onNumberBChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg w-20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
          placeholder="B"
          data-testid="number-b-input"
        />
        <button
          type="button"
          onClick={onCalculate}
          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg hover:from-emerald-700 hover:to-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-emerald-500/25"
          data-testid="calculate-subtract-button"
        >
          Calculate in Remote
        </button>
        {result !== null && (
          <div className="ml-4 flex items-center">
            <span className="text-slate-300 mr-2">=</span>
            <span className="text-blue-400 font-bold text-xl" data-testid="calculation-result">
              {result}
            </span>
          </div>
        )}
      </div>

      <p className="text-sm text-slate-400">
        This will call the subtract method in the remote iframe
      </p>
    </div>
  )
}

// Iframe Container Helper Component (uses hooks directly)
const IframeContainer = memo(
  ({
    iframeElement,
    setIframeElement,
  }: {
    iframeElement: HTMLIFrameElement | null
    setIframeElement: (element: HTMLIFrameElement | null) => void
  }) => {
    const bridge = useBridge()
    // @ts-ignore

    // Handle iframe initialization when element becomes available and loaded
    useEffect(() => {
      if (!iframeElement?.contentWindow) {
        return
      }

      const contentWindow = iframeElement.contentWindow
      bridge.connect(contentWindow)

      return () => {
        bridge.reset()
      }
    }, [bridge, iframeElement?.contentWindow])

    const handleIframeRef = useCallback(
      (element: HTMLIFrameElement | null) => {
        setIframeElement(element)
      },
      [setIframeElement]
    )

    return (
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Remote Application</h3>
        <div className="border-2 border-slate-600 rounded-lg overflow-hidden">
          <iframe
            ref={handleIframeRef}
            src={REMOTE_URL}
            className="w-full h-72"
            title="Child Frame"
            scrolling="no"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>
        <div className="mt-4 text-sm text-slate-400">
          <p>
            <strong className="text-slate-300">Note:</strong> Make sure the remote app is running on
            localhost:5174
          </p>
        </div>
      </div>
    )
  }
)

IframeContainer.displayName = 'IframeContainer'

export function AppContent() {
  const bridge = useBridge()
  const [result, setResult] = useState<number | null>(null)
  const [numberA, setNumberA] = useState<number>(0)
  const [numberB, setNumberB] = useState<number>(0)
  const [iframeElement, setIframeElement] = useState<HTMLIFrameElement | null>(null)

  const remoteProxyLoadable = useRemoteProxy()

  // Refresh UI state without disconnecting bridge
  const refreshUI = useCallback(() => {
    bridge.reset()
  }, [bridge])

  const testSubtraction = async () => {
    if (remoteProxyLoadable.state !== 'hasData') return

    const remoteProxy = remoteProxyLoadable.data

    try {
      const result = await remoteProxy.subtract(numberA, numberB)
      setResult(result)
    } catch (_error) {
      return
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        <ConnectionSection onRefresh={refreshUI} />

        <div className="space-y-4">
          {/* Controls */}
          <CalculationSection
            numberA={numberA}
            numberB={numberB}
            onNumberAChange={setNumberA}
            onNumberBChange={setNumberB}
            onCalculate={testSubtraction}
            result={result}
          />

          {/* Iframe */}
          <IframeContainer iframeElement={iframeElement} setIframeElement={setIframeElement} />
        </div>
      </div>
    </div>
  )
}
