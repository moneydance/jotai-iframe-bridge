import { safeAssignment } from '../utils/safeAssignment.js'
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
  }

  async start(): Promise<void> {
    const _runningOptions = this.config.getCurrentOptions()
    console.log(`Starting script runner...`)

    // Initialize components
    this.unsubscribeObserver = this.stateManager.observeChanges(() =>
      this.rendering.throttledRender()
    )

    // Set up keyboard interactions with shutdown handler
    this.keyboardInteractions.setScriptSelectedHandler((scriptName: string) => {
      this.executeScript(scriptName)
    })

    this.keyboardInteractions.setProcessKillHandler(() => {
      this.processRunner.killCurrentProcess()
    })

    // Set up shutdown handler for Ctrl+C in raw mode
    this.keyboardInteractions.setShutdownHandler(async () => {
      console.log('\n🛑 ScriptRunner cleanup initiated...')

      // Stop processes first
      await this.processRunner.killCurrentProcess()

      // Then cleanup UI components
      this.keyboardInteractions.cleanup()
      this.rendering.cleanup()

      // Clean up observer
      if (this.unsubscribeObserver) {
        this.unsubscribeObserver()
      }

      this.rendering.displayShutdown()
      console.log('👋 ScriptRunner cleanup complete')
      process.exit(0)
    })

    this.keyboardInteractions.setupKeyboardControls()
    this.rendering.render()

    // Since we handle Ctrl+C in raw mode, we don't need signal handlers
    // Just handle the exit event for cleanup when process ends normally
    process.on('exit', () => {
      this.keyboardInteractions.cleanup()
      this.rendering.cleanup()
      if (this.unsubscribeObserver) {
        this.unsubscribeObserver()
      }
    })

    return new Promise<void>((resolve) => {
      process.on('exit', resolve)
    })
  }

  private async executeScript(scriptName: string): Promise<void> {
    const [success, error] = await safeAssignment(() =>
      this.processRunner.executeScript(scriptName)
    )

    if (!success) {
      this.rendering.displayError(error instanceof Error ? error.message : String(error))
    }
  }
}

// Export all the types from ScriptRunnerConfig
export type {
  ScriptConfig,
  ScriptDefinition,
  ScriptGroup,
  ScriptRunnerConfigOptions,
} from './ScriptRunnerConfig.js'
