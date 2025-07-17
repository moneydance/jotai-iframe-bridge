import { Command } from 'commander'
import { DevRunner, type DevRunnerConfigOptions, type ProcessDefinition } from './DevRunner.js'

export function createDevCommand(processConfigs: ProcessDefinition[]) {
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
      const config: DevRunnerConfigOptions = {
        title: '🎯 Jotai Iframe Bridge Development Environment',
        processes: processConfigs,
      }

      // Handle specific processes
      if (options.processes) {
        config.processNames = options.processes.split(',').map((s: string) => s.trim())
      }

      // Handle custom tag filtering
      if (options.includeTags) {
        config.includeTags = options.includeTags.split(',').map((s: string) => s.trim())
      }

      if (options.excludeTags) {
        config.excludeTags = options.excludeTags.split(',').map((s: string) => s.trim())
      }

      console.log('Configuration:', {
        includeTags: config.includeTags,
        excludeTags: config.excludeTags,
        processNames: config.processNames,
      })

      // Create and start the development runner
      const runner = new DevRunner(config)
      await runner.start()
    })

  return program
}
