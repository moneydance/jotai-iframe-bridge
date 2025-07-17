import { getDefaultStore } from 'jotai'
import { createDevRunnerAtoms } from '../state/atoms.js'
import { DevRunnerConfig, type DevRunnerConfigOptions, type LogEntry } from './DevRunnerConfig.js'
import { KeyboardInteractions } from './KeyboardInteractions.js'
import { ProcessManager } from './ProcessManager.js'
import { Rendering } from './Rendering.js'

export class DevRunner {
  private store = getDefaultStore()
  private config: DevRunnerConfig
  private atoms: ReturnType<typeof createDevRunnerAtoms>
  private rendering: Rendering
  private keyboardInteractions: KeyboardInteractions
  private processManager: ProcessManager

  constructor(configOptions: DevRunnerConfigOptions) {
    // Create config manager for business logic
    this.config = new DevRunnerConfig(configOptions)

    // Create atoms without config dependency
    this.atoms = createDevRunnerAtoms()

    // Initialize component classes with atoms and config
    this.rendering = new Rendering(this.atoms, this.config)
    this.keyboardInteractions = new KeyboardInteractions(this.atoms, this.config, this.rendering)
    this.processManager = new ProcessManager(this.atoms, this.config, this.rendering)

    // Initialize log buffers for the filtered processes
    const runningProcesses = this.config.getFilteredProcessNames()
    this.initializeLogBuffers(runningProcesses)
  }

  private initializeLogBuffers(processNames: string[]): void {
    const logBuffers = new Map<string, LogEntry[]>()

    processNames.forEach((name) => {
      logBuffers.set(name, [])
    })
    logBuffers.set('summary', [])

    this.store.set(this.atoms.logBuffersAtom, logBuffers)
    this.store.set(this.atoms.serversAtom, new Map())
  }

  async start(): Promise<void> {
    const runningProcesses = this.config.getFilteredProcessNames()
    console.log(`Starting: ${runningProcesses.join(', ')}`)

    // Setup keyboard controls
    this.keyboardInteractions.setupKeyboardControls()

    // Setup cleanup handlers
    this.setupCleanupHandlers()

    // Start process management
    await this.processManager.start()
  }

  private setupCleanupHandlers(): void {
    const cleanup = () => {
      this.keyboardInteractions.cleanup()
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('exit', cleanup)
  }
}

// Re-export types for convenience
export type { DevRunnerConfigOptions, LogEntry, ProcessDefinition } from './DevRunnerConfig.js'
