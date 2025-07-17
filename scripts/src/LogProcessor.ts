import type { createStateManager, LogEntry } from './atoms.js'

export class LogProcessor {
  constructor(private stateManager: ReturnType<typeof createStateManager>) {}

  processOutput(processName: string, rawData: string): void {
    const cleanData = this.cleanOutput(rawData)
    if (!cleanData) return

    // Create log entry
    const logEntry = this.createLogEntry(processName, cleanData.trim())

    // Update log buffers with complex logic
    this.updateLogBuffers(processName, logEntry)

    // Extract and store server URLs
    const urls = this.extractUrls(cleanData)
    if (urls.length > 0) {
      urls.forEach((url) => {
        this.stateManager.addServerUrl(processName, url)
      })
    }
  }

  private createLogEntry(processName: string, content: string): LogEntry {
    return {
      timestamp: new Date(),
      content,
      processName,
    }
  }

  private updateLogBuffers(processName: string, logEntry: LogEntry): void {
    const currentBuffers = this.stateManager.getLogBuffers()
    const newBuffers = new Map(currentBuffers)

    // Add to process-specific buffer
    const processBuffer = newBuffers.get(processName) || []
    processBuffer.push(logEntry)
    if (processBuffer.length > 100) {
      processBuffer.shift()
    }
    newBuffers.set(processName, processBuffer)

    // Add to summary buffer
    const summaryBuffer = newBuffers.get('summary') || []
    summaryBuffer.push(logEntry)
    if (summaryBuffer.length > 200) {
      summaryBuffer.shift()
    }
    newBuffers.set('summary', summaryBuffer)

    this.stateManager.setLogBuffers(newBuffers)
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
}
