import concurrently from 'concurrently'
import { EventEmitter } from 'events'

export interface ProcessConfig {
  name: string
  package: string
  script: string
  description: string
  color: string
  tags: string[]
}

export interface LogEntry {
  timestamp: Date
  content: string
  processName: string
}

export interface DevRunnerConfig {
  processes: ProcessConfig[]
  includeTags?: string[]
  excludeTags?: string[]
  processNames?: string[]
  title?: string
  displayHeader?: () => void
  displayControls?: (runningProcesses: string[], processConfigs: ProcessConfig[]) => void
}

export class DevRunner extends EventEmitter {
  protected processConfigs: ProcessConfig[]
  private config: DevRunnerConfig
  private logBuffers: Map<string, LogEntry[]> = new Map()
  private activeView: string = 'summary'
  private servers: Map<string, string[]> = new Map()
  private runningProcesses: string[] = []
  private showAllLogs: boolean = false

  protected colors = {
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

  constructor(config: DevRunnerConfig) {
    super()
    this.config = config
    this.processConfigs = config.processes

    // Filter processes based on configuration
    const selectedProcesses = this.filterProcesses(config)

    // Initialize log buffers for selected processes
    selectedProcesses.forEach((name) => {
      this.logBuffers.set(name, [])
    })
    this.logBuffers.set('summary', [])
    this.runningProcesses = [...selectedProcesses]
  }

  /**
   * Builds the actual command to execute from declarative process configuration.
   * This keeps command construction as an implementation detail of the DevRunner.
   */
  private buildCommand(config: ProcessConfig): string {
    return `pnpm --filter ${config.package} ${config.script}`
  }

  private filterProcesses(config: DevRunnerConfig): string[] {
    let filtered = [...this.processConfigs]

    // Filter by specific process names if provided
    if (config.processNames && config.processNames.length > 0) {
      filtered = filtered.filter((p) => config.processNames?.includes(p.name))
    }

    // Filter by include tags
    if (config.includeTags && config.includeTags.length > 0) {
      filtered = filtered.filter((p) => config.includeTags?.some((tag) => p.tags.includes(tag)))
    }

    // Filter by exclude tags
    if (config.excludeTags && config.excludeTags.length > 0) {
      filtered = filtered.filter((p) => !config.excludeTags?.some((tag) => p.tags.includes(tag)))
    }

    return filtered.map((p) => p.name)
  }

  private addLogEntry(processName: string, content: string) {
    const entry: LogEntry = {
      timestamp: new Date(),
      content: content.trim(),
      processName,
    }

    // Add to process-specific buffer
    const buffer = this.logBuffers.get(processName)
    if (buffer) {
      buffer.push(entry)
      // Keep only last 2000 entries per process
      if (buffer.length > 2000) {
        buffer.shift()
      }
    }

    // Add to summary buffer (all processes)
    const summaryBuffer = this.logBuffers.get('summary')
    if (summaryBuffer) {
      summaryBuffer.push(entry)
      // Keep only last 5000 entries in summary
      if (summaryBuffer.length > 5000) {
        summaryBuffer.shift()
      }
    }

    // Update display if this is the active view
    if (this.activeView === processName || this.activeView === 'summary') {
      this.updateDisplay()
    }
  }

  private extractUrls(data: string): string[] {
    const urlRegex = /➜\s+Local:\s+(https?:\/\/localhost[^\s]+)/g
    const urls: string[] = []
    let match: RegExpExecArray | null = urlRegex.exec(data)
    while (match !== null) {
      urls.push(match[1])
      match = urlRegex.exec(data)
    }
    return urls
  }

  private updateDisplay() {
    console.clear()
    this.displayHeader()

    if (this.activeView === 'summary') {
      this.displaySummary()
    } else {
      this.displayProcessLogs(this.activeView)
    }

    this.displayControls()
  }

  private displayHeader(): void {
    if (this.config.displayHeader) {
      this.config.displayHeader()
    } else {
      console.log(
        `${this.colors.bright}${this.config.title || 'Development Environment'}${this.colors.reset}`
      )
      console.log(`Running: ${this.runningProcesses.join(', ')}`)
      console.log('============================================================')
    }
  }

  private displaySummary() {
    console.log(`${this.colors.bright}📊 Summary View${this.colors.reset}`)
    console.log('============================================================')

    // Show server URLs first
    const urlEntries: string[] = []
    this.servers.forEach((urls, processName) => {
      urls.forEach((url) => {
        urlEntries.push(`${this.colors.cyan}🌐 ${processName}:${this.colors.reset} ${url}`)
      })
    })

    if (urlEntries.length > 0) {
      console.log('🚀 Running Servers:')
      urlEntries.forEach((entry) => console.log(`  ${entry}`))
      console.log('')
    } else {
      console.log('Starting servers...')
    }

    console.log('Recent Activity:')
    const summaryBuffer = this.logBuffers.get('summary') || []
    const logsToShow = this.showAllLogs ? summaryBuffer : summaryBuffer.slice(-100)

    logsToShow.forEach((entry) => {
      const timeStr = entry.timestamp.toLocaleTimeString()
      const processConfig = this.processConfigs.find((p) => p.name === entry.processName)
      const color = processConfig
        ? this.colors[processConfig.color as keyof typeof this.colors]
        : this.colors.gray
      console.log(
        `${this.colors.gray}[${timeStr}]${this.colors.reset} ${color}[${entry.processName}]${this.colors.reset} ${entry.content}`
      )
    })
  }

  private displayProcessLogs(processName: string) {
    const processConfig = this.processConfigs.find((p) => p.name === processName)
    if (!processConfig) return

    const color = this.colors[processConfig.color as keyof typeof this.colors]
    console.log(`${color}${this.colors.bright}${processConfig.description}${this.colors.reset}`)
    console.log('============================================================')

    const buffer = this.logBuffers.get(processName) || []
    const logsToShow = this.showAllLogs ? buffer : buffer.slice(-100)

    logsToShow.forEach((entry) => {
      const timeStr = entry.timestamp.toLocaleTimeString()
      console.log(`${this.colors.gray}[${timeStr}]${this.colors.reset} ${entry.content}`)
    })
  }

  private displayControls(): void {
    if (this.config.displayControls) {
      this.config.displayControls(this.runningProcesses, this.processConfigs)
    } else {
      console.log('============================================================')
      console.log('Controls:')
      console.log(' 1. Summary')

      this.runningProcesses.forEach((processName, index) => {
        const config = this.processConfigs.find((p) => p.name === processName)
        if (config) {
          const color = this.colors[config.color as keyof typeof this.colors]
          console.log(` ${index + 2}. ${color}${config.description}${this.colors.reset}`)
        }
      })

      console.log(`Press 1-${this.runningProcesses.length + 1} to switch views`)
      console.log("Press 'a' to show ALL logs in current view")
      console.log("Press 'r' to refresh display")
      console.log('Press Ctrl+C to quit')
    }
  }

  private setupKeyboardControls() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')

      process.stdin.on('data', (key) => {
        const keyStr = key.toString()

        if (keyStr === '\u0003') {
          // Ctrl+C
          console.log('\nShutting down all processes...')
          process.exit(0)
        }

        this.handleKeyPress(keyStr)
      })
    }
  }

  protected handleKeyPress(key: string) {
    switch (key) {
      case '1':
        this.activeView = 'summary'
        this.updateDisplay()
        break
      case 'a':
      case 'A':
        this.showAllLogs = !this.showAllLogs
        this.updateDisplay()
        break
      case 'r':
      case 'R':
        this.updateDisplay()
        break
      default: {
        // Check if it's a number key for process selection
        const num = parseInt(key)
        if (num >= 2 && num <= this.runningProcesses.length + 1) {
          const processIndex = num - 2
          this.activeView = this.runningProcesses[processIndex]
          this.updateDisplay()
        }
        break
      }
    }
  }

  public async start() {
    const commandsToRun = this.runningProcesses.map((name) => {
      const config = this.processConfigs.find((p) => p.name === name)!
      return {
        name,
        command: this.buildCommand(config),
      }
    })

    // Map colors only for the running processes, in the same order as commandsToRun
    const colorsForRunningProcesses = this.runningProcesses.map((name) => {
      const config = this.processConfigs.find((p) => p.name === name)!
      return config.color
    })

    try {
      const { commands, result } = concurrently(commandsToRun, {
        prefix: '{name}',
        prefixColors: colorsForRunningProcesses,
        killOthers: ['failure'],
        restartTries: 0,
      })

      commands.forEach((command, index) => {
        const name = commandsToRun[index].name

        command.stdout.subscribe((event) => {
          const data = event.toString()
          this.addLogEntry(name, data)

          const urls = this.extractUrls(data)
          if (urls.length > 0) {
            const existing = this.servers.get(name) || []
            const newUrls = urls.filter((url) => !existing.includes(url))
            if (newUrls.length > 0) {
              this.servers.set(name, [...existing, ...newUrls])
              if (this.activeView === 'summary') {
                this.updateDisplay()
              }
            }
          }
        })

        command.stderr.subscribe((event) => {
          const data = event.toString()
          this.addLogEntry(name, `${this.colors.red}ERROR: ${data}${this.colors.reset}`)
        })
      })

      this.setupKeyboardControls()
      this.updateDisplay()
      await result
    } catch (error) {
      console.error(`${this.colors.red}Error starting processes:${this.colors.reset}`, error)
      process.exit(1)
    }
  }

  protected getRunningProcesses(): string[] {
    return this.runningProcesses
  }

  protected getProcessConfigs(): ProcessConfig[] {
    return this.processConfigs
  }
}
