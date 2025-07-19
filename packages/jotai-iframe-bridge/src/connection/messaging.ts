import type { Message } from './types'
import { isMessage, isSynMessage } from './types'

// ==================== Window Messenger ====================

export class WindowMessenger {
  private remoteWindow: Window
  private allowedOrigins: (string | RegExp)[]
  private log: ((...args: unknown[]) => void) | undefined
  private concreteRemoteOrigin?: string
  private messageCallbacks = new Set<(message: Message) => void>()
  private destroyed = false

  constructor(
    remoteWindow: Window,
    allowedOrigins: (string | RegExp)[],
    log?: (...args: unknown[]) => void
  ) {
    if (!remoteWindow) {
      throw new Error('remoteWindow must be defined')
    }

    this.remoteWindow = remoteWindow
    this.allowedOrigins = allowedOrigins.length ? allowedOrigins : [window.origin]
    this.log = log

    window.addEventListener('message', this.handleMessageFromRemoteWindow)
  }

  sendMessage(message: Message, _transferables?: Transferable[]): void {
    if (this.destroyed) {
      throw new Error('WindowMessenger has been destroyed')
    }

    const origin = this.getOriginForSendingMessage(message)
    this.log?.('postMessage', message, origin)
    this.remoteWindow.postMessage(message, origin)
  }

  addMessageHandler = (callback: (message: Message) => void): void => {
    this.messageCallbacks.add(callback)
  }

  removeMessageHandler = (callback: (message: Message) => void): void => {
    this.messageCallbacks.delete(callback)
  }

  destroy = (): void => {
    this.destroyed = true
    window.removeEventListener('message', this.handleMessageFromRemoteWindow)
    this.messageCallbacks.clear()
  }

  private isAllowedOrigin = (origin: string): boolean => {
    return this.allowedOrigins.some((allowedOrigin) =>
      allowedOrigin instanceof RegExp
        ? allowedOrigin.test(origin)
        : allowedOrigin === origin || allowedOrigin === '*'
    )
  }

  private getOriginForSendingMessage = (message: Message): string => {
    if (isSynMessage(message)) {
      return '*'
    }

    if (!this.concreteRemoteOrigin) {
      throw new Error('Concrete remote origin not set')
    }

    return this.concreteRemoteOrigin === 'null' && this.allowedOrigins.includes('*')
      ? '*'
      : this.concreteRemoteOrigin
  }

  private handleMessageFromRemoteWindow = ({ source, origin, data }: MessageEvent): void => {
    if (this.destroyed || source !== this.remoteWindow) {
      return
    }

    if (this.isAllowedOrigin(origin)) {
      if (!this.concreteRemoteOrigin) {
        this.concreteRemoteOrigin = origin
      }

      if (isMessage(data)) {
        this.messageCallbacks.forEach((callback) => callback(data))
      }
    }
  }
}
