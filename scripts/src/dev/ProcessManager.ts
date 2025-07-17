import { type ChildProcess, exec, spawn } from 'child_process'
import { promisify } from 'util'
import type { createStateManager } from './atoms.js'
import type { DevRunnerConfig } from './DevRunnerConfig.js'
import { LogProcessor } from './LogProcessor.js'

const execAsync = promisify(exec)

interface ManagedProcess {
  name: string
  process: ChildProcess
  pgid?: number
}

export class ProcessManager {
  private logProcessor: LogProcessor
  private managedProcesses: ManagedProcess[] = []
  private isRunning = false
  private isTerminating = false

  constructor(
    stateManager: ReturnType<typeof createStateManager>,
    private config: DevRunnerConfig
  ) {
    this.logProcessor = new LogProcessor(stateManager)

    // Set up custom signal handlers to kill process trees
    this.setupSignalHandlers()
  }

  private async findDescendantProcesses(parentPid: number): Promise<number[]> {
    try {
      // Use ps to find all processes with the given parent PID
      const { stdout } = await execAsync(`ps -eo pid,ppid | awk '$2 == ${parentPid} { print $1 }'`)
      const childPids = stdout.trim().split('\n').filter(Boolean).map(Number)

      // Recursively find descendants of children
      const allDescendants: number[] = []
      for (const childPid of childPids) {
        allDescendants.push(childPid)
        const grandChildren = await this.findDescendantProcesses(childPid)
        allDescendants.push(...grandChildren)
      }

      return allDescendants
    } catch (error) {
      console.warn(`Failed to find descendant processes for ${parentPid}:`, error)
      return []
    }
  }

  private async killProcessTree(rootPid: number, signal: string = 'SIGINT'): Promise<void> {
    try {
      console.log(`Killing process group for PID: ${rootPid}`)

      // Since we spawn with detached: true, we can kill the entire process group
      // by using the negative PID (which targets the process group)
      try {
        process.kill(-rootPid, signal)
        console.log(`Sent ${signal} to process group ${rootPid}`)
      } catch (error) {
        console.log(`Failed to kill process group ${rootPid} with ${signal}:`, error)

        // Fallback: try to kill individual processes
        const descendants = await this.findDescendantProcesses(rootPid)
        const allPids = [rootPid, ...descendants]
        console.log(`Fallback: killing individual processes: ${allPids.join(', ')}`)

        for (const pid of allPids.reverse()) {
          try {
            process.kill(pid, signal)
            console.log(`Killed process ${pid}`)
          } catch (_error) {
            console.log(`Process ${pid} already dead or not accessible`)
          }
        }
      }

      // Give processes time to shut down gracefully
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Force kill the process group if still alive
      try {
        process.kill(-rootPid, 'SIGKILL')
        console.log(`Force killed process group ${rootPid}`)
      } catch (_error) {
        console.log(`Process group ${rootPid} already terminated or not accessible`)

        // Fallback: force kill individual processes
        const descendants = await this.findDescendantProcesses(rootPid)
        const allPids = [rootPid, ...descendants]

        for (const pid of allPids) {
          try {
            process.kill(pid, 'SIGKILL')
            console.log(`Force killed process ${pid}`)
          } catch (_error) {
            // Process is definitely dead now
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to kill process tree for ${rootPid}:`, error)
    }
  }

  private setupSignalHandlers(): void {
    const killProcessTrees = async () => {
      if (this.isTerminating) return
      this.isTerminating = true

      console.log('\nTerminating process trees...')

      // Kill all managed process trees
      const killPromises = this.managedProcesses.map(async ({ name, process }) => {
        if (process.pid && !process.killed) {
          console.log(`Killing process tree for ${name} (PID: ${process.pid})`)
          await this.killProcessTree(process.pid)
        }
      })

      await Promise.all(killPromises)

      console.log('Process cleanup complete')
      process.exit(0)
    }

    process.on('SIGINT', killProcessTrees)
    process.on('SIGTERM', killProcessTrees)
    process.on('exit', killProcessTrees)
  }

  async start(): Promise<void> {
    const runningProcesses = this.config.getFilteredProcessNames()

    if (runningProcesses.length === 0) {
      console.error('No processes to run with current filters')
      return
    }

    this.isRunning = true

    // Start all processes
    const processPromises = runningProcesses.map((processName) => {
      const processDefinition = this.config.getProcessConfig(processName)
      if (!processDefinition) {
        throw new Error(`Process config not found: ${processName}`)
      }

      const command = this.config.buildCommand(processDefinition)
      return this.spawnManagedProcess(command, processName, processDefinition.color)
    })

    try {
      // Wait for all processes to complete
      await Promise.all(processPromises)
      console.log('✅ All processes completed successfully')
    } catch (error) {
      console.error('❌ One or more processes failed:', error)
      throw error
    } finally {
      this.isRunning = false
      this.managedProcesses = []
    }
  }

  private async spawnManagedProcess(command: string, name: string, _color: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Parse the command into command and args
      const [cmd, ...args] = command.split(' ')

      // Spawn with detached: true to create a new process group
      const childProcess = spawn(cmd, args, {
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          CI: 'false',
          NO_COLOR: undefined,
        },
      })

      // Store the managed process with its process group ID
      const managedProcess: ManagedProcess = {
        name,
        process: childProcess,
        pgid: childProcess.pid, // In detached mode, PID = PGID
      }
      this.managedProcesses.push(managedProcess)

      // Set up logging
      const prefix = `[${new Date().toLocaleTimeString()}] [${name}]`

      childProcess.stdout?.on('data', (data) => {
        const output = data.toString()
        console.log(`${prefix} ${output}`)
        this.logProcessor.processOutput(name, output)
      })

      childProcess.stderr?.on('data', (data) => {
        const output = data.toString()
        console.error(`${prefix} ${output}`)
        this.logProcessor.processOutput(name, output)
      })

      childProcess.on('error', (error) => {
        console.error(`${prefix} Process error:`, error)
        this.logProcessor.processOutput(name, `Process error: ${error.message}`)
        reject(error)
      })

      childProcess.on('exit', (code, signal) => {
        if (code === 0) {
          console.log(`${prefix} ✅ Process completed successfully`)
          this.logProcessor.processOutput(name, '✅ Process completed successfully')
          resolve()
        } else if (signal) {
          console.log(`${prefix} Process terminated by signal: ${signal}`)
          this.logProcessor.processOutput(name, `Process terminated by signal: ${signal}`)
          resolve() // Don't reject on signal termination
        } else {
          console.error(`${prefix} ❌ Process failed with exit code: ${code}`)
          this.logProcessor.processOutput(name, `❌ Process failed with exit code: ${code}`)
          reject(new Error(`Process ${name} failed with exit code: ${code}`))
        }
      })
    })
  }

  async stop(): Promise<void> {
    console.log('🔴 ProcessManager.stop() called')

    if (this.isRunning && this.managedProcesses.length > 0) {
      console.log(`🎯 Stopping ${this.managedProcesses.length} managed processes...`)

      // Kill all managed process trees
      const killPromises = this.managedProcesses.map(async ({ name, process }) => {
        if (process.pid && !process.killed) {
          console.log(`🌳 Stopping process tree for ${name} (PID: ${process.pid})`)
          await this.killProcessTree(process.pid)
          console.log(`✅ Process tree for ${name} stopped`)
        } else {
          console.log(`⚠️  Process ${name} already dead or no PID`)
        }
      })

      try {
        await Promise.all(killPromises)
        console.log('🎉 All processes stopped successfully')
      } catch (error) {
        console.error('💥 Error stopping processes:', error)
      }

      this.isRunning = false
      this.managedProcesses = []
    } else {
      console.log('ℹ️  ProcessManager: no processes to stop')
    }

    console.log('✅ ProcessManager.stop() complete')
  }
}
