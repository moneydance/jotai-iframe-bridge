import { useEffect, useState } from 'react'
import { connectToParent, type RemoteProxy } from '../../../jotai-iframe-bridge/src/index'

// Simplified interfaces
interface ParentMethods {
  [methodName: string]: (...args: any[]) => any
  add: (a: number, b: number) => Promise<number>
}

interface ChildMethods {
  [methodName: string]: (...args: any[]) => any
  subtract: (a: number, b: number) => Promise<number>
}

function App() {
  const [parentProxy, setParentProxy] = useState<RemoteProxy<ParentMethods> | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected')
  const [result, setResult] = useState<number | null>(null)
  const [numberA, setNumberA] = useState<number>(15)
  const [numberB, setNumberB] = useState<number>(7)

  useEffect(() => {
    setConnectionStatus('connecting')

    // Connect to parent
    connectToParent<ChildMethods, ParentMethods>({
      parentOrigin: '*',
      methods: {
        subtract: async (a: number, b: number) => {
          const result = a - b
          console.log(`Remote: ${a} - ${b} = ${result}`)
          return result
        },
      },
      timeout: 15000,
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

  const testAddition = async () => {
    if (!parentProxy) return

    try {
      const result = await parentProxy.add(numberA, numberB)
      setResult(result)
      console.log(`Host addition: ${numberA} + ${numberB} = ${result}`)
    } catch (error) {
      console.error('Error calling host add:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Remote Application</h1>
          <p className="text-gray-600">
            This iframe can call addition in the host and provides subtraction
          </p>
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
              >
                {connectionStatus}
              </span>
            </div>
            {result !== null && (
              <div>
                <span className="font-semibold">Last Result: </span>
                <span className="text-green-600 font-bold text-lg">{result}</span>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        {connectionStatus === 'connected' && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">Test Host Addition</h3>

            <div className="flex gap-2 mb-4">
              <input
                type="number"
                value={numberA}
                onChange={(e) => setNumberA(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded w-24"
                placeholder="A"
              />
              <span className="py-2">+</span>
              <input
                type="number"
                value={numberB}
                onChange={(e) => setNumberB(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded w-24"
                placeholder="B"
              />
              <button
                type="button"
                onClick={testAddition}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Calculate in Host
              </button>
            </div>

            <p className="text-sm text-gray-600">
              This will call the add method in the host application
            </p>
          </div>
        )}

        {/* Info */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">Available Operations</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div>
              <strong>Local:</strong> subtract(a, b) - Subtraction performed in this iframe
            </div>
            <div>
              <strong>Remote:</strong> add(a, b) - Addition called in the host application
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
