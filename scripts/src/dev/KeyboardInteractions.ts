import { OptionSelector } from '../OptionSelector.js'
import { safeAssignment } from '../utils/safeAssignment.js'
import type { createStateManager } from './atoms.js'
import type { DevRunnerConfig } from './DevRunnerConfig.js'

export class KeyboardInteractions {
  private isCleanedUp = false

  constructor(
    private stateManager: ReturnType<typeof createStateManager>,
    private config: DevRunnerConfig
  ) {}

  setupKeyboardControls(): void {
    if (this.isCleanedUp) return

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    process.stdin.on('data', (key: string) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        this.cleanup()
        process.exit(0)
        return
      }

      // Handle Ctrl+A (toggle all logs)
      if (key === '\u0001') {
        this.stateManager.toggleShowAllLogs()
        return
      }

      // Handle view selection using OptionSelector
      this.handleViewSelection(key)
    })
  }

  private handleViewSelection(key: string): void {
    if (this.isCleanedUp) return

    const runningProcesses = this.config.getFilteredProcessNames()
    const totalOptions = runningProcesses.length + 1 // +1 for summary view

    const selectionIndex = OptionSelector.getSelectionIndex(key)
    if (selectionIndex === -1 || selectionIndex >= totalOptions) return

    // Index 0 = summary, Index 1+ = process views
    if (selectionIndex === 0) {
      this.stateManager.setActiveView('summary')
      return
    }

    const processIndex = selectionIndex - 1
    if (processIndex >= runningProcesses.length) return

    this.stateManager.setActiveView(runningProcesses[processIndex])
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
