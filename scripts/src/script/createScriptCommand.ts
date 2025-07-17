import { Command } from 'commander'
import { type ScriptConfig, ScriptRunner, type ScriptRunnerConfigOptions } from './ScriptRunner.js'

export function createScriptCommand(scriptConfigs: ScriptConfig[]) {
  const program = new Command()

  program
    .name('script-runner')
    .description('Interactive script runner for development tasks')
    .version('1.0.0')
    .action(async () => {
      // Build configuration
      const config: ScriptRunnerConfigOptions = {
        title: '🔧 Development Scripts',
        scripts: scriptConfigs,
      }

      console.log('Starting script runner...')

      // Create and start the script runner
      const runner = new ScriptRunner(config)
      await runner.start()
    })

  return program
}
