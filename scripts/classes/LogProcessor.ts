import { getDefaultStore } from 'jotai'
import type { createDevRunnerAtoms, LogEntry } from '../state/atoms.js'

export class LogProcessor {
  private store = getDefaultStore()

  constructor(private atoms: ReturnType<typeof createDevRunnerAtoms>) {}

  processOutput(processName: string, rawData: string): void {
    const cleanData = this.cleanOutput(rawData)
    if (!cleanData) return

    // Create log entry
    const logEntry = this.addLogEntry(processName, cleanData)

    // Update log buffers
    this.updateLogBuffers(processName, logEntry)

    // Extract and store server URLs
    const urls = this.extractUrls(cleanData)
    if (urls.length > 0) {
      this.updateServerUrls(processName, urls)
    }
  }

  private addLogEntry(processName: string, content: string): LogEntry {
    return {
      timestamp: new Date(),
      content: content.trim(),
      processName,
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

  private cleanOutput(data: string): string {
    const ansiEscapeRegex = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
    return data
      .replace(ansiEscapeRegex, '') // Remove ANSI escape codes
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n') // Handle remaining carriage returns
      .trim()
  }

  private updateLogBuffers(processName: string, logEntry: LogEntry): void {
    const currentBuffers = this.store.get(this.atoms.logBuffersAtom)
    const newBuffers = new Map(currentBuffers)

    // Add to process-specific buffer
    const processBuffer = newBuffers.get(processName) || []
    processBuffer.push(logEntry)
    if (processBuffer.length > 2000) {
      processBuffer.shift()
    }
    newBuffers.set(processName, processBuffer)

    // Add to summary buffer
    const summaryBuffer = newBuffers.get('summary') || []
    summaryBuffer.push(logEntry)
    if (summaryBuffer.length > 5000) {
      summaryBuffer.shift()
    }
    newBuffers.set('summary', summaryBuffer)

    this.store.set(this.atoms.logBuffersAtom, newBuffers)
  }

  private updateServerUrls(processName: string, urls: string[]): void {
    const currentServers = this.store.get(this.atoms.serversAtom)
    const newServers = new Map(currentServers)
    newServers.set(processName, urls)
    this.store.set(this.atoms.serversAtom, newServers)
  }
}
