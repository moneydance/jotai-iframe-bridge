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

  sendMessage(message: Message, onError?: (error: Error) => void): boolean {
    if (this.destroyed) {
      const error = new Error('WindowMessenger has been destroyed')
      this.log?.('❌ Failed to send message: WindowMessenger destroyed', message)
      onError?.(error)
      return false
    }

    try {
      const origin = this.getOriginForSendingMessage(message)
      this.log?.('📤 Sending message:', message.type, 'to origin:', origin)
      this.remoteWindow.postMessage(message, origin)
      this.log?.('✅ Message sent successfully:', message.type)
      return true
    } catch (error) {
      const sendError = error instanceof Error ? error : new Error(String(error))
      this.log?.('❌ Failed to send message:', message.type, 'Error:', sendError.message)
      onError?.(sendError)
      return false
    }
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

  private handleMessageFromRemoteWindow = ({ origin, data }: MessageEvent): void => {
    this.log?.('🔔 Received message event:', {
      origin,
      dataType: typeof data,
      isMessage: isMessage(data),
      destroyed: this.destroyed,
    })

    if (this.destroyed) {
      this.log?.('❌ Message ignored: WindowMessenger destroyed')
      return
    }

    if (this.isAllowedOrigin(origin)) {
      if (!this.concreteRemoteOrigin) {
        this.concreteRemoteOrigin = origin
        this.log?.('✅ Set concrete remote origin:', origin)
      }

      if (isMessage(data)) {
        this.log?.(
          '✅ Valid message received, calling',
          this.messageCallbacks.size,
          'callbacks:',
          data
        )
        this.messageCallbacks.forEach((callback) => callback(data))
      }
    } else {
      this.log?.('❌ Message ignored: Origin not allowed:', origin, 'allowed:', this.allowedOrigins)
    }
  }
}
