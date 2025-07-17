import { atom, getDefaultStore } from 'jotai'
import { observe } from 'jotai-effect'
import type { ScriptDefinition } from './ScriptRunnerConfig.js'

export interface LogEntry {
  timestamp: Date
  content: string
}

export type ViewState = 'menu' | 'executing'

// Factory function that creates atoms for state only
export function createScriptRunnerAtoms() {
  // Core state atoms
  const viewStateAtom = atom<ViewState>('menu')
  const currentScriptAtom = atom<ScriptDefinition | null>(null)
  const processOutputAtom = atom<LogEntry[]>([])
  const isProcessRunningAtom = atom<boolean>(false)
  const navigationTriggerAtom = atom<number>(0) // Increment to trigger re-render

  // Derived atom for display state
  const shouldShowMenuAtom = atom((get) => get(viewStateAtom) === 'menu')
  const shouldShowLogsAtom = atom((get) => get(viewStateAtom) === 'executing')

  return {
    // Core atoms
    viewStateAtom,
    currentScriptAtom,
    processOutputAtom,
    isProcessRunningAtom,
    navigationTriggerAtom,

    // Derived atoms
    shouldShowMenuAtom,
    shouldShowLogsAtom,
  }
}

// State manager factory that creates business logic methods closing over atoms
export function createScriptStateManager(atoms: ReturnType<typeof createScriptRunnerAtoms>) {
  const store = getDefaultStore()

  return {
    // View management
    setViewState: (state: ViewState) => {
      store.set(atoms.viewStateAtom, state)
    },

    getViewState: () => {
      return store.get(atoms.viewStateAtom)
    },

    showMenu: () => {
      store.set(atoms.viewStateAtom, 'menu')
    },

    showExecution: () => {
      store.set(atoms.viewStateAtom, 'executing')
    },

    // Script management
    setCurrentScript: (script: ScriptDefinition | null) => {
      store.set(atoms.currentScriptAtom, script)
    },

    getCurrentScript: () => {
      return store.get(atoms.currentScriptAtom)
    },

    // Process management
    setProcessRunning: (running: boolean) => {
      store.set(atoms.isProcessRunningAtom, running)
    },

    isProcessRunning: () => {
      return store.get(atoms.isProcessRunningAtom)
    },

    // Log management
    clearLogs: () => {
      store.set(atoms.processOutputAtom, [])
    },

    addLogEntry: (content: string) => {
      const currentLogs = store.get(atoms.processOutputAtom)
      const newEntry: LogEntry = {
        timestamp: new Date(),
        content: content.trim(),
      }

      // Keep last 1000 entries to prevent memory issues
      const updatedLogs = [...currentLogs, newEntry].slice(-1000)
      store.set(atoms.processOutputAtom, updatedLogs)
    },

    getLogs: () => {
      return store.get(atoms.processOutputAtom)
    },

    // Navigation triggers
    triggerNavigationUpdate: () => {
      const current = store.get(atoms.navigationTriggerAtom)
      store.set(atoms.navigationTriggerAtom, current + 1)
    },

    // Getters for derived state
    shouldShowMenu: () => {
      return store.get(atoms.shouldShowMenuAtom)
    },

    shouldShowLogs: () => {
      return store.get(atoms.shouldShowLogsAtom)
    },

    // Reactive rendering setup
    observeChanges: (renderFunction: () => void) => {
      const unsubscribe = observe((get) => {
        // Touch all atoms that affect rendering to trigger on any change
        get(atoms.viewStateAtom)
        get(atoms.processOutputAtom)
        get(atoms.navigationTriggerAtom)
        get(atoms.isProcessRunningAtom)

        // Trigger re-render
        renderFunction()
      }, store)

      return unsubscribe
    },
  }
}
