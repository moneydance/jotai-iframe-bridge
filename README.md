# Jotai Iframe Bridge Workspace

A monorepo workspace containing React TypeScript component libraries for Jotai iframe bridge functionality.

## Packages

- `jotai-iframe-bridge` - A robust iframe communication bridge with type-safe API and reactive state management using Jotai
  - ✅ Type-safe bidirectional communication between parent and child iframes
  - ✅ Three-way handshake protocol for reliable connection establishment
  - ✅ React hooks for seamless integration
  - ✅ Automatic reconnection support and clean lifecycle management
  - ✅ Promise-based method calls with full TypeScript support



For detailed documentation on the jotai-iframe-bridge library, see the [package README](packages/jotai-iframe-bridge/README.md).




## Installation

```bash
# Install all dependencies
pnpm install
```

## VS Code Setup

This workspace is configured to use Biome for formatting and linting. When you open the project in VS Code:

1. **Install the recommended extension**: VS Code will prompt you to install the Biome extension
2. **Format on save**: Files will automatically format when you save them
3. **Organize imports**: Imports will be automatically organized on save
4. **Consistent formatting**: All team members will use the same formatting rules

The configuration is stored in `.vscode/settings.json` and applies to all JavaScript, TypeScript, React, and JSON files.

## Development

### Workspace Commands (run from root)

```bash
# Interactive script runner
pnpm scripts

# Development runners
pnpm dev              # Start development mode for all packages
pnpm dev:servers      # Start only development servers
pnpm dev:tests        # Start only test runners

# Build and type checking
pnpm build            # Build all packages
pnpm type-check       # Type check all packages

# Testing
pnpm test             # Run tests in watch mode
pnpm test:run         # Run tests once (CI mode)
pnpm test:watch       # Watch tests

# Code quality
pnpm format           # Check code formatting
pnpm format:fix       # Format and fix code
pnpm lint             # Check linting
pnpm lint:fix         # Lint and fix code
pnpm check            # Run both format and lint checks
pnpm check:fix        # Run both format and lint with fixes

# Utilities
pnpm clean            # Clean all build outputs
```

## License

MIT
