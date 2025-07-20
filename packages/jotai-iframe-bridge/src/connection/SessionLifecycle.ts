// Event type definitions for type safety
export interface SessionEvents {
  // Connection lifecycle events
  connectionEstablished: () => void
  connectionFailed: (error: Error) => void
  destroyReceived: (fromParticipantId: string) => void
  pairedWith: (participantId: string) => void

  // Message sending events (for pure handlers)
  sendSyn: (participantId: string) => void
  sendAck1: (fromParticipantId: string, toParticipantId: string) => void
  sendAck2: (fromParticipantId: string, toParticipantId: string) => void
  sendDestroy: (fromParticipantId: string) => void
  sendMethodReply: (callId: string, isError: boolean, value: any) => void
}

export type SessionEventName = keyof SessionEvents

// Pure event emitter - no state, just coordination
export class SessionLifecycle {
  private listeners = new Map<SessionEventName, Function[]>()

  // Type-safe event registration
  on<T extends SessionEventName>(event: T, handler: SessionEvents[T]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)?.push(handler)
  }

  // Type-safe event emission
  emit<T extends SessionEventName>(event: T, ...args: Parameters<SessionEvents[T]>): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(...args)
        } catch (_error) {
          // Handler error - continue with other handlers
        }
      })
    }
  }

  // Remove specific handler
  off<T extends SessionEventName>(event: T, handler: SessionEvents[T]): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler as Function)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  // Remove all handlers for an event
  removeAllListeners(event?: SessionEventName): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  // Debug helper
  getListenerCount(event: SessionEventName): number {
    return this.listeners.get(event)?.length ?? 0
  }
}
