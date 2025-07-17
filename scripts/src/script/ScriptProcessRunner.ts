import { concurrent } from '../utils/concurrent.js'
import { safeAssignment } from '../utils/safeAssignment.js'
import type { createScriptStateManager } from './atoms.js'
import type { ScriptRunnerConfig } from './ScriptRunnerConfig.js'

export class ScriptProcessRunner {
  private currentResult: Promise<void> | null = null
  private isRunning = false
  private concurrentManager: ReturnType<typeof concurrent>

  constructor(
    private stateManager: ReturnType<typeof createScriptStateManager>,
    private config: ScriptRunnerConfig
  ) {
    // Create concurrent manager with state manager integration
    this.concurrentManager = concurrent({
      onOutput: (_name: string, output: string) => {
        const cleanOutput = this.cleanOutput(output)
        if (cleanOutput) {
          this.stateManager.addLogEntry(cleanOutput)
        }
      },
      onError: (_name: string, error: Error) => {
        this.stateManager.addLogEntry(`Process error: ${error.message}`)
      },
      onExit: (_name: string, code: number | null, signal: string | null) => {
        if (code === 0) {
          this.stateManager.addLogEntry(`✅ Script completed successfully`)
        } else if (signal) {
          this.stateManager.addLogEntry(`Process terminated by signal: ${signal}`)
        } else {
          this.stateManager.addLogEntry(`❌ Script failed with exit code: ${code}`)
        }
      },
    })
  }

  async executeScript(scriptName: string): Promise<void> {
    // Find the script definition
    const scriptDefinition = this.config.findScript(scriptName)
    if (!scriptDefinition) {
      this.stateManager.addLogEntry(`Error: Script '${scriptName}' not found`)
      return
    }

    // Clear previous logs and set up state
    this.stateManager.clearLogs()
    this.stateManager.setCurrentScript(scriptDefinition)
    this.stateManager.setProcessRunning(true)
    this.stateManager.showExecution()
    this.isRunning = true

    // Build and execute command
    const command = this.config.buildCommand(scriptDefinition)
    this.stateManager.addLogEntry(`Starting: ${command}`)
    this.stateManager.addLogEntry(`Process started: ${scriptDefinition.description}`)

    const result = await safeAssignment(() =>
      this.concurrentManager.spawn(command, scriptDefinition.name, {
        color: scriptDefinition.color,
        env: {
          FORCE_COLOR: '1',
          CI: 'false',
        },
      })
    )

    if (!result[0]) {
      this.stateManager.addLogEntry(
        `Error: ${result[1] instanceof Error ? result[1].message : String(result[1])}`
      )
    }

    // Cleanup always happens
    this.stateManager.setProcessRunning(false)
    this.currentResult = null
    this.isRunning = false
  }

  async killCurrentProcess(): Promise<void> {
    if (!this.isRunning) return

    this.stateManager.addLogEntry('Process terminated by user')
    await this.concurrentManager.stop()
    this.isRunning = false
    this.stateManager.setProcessRunning(false)
  }

  private cleanOutput(rawData: string): string {
    if (!rawData) return ''

    const ESC = '\x1b'

    // Remove problematic escape sequences while preserving colors
    return (
      rawData
        // Remove cursor movement and positioning codes
        .replace(new RegExp(`${ESC}\\[[0-9]+[ABCD]`, 'g'), '') // Cursor up/down/forward/back
        .replace(new RegExp(`${ESC}\\[[0-9]+;[0-9]+[Hf]`, 'g'), '') // Cursor position
        .replace(new RegExp(`${ESC}\\[[0-9]*[JK]`, 'g'), '') // Clear screen/line
        .replace(new RegExp(`${ESC}\\[s`, 'g'), '') // Save cursor position
        .replace(new RegExp(`${ESC}\\[u`, 'g'), '') // Restore cursor position
        .replace(new RegExp(`${ESC}\\[2J`, 'g'), '') // Clear entire screen
        .replace(new RegExp(`${ESC}\\[H`, 'g'), '') // Move cursor to home
        // Remove carriage returns that interfere with line-by-line display
        .replace(/\r(?!\n)/g, '') // Remove standalone carriage returns
        .replace(/\r\n/g, '\n') // Normalize CRLF to LF
        // Keep color codes: \x1b[<numbers>m (including semicolon-separated ones)
        .trim()
    )
  }

  isProcessRunning(): boolean {
    return this.isRunning
  }
}
