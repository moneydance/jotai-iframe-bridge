import { getDefaultStore } from 'jotai'
import type { createDevRunnerAtoms } from '../state/atoms.js'
import type { DevRunnerConfig } from './DevRunnerConfig.js'
import type { Rendering } from './Rendering.js'

export class KeyboardInteractions {
  private store = getDefaultStore()

  constructor(
    private atoms: ReturnType<typeof createDevRunnerAtoms>,
    private config: DevRunnerConfig,
    private rendering: Rendering
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
        this.rendering.render()
        return
      }

      if (key === 'a' || key === 'A') {
        const currentShowAll = this.store.get(this.atoms.showAllLogsAtom)
        this.store.set(this.atoms.showAllLogsAtom, !currentShowAll)
        this.rendering.render()
        return
      }

      const num = parseInt(key, 10)
      if (!Number.isNaN(num)) {
        const runningProcesses = this.config.getFilteredProcessNames()

        if (this.isValidViewNumber(num, runningProcesses)) {
          const newView = this.getViewFromNumber(num, runningProcesses)
          this.store.set(this.atoms.activeViewAtom, newView)
          this.rendering.render()
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
