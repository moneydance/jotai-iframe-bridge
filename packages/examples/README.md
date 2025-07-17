# Examples

This directory contains example projects demonstrating the usage of the `jotai-iframe-bridge` library.

## Projects

### Host (`packages/examples/host`)
- **Framework**: Vite + React + TypeScript + Tailwind CSS
- **Testing**: Vitest with browser mode
- **Port**: 3001
- **Features**: Imports and displays HelloWorld component, includes test suite

### Remote (`packages/examples/remote`)
- **Framework**: Vite + React + TypeScript + Tailwind CSS
- **Port**: 3002
- **Features**: Imports and displays HelloWorld component

## Getting Started

### Prerequisites
- Node.js 20.x (use `nvm use 20` if you have nvm)
- pnpm

### Install Dependencies
From the root directory:
```bash
pnpm install
```

### Build the Library
```bash
pnpm -r build
```

### Run the Examples

#### Host Application
```bash
cd packages/examples/host
pnpm dev
# Visit http://localhost:3001
```

#### Remote Application
```bash
cd packages/examples/remote
pnpm dev
# Visit http://localhost:3002
```

### Run Tests
Host application includes a test suite:
```bash
cd packages/examples/host
pnpm test:run
```

## What You'll See

Both applications display:
- A clean, modern UI with Tailwind CSS styling
- The HelloWorld component imported from the jotai-iframe-bridge library
- Different color schemes (blue for host, green for remote) to distinguish them
- Attribution text indicating the component source

This demonstrates successful workspace package consumption and serves as a foundation for more complex iframe bridge implementations.
