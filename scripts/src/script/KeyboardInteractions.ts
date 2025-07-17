import { OptionSelector } from '../OptionSelector.js'
import { safeAssignment } from '../utils/safeAssignment.js'
import type { createScriptStateManager } from './atoms.js'
import type { ScriptRunnerConfig } from './ScriptRunnerConfig.js'

export class ScriptKeyboardInteractions {
  private onScriptSelected?: (scriptName: string) => void
  private onProcessKill?: () => void
  private onShutdown?: () => void
  private isCleanedUp = false

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
    if (this.isCleanedUp) return

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    process.stdin.on('data', (key: string) => {
      this.handleKeyInput(key)
    })
  }

  private handleKeyInput(key: string): void {
    // Handle Ctrl+C (since we're in raw mode, SIGINT won't work)
    if (key === '\u0003') {
      this.handleCtrlC()
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
      return
    }

    if (this.stateManager.shouldShowLogs()) {
      this.handleExecutionInput(key)
      return
    }
  }

  private handleCtrlC(): void {
    if (this.onShutdown) {
      this.onShutdown()
      return
    }

    console.log('\n🛑 Ctrl+C detected, shutting down...')
    this.cleanup()
    process.exit(0)
  }

  private handleEscapeKey(): void {
    if (this.stateManager.shouldShowLogs()) {
      // In execution view - stop process and go back to menu
      if (this.stateManager.isProcessRunning() && this.onProcessKill) {
        this.onProcessKill()
      }
      this.goBackToMenu()
      return
    }

    if (this.stateManager.shouldShowMenu()) {
      // In menu view - navigate back if possible
      this.navigateBack()
      return
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
    if (!this.stateManager.shouldShowLogs()) return

    // Rerun the current script
    const currentScript = this.stateManager.getCurrentScript()
    if (!currentScript || !this.onScriptSelected) return

    this.onScriptSelected(currentScript.name)
  }

  private handleSelectionKey(key: string): void {
    const currentOptions = this.config.getCurrentOptions()
    const selectionIndex = OptionSelector.getSelectionIndex(key)

    if (selectionIndex === -1 || selectionIndex >= currentOptions.length) return

    const selectedOption = currentOptions[selectionIndex]

    if (this.config.isScriptGroup(selectedOption)) {
      // Navigate into group
      if (this.config.navigateInto(selectedOption.groupName)) {
        this.stateManager.triggerNavigationUpdate()
      }
      return
    }

    // Execute script
    if (this.onScriptSelected) {
      this.onScriptSelected(selectedOption.name)
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
    if (this.isCleanedUp) return
    this.isCleanedUp = true

    // Set raw mode to false if TTY
    if (process.stdin.isTTY) {
      safeAssignment(() => {
        process.stdin.setRawMode(false)
      })
    }

    // Pause stdin
    safeAssignment(() => {
      process.stdin.pause()
    })
  }
}
