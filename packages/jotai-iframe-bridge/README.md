# Jotai Iframe Bridge

A robust iframe communication bridge with type-safe API and reactive state management using Jotai.

## Features

- **Type-safe communication** between parent and child iframes
- **Reactive state management** with Jotai atoms
- **Robust three-way handshake protocol** for reliable connection establishment
- **Automatic reconnection support** for iframe reloads
- **React hooks** for easy integration
- **Bidirectional method calls** with Promise-based API

## Three-Way Handshake Protocol

This library implements a sophisticated handshake protocol inspired by Penpal to ensure robust communication between parent and child frames. The protocol solves several challenges:

### Protocol Requirements

1. **Either participant can initiate** - Parent or child can start the handshake
2. **Handles timing issues** - One participant may not be ready when the other starts
3. **Avoids race conditions** - Both participants can send initial messages simultaneously
4. **Confirms bidirectional communication** - Both sides know the other is receiving messages
5. **Supports reconnection** - Either side can re-establish connection (e.g., iframe reload)

### Protocol Flow

![Handshake Protocol Diagram](assets/handshakeDiagram.png)

### Protocol Details

#### 1. SYN Exchange
- Both participants send SYN messages containing their randomly generated participant IDs
- When receiving a SYN, each participant sends another SYN to ensure the other side received it
- This handles cases where one participant wasn't ready for the initial SYN

#### 2. Leadership Determination
- Both participants compare their IDs using lexicographical string comparison
- The participant with the lexicographically higher ID becomes the "handshake leader"
- This ensures exactly one participant will send ACK1, avoiding race conditions

#### 3. ACK1/ACK2 Exchange
- **Leader sends ACK1** to the follower
- **Follower receives ACK1** and responds with ACK2
- **Leader receives ACK2** and both sides establish the connection
- This confirms bidirectional communication is working

#### 4. Connection Establishment
- Both sides create remote proxies for method calls
- Connection promises resolve, making the bridge ready for use
- The connection is fully established and method calls can begin

### Example Logs

Here's what a successful handshake looks like in the logs:

```
🚌 Host Bridge: Sending SYN message { "participantId": "itmpknos1", "type": "SYN" }
🚌 Child Bridge: Sending SYN message { "participantId": "93ym8wst9", "type": "SYN" }

🚌 Host Bridge: Received SYN message from participant: 93ym8wst9
🚌 Host Bridge: Leadership check: itmpknos1 > 93ym8wst9 = true
🚌 Host Bridge: Sending ACK1 message as leader

🚌 Child Bridge: Received ACK1 message, sending ACK2 response
🚌 Child Bridge: Connection established successfully (follower)

🚌 Host Bridge: Received ACK2 message, establishing connection
🚌 Host Bridge: Connection established successfully (leader)
```

## Basic Usage

### Parent (Host) Application

```tsx
import { createParentBridge, makeParentBridgeHooks } from 'jotai-iframe-bridge'

// Define method interfaces
interface ParentMethods {
  add: (a: number, b: number) => Promise<number>
}

interface ChildMethods {
  subtract: (a: number, b: number) => Promise<number>
}

// Create bridge
const bridge = createParentBridge<ParentMethods, ChildMethods>({
  allowedOrigins: ['*'],
  methods: {
    add: async (a, b) => a + b
  }
})

// Create provider and hooks
const { ParentBridgeProvider, hooks } = makeParentBridgeHooks(bridge)
const { useParentBridge, useRemoteProxy, useConnection } = hooks

function App() {
  return (
    <ParentBridgeProvider>
      <MyComponent />
    </ParentBridgeProvider>
  )
}

function MyComponent() {
  const bridge = useParentBridge()
  const remoteProxy = useRemoteProxy()

  const handleIframeRef = (iframe: HTMLIFrameElement | null) => {
    if (iframe?.contentWindow) {
      bridge.init(iframe)
      bridge.connect()
    }
  }

  const callChildMethod = async () => {
    if (remoteProxy.state === 'hasData') {
      const result = await remoteProxy.data.subtract(10, 3)
      console.log('Result:', result) // 7
    }
  }

  return (
    <div>
      <iframe ref={handleIframeRef} src="/child.html" />
      <button onClick={callChildMethod}>Call Child Method</button>
    </div>
  )
}
```

### Child (Iframe) Application

```tsx
import { createChildBridge, makeChildBridgeHooks } from 'jotai-iframe-bridge'

// Create bridge
const bridge = createChildBridge<ChildMethods, ParentMethods>({
  parentOrigin: '*',
  methods: {
    subtract: async (a, b) => a - b
  }
})

// Create provider and hooks
const { ChildBridgeProvider, hooks } = makeChildBridgeHooks(bridge)
const { useChildBridge, useRemoteProxy } = hooks

function App() {
  return (
    <ChildBridgeProvider>
      <MyComponent />
    </ChildBridgeProvider>
  )
}

function MyComponent() {
  const bridge = useChildBridge()
  const remoteProxy = useRemoteProxy()

  useEffect(() => {
    bridge.connect()
  }, [bridge])

  const callParentMethod = async () => {
    if (remoteProxy.state === 'hasData') {
      const result = await remoteProxy.data.add(5, 3)
      console.log('Result:', result) // 8
    }
  }

  return (
    <button onClick={callParentMethod}>Call Parent Method</button>
  )
}
```

## API Reference

### `createParentBridge<TLocalMethods, TRemoteMethods>(config, store?)`

Creates a parent bridge for iframe communication.

**Parameters:**
- `config: ConnectionConfig<TLocalMethods>` - Bridge configuration
- `store?: Store` - Optional Jotai store

**Returns:** `ParentBridge<TLocalMethods, TRemoteMethods>`

### `createChildBridge<TLocalMethods, TRemoteMethods>(config, store?)`

Creates a child bridge for iframe communication.

**Parameters:**
- `config: ChildConnectionConfig<TLocalMethods>` - Bridge configuration
- `store?: Store` - Optional Jotai store

**Returns:** `ChildBridge<TLocalMethods, TRemoteMethods>`

### Factory Functions

#### `makeParentBridgeHooks(bridge)`

Creates React provider and hooks for ParentBridge.

**Returns:**
```tsx
{
  ParentBridgeProvider: React.Component,
  hooks: {
    useParentBridge: () => ParentBridge,
    useRemoteProxy: () => Loadable<RemoteProxy>,
    useConnection: () => Loadable<Connection>,
    useChildReady: () => boolean
  }
}
```

#### `makeChildBridgeHooks(bridge)`

Creates React provider and hooks for ChildBridge.

**Returns:**
```tsx
{
  ChildBridgeProvider: React.Component,
  hooks: {
    useChildBridge: () => ChildBridge,
    useRemoteProxy: () => Loadable<RemoteProxy>,
    useConnection: () => Loadable<Connection>
  }
}
```

## Configuration

### `ConnectionConfig<TLocalMethods>`

```tsx
interface ConnectionConfig<TLocalMethods> {
  allowedOrigins: string[]      // Origins that can connect
  methods?: TLocalMethods       // Methods to expose
  timeout?: number             // Connection timeout (default: 15000ms)
  log?: (...args: any[]) => void // Custom logger
}
```

### `ChildConnectionConfig<TLocalMethods>`

```tsx
interface ChildConnectionConfig<TLocalMethods> {
  parentOrigin: string | string[]  // Parent origin(s)
  methods?: TLocalMethods          // Methods to expose
  timeout?: number                // Connection timeout
  log?: (...args: any[]) => void  // Custom logger
}
```

## Why Three-Way Handshake?

The three-way handshake solves several critical issues that simpler protocols cannot handle:

### Problem with Two-Way Handshake

```
❌ Simple approach (doesn't work):
Parent: sends SYN → Child: sends ACK → Connection?
```

**Issues:**
- What if child isn't ready when parent sends SYN?
- What if both sides send SYN simultaneously?
- How do we handle iframe reloads?

### Problem with Both Sending ACK

```
❌ Race condition (our original issue):
Parent: sends SYN → receives SYN from child → sends ACK → waits for ACK
Child:  sends SYN → receives SYN from parent → sends ACK → waits for ACK
Result: Both waiting forever!
```

### Solution: Leadership + Confirmation

```
✅ Three-way handshake (reliable):
1. Both send SYN (either can initiate)
2. Leader determined by ID comparison (breaks tie)
3. Leader sends ACK1, follower responds with ACK2
4. Both sides confirm bidirectional communication
```

This protocol is battle-tested and handles all edge cases including:
- Race conditions during simultaneous connection attempts
- Iframe reloads and reconnection scenarios
- Timing issues where one side isn't ready
- Network reliability confirmation

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
