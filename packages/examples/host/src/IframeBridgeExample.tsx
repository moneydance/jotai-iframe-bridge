// Import from the library source - in production, this would be 'jotai-iframe-bridge'

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  type ConnectionConfig,
  connectToParent,
  createIframeBridge,
  type IframeBridge,
  type RemoteProxy,
} from '../../../jotai-iframe-bridge/src/index'

// Define the method interfaces for type safety
interface ParentMethods {
  [methodName: string]: (...args: any[]) => any
  notifyParent: (message: string) => void
  getParentData: () => Promise<string>
}

interface ChildMethods {
  [methodName: string]: (...args: any[]) => any
  getData: () => Promise<string>
  updateValue: (value: string) => Promise<void>
  calculate: (a: number, b: number) => Promise<number>
}

// Parent Component Example
export const ParentIframeExample: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [bridge, setBridge] = useState<IframeBridge<ParentMethods, ChildMethods> | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected')
  const [remoteData, setRemoteData] = useState<string>('')
  const [calculationResult, setCalculationResult] = useState<number | null>(null)

  useEffect(() => {
    // Create the iframe bridge configuration
    const config: ConnectionConfig<ParentMethods> = {
      allowedOrigins: ['*'], // In production, specify exact origins
      methods: {
        notifyParent: (message: string) => {
          console.log('🔔 Notification from child:', message)
          alert(`Child says: ${message}`)
        },
        getParentData: async () => {
          return 'Data from parent window'
        },
      },
      timeout: 5000,
      log: (...args) => console.log('🚌 Bridge:', ...args),
    }

    // Create the bridge instance
    const bridgeInstance = createIframeBridge<ParentMethods, ChildMethods>(config)
    setBridge(bridgeInstance)

    return () => {
      bridgeInstance.destroy()
    }
  }, [])

  const initializeConnection = () => {
    if (!bridge || !iframeRef.current?.contentWindow) return

    setConnectionStatus('connecting')

    // Set the remote window (iframe's contentWindow)
    bridge.setRemoteWindow(iframeRef.current.contentWindow)

    // Wait for connection to be established
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

  const handleGetRemoteData = async () => {
    if (!bridge) return

    try {
      const remoteProxy = await bridge.getRemoteProxyPromise()
      const data = await remoteProxy.getData()
      setRemoteData(data)
    } catch (error) {
      console.error('Error getting remote data:', error)
    }
  }

  const handleUpdateRemoteValue = async () => {
    if (!bridge) return

    try {
      const remoteProxy = await bridge.getRemoteProxyPromise()
      await remoteProxy.updateValue('Hello from parent!')
      console.log('✅ Remote value updated')
    } catch (error) {
      console.error('Error updating remote value:', error)
    }
  }

  const handleCalculation = async () => {
    if (!bridge) return

    try {
      const remoteProxy = await bridge.getRemoteProxyPromise()
      const result = await remoteProxy.calculate(10, 5)
      setCalculationResult(result)
    } catch (error) {
      console.error('Error performing calculation:', error)
    }
  }

  const handleRetry = () => {
    if (!bridge) return

    setConnectionStatus('connecting')
    bridge.retry()

    bridge
      .getConnectionPromise()
      .then(() => setConnectionStatus('connected'))
      .catch(() => setConnectionStatus('disconnected'))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Iframe Bridge - Parent Window</h1>

      {/* Connection Status */}
      <div className="mb-4">
        <span className="font-semibold">Status: </span>
        <span
          className={`px-2 py-1 rounded text-white ${
            connectionStatus === 'connected'
              ? 'bg-green-500'
              : connectionStatus === 'connecting'
                ? 'bg-yellow-500'
                : 'bg-red-500'
          }`}
        >
          {connectionStatus}
        </span>
      </div>

      {/* Controls */}
      <div className="mb-6 space-x-2">
        <button
          type="button"
          onClick={initializeConnection}
          disabled={connectionStatus === 'connecting'}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Initialize Connection
        </button>

        <button
          type="button"
          onClick={handleRetry}
          disabled={connectionStatus === 'connecting'}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
        >
          Retry Connection
        </button>
      </div>

      {/* Remote Method Calls */}
      {connectionStatus === 'connected' && (
        <div className="mb-6 space-x-2">
          <button
            type="button"
            onClick={handleGetRemoteData}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Get Remote Data
          </button>

          <button
            type="button"
            onClick={handleUpdateRemoteValue}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            Update Remote Value
          </button>

          <button
            type="button"
            onClick={handleCalculation}
            className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
          >
            Calculate 10 + 5
          </button>
        </div>
      )}

      {/* Results Display */}
      {remoteData && (
        <div className="mb-4 p-3 bg-gray-100 rounded">
          <strong>Remote Data:</strong> {remoteData}
        </div>
      )}

      {calculationResult !== null && (
        <div className="mb-4 p-3 bg-gray-100 rounded">
          <strong>Calculation Result:</strong> {calculationResult}
        </div>
      )}

      {/* Debug Info */}
      {bridge && (
        <div className="mb-6 p-3 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">Debug Info:</h3>
          <div>Bridge Initialized: {bridge.isInitialized() ? '✅' : '❌'}</div>
          <div>Messenger: {bridge.getMessenger() ? '✅' : '❌'}</div>
        </div>
      )}

      {/* Iframe */}
      <div className="border-2 border-gray-300 rounded">
        <div className="bg-gray-100 p-2 font-semibold">Child Iframe:</div>
        <iframe
          ref={iframeRef}
          src="/child.html" // This would be your child iframe URL
          className="w-full h-96"
          title="Child Frame"
          onLoad={() => {
            console.log('📦 Iframe loaded')
            // You could auto-initialize here if desired
          }}
        />
      </div>
    </div>
  )
}

// Child Component Example (for iframe content)
export const ChildIframeExample: React.FC = () => {
  const [parentProxy, setParentProxy] = useState<RemoteProxy<ParentMethods> | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected')
  const [currentValue, setCurrentValue] = useState<string>('Initial value')

  useEffect(() => {
    // Initialize connection to parent using the child-specific function
    setConnectionStatus('connecting')

    connectToParent<ChildMethods, ParentMethods>({
      parentOrigin: '*', // In production, specify exact origins
      methods: {
        getData: async () => {
          return `Data from child iframe (${new Date().toLocaleTimeString()})`
        },
        updateValue: async (value: string) => {
          setCurrentValue(value)
          console.log('📝 Value updated to:', value)
        },
        calculate: async (a: number, b: number) => {
          const result = a + b
          console.log(`🧮 Calculated ${a} + ${b} = ${result}`)
          return result
        },
      },
      timeout: 5000,
      log: (...args) => console.log('🚌 Child Bridge:', ...args),
    })
      .then((proxy) => {
        console.log('✅ Child connection established!')
        setParentProxy(proxy)
        setConnectionStatus('connected')
      })
      .catch((error) => {
        console.error('❌ Child connection failed:', error)
        setConnectionStatus('disconnected')
      })
  }, [])

  const handleNotifyParent = async () => {
    if (!parentProxy) return

    try {
      await parentProxy.notifyParent('Hello from child iframe!')
    } catch (error) {
      console.error('Error notifying parent:', error)
    }
  }

  const handleGetParentData = async () => {
    if (!parentProxy) return

    try {
      const data = await parentProxy.getParentData()
      console.log('📡 Received from parent:', data)
    } catch (error) {
      console.error('Error getting parent data:', error)
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Child Iframe Content</h2>

      {/* Connection Status */}
      <div className="mb-4">
        <span className="font-semibold">Status: </span>
        <span
          className={`px-2 py-1 rounded text-white text-sm ${
            connectionStatus === 'connected'
              ? 'bg-green-500'
              : connectionStatus === 'connecting'
                ? 'bg-yellow-500'
                : 'bg-red-500'
          }`}
        >
          {connectionStatus}
        </span>
      </div>

      {/* Current Value Display */}
      <div className="mb-4 p-2 bg-blue-50 rounded">
        <strong>Current Value:</strong> {currentValue}
      </div>

      {/* Controls */}
      {connectionStatus === 'connected' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleNotifyParent}
            className="block px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
          >
            Notify Parent
          </button>

          <button
            type="button"
            onClick={handleGetParentData}
            className="block px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            Get Parent Data
          </button>
        </div>
      )}

      {/* Usage Examples */}
      <div className="mt-6 p-3 bg-gray-50 rounded text-sm">
        <h3 className="font-semibold mb-2">Available Remote Methods:</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>notifyParent(message: string) - Shows alert in parent</li>
          <li>getParentData() - Gets data from parent window</li>
        </ul>
      </div>
    </div>
  )
}

export default ParentIframeExample
