import { atom, getDefaultStore } from 'jotai'
import { observe } from 'jotai-effect'

export interface LogEntry {
  timestamp: Date
  content: string
  processName: string
}

// Factory function that creates atoms for state only
export function createDevRunnerAtoms() {
  // Core state atoms
  const activeViewAtom = atom<string>('summary')
  const showAllLogsAtom = atom<boolean>(false)
  const logBuffersAtom = atom<Map<string, LogEntry[]>>(new Map())
  const serversAtom = atom<Map<string, string[]>>(new Map())

  // Derived atom for current logs
  const currentLogsAtom = atom((get) => {
    const activeView = get(activeViewAtom)
    const logBuffers = get(logBuffersAtom)
    const showAll = get(showAllLogsAtom)

    const buffer = logBuffers.get(activeView) || []
    return showAll ? buffer : buffer.slice(-100)
  })

  // Derived atom for server URLs
  const serverUrlsAtom = atom((get) => {
    const servers = get(serversAtom)
    const urlEntries: string[] = []

    servers.forEach((urls, processName) => {
      urls.forEach((url) => {
        urlEntries.push(`🌐 ${processName}: ${url}`)
      })
    })

    return urlEntries
  })

  // Return atoms only (no business logic)
  return {
    // Atoms
    activeViewAtom,
    showAllLogsAtom,
    logBuffersAtom,
    serversAtom,
    currentLogsAtom,
    serverUrlsAtom,
  }
}

// State manager factory that creates business logic methods closing over atoms
export function createStateManager(atoms: ReturnType<typeof createDevRunnerAtoms>) {
  const store = getDefaultStore()

  return {
    // View management
    setActiveView: (view: string) => {
      store.set(atoms.activeViewAtom, view)
    },

    getActiveView: () => {
      return store.get(atoms.activeViewAtom)
    },

    toggleShowAllLogs: () => {
      const current = store.get(atoms.showAllLogsAtom)
      store.set(atoms.showAllLogsAtom, !current)
    },

    // Log management
    getLogBuffers: () => {
      return store.get(atoms.logBuffersAtom)
    },

    setLogBuffers: (logBuffers: Map<string, LogEntry[]>) => {
      store.set(atoms.logBuffersAtom, logBuffers)
    },

    initializeLogBuffers: (processNames: string[]) => {
      const logBuffers = new Map<string, LogEntry[]>()

      processNames.forEach((name) => {
        logBuffers.set(name, [])
      })
      logBuffers.set('summary', [])

      store.set(atoms.logBuffersAtom, logBuffers)
      store.set(atoms.serversAtom, new Map())
    },

    // Server management
    addServerUrl: (processName: string, url: string) => {
      const servers = store.get(atoms.serversAtom)
      const urls = servers.get(processName) || []

      if (!urls.includes(url)) {
        urls.push(url)
        servers.set(processName, urls)
        store.set(atoms.serversAtom, new Map(servers))
      }
    },

    // Getters for derived state
    getCurrentLogs: () => {
      return store.get(atoms.currentLogsAtom)
    },

    getServerUrls: () => {
      return store.get(atoms.serverUrlsAtom)
    },

    // Reactive rendering setup
    observeChanges: (renderFunction: () => void) => {
      // Observe changes to any atoms that affect rendering
      const unsubscribe = observe((get) => {
        // Touch all atoms that affect rendering to trigger on any change
        get(atoms.activeViewAtom)
        get(atoms.currentLogsAtom)
        get(atoms.serverUrlsAtom)

        // Trigger re-render
        renderFunction()
      }, store)

      return unsubscribe
    },
  }
}
