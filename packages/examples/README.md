# Iframe Bridge Examples

This directory contains simplified examples demonstrating iframe communication using the `jotai-iframe-bridge` library with basic math operations.

## Applications

### Host Application (Parent)
- **Location**: `packages/examples/host/`
- **Port**: `http://localhost:5173` (default Vite dev server)
- **Role**: Parent window that embeds the remote application and provides addition
- **Method**: `add(a, b)` - Performs addition and returns the result

### Remote Application (Child)
- **Location**: `packages/examples/remote/`
- **Port**: `http://localhost:5174` (configured to avoid conflicts)
- **Role**: Child iframe that provides subtraction and can call parent's addition
- **Method**: `subtract(a, b)` - Performs subtraction and returns the result

## Running the Examples

### Prerequisites
Make sure you have the dependencies installed:

```bash
# From the project root
pnpm install

# Build the library first
cd packages/jotai-iframe-bridge
pnpm build
```

### Step 1: Start the Remote Application

First, start the remote (child) application:

```bash
cd packages/examples/remote
pnpm dev
```

This will start the remote app on `http://localhost:5174`

### Step 2: Start the Host Application

In a separate terminal, start the host (parent) application:

```bash
cd packages/examples/host
pnpm dev
```

This will start the host app on `http://localhost:5173`

### Step 3: Test the Communication

1. Open `http://localhost:5173` in your browser
2. You should see the Host Application with an embedded iframe showing the Remote Application
3. Click "Initialize Connection" to establish communication between parent and child
4. Once connected, you can:
   - **In Host**: Test remote subtraction (calls subtract method in child iframe)
   - **In Remote**: Test host addition (calls add method in parent window)

## Features Demonstrated

### Simple Math Operations
- **Host Method**: `add(a, b)` - Addition performed in the parent window
- **Remote Method**: `subtract(a, b)` - Subtraction performed in the child iframe

### Bi-directional Communication
- **Parent → Child**: Host can call subtract method in the remote iframe
- **Child → Parent**: Remote iframe can call add method in the host

### Core Bridge Features
- Origin validation (set to `'*'` for development)
- Message namespace isolation (`'jotai-iframe-bridge'`)
- Proper error handling and timeouts
- Connection status management

## Testing

### Running Unit Tests

```bash
cd packages/examples/host
pnpm test
```

The tests verify:
- Bridge initialization with correct methods
- Addition method in host application
- Subtraction method calls to remote
- Connection management
- postMessage communication protocol

### Manual Testing Checklist

1. **Connection Establishment**:
   - [ ] Both apps load without errors
   - [ ] Connection status shows "connected" after initialization
   - [ ] Console shows bridge messages

2. **Host → Remote Communication**:
   - [ ] Enter numbers in host app (default: 10 - 5)
   - [ ] Click "Calculate in Remote" button
   - [ ] Verify result shows 5 (subtraction performed in remote)

3. **Remote → Host Communication**:
   - [ ] Enter numbers in remote app (default: 15 + 7)
   - [ ] Click "Calculate in Host" button
   - [ ] Verify result shows 22 (addition performed in host)

4. **Error Handling**:
   - [ ] Connection timeout handling
   - [ ] Method call errors
   - [ ] Bridge destruction on page unload

## Development Tips

### Debugging
- Open browser developer tools on both parent and child
- Check console logs for bridge messages (prefixed with 🚌)
- Use the debug information panel in the host app

### Modifying Origins
For production use, update the `allowedOrigins` configuration:

```typescript
// In host app
const config = {
  allowedOrigins: ['https://your-remote-domain.com'],
  // ...
}

// In remote app
connectToParent({
  parentOrigin: 'https://your-parent-domain.com',
  // ...
})
```

### Adding New Methods
1. Update the TypeScript interfaces in both apps
2. Implement the method in the `methods` configuration
3. Call the method through the remote proxy

## Architecture

```
┌─────────────────────────────┐
│     Host Application        │
│     (localhost:5173)        │
│                             │
│  Method: add(a, b)          │
│  ┌─────────────────────────┐│
│  │   Iframe Bridge         ││
│  │   - createIframeBridge  ││
│  │   - Remote Proxy        ││
│  └─────────────────────────┘│
│             │               │
│             │ postMessage   │
│             ▼               │
│  ┌─────────────────────────┐│
│  │       <iframe>          ││
│  │   Remote Application   ││
│  │   (localhost:5174)     ││
│  │                        ││
│  │   Method: subtract(a,b)││
│  │ ┌─────────────────────┐ ││
│  │ │  connectToParent    │ ││
│  │ │  Parent Proxy       │ ││
│  │ └─────────────────────┘ ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

## Message Flow

1. **Handshake**:
   ```
   Parent → Child: SYN message
   Child → Parent: ACK message
   ```

2. **Host calls Remote subtract**:
   ```
   Parent → Child: CALL { methodPath: ['subtract'], args: [10, 5] }
   Child → Parent: REPLY { value: 5 }
   ```

3. **Remote calls Host add**:
   ```
   Child → Parent: CALL { methodPath: ['add'], args: [15, 7] }
   Parent → Child: REPLY { value: 22 }
   ```

## Common Issues

### Connection Fails
- Ensure both applications are running
- Check browser console for CORS errors
- Verify iframe src URL is correct (localhost:5174)

### Methods Not Working
- Check console for error messages
- Verify method names match interfaces exactly
- Ensure proper error handling

### Performance Issues
- Operations should be fast (simple math)
- Check for network/connection delays

## Code Examples

### Host Application (Parent)
```typescript
// Method exposed by host
methods: {
  add: async (a: number, b: number) => {
    return a + b  // Simple addition
  }
}

// Calling remote method
const result = await remoteProxy.subtract(10, 5)  // Result: 5
```

### Remote Application (Child)
```typescript
// Method exposed by remote
methods: {
  subtract: async (a: number, b: number) => {
    return a - b  // Simple subtraction
  }
}

// Calling parent method
const result = await parentProxy.add(15, 7)  // Result: 22
```

## Next Steps

- Add multiplication and division operations
- Implement error handling for invalid inputs
- Add input validation
- Create more complex data exchange examples
