#!/usr/bin/env tsx

import { createDevCommand } from './src/dev/createDevCommand.js'
import type { ProcessDefinition } from './src/dev/DevRunnerConfig.js'

// Define the process configurations with tags
const processConfigs: ProcessDefinition[] = [
  {
    name: 'host',
    package: 'host',
    script: 'dev',
    description: 'Host app development server',
    color: 'cyan',
    tags: ['dev', 'host', 'frontend'],
  },
  {
    name: 'remote',
    package: 'remote',
    script: 'dev',
    description: 'Remote app development server',
    color: 'magenta',
    tags: ['dev', 'remote', 'frontend'],
  },
  {
    name: 'lib',
    package: 'jotai-iframe-bridge',
    script: 'dev',
    description: 'Library build watcher',
    color: 'yellow',
    tags: ['dev', 'library'],
  },
  {
    name: 'host-test',
    package: 'host',
    script: 'test:watch',
    description: 'Host app test watcher',
    color: 'blue',
    tags: ['test', 'host', 'frontend'],
  },
  {
    name: 'lib-test',
    package: 'jotai-iframe-bridge',
    script: 'test:watch',
    description: 'Library test watcher',
    color: 'green',
    tags: ['test', 'library'],
  },
]

// Create and run the command
const program = createDevCommand(processConfigs)
program.parse(process.argv)
