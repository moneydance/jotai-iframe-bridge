import { useRef, useState } from 'react'
import {
  type ConnectionConfig,
  createIframeBridge,
  type IframeBridge,
} from '../../../jotai-iframe-bridge/src/index'

// Export for testing
export const REMOTE_URL = 'http://localhost:5174'

// Simplified interfaces
interface ParentMethods {
  [methodName: string]: (...args: any[]) => any
  add: (a: number, b: number) => Promise<number>
}

interface ChildMethods {
  [methodName: string]: (...args: any[]) => any
  subtract: (a: number, b: number) => Promise<number>
}

// Create bridge instance outside the component
const createDefaultBridge = () => {
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

  const bridgeInstance = createIframeBridge<ParentMethods, ChildMethods>(config)

  // Add error handlers to prevent unhandled rejections
  bridgeInstance.getConnectionPromise().catch((error) => {
    // Silently handle connection errors during cleanup
    if (error.message === 'IframeBridge destroyed') {
      return // Expected during cleanup
    }
    console.error('Bridge connection error:', error)
  })

  bridgeInstance.getRemoteProxyPromise().catch((error) => {
    // Silently handle proxy errors during cleanup
    if (error.message === 'IframeBridge destroyed') {
      return // Expected during cleanup
    }
    console.error('Bridge proxy error:', error)
  })

  return bridgeInstance
}

// Create default bridge instance
const defaultBridge = createDefaultBridge()

// App component props interface
interface AppProps {
  bridge?: IframeBridge<ParentMethods, ChildMethods>
}

function App({ bridge = defaultBridge }: AppProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected')
  const [result, setResult] = useState<number | null>(null)
  const [numberA, setNumberA] = useState<number>(10)
  const [numberB, setNumberB] = useState<number>(5)

  const initializeConnection = () => {
    if (!bridge || !iframeRef.current?.contentWindow) return

    setConnectionStatus('connecting')
    bridge.init(iframeRef.current.contentWindow)

    bridge
      .getConnectionPromise()
      .then(() => {
        console.log('✅ Connection established!')
        setConnectionStatus('connected')
      })
      .catch((error) => {
        console.error('❌ Connection failed:', error)
        setConnectionStatus('disconnected')
      })
  }

  const testSubtraction = async () => {
    if (!bridge || connectionStatus !== 'connected') return

    try {
      const remoteProxy = await bridge.getRemoteProxyPromise()
      const result = await remoteProxy.subtract(numberA, numberB)
      setResult(result)
      console.log(`Remote subtraction: ${numberA} - ${numberB} = ${result}`)
    } catch (error) {
      console.error('Error calling remote subtract:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Host Application</h1>
          <p className="text-gray-600">Testing iframe bridge with simple math operations</p>
        </div>

        {/* Connection Status */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold">Connection Status: </span>
              <span
                className={`px-3 py-1 rounded-full text-white text-sm ${
                  connectionStatus === 'connected'
                    ? 'bg-green-500'
                    : connectionStatus === 'connecting'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                data-testid="connection-status"
              >
                {connectionStatus}
              </span>
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">Connection</h3>
              <button
                type="button"
                onClick={initializeConnection}
                disabled={connectionStatus === 'connecting'}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
                data-testid="connect-button"
              >
                {connectionStatus === 'connecting' ? 'Connecting...' : 'Initialize Connection'}
              </button>
            </div>

            {connectionStatus === 'connected' && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">
                  Test Remote Subtraction
                </h3>

                <div className="flex gap-2 mb-4">
                  <input
                    type="number"
                    value={numberA}
                    onChange={(e) => setNumberA(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded w-24"
                    placeholder="A"
                    data-testid="number-a-input"
                  />
                  <span className="py-2">-</span>
                  <input
                    type="number"
                    value={numberB}
                    onChange={(e) => setNumberB(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded w-24"
                    placeholder="B"
                    data-testid="number-b-input"
                  />
                  <button
                    type="button"
                    onClick={testSubtraction}
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
            )}
          </div>

          {/* Iframe */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">Remote Application</h3>
            <div className="border-2 border-gray-300 rounded">
              <iframe
                ref={iframeRef}
                src={REMOTE_URL}
                className="w-full h-96"
                title="Child Frame"
                onLoad={() => {
                  console.log('📦 Iframe loaded')
                  setTimeout(initializeConnection, 500)
                }}
              />
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>
                <strong>Note:</strong> Make sure the remote app is running on localhost:5174
              </p>
            </div>
          </div>
        </div>

        {/* Debug Info */}
        {bridge && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm">
            <h4 className="font-semibold mb-2">Debug Information:</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>Bridge Initialized: {bridge.isInitialized() ? '✅' : '❌'}</div>
              <div>Connection Status: {connectionStatus}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Export types and functions for testing
export type { AppProps, ParentMethods, ChildMethods }
export { createDefaultBridge }

export default App
