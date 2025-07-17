import { HelloWorld } from 'jotai-iframe-bridge'

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Host Application</h1>
          <p className="text-gray-600">
            this is the host application demonstrating the jotai-iframe-bridge library
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-700 mb-6 text-center">
            HelloWorld Component from Library
          </h2>
          <div className="flex justify-center">
            <HelloWorld />
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            This component is imported from the jotai-iframe-bridge workspace package
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
