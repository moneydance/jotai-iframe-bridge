# jotai-iframe-bridge

A React TypeScript component library with a simple Hello World component.

## Features

- 🚀 React components built with TypeScript
- 📦 Lightweight and modern
- 🎨 Clean, styled components
- 🛡️ Type-safe interface

## Installation

```bash
npm install jotai-iframe-bridge
# or
yarn add jotai-iframe-bridge
# or
pnpm add jotai-iframe-bridge
```

## Usage

### Basic Example

```tsx
import React from 'react'
import HelloWorld from 'jotai-iframe-bridge'

function App() {
  return (
    <div>
      <HelloWorld />
    </div>
  )
}

export default App
```

### Named Import

```tsx
import { HelloWorld } from 'jotai-iframe-bridge'

function App() {
  return <HelloWorld />
}
```

## Components

### `HelloWorld`

A simple, styled Hello World component that displays a welcome message.

**Props:** None

**Returns:** A styled div element with a greeting message.

## Development

```bash
# Build the package
pnpm build

# Watch for changes
pnpm dev

# Type check
pnpm type-check

# Format code
pnpm format

# Format and fix code
pnpm format:fix

# Lint code
pnpm lint

# Lint and fix code
pnpm lint:fix

# Run both format and lint checks
pnpm check

# Run both format and lint with fixes
pnpm check:fix
```
