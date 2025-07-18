# jotai-iframe-bridge

A robust iframe communication bridge inspired by Penpal, providing secure postMessage communication between parent and child windows with a clean, type-safe API.

## Features

- 🚀 **Type Safe**: Full TypeScript support with strongly-typed method interfaces
- 🔒 **Secure**: Origin-based security with configurable allowed origins
- 🎯 **Promise-based**: Clean async/await patterns for all operations
- 🔄 **Connection Management**: Built-in handshake, retry, and cleanup logic
- 📡 **Real postMessage**: Actual cross-window communication using postMessage API
- 🛡️ **Error Handling**: Proper error serialization and timeout management
- 📦 **Minimal**: No external dependencies, pure JavaScript implementation
- ⚡ **Performance**: Efficient communication with message handlers and proxies

## Architecture

This library implements a communication protocol similar to Penpal:

1. **Handshake**: SYN/ACK message exchange to establish connection
2. **Method Calls**: CALL/REPLY message pairs for remote method invocation
3. **Proxies**: Dynamic proxy objects that make remote calls transparent
4. **Security**: Origin validation and message namespace protection

## Installation

```bash
npm install jotai-iframe-bridge
# or
yarn add jotai-iframe-bridge
# or
pnpm add jotai-iframe-bridge
```

## Quick Start

### Parent Window

```tsx
import React, { useRef, useEffect, useState } from 'react'
import { createIframeBridge, type IframeBridge, type ConnectionConfig } from 'jotai-iframe-bridge'

// Define type-safe method interfaces
interface ParentMethods {
  notifyParent: (message: string) => void
  getParentData: () => Promise<string>
}

interface ChildMethods {
  getData: () => Promise<string>
  updateValue: (value: string) => Promise<void>
  calculate: (a: number, b: number) => Promise<number>
}

export const ParentComponent: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [bridge, setBridge] = useState<IframeBridge<ParentMethods, ChildMethods> | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  useEffect(() => {
    // Create bridge configuration
    const config: ConnectionConfig<ParentMethods> = {
      allowedOrigins: ['https://child-domain.com'], // Configure for your domain
      methods: {
        notifyParent: (message: string) => {
          console.log('Received from child:', message)
          alert(`Child says: ${message}`)
        },
        getParentData: async () => {
          return 'Data from parent window'
        }
      },
      timeout: 5000,
      log: (...args) => console.log('Bridge:', ...args) // Optional logging
    }

    // Create bridge instance
    const bridgeInstance = createIframeBridge<ParentMethods, ChildMethods>(config)
    setBridge(bridgeInstance)

    return () => bridgeInstance.destroy()
  }, [])

  const initializeConnection = () => {
    if (!bridge || !iframeRef.current?.contentWindow) return

    setConnectionStatus('connecting')

    // Set the iframe's contentWindow as the remote window
    bridge.setRemoteWindow(iframeRef.current.contentWindow)

    // Wait for connection to be established
    bridge.getConnectionPromise()
      .then(() => {
        console.log('Connection established!')
        setConnectionStatus('connected')
      })
      .catch((error) => {
        console.error('Connection failed:', error)
        setConnectionStatus('disconnected')
      })
  }

  const callChildMethod = async () => {
    if (!bridge) return

    try {
      const remoteProxy = await bridge.getRemoteProxyPromise()
      const data = await remoteProxy.getData()
      console.log('Data from child:', data)

      // Call another method
      const result = await remoteProxy.calculate(10, 5)
      console.log('Calculation result:', result)
    } catch (error) {
      console.error('Error calling child method:', error)
    }
  }

  return (
    <div>
      <div>Status: {connectionStatus}</div>
      <button onClick={initializeConnection} disabled={connectionStatus === 'connecting'}>
        Connect to Child
      </button>
      <button onClick={callChildMethod} disabled={connectionStatus !== 'connected'}>
        Call Child Methods
      </button>

      <iframe
        ref={iframeRef}
        src="https://child-domain.com/child.html"
        onLoad={() => {
          // Auto-connect when iframe loads
          setTimeout(initializeConnection, 100)
        }}
      />
    </div>
  )
}
```

### Child Window (Iframe Content)

```tsx
import React, { useEffect, useState } from 'react'
import { connectToParent, type RemoteProxy, type ChildConnectionConfig } from 'jotai-iframe-bridge'

// Same interfaces as parent (typically shared in a types file)
interface ParentMethods {
  notifyParent: (message: string) => void
  getParentData: () => Promise<string>
}

interface ChildMethods {
  getData: () => Promise<string>
  updateValue: (value: string) => Promise<void>
  calculate: (a: number, b: number) => Promise<number>
}

export const ChildComponent: React.FC = () => {
  const [parentProxy, setParentProxy] = useState<RemoteProxy<ParentMethods> | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [currentValue, setCurrentValue] = useState<string>('Initial value')

  useEffect(() => {
    setConnectionStatus('connecting')

    // Connect to parent using the child-specific function
    connectToParent<ChildMethods, ParentMethods>({
      parentOrigin: 'https://parent-domain.com', // Configure for your domain
      methods: {
        getData: async () => {
          return `Child data: ${currentValue} (${new Date().toLocaleTimeString()})`
        },
        updateValue: async (value: string) => {
          setCurrentValue(value)
          console.log('Value updated to:', value)
        },
        calculate: async (a: number, b: number) => {
          return a + b
        }
      },
      timeout: 5000,
      log: (...args) => console.log('Child Bridge:', ...args)
    })
      .then((proxy) => {
        console.log('Child connection established!')
        setParentProxy(proxy)
        setConnectionStatus('connected')
      })
      .catch((error) => {
        console.error('Child connection failed:', error)
        setConnectionStatus('disconnected')
      })
  }, [])

  const notifyParent = async () => {
    if (!parentProxy) return

    try {
      await parentProxy.notifyParent('Hello from child iframe!')
    } catch (error) {
      console.error('Error notifying parent:', error)
    }
  }

  const getParentData = async () => {
    if (!parentProxy) return

    try {
      const data = await parentProxy.getParentData()
      console.log('Received from parent:', data)
    } catch (error) {
      console.error('Error getting parent data:', error)
    }
  }

  return (
    <div>
      <h2>Child Iframe Content</h2>
      <div>Status: {connectionStatus}</div>
      <div>Current Value: {currentValue}</div>

      {connectionStatus === 'connected' && (
        <div>
      <button onClick={notifyParent}>Notify Parent</button>
          <button onClick={getParentData}>Get Parent Data</button>
        </div>
      )}
    </div>
  )
}
```

## API Reference

### `createIframeBridge<TLocalMethods, TRemoteMethods>(config)`

Creates an iframe bridge for the parent window.

**Parameters:**
- `config: ConnectionConfig<TLocalMethods>` - Configuration object

**Returns:** `IframeBridge<TLocalMethods, TRemoteMethods>`

### `connectToParent<TLocalMethods, TParentMethods>(config)`

Connects to the parent window from within an iframe.

**Parameters:**
- `config: ChildConnectionConfig<TLocalMethods>` - Child configuration object

**Returns:** `Promise<RemoteProxy<TParentMethods>>`

### ConnectionConfig

```typescript
interface ConnectionConfig<TLocalMethods extends Methods = Methods> {
  allowedOrigins: string[]        // Array of allowed origins
  methods?: TLocalMethods         // Methods to expose to remote
  timeout?: number               // Timeout in milliseconds (default: 10000)
  log?: (...args: unknown[]) => void  // Optional logging function
}
```

### ChildConnectionConfig

```typescript
interface ChildConnectionConfig<TLocalMethods extends Methods = Methods> {
  parentOrigin: string | string[]  // Allowed parent origin(s)
  methods?: TLocalMethods         // Methods to expose to parent
  timeout?: number               // Timeout in milliseconds (default: 10000)
  log?: (...args: unknown[]) => void  // Optional logging function
}
```

### IframeBridge Interface

```typescript
interface IframeBridge<TLocalMethods, TRemoteMethods> {
  getMessenger(): WindowMessenger | null
setRemoteWindow(window: Window): void
  getConnectionPromise(): Promise<Connection<TRemoteMethods>>
reinitialize(): void
getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>>
isInitialized(): boolean
  destroy(): void
retry(): void
}
```

### RemoteProxy

A proxy object that makes remote method calls transparent. When you call a method on the proxy, it sends a message to the remote window and returns a Promise that resolves with the result.

```typescript
type RemoteProxy<T extends Methods> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? (...args: P) => Promise<R>
    : never
}
```

## Security Considerations

1. **Always specify exact origins** in production instead of using `'*'`
2. **Validate input** in your exposed methods
3. **Use HTTPS** for production deployments
4. **Sanitize data** before processing method arguments
5. **Implement rate limiting** for method calls if needed

## Error Handling

The library handles various error scenarios:

- **Connection timeouts**: Configurable timeout for handshake
- **Method call timeouts**: Individual timeouts for method calls
- **Origin validation**: Automatic rejection of unauthorized origins
- **Connection destruction**: Proper cleanup when connection is destroyed
- **Method not found**: Error when calling non-existent remote methods

## Advanced Usage

### Custom Error Handling

```typescript
const config: ConnectionConfig<MyMethods> = {
  allowedOrigins: ['https://trusted-domain.com'],
  methods: {
    riskyMethod: async (data: unknown) => {
      try {
        // Your logic here
        return await processData(data)
      } catch (error) {
        // Errors are automatically serialized and sent back
        throw new Error(`Processing failed: ${error.message}`)
      }
    }
  }
}
```

### Reconnection Logic

   ```typescript
// In parent component
const handleRetry = () => {
  if (bridge) {
    bridge.retry() // Attempts to reconnect

    bridge.getConnectionPromise()
      .then(() => setStatus('connected'))
      .catch(() => setStatus('failed'))
     }
   }
   ```

### Nested Method Calls

   ```typescript
interface NestedMethods {
  user: {
    profile: {
      getName: () => Promise<string>
      setName: (name: string) => Promise<void>
    }
  }
}

// Usage
const name = await remoteProxy.user.profile.getName()
await remoteProxy.user.profile.setName('New Name')
```

## Protocol Details

The library uses a simple message-based protocol:

1. **SYN Message**: Parent sends to initiate handshake
2. **ACK Message**: Child responds to confirm connection
3. **CALL Message**: Either side can call remote methods
4. **REPLY Message**: Response to method calls
5. **DESTROY Message**: Clean shutdown notification

All messages include a namespace (`'jotai-iframe-bridge'`) for isolation and security.

## Migration from Other Libraries

### From Penpal

The API is similar to Penpal but simplified:

```typescript
// Penpal
const connection = connectToChild({ iframe })
const child = await connection.promise

// jotai-iframe-bridge
const bridge = createIframeBridge(config)
bridge.setRemoteWindow(iframe.contentWindow)
const child = await bridge.getRemoteProxyPromise()
```

### From PostMessage

Replace manual postMessage handling:

```typescript
// Old postMessage approach
window.postMessage({ type: 'GET_DATA' }, '*')
window.addEventListener('message', (event) => {
  if (event.data.type === 'DATA_RESPONSE') {
    // Handle response
  }
})

// jotai-iframe-bridge
const data = await remoteProxy.getData()
```

## License

MIT
