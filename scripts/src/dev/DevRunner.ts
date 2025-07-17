import { createDevRunnerAtoms, createStateManager } from './atoms.js'
import { DevRunnerConfig, type DevRunnerConfigOptions } from './DevRunnerConfig.js'
import { KeyboardInteractions } from './KeyboardInteractions.js'
import { ProcessManager } from './ProcessManager.js'
import { Rendering } from './Rendering.js'

export class DevRunner {
  private config: DevRunnerConfig
  private atoms: ReturnType<typeof createDevRunnerAtoms>
  private stateManager: ReturnType<typeof createStateManager>
  private rendering: Rendering
  private keyboardInteractions: KeyboardInteractions
  private processManager: ProcessManager
  private unsubscribeObserver?: () => void

  constructor(configOptions: DevRunnerConfigOptions) {
    // Create config for business logic
    this.config = new DevRunnerConfig(configOptions)

    // Create atoms and state manager
    this.atoms = createDevRunnerAtoms()
    this.stateManager = createStateManager(this.atoms)

    // Initialize component classes with state manager and config
    this.rendering = new Rendering(this.stateManager, this.config)
    this.keyboardInteractions = new KeyboardInteractions(this.stateManager, this.config)
    this.processManager = new ProcessManager(this.stateManager, this.config)

    // Initialize log buffers for the filtered processes
    const runningProcesses = this.config.getFilteredProcessNames()
    this.stateManager.initializeLogBuffers(runningProcesses)
  }

  async start(): Promise<void> {
    const runningProcesses = this.config.getFilteredProcessNames()
    console.log(`Starting: ${runningProcesses.join(', ')}`)

    // Set up reactive rendering - automatically re-render when state changes using throttled render
    this.unsubscribeObserver = this.stateManager.observeChanges(() =>
      this.rendering.throttledRender()
    )

    // Initial render (not throttled for immediate feedback)
    this.rendering.render()

    // Setup keyboard controls
    this.keyboardInteractions.setupKeyboardControls()

    // Setup cleanup handlers
    this.setupCleanupHandlers()

    // Start process management
    await this.processManager.start()
  }

  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      console.log('\n🛑 DevRunner cleanup initiated...')

      // Stop processes first (with emoji logs)
      await this.processManager.stop()

      // Then cleanup UI components
      this.keyboardInteractions.cleanup()
      this.rendering.cleanup()

      // Clean up observer
      if (this.unsubscribeObserver) {
        this.unsubscribeObserver()
      }

      console.log('👋 DevRunner cleanup complete')
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('exit', cleanup)
  }
}

// Re-export types for convenience
export type { DevRunnerConfigOptions, ProcessDefinition } from './DevRunnerConfig.js'
