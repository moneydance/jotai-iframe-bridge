import { type ThrottledFunction, throttle } from '../utils/throttle.js'
import type { createScriptStateManager, LogEntry } from './atoms.js'
import { OptionSelector } from './OptionSelector.js'
import type { ScriptRunnerConfig } from './ScriptRunnerConfig.js'

export class ScriptRendering {
  private colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
    black: '\x1b[30m',
    bgWhite: '\x1b[47m',
  }

  public throttledRender: ThrottledFunction<() => void>

  constructor(
    private stateManager: ReturnType<typeof createScriptStateManager>,
    private config: ScriptRunnerConfig
  ) {
    // Create throttled render function for smooth UI updates
    this.throttledRender = throttle(() => this.render(), 100)
  }

  render(): void {
    console.clear()
    this.displayHeader()

    if (this.stateManager.shouldShowMenu()) {
      this.displayMenu()
    } else if (this.stateManager.shouldShowLogs()) {
      this.displayScriptExecution()
    }

    this.displayControls()
  }

  private displayHeader(): void {
    console.log(`${this.colors.bright}${this.config.title}${this.colors.reset}`)

    // Show breadcrumb navigation
    const breadcrumb = this.config.getCurrentBreadcrumb()
    console.log(`${this.colors.gray}📁 ${breadcrumb}${this.colors.reset}`)
    console.log('============================================================')
  }

  private displayMenu(): void {
    const currentOptions = this.config.getCurrentOptions()

    if (currentOptions.length === 0) {
      console.log(
        `${this.colors.yellow}No scripts or groups available at this level.${this.colors.reset}`
      )
      return
    }

    console.log(`${this.colors.bright}📋 Available Options${this.colors.reset}`)
    console.log('')

    // Get selection keys for all options
    const selectionKeys = OptionSelector.getSelectionKeys(currentOptions.length)

    currentOptions.forEach((option, index) => {
      const key = selectionKeys[index]

      if (this.config.isScriptGroup(option)) {
        // Display group
        console.log(`${this.colors.cyan}${key}. 📁 ${option.groupName}${this.colors.reset}`)
      } else {
        // Display script
        const color = this.colors[option.color as keyof typeof this.colors]
        console.log(`${color}${key}. ⚡ ${option.description}${this.colors.reset}`)
      }
    })
  }

  private displayScriptExecution(): void {
    const currentScript = this.stateManager.getCurrentScript()
    const isRunning = this.stateManager.isProcessRunning()

    if (!currentScript) {
      console.log(`${this.colors.red}No script selected${this.colors.reset}`)
      return
    }

    const color = this.colors[currentScript.color as keyof typeof this.colors]
    const status = isRunning ? '🔄 Running' : '✅ Completed'

    console.log(`${color}${this.colors.bright}${currentScript.description}${this.colors.reset}`)
    console.log(
      `${this.colors.gray}Command: ${this.config.buildCommand(currentScript)}${this.colors.reset}`
    )
    console.log(`${this.colors.gray}Status: ${status}${this.colors.reset}`)
    console.log('============================================================')

    // Display logs
    const logs = this.stateManager.getLogs()

    if (logs.length === 0) {
      console.log(`${this.colors.gray}Waiting for output...${this.colors.reset}`)
    } else {
      logs.forEach((entry: LogEntry) => {
        const timeStr = entry.timestamp.toLocaleTimeString()
        console.log(`${this.colors.gray}[${timeStr}]${this.colors.reset} ${entry.content}`)
      })
    }
  }

  private displayControls(): void {
    console.log('============================================================')

    if (this.stateManager.shouldShowMenu()) {
      this.displayMenuControls()
    } else if (this.stateManager.shouldShowLogs()) {
      this.displayExecutionControls()
    }
  }

  private displayMenuControls(): void {
    const currentOptions = this.config.getCurrentOptions()
    const canGoBack = this.config.getCurrentPath().length > 0

    console.log('Navigation:')

    if (currentOptions.length > 0) {
      const selectionKeys = OptionSelector.getSelectionKeys(currentOptions.length)
      const keyRange = OptionSelector.getSelectionKeyRange(selectionKeys)
      console.log(`Press ${keyRange} to select an option`)
    }

    if (canGoBack) {
      console.log('Press Escape to go back')
    }

    console.log('Press Ctrl+C to quit')
  }

  private displayExecutionControls(): void {
    const isRunning = this.stateManager.isProcessRunning()

    console.log('Controls:')

    if (isRunning) {
      console.log('Press Escape to stop and go back')
    } else {
      console.log('Press Escape to go back to menu')
      console.log('Press Ctrl+R to rerun script')
    }

    console.log('Press Ctrl+C to quit')
  }

  displayError(message: string): void {
    console.error(`${this.colors.red}Error: ${message}${this.colors.reset}`)
  }

  displayShutdown(): void {
    console.log(`${this.colors.gray}Script runner stopped.${this.colors.reset}`)
  }

  cleanup(): void {
    // Rendering cleanup if needed
  }
}
