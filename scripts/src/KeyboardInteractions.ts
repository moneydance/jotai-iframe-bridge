import type { createStateManager } from './atoms.js'
import type { DevRunnerConfig } from './DevRunnerConfig.js'

export class KeyboardInteractions {
  constructor(
    private stateManager: ReturnType<typeof createStateManager>,
    private config: DevRunnerConfig
  ) {}

  setupKeyboardControls(): void {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    process.stdin.on('data', (key: string) => {
      if (key === '\u0003') {
        // Ctrl+C
        this.cleanup()
        process.exit(0)
      }

      if (key === 'r' || key === 'R') {
        // Force refresh by touching an atom to trigger re-render
        const currentView = this.stateManager.getActiveView()
        this.stateManager.setActiveView(currentView)
        return
      }

      if (key === 'a' || key === 'A') {
        this.stateManager.toggleShowAllLogs()
        // Re-render happens automatically via observer
        return
      }

      const num = parseInt(key, 10)
      if (!Number.isNaN(num)) {
        const runningProcesses = this.config.getFilteredProcessNames()

        if (this.isValidViewNumber(num, runningProcesses)) {
          const newView = this.getViewFromNumber(num, runningProcesses)
          this.stateManager.setActiveView(newView)
          // Re-render happens automatically via observer
        }
      }
    })
  }

  cleanup(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdin.pause()
  }

  // Keyboard navigation utility functions
  private isValidViewNumber(num: number, runningProcesses: string[]): boolean {
    return num >= 1 && num <= runningProcesses.length + 1
  }

  private getViewFromNumber(num: number, runningProcesses: string[]): string {
    if (num === 1) return 'summary'

    const processIndex = num - 2
    if (processIndex >= 0 && processIndex < runningProcesses.length) {
      return runningProcesses[processIndex]
    }

    return 'summary'
  }
}
