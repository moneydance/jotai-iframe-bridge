import { atom } from 'jotai'
import type { LogEntry } from '../classes/DevRunnerConfig.js'

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
