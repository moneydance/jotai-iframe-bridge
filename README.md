# Jotai Iframe Bridge Workspace

A monorepo workspace containing React TypeScript component libraries for Jotai iframe bridge functionality.

## Packages

- `jotai-iframe-bridge` - A React TypeScript component library with a simple Hello World component

## Structure

```
jotai-iframe-bridge-workspace/
├── packages/
│   └── jotai-iframe-bridge/          # React component library
│       ├── src/
│       │   └── index.tsx             # Hello World component
│       ├── dist/                     # Built outputs
│       ├── package.json              # Package configuration
│       ├── tsconfig.json             # TypeScript config
│       ├── tsup.config.ts            # Build configuration
│       └── README.md                 # Package documentation
├── package.json                      # Workspace root configuration
├── pnpm-workspace.yaml               # Workspace definition
├── tsconfig.json                     # Shared TypeScript config
└── README.md                         # This file
```

## Features

- 🏗️ Monorepo structure with pnpm workspaces
- 🚀 React components built with TypeScript
- 📦 Lightweight and modern
- 🛡️ Type-safe interface
- 🔧 Shared configurations

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
# Build all packages
pnpm build

# Watch all packages for changes
pnpm dev

# Type check all packages
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

# Clean all build outputs
pnpm clean
```

### Package-specific Commands

```bash
# Work on a specific package
cd packages/jotai-iframe-bridge

# Build this package only
pnpm build

# Watch this package for changes
pnpm dev
```

## License

MIT
