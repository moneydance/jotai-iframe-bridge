#!/usr/bin/env tsx

import { createScriptCommand } from './src/script/createScriptCommand.js'
import type { ScriptConfig } from './src/script/ScriptRunnerConfig.js'

// Define the hierarchical script configurations
const scriptConfigs: ScriptConfig[] = [
  {
    groupName: 'Workspace (All Projects)',
    children: [
      {
        name: 'build-all',
        command: 'pnpm build',
        description: 'Build all packages',
        color: 'green',
      },
      {
        name: 'test-all-run',
        command: 'pnpm test:run',
        description: 'Run all tests once',
        color: 'blue',
      },
      {
        name: 'typecheck-all',
        command: 'pnpm type-check',
        description: 'Type check all packages',
        color: 'blue',
      },
      {
        name: 'lint-all',
        command: 'pnpm lint',
        description: 'Lint all packages',
        color: 'red',
      },
      {
        name: 'lint-all-fix',
        command: 'pnpm lint:fix',
        description: 'Lint and fix all packages',
        color: 'red',
      },
      {
        name: 'format-all',
        command: 'pnpm format',
        description: 'Format all packages',
        color: 'magenta',
      },
      {
        name: 'format-all-fix',
        command: 'pnpm format:fix',
        description: 'Format and fix all packages',
        color: 'magenta',
      },
      {
        name: 'check-all',
        command: 'pnpm check',
        description: 'Check all packages (lint + format)',
        color: 'green',
      },
      {
        name: 'check-all-fix',
        command: 'pnpm check:fix',
        description: 'Check and fix all packages',
        color: 'green',
      },
      {
        name: 'clean-all',
        command: 'pnpm clean',
        description: 'Clean all build artifacts',
        color: 'red',
      },
    ],
  },
  {
    groupName: 'Library (jotai-iframe-bridge)',
    children: [
      {
        name: 'build-lib',
        command: 'pnpm --filter jotai-iframe-bridge build',
        description: 'Build library',
        color: 'green',
      },
      {
        name: 'test-lib-run',
        command: 'pnpm --filter jotai-iframe-bridge test:run',
        description: 'Run library tests once',
        color: 'blue',
      },
      {
        name: 'test-lib-ui',
        command: 'pnpm --filter jotai-iframe-bridge test:ui',
        description: 'Run library tests with UI',
        color: 'blue',
      },
      {
        name: 'typecheck-lib',
        command: 'pnpm --filter jotai-iframe-bridge type-check',
        description: 'Type check library',
        color: 'cyan',
      },
      {
        name: 'lint-lib',
        command: 'pnpm --filter jotai-iframe-bridge lint',
        description: 'Lint library',
        color: 'red',
      },
      {
        name: 'lint-lib-fix',
        command: 'pnpm --filter jotai-iframe-bridge lint:fix',
        description: 'Lint and fix library',
        color: 'red',
      },
      {
        name: 'format-lib',
        command: 'pnpm --filter jotai-iframe-bridge format',
        description: 'Format library',
        color: 'magenta',
      },
      {
        name: 'format-lib-fix',
        command: 'pnpm --filter jotai-iframe-bridge format:fix',
        description: 'Format and fix library',
        color: 'magenta',
      },
      {
        name: 'check-lib',
        command: 'pnpm --filter jotai-iframe-bridge check',
        description: 'Check library (lint + format)',
        color: 'yellow',
      },
      {
        name: 'check-lib-fix',
        command: 'pnpm --filter jotai-iframe-bridge check:fix',
        description: 'Check and fix library',
        color: 'yellow',
      },
      {
        name: 'clean-lib',
        command: 'pnpm --filter jotai-iframe-bridge clean',
        description: 'Clean library build artifacts',
        color: 'gray',
      },
    ],
  },
  {
    groupName: 'Host App',
    children: [
      {
        name: 'build-host',
        command: 'pnpm --filter host build',
        description: 'Build host app',
        color: 'green',
      },
      {
        name: 'test-host-run',
        command: 'pnpm --filter host test:run',
        description: 'Run host tests once',
        color: 'blue',
      },
      {
        name: 'lint-host',
        command: 'pnpm --filter host lint',
        description: 'Lint host app',
        color: 'red',
      },
      {
        name: 'preview-host',
        command: 'pnpm --filter host preview',
        description: 'Preview host app build',
        color: 'cyan',
      },
    ],
  },
  {
    groupName: 'Remote App',
    children: [
      {
        name: 'build-remote',
        command: 'pnpm --filter remote build',
        description: 'Build remote app',
        color: 'green',
      },
      {
        name: 'lint-remote',
        command: 'pnpm --filter remote lint',
        description: 'Lint remote app',
        color: 'red',
      },
      {
        name: 'preview-remote',
        command: 'pnpm --filter remote preview',
        description: 'Preview remote app build',
        color: 'cyan',
      },
    ],
  },
]

// Create and run the command
const program = createScriptCommand(scriptConfigs)
program.parse(process.argv)
