#!/usr/bin/env tsx

import { Command } from 'commander'
import { DevRunner, type DevRunnerConfig, type ProcessConfig } from './DevRunner.js'

// Define the process configurations with tags
const processConfigs: ProcessConfig[] = [
  {
    name: 'host',
    package: 'host',
    script: 'dev',
    description: 'Host app development server',
    color: 'cyan',
    tags: ['dev', 'server', 'host', 'frontend'],
  },
  {
    name: 'remote',
    package: 'remote',
    script: 'dev',
    description: 'Remote app development server',
    color: 'magenta',
    tags: ['dev', 'server', 'remote', 'frontend'],
  },
  {
    name: 'lib',
    package: 'jotai-iframe-bridge',
    script: 'dev',
    description: 'Library build watcher',
    color: 'yellow',
    tags: ['dev', 'build', 'library', 'watch'],
  },
  {
    name: 'host-test',
    package: 'host',
    script: 'test:watch',
    description: 'Host app test watcher',
    color: 'blue',
    tags: ['test', 'watch', 'host', 'frontend'],
  },
  {
    name: 'lib-test',
    package: 'jotai-iframe-bridge',
    script: 'test:watch',
    description: 'Library test watcher',
    color: 'green',
    tags: ['test', 'watch', 'library'],
  },
]

// Setup CLI with commander
const program = new Command()

program
  .name('dev-runner')
  .description('Development runner for Jotai Iframe Bridge')
  .version('1.0.0')
  .option('--include-tags <tags>', 'Include only processes with these tags (comma-separated)')
  .option('--exclude-tags <tags>', 'Exclude processes with these tags (comma-separated)')
  .option('--processes <names>', 'Run only specific processes by name (comma-separated)')
  .action(async (options) => {
    // Build configuration based on options
    const config: DevRunnerConfig = {
      processes: processConfigs,
      title: '🎯 Jotai Iframe Bridge Development Environment',
    }

    // Handle specific processes
    if (options.processes) {
      config.processNames = options.processes.split(',').map((s: string) => s.trim())
    }

    // Handle custom tag filtering (overrides simple options)
    if (options.includeTags) {
      config.includeTags = options.includeTags.split(',').map((s: string) => s.trim())
    }

    if (options.excludeTags) {
      config.excludeTags = options.excludeTags.split(',').map((s: string) => s.trim())
    }

    // If no filtering specified, run everything
    if (!config.includeTags && !config.excludeTags && !config.processNames) {
      // Default to running everything
    }

    console.log('Configuration:', {
      includeTags: config.includeTags,
      excludeTags: config.excludeTags,
      processNames: config.processNames,
    })

    // Start the runner
    const runner = new DevRunner(config)
    await runner.start()
  })

// Parse arguments
program.parse(process.argv)
