import type { ConnectionSession } from '../connection/ConnectionSession'

// Bridge-level events for immediate state management
export interface BridgeEvents {
  sessionCreated: (session: ConnectionSession<any, any>) => void
  sessionDestroyed: (session: ConnectionSession<any, any>) => void
  targetWindowChanged: (window: Window | null) => void
}

export type BridgeEventName = keyof BridgeEvents

// Simple event emitter for bridge lifecycle management
export class BridgeLifecycle {
  private listeners = new Map<BridgeEventName, Function[]>()

  // Type-safe event registration
  on<T extends BridgeEventName>(event: T, handler: BridgeEvents[T]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)?.push(handler)
  }

  // Type-safe event emission
  emit<T extends BridgeEventName>(event: T, ...args: Parameters<BridgeEvents[T]>): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(...args)
        } catch (error) {
          // Handler error - continue with other handlers
          console.warn(`BridgeLifecycle event handler error for ${event}:`, error)
        }
      })
    }
  }

  // Remove specific handler
  off<T extends BridgeEventName>(event: T, handler: BridgeEvents[T]): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler as Function)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  // Remove all handlers for an event
  removeAllListeners(event?: BridgeEventName): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  // Cleanup
  destroy(): void {
    this.listeners.clear()
  }
}
