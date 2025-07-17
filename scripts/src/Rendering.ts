import type { createStateManager, LogEntry } from './atoms.js'
import type { DevRunnerConfig } from './DevRunnerConfig.js'

export class Rendering {
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

  constructor(
    private stateManager: ReturnType<typeof createStateManager>,
    private config: DevRunnerConfig
  ) {}

  render(): void {
    console.clear()
    this.displayHeader()

    const activeView = this.stateManager.getActiveView()
    if (activeView === 'summary') {
      this.displaySummary()
    } else {
      this.displayProcessLogs(activeView)
    }

    this.displayControls()
  }

  private displayHeader(): void {
    const runningProcesses = this.config.getFilteredProcessNames()

    console.log(`${this.colors.bright}${this.config.title}${this.colors.reset}`)
    console.log(`Running: ${runningProcesses.join(', ')}`)
    console.log('============================================================')
  }

  private displaySummary(): void {
    console.log(`${this.colors.bright}📊 Summary View${this.colors.reset}`)
    console.log('============================================================')

    // Show server URLs first
    const urlEntries = this.stateManager.getServerUrls()

    if (urlEntries.length > 0) {
      console.log('🚀 Running Servers:')
      urlEntries.forEach((entry: string) =>
        console.log(`  ${this.colors.cyan}${entry}${this.colors.reset}`)
      )
      console.log('')
    } else {
      console.log('Starting servers...')
    }

    console.log('Recent Activity:')
    const currentLogs = this.stateManager.getCurrentLogs()

    currentLogs.forEach((entry: LogEntry) => {
      const timeStr = entry.timestamp.toLocaleTimeString()
      const processDefinition = this.config.getProcessConfig(entry.processName)
      const color = processDefinition
        ? this.colors[processDefinition.color as keyof typeof this.colors]
        : this.colors.gray
      console.log(
        `${this.colors.gray}[${timeStr}]${this.colors.reset} ${color}[${entry.processName}]${this.colors.reset} ${entry.content}`
      )
    })
  }

  private displayProcessLogs(processName: string): void {
    const processDefinition = this.config.getProcessConfig(processName)
    if (!processDefinition) return

    const color = this.colors[processDefinition.color as keyof typeof this.colors]
    console.log(`${color}${this.colors.bright}${processDefinition.description}${this.colors.reset}`)
    console.log('============================================================')

    const currentLogs = this.stateManager.getCurrentLogs()

    currentLogs.forEach((entry: LogEntry) => {
      const timeStr = entry.timestamp.toLocaleTimeString()
      console.log(`${this.colors.gray}[${timeStr}]${this.colors.reset} ${entry.content}`)
    })
  }

  private displayControls(): void {
    const runningProcesses = this.config.getFilteredProcessNames()

    console.log('============================================================')
    console.log('Controls:')
    console.log(' 1. Summary')

    runningProcesses.forEach((processName: string, index: number) => {
      const processDefinition = this.config.getProcessConfig(processName)
      if (processDefinition) {
        const color = this.colors[processDefinition.color as keyof typeof this.colors]
        console.log(` ${index + 2}. ${color}${processDefinition.description}${this.colors.reset}`)
      }
    })

    console.log(`Press 1-${runningProcesses.length + 1} to switch views`)
    console.log("Press 'a' to show ALL logs in current view")
    console.log("Press 'r' to refresh display")
    console.log('Press Ctrl+C to quit')
  }

  displayError(message: string): void {
    console.error(`${this.colors.red}Error: ${message}${this.colors.reset}`)
  }

  displayShutdown(): void {
    console.log(`\n${this.colors.yellow}Shutting down all processes...${this.colors.reset}`)
  }
}
