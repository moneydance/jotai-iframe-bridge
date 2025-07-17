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

# Run tests
pnpm test

# Run tests once (CI mode)
pnpm test:run

# Run tests with UI
pnpm test:ui

# Watch tests
pnpm test:watch

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

## Testing

This package uses [Vitest](https://vitest.dev/guide/browser/) with browser mode for testing React components. The tests run in a real browser environment using Playwright.

### Test Files

- Tests are located alongside source files with `.test.tsx` or `.spec.tsx` extensions
- Example: `src/HelloWorld.test.tsx`

### Testing Libraries

- **Vitest**: Fast test runner with browser mode support
- **@testing-library/react**: React component testing utilities
- **@testing-library/jest-dom**: Extended DOM matchers
- **Playwright**: Browser automation for running tests

### Running Tests

```bash
# Run tests in watch mode (recommended for development)
pnpm test

# Run tests once and exit
pnpm test:run

# Run tests with UI interface
pnpm test:ui
```

> **Note**: The Vitest browser mode configuration is currently experiencing ESM/CommonJS compatibility issues. The testing infrastructure is set up at the package level with all necessary dependencies installed. To complete the setup, you may need to adjust the module configuration or use a simpler Vitest setup initially.
