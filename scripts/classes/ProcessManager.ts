import concurrently from 'concurrently'
import { getDefaultStore } from 'jotai'
import type { createDevRunnerAtoms } from '../state/atoms.js'
import type { DevRunnerConfig } from './DevRunnerConfig.js'
import { LogProcessor } from './LogProcessor.js'
import type { Rendering } from './Rendering.js'

export class ProcessManager {
  private store = getDefaultStore()
  private logProcessor: LogProcessor

  constructor(
    private atoms: ReturnType<typeof createDevRunnerAtoms>,
    private config: DevRunnerConfig,
    private rendering: Rendering
  ) {
    this.logProcessor = new LogProcessor(atoms)
  }

  async start(): Promise<void> {
    const runningProcesses = this.config.getFilteredProcessNames()

    if (runningProcesses.length === 0) {
      this.rendering.displayError('No processes to run with current filters')
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
      }
    })

    // Initial render
    this.rendering.render()

    // Start concurrent processes
    const { commands: runningCommands, result } = concurrently(commands, {
      prefix: 'name',
      killOthers: ['failure', 'success'],
      restartTries: 0,
    })

    // Set up data handlers for each command
    runningCommands.forEach((command: any) => {
      const processName = command.name

      command.stdout.subscribe((data: any) => {
        this.handleProcessOutput(processName, data.toString())
      })

      command.stderr.subscribe((data: any) => {
        this.handleProcessOutput(processName, data.toString())
      })

      command.error.subscribe((error: any) => {
        this.handleProcessOutput(processName, `Error: ${error.message}`)
      })

      command.close.subscribe((exitInfo: any) => {
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
    this.logProcessor.processOutput(processName, data)

    // Re-render to show new logs
    this.rendering.render()
  }
}
