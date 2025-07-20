import type { ConnectionRegistry } from './ConnectionRegistry'
import { createUniversalMessageHandler, type HandlerConfig } from './handlers'
import { Messages } from './Messages'
import { WindowMessenger } from './messaging'
import { connectRemoteProxy } from './proxy'
import { SessionLifecycle } from './SessionLifecycle'
import type { Message, Methods, RemoteProxy } from './types'

export interface ConnectionConfig<TLocalMethods extends Methods = Methods> {
  allowedOrigins: string[]
  methods?: TLocalMethods
  timeout?: number
  log?: (...args: unknown[]) => void
}

// Handler state (managed by ConnectionSession)
interface HandlerState {
  pairedParticipantId: string | null
  handshakeCompleted: boolean
}

const INITIAL_HANDLER_STATE: HandlerState = {
  pairedParticipantId: null,
  handshakeCompleted: false,
}

export class ConnectionSession<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
> {
  private config: ConnectionConfig<TLocalMethods>
  private participantId: string
  private targetWindow: Window
  private registry: ConnectionRegistry
  private lifecycle: SessionLifecycle
  private handlerState: HandlerState
  private messenger: WindowMessenger
  private universalHandler!: (message: Message) => void
  private proxyPromise: Promise<RemoteProxy<TRemoteMethods>>
  private proxyPromiseResolve!: (proxy: RemoteProxy<TRemoteMethods>) => void
  private proxyPromiseReject!: (error: Error) => void
  private timeoutId: NodeJS.Timeout | null = null
  private destroyed = false // Track if session has been destroyed

  constructor(
    targetWindow: Window,
    config: ConnectionConfig<TLocalMethods>,
    participantId: string,
    registry: ConnectionRegistry
  ) {
    this.config = config
    this.participantId = participantId
    this.targetWindow = targetWindow
    this.registry = registry
    this.config.log?.(`🔗 Creating ConnectionSession with participant: ${this.participantId}`)
    // Initialize event system
    this.lifecycle = new SessionLifecycle()

    // Initialize handler state (minimal state pushed up to session level)
    this.handlerState = INITIAL_HANDLER_STATE

    // Initialize messenger
    this.messenger = new WindowMessenger(targetWindow, config.allowedOrigins, config.log)

    // Create promise that will be resolved by event handlers
    this.proxyPromise = new Promise<RemoteProxy<TRemoteMethods>>((resolve, reject) => {
      this.proxyPromiseResolve = resolve
      this.proxyPromiseReject = reject
    })

    // Setup event-driven architecture
    this.setupEventListeners()
    this.registerUniversalHandler()
    this.startHandshake()
  }

  private setupEventListeners(): void {
    // Connection established - create and resolve proxy promise
    this.lifecycle.on('connectionEstablished', () => {
      this.handlerState.handshakeCompleted = true
      this.clearHandshakeTimeout()
      // Create the remote proxy now that connection is established
      const { remoteProxy } = connectRemoteProxy<TRemoteMethods>(
        this.messenger,
        undefined, // channel
        this.config.log,
        this.config.timeout || 30000
      )
      this.config.log?.(`✅ ConnectionSession established for participant: ${this.participantId}`)
      this.proxyPromiseResolve(remoteProxy)
    })

    // Connection failed - reject proxy promise
    this.lifecycle.on('connectionFailed', (error: Error) => {
      this.clearHandshakeTimeout()
      this.config.log?.(`❌ ConnectionSession failed for participant: ${this.participantId}`, error)
      this.proxyPromiseReject(error)
    })

    // Destroy received - reset connection state
    this.lifecycle.on('destroyReceived', (fromParticipantId: string) => {
      this.config.log?.(`🔄 ConnectionSession received DESTROY from: ${fromParticipantId}`)
      this.destroy()
    })

    // Paired with participant - update state
    this.lifecycle.on('pairedWith', (participantId: string) => {
      this.handlerState.pairedParticipantId = participantId
      this.config.log?.(`🔄 Paired with participant: ${participantId}`)
    })

    // Handle send events from pure handlers
    this.lifecycle.on('sendSyn', (participantId: string) => {
      this.messenger.sendMessage(Messages.createSyn(participantId), (error) =>
        this.lifecycle.emit('connectionFailed', error)
      )
    })

    this.lifecycle.on('sendAck1', (fromParticipantId: string, toParticipantId: string) => {
      this.messenger.sendMessage(Messages.createAck1(fromParticipantId, toParticipantId), (error) =>
        this.lifecycle.emit('connectionFailed', error)
      )
    })

    this.lifecycle.on('sendAck2', (fromParticipantId: string, toParticipantId: string) => {
      this.messenger.sendMessage(Messages.createAck2(fromParticipantId, toParticipantId), (error) =>
        this.lifecycle.emit('connectionFailed', error)
      )
    })

    this.lifecycle.on('sendDestroy', (fromParticipantId: string) => {
      this.messenger.sendMessage(Messages.createDestroy(fromParticipantId))
    })

    this.lifecycle.on('sendMethodReply', (callId: string, isError: boolean, value: any) => {
      this.messenger.sendMessage(Messages.createReply(callId, isError, value))
    })
  }

  private registerUniversalHandler(): void {
    const handlerConfig: HandlerConfig = {
      participantId: this.participantId,
      methods: this.config.methods,
      log: this.config.log,
    }

    this.universalHandler = createUniversalMessageHandler(this.lifecycle, handlerConfig, () =>
      Object.freeze({ ...this.handlerState })
    )

    // Register with messenger
    this.messenger.addMessageHandler(this.universalHandler)
    this.config.log?.(
      `🔧 Registered universal message handler for participant: ${this.participantId}`
    )
  }

  private startHandshake(): void {
    // Send initial SYN to start handshake via event system
    this.lifecycle.emit('sendSyn', this.participantId)

    // Set up handshake timeout - directly reject promise
    const timeout = this.config.timeout || 10000
    this.timeoutId = setTimeout(() => {
      if (!this.handlerState.handshakeCompleted) {
        this.config.log?.(
          `⏰ ConnectionSession handshake timeout for participant: ${this.participantId}`
        )
        this.proxyPromiseReject(new Error(`Connection timeout after ${timeout}ms`))
      }
    }, timeout)
  }

  private clearHandshakeTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  // Simple state accessors
  getProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> {
    return this.proxyPromise
  }

  sendDestroyMessage(): void {
    if (this.handlerState.handshakeCompleted) {
      this.lifecycle.emit('sendDestroy', this.participantId)
      this.config.log?.(`📤 Sending DESTROY for established session: ${this.participantId}`)
    } else {
      this.config.log?.(`⏭️ Skipping DESTROY for unestablished session: ${this.participantId}`)
    }
  }

  // Clean teardown - the beauty of event-driven architecture!
  destroy(): void {
    if (this.destroyed) return // Already destroyed

    this.destroyed = true
    this.sendDestroyMessage()
    this.config.log?.(`🧹 Destroying ConnectionSession for participant: ${this.participantId}`)
    this.messenger.destroy()
    // Remove self from registry
    this.registry.delete(this.targetWindow)
    this.config.log?.(`✅ ConnectionSession destroyed for participant: ${this.participantId}`)
  }
}
