import concurrently, { KillOnSignal, LogError, LogExit, Logger, LogOutput } from 'concurrently'
import { safeAssignment } from '../utils/safeAssignment.js'
import type { createScriptStateManager } from './atoms.js'
import type { ScriptDefinition, ScriptRunnerConfig } from './ScriptRunnerConfig.js'

export class ScriptProcessRunner {
  private currentResult: Promise<any> | null = null
  private isRunning = false

  constructor(
    private stateManager: ReturnType<typeof createScriptStateManager>,
    private config: ScriptRunnerConfig
  ) {}

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

    const [success, error] = await safeAssignment(() => this.runCommand(command, scriptDefinition))

    if (!success) {
      this.stateManager.addLogEntry(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Cleanup always happens
    this.stateManager.setProcessRunning(false)
    this.currentResult = null
    this.isRunning = false
  }

  killCurrentProcess(): void {
    if (this.isRunning && this.currentResult) {
      this.stateManager.addLogEntry('Process terminated by user')
      // KillOnSignal controller handles the actual process killing
      this.isRunning = false
      this.stateManager.setProcessRunning(false)
    }
  }

  private async runCommand(command: string, scriptDefinition: ScriptDefinition): Promise<void> {
    // Create logger for concurrently
    const logger = new Logger({
      raw: false,
      timestampFormat: 'HH:mm:ss.SSS',
    })

    const { commands, result } = concurrently(
      [
        {
          command,
          name: scriptDefinition.name,
          prefixColor: scriptDefinition.color,
          env: {
            // Force color output from child processes
            FORCE_COLOR: '1',
            CI: 'false',
            NO_COLOR: undefined,
          },
        },
      ],
      {
        logger,
        outputStream: process.stdout,
        controllers: [
          new LogOutput({ logger }),
          new LogError({ logger }),
          new LogExit({ logger }),
          new KillOnSignal({ process }), // Handle Ctrl+C reliably with SIGINT
        ],
      }
    )

    this.currentResult = result

    // Set up handlers for the single command
    const scriptCommand = commands[0]

    scriptCommand.stdout.subscribe((data) => {
      const output = this.cleanOutput(data.toString())
      if (output) {
        this.stateManager.addLogEntry(output)
      }
    })

    scriptCommand.stderr.subscribe((data) => {
      const output = this.cleanOutput(data.toString())
      if (output) {
        this.stateManager.addLogEntry(output)
      }
    })

    scriptCommand.error.subscribe((error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.stateManager.addLogEntry(`Process error: ${message}`)
    })

    scriptCommand.close.subscribe((exitInfo) => {
      if (exitInfo.exitCode === 0) {
        this.stateManager.addLogEntry(`✅ Script completed successfully`)
      } else {
        this.stateManager.addLogEntry(`❌ Script failed with exit code: ${exitInfo.exitCode}`)
      }
    })

    // Log that the process started
    this.stateManager.addLogEntry(`Process started: ${scriptDefinition.description}`)
    await result
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
