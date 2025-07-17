import type { createScriptStateManager } from './atoms.js'
import { OptionSelector } from './OptionSelector.js'
import type { ScriptRunnerConfig } from './ScriptRunnerConfig.js'

export class ScriptKeyboardInteractions {
  private onScriptSelected?: (scriptName: string) => void
  private onProcessKill?: () => void
  private onShutdown?: () => void

  constructor(
    private stateManager: ReturnType<typeof createScriptStateManager>,
    private config: ScriptRunnerConfig
  ) {}

  setScriptSelectedHandler(handler: (scriptName: string) => void): void {
    this.onScriptSelected = handler
  }

  setProcessKillHandler(handler: () => void): void {
    this.onProcessKill = handler
  }

  setShutdownHandler(handler: () => void): void {
    this.onShutdown = handler
  }

  setupKeyboardControls(): void {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    process.stdin.on('data', (key: string) => {
      // Handle Ctrl+C (since we're in raw mode, SIGINT won't work)
      if (key === '\u0003') {
        // Ctrl+C - trigger full shutdown via callback
        if (this.onShutdown) {
          this.onShutdown()
        } else {
          console.log('\n🛑 Ctrl+C detected, shutting down...')
          this.cleanup()
          process.exit(0)
        }
        return
      }

      // Handle Ctrl+R (rerun current script)
      if (key === '\u0012') {
        this.handleRerun()
        return
      }

      // Handle Escape key
      if (key === '\u001b') {
        this.handleEscapeKey()
        return
      }

      // Handle other keys based on current view
      if (this.stateManager.shouldShowMenu()) {
        this.handleMenuInput(key)
      } else if (this.stateManager.shouldShowLogs()) {
        this.handleExecutionInput(key)
      }
    })
  }

  private handleEscapeKey(): void {
    if (this.stateManager.shouldShowLogs()) {
      // In execution view - stop process and go back to menu
      if (this.stateManager.isProcessRunning() && this.onProcessKill) {
        this.onProcessKill()
      }
      this.goBackToMenu()
    } else if (this.stateManager.shouldShowMenu()) {
      // In menu view - navigate back if possible
      this.navigateBack()
    }
  }

  private handleMenuInput(key: string): void {
    // Handle selection by key (numbers 1-9, then letters a-z)
    this.handleSelectionKey(key)
  }

  private handleExecutionInput(_key: string): void {
    // No additional keys handled in execution view
    // Escape and Ctrl+R are handled at the top level
  }

  private handleRerun(): void {
    if (this.stateManager.shouldShowLogs()) {
      // Rerun the current script
      const currentScript = this.stateManager.getCurrentScript()
      if (currentScript && this.onScriptSelected) {
        this.onScriptSelected(currentScript.name)
      }
    }
  }

  private handleSelectionKey(key: string): void {
    const currentOptions = this.config.getCurrentOptions()
    const selectionIndex = OptionSelector.getSelectionIndex(key)

    if (selectionIndex === -1 || selectionIndex >= currentOptions.length) {
      return // Invalid selection
    }

    const selectedOption = currentOptions[selectionIndex]

    if (this.config.isScriptGroup(selectedOption)) {
      // Navigate into group
      if (this.config.navigateInto(selectedOption.groupName)) {
        this.stateManager.triggerNavigationUpdate()
      }
    } else {
      // Execute script
      if (this.onScriptSelected) {
        this.onScriptSelected(selectedOption.name)
      }
    }
  }

  private navigateBack(): void {
    if (this.config.navigateBack()) {
      this.stateManager.triggerNavigationUpdate()
    }
  }

  private goBackToMenu(): void {
    // Clear current script and switch to menu view
    this.stateManager.setCurrentScript(null)
    this.stateManager.clearLogs()
    this.stateManager.setProcessRunning(false)
    this.stateManager.showMenu()
  }

  cleanup(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdin.pause()
  }
}
