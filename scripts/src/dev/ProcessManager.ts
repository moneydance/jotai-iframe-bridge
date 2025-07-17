import { concurrent } from '../utils/concurrent.js'
import type { createStateManager } from './atoms.js'
import type { DevRunnerConfig } from './DevRunnerConfig.js'
import { LogProcessor } from './LogProcessor.js'

export class ProcessManager {
  private logProcessor: LogProcessor
  private concurrentManager: ReturnType<typeof concurrent>

  constructor(
    stateManager: ReturnType<typeof createStateManager>,
    private config: DevRunnerConfig
  ) {
    this.logProcessor = new LogProcessor(stateManager)

    // Create concurrent manager with LogProcessor integration
    this.concurrentManager = concurrent({
      onOutput: (name: string, output: string) => {
        this.logProcessor.processOutput(name, output)
      },
      onError: (name: string, error: Error) => {
        this.logProcessor.processOutput(name, `Process error: ${error.message}`)
      },
      onExit: (name: string, code: number | null, signal: string | null) => {
        if (code === 0) {
          this.logProcessor.processOutput(name, '✅ Process completed successfully')
        } else if (signal) {
          this.logProcessor.processOutput(name, `Process terminated by signal: ${signal}`)
        } else {
          this.logProcessor.processOutput(name, `❌ Process failed with exit code: ${code}`)
        }
      },
    })
  }

  async start(): Promise<void> {
    const runningProcesses = this.config.getFilteredProcessNames()

    if (runningProcesses.length === 0) {
      console.error('No processes to run with current filters')
      return
    }

    // Start all processes
    const processPromises = runningProcesses.map((processName) => {
      const processDefinition = this.config.getProcessConfig(processName)
      if (!processDefinition) {
        throw new Error(`Process config not found: ${processName}`)
      }

      const command = this.config.buildCommand(processDefinition)
      return this.concurrentManager.spawn(command, processName, {
        color: processDefinition.color,
      })
    })

    try {
      // Wait for all processes to complete
      await Promise.all(processPromises)
      console.log('✅ All processes completed successfully')
    } catch (error) {
      console.error('❌ One or more processes failed:', error)
      throw error
    }
  }

  async stop(): Promise<void> {
    await this.concurrentManager.stop()
  }

  get isRunning(): boolean {
    return this.concurrentManager.isRunning
  }

  getProcessCount(): number {
    return this.concurrentManager.getProcessCount()
  }
}
