import type { Command } from 'concurrently'
import type { createStateManager, LogEntry } from './atoms.js'

export class LogProcessor {
  constructor(private stateManager: ReturnType<typeof createStateManager>) {}

  processCommand(command: Command): void {
    const processName = command.name

    command.stdout.subscribe((data) => {
      this.processOutput(processName, data.toString())
    })

    command.stderr.subscribe((data) => {
      this.processOutput(processName, data.toString())
    })

    command.error.subscribe((error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.processOutput(processName, `Process error: ${message}`)
    })

    command.close.subscribe((exitInfo) => {
      if (exitInfo.exitCode === 0) {
        this.processOutput(processName, `✅ Process completed successfully`)
      } else {
        this.processOutput(processName, `❌ Process failed with exit code: ${exitInfo.exitCode}`)
      }
    })
  }

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
    // Remove problematic ANSI escape codes but preserve colors
    const ESC = String.fromCharCode(27)
    return (
      data
        // Remove cursor movement and positioning codes
        .replace(new RegExp(`${ESC}\\[[0-9]+[ABCD]`, 'g'), '') // Cursor up/down/forward/back
        .replace(new RegExp(`${ESC}\\[[0-9]+;[0-9]+[Hf]`, 'g'), '') // Cursor position
        .replace(new RegExp(`${ESC}\\[[0-9]*[JK]`, 'g'), '') // Clear screen/line
        .replace(new RegExp(`${ESC}\\[s`, 'g'), '') // Save cursor position
        .replace(new RegExp(`${ESC}\\[u`, 'g'), '') // Restore cursor position
        .replace(new RegExp(`${ESC}\\[2J`, 'g'), '') // Clear entire screen
        .replace(new RegExp(`${ESC}\\[H`, 'g'), '') // Move cursor to home
        // Remove carriage returns that interfere with line-by-line display
        .replace(/\r(?!\n)/g, '') // Remove standalone carriage returns
        .replace(/\r\n/g, '\n') // Normalize CRLF to LF
        // Keep color codes: \x1b[<numbers>m (including semicolon-separated ones)
        // This preserves foreground, background, and style codes
        .trim()
    )
  }
}
