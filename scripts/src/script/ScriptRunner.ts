import { createScriptRunnerAtoms, createScriptStateManager } from './atoms.js'
import { ScriptKeyboardInteractions } from './KeyboardInteractions.js'
import { ScriptRendering } from './Rendering.js'
import { ScriptProcessRunner } from './ScriptProcessRunner.js'
import { ScriptRunnerConfig, type ScriptRunnerConfigOptions } from './ScriptRunnerConfig.js'

export class ScriptRunner {
  private config: ScriptRunnerConfig
  private atoms: ReturnType<typeof createScriptRunnerAtoms>
  private stateManager: ReturnType<typeof createScriptStateManager>
  private rendering: ScriptRendering
  private keyboardInteractions: ScriptKeyboardInteractions
  private processRunner: ScriptProcessRunner
  private unsubscribeObserver?: () => void

  constructor(configOptions: ScriptRunnerConfigOptions) {
    // Create config for business logic
    this.config = new ScriptRunnerConfig(configOptions)

    // Create atoms and state manager
    this.atoms = createScriptRunnerAtoms()
    this.stateManager = createScriptStateManager(this.atoms)

    // Initialize component classes with state manager and config
    this.rendering = new ScriptRendering(this.stateManager, this.config)
    this.keyboardInteractions = new ScriptKeyboardInteractions(this.stateManager, this.config)
    this.processRunner = new ScriptProcessRunner(this.stateManager, this.config)

    // Wire up keyboard interactions
    this.keyboardInteractions.setScriptSelectedHandler((scriptName: string) => {
      this.executeScript(scriptName)
    })

    this.keyboardInteractions.setProcessKillHandler(() => {
      this.processRunner.killCurrentProcess()
    })
  }

  async start(): Promise<void> {
    console.log(`Starting: ${this.config.title}`)

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

    // Keep the process running
    await new Promise<void>((resolve) => {
      // The process will keep running until user exits with Ctrl+C
      // The cleanup handlers will call resolve when exiting
      process.on('SIGINT', resolve)
      process.on('SIGTERM', resolve)
    })
  }

  private async executeScript(scriptName: string): Promise<void> {
    try {
      await this.processRunner.executeScript(scriptName)
    } catch (error) {
      this.rendering.displayError(error instanceof Error ? error.message : String(error))
    }
  }

  private setupCleanupHandlers(): void {
    const cleanup = () => {
      this.keyboardInteractions.cleanup()
      this.rendering.cleanup()
      this.processRunner.killCurrentProcess()
      // Clean up observer
      if (this.unsubscribeObserver) {
        this.unsubscribeObserver()
      }
      this.rendering.displayShutdown()
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('exit', cleanup)
  }
}

// Export all the types from ScriptRunnerConfig
export type {
  ScriptConfig,
  ScriptDefinition,
  ScriptGroup,
  ScriptRunnerConfigOptions,
} from './ScriptRunnerConfig.js'
