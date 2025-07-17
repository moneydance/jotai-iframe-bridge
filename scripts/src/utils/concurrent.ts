import { type ChildProcess, exec, spawn } from 'child_process'
import { promisify } from 'util'
import { safeAssignment } from './safeAssignment.js'

const execAsync = promisify(exec)

interface ManagedProcess {
  name: string
  process: ChildProcess
  pgid?: number
}

interface ConcurrentOptions {
  onOutput?: (name: string, output: string) => void
  onError?: (name: string, error: Error) => void
  onExit?: (name: string, code: number | null, signal: string | null) => void
}

interface SpawnOptions {
  color?: string
  env?: Record<string, string>
}

interface ConcurrentManager {
  spawn(command: string, name: string, options?: SpawnOptions): Promise<void>
  stop(): Promise<void>
  isRunning: boolean
  getProcessCount(): number
}

export function concurrent(options: ConcurrentOptions = {}): ConcurrentManager {
  const managedProcesses: ManagedProcess[] = []
  let isRunning = false

  const findDescendantProcesses = async (parentPid: number): Promise<number[]> => {
    // Use ps to find all processes with the given parent PID
    const [execOk, execError, execResult] = await safeAssignment(() =>
      execAsync(`ps -eo pid,ppid | awk '$2 == ${parentPid} { print $1 }'`)
    )

    if (!execOk) {
      console.warn(`Failed to find descendant processes for ${parentPid}:`, execError)
      return []
    }

    const childPids = execResult.stdout.trim().split('\n').filter(Boolean).map(Number)

    // Recursively find descendants of children
    const allDescendants: number[] = []
    for (const childPid of childPids) {
      allDescendants.push(childPid)
      const grandChildren = await findDescendantProcesses(childPid)
      allDescendants.push(...grandChildren)
    }

    return allDescendants
  }

  const killProcessTree = async (rootPid: number, signal: string = 'SIGINT'): Promise<void> => {
    console.log(`Killing process group for PID: ${rootPid}`)

    // Try to kill the entire process group first
    const [killGroupOk] = safeAssignment(() => process.kill(-rootPid, signal))
    if (killGroupOk) {
      console.log(`Sent ${signal} to process group ${rootPid}`)
    } else {
      console.log(`Failed to kill process group ${rootPid} with ${signal}`)

      // Fallback: try to kill individual processes
      const descendants = await findDescendantProcesses(rootPid)
      const allPids = [rootPid, ...descendants]
      console.log(`Fallback: killing individual processes: ${allPids.join(', ')}`)

      for (const pid of allPids.reverse()) {
        const [killOk] = safeAssignment(() => process.kill(pid, signal))
        if (killOk) {
          console.log(`Killed process ${pid}`)
        } else {
          console.log(`Process ${pid} already dead or not accessible`)
        }
      }
    }

    // Give processes time to shut down gracefully
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Force kill the process group if still alive
    const [forceKillGroupOk] = safeAssignment(() => process.kill(-rootPid, 'SIGKILL'))
    if (forceKillGroupOk) {
      console.log(`Force killed process group ${rootPid}`)
      return
    }

    console.log(`Process group ${rootPid} already terminated or not accessible`)

    // Fallback: force kill individual processes
    const descendants = await findDescendantProcesses(rootPid)
    const allPids = [rootPid, ...descendants]

    for (const pid of allPids) {
      const [forceKillOk] = safeAssignment(() => process.kill(pid, 'SIGKILL'))
      if (forceKillOk) {
        console.log(`Force killed process ${pid}`)
      }
      // Note: No need to log failure here since processes should be dead by now
    }
  }

  const spawnManagedProcess = async (
    command: string,
    name: string,
    spawnOptions: SpawnOptions = {}
  ): Promise<void> => {
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
          LANG: process.env.LANG || 'en_US.UTF-8',
          LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
          TERM: process.env.TERM || 'xterm-256color',
          ...spawnOptions.env,
        },
      })

      // Store the managed process with its process group ID
      const managedProcess: ManagedProcess = {
        name,
        process: childProcess,
        pgid: childProcess.pid, // In detached mode, PID = PGID
      }
      managedProcesses.push(managedProcess)

      // Set up logging
      const prefix = `[${new Date().toLocaleTimeString()}] [${name}]`

      childProcess.stdout?.on('data', (data) => {
        const output = data.toString()
        console.log(`${prefix} ${output}`)
        options.onOutput?.(name, output)
      })

      childProcess.stderr?.on('data', (data) => {
        const output = data.toString()
        console.error(`${prefix} ${output}`)
        options.onOutput?.(name, output)
      })

      childProcess.on('error', (error) => {
        console.error(`${prefix} Process error:`, error)
        options.onError?.(name, error)
        options.onOutput?.(name, `Process error: ${error.message}`)
        reject(error)
      })

      childProcess.on('exit', (code, signal) => {
        if (code === 0) {
          console.log(`${prefix} ✅ Process completed successfully`)
          options.onOutput?.(name, '✅ Process completed successfully')
          options.onExit?.(name, code, signal)
          resolve()
        } else if (signal) {
          console.log(`${prefix} Process terminated by signal: ${signal}`)
          options.onOutput?.(name, `Process terminated by signal: ${signal}`)
          options.onExit?.(name, code, signal)
          resolve() // Don't reject on signal termination
        } else {
          console.error(`${prefix} ❌ Process failed with exit code: ${code}`)
          options.onOutput?.(name, `❌ Process failed with exit code: ${code}`)
          options.onExit?.(name, code, signal)
          reject(new Error(`Process ${name} failed with exit code: ${code}`))
        }
      })
    })
  }

  const stop = async (): Promise<void> => {
    console.log('🔴 Concurrent manager stopping...')

    // Early return if no processes to stop
    if (!isRunning || managedProcesses.length === 0) {
      console.log('ℹ️  Concurrent manager: no processes to stop')
      console.log('✅ Concurrent manager stopped')
      return
    }

    console.log(`🎯 Stopping ${managedProcesses.length} managed processes...`)

    // Kill all managed process trees
    const killPromises = managedProcesses.map(async ({ name, process }) => {
      if (!process.pid || process.killed) {
        console.log(`⚠️  Process ${name} already dead or no PID`)
        return
      }

      console.log(`🌳 Stopping process tree for ${name} (PID: ${process.pid})`)
      await killProcessTree(process.pid)
      console.log(`✅ Process tree for ${name} stopped`)
    })

    // Use safeAssignment for cleaner error handling
    const [success, error] = await safeAssignment(() => Promise.all(killPromises))

    if (success) {
      console.log('🎉 All processes stopped successfully')
    } else {
      console.error('💥 Error stopping processes:', error)
    }

    // Cleanup always happens
    isRunning = false
    managedProcesses.length = 0
    console.log('✅ Concurrent manager stopped')
  }

  return {
    spawn: async (command: string, name: string, spawnOptions?: SpawnOptions): Promise<void> => {
      if (!isRunning) {
        isRunning = true
      }
      return spawnManagedProcess(command, name, spawnOptions)
    },
    stop,
    get isRunning() {
      return isRunning
    },
    getProcessCount(): number {
      return managedProcesses.length
    },
  }
}
