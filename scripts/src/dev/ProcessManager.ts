import concurrently from 'concurrently'
import type { createStateManager } from './atoms.js'
import type { DevRunnerConfig } from './DevRunnerConfig.js'
import { LogProcessor } from './LogProcessor.js'

export class ProcessManager {
  private logProcessor: LogProcessor

  constructor(
    stateManager: ReturnType<typeof createStateManager>,
    private config: DevRunnerConfig
  ) {
    this.logProcessor = new LogProcessor(stateManager)
  }

  async start(): Promise<void> {
    const runningProcesses = this.config.getFilteredProcessNames()

    if (runningProcesses.length === 0) {
      console.error('No processes to run with current filters')
      return
    }

    const commands = runningProcesses.map((processName: string) => {
      const processDefinition = this.config.getProcessConfig(processName)
      if (!processDefinition) {
        throw new Error(`Process config not found: ${processName}`)
      }

      return {
        command: this.config.buildCommand(processDefinition),
        name: processName,
        prefixColor: processDefinition.color,
        env: {
          // Force color output from child processes
          FORCE_COLOR: '1',
          CI: 'false',
          NO_COLOR: undefined,
        },
      }
    })

    // Start concurrent processes
    const { commands: runningCommands, result } = concurrently(commands, {
      prefix: 'name',
      killOthers: ['failure', 'success'],
      restartTries: 0,
      // Additional options to preserve colors
      raw: false, // Keep false to get structured output
      timestampFormat: 'HH:mm:ss.SSS',
    })

    // Set up data handlers for each command
    runningCommands.forEach((command) => {
      const processName = command.name

      command.stdout.subscribe((data) => {
        this.handleProcessOutput(processName, data.toString())
      })

      command.stderr.subscribe((data) => {
        this.handleProcessOutput(processName, data.toString())
      })

      command.error.subscribe((error) => {
        if (error instanceof Error) {
          this.handleProcessOutput(processName, `Error: ${error.message}`)
        } else {
          this.handleProcessOutput(processName, `Error: ${error}`)
        }
      })

      command.close.subscribe((exitInfo) => {
        if (exitInfo.exitCode !== 0) {
          this.handleProcessOutput(processName, `Process exited with code: ${exitInfo.exitCode}`)
        }
      })
    })

    try {
      await result
    } catch (error) {
      // Handle concurrently errors (processes failing)
      console.error('One or more processes failed:', error)
    }
  }

  private handleProcessOutput(processName: string, data: string): void {
    // Delegate all log processing to LogProcessor
    // Re-render happens automatically via observer when state changes
    this.logProcessor.processOutput(processName, data)
  }
}
