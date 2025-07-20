import type { WritableAtom } from 'jotai'
import { atom, getDefaultStore } from 'jotai'
import type { ConnectionRegistry } from './ConnectionRegistry'
import { createUniversalMessageHandler, type HandlerConfig } from './handlers'
import { Messages } from './Messages'
import { WindowMessenger } from './messaging'
import { connectRemoteProxy } from './proxy'
import { SessionLifecycle } from './SessionLifecycle'
import type { Message, Methods, RemoteProxy } from './types'

export interface ConnectionConfig<TLocalMethods extends Methods = Methods> {
  methods?: TLocalMethods
  allowedOrigins?: (string | RegExp)[]
  timeout?: number
  log?: (...args: unknown[]) => void
}

// Store type from Jotai
type Store = ReturnType<typeof getDefaultStore>

export class ConnectionSession<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
> {
  private config: ConnectionConfig<TLocalMethods>
  private participantId: string
  private targetWindow: Window
  private registry: ConnectionRegistry
  private lifecycle: SessionLifecycle
  private pairedParticipantAtom: WritableAtom<string | null, [string | null], void>
  private handshakeCompletedAtom: WritableAtom<boolean, [boolean], void>
  private store: Store
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
    this.store = getDefaultStore()
    this.config.log?.(`🔗 Creating ConnectionSession with participant: ${this.participantId}`)

    // Initialize event system
    this.lifecycle = new SessionLifecycle()

    // Initialize handler state atoms (immutable and reactive!)
    this.pairedParticipantAtom = atom<string | null>(null) as WritableAtom<
      string | null,
      [string | null],
      void
    >
    this.handshakeCompletedAtom = atom<boolean>(false) as WritableAtom<boolean, [boolean], void>

    // Initialize messenger
    this.messenger = new WindowMessenger(
      targetWindow,
      config.allowedOrigins || [window.origin],
      config.log
    )

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
      this.store.set(this.handshakeCompletedAtom, true)
      this.clearHandshakeTimeout()
      // Create the remote proxy now that connection is established
      const { remoteProxy } = connectRemoteProxy<TRemoteMethods>(
        this.messenger,
        undefined, // channel
        this.config.log,
        this.config.timeout || 30000
      )
      this.config.log?.(`✅ ConnectionSession established for participant: ${this.participantId}`)
      this.config.log?.(`🔄 Resolving proxy promise for participant: ${this.participantId}`)
      this.proxyPromiseResolve(remoteProxy)
      this.config.log?.(`✅ Proxy promise resolved for participant: ${this.participantId}`)
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
      // Explicitly clear pairing state before destroying
      this.store.set(this.pairedParticipantAtom, null)
      this.store.set(this.handshakeCompletedAtom, false)
      this.config.log?.(`🧹 Cleared pairing state for session: ${this.participantId}`)
      this.destroy()
    })

    // Paired with participant - update state
    this.lifecycle.on('pairedWith', (participantId: string) => {
      this.store.set(this.pairedParticipantAtom, participantId)
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

    this.lifecycle.on('sendDestroy', (participantId: string) => {
      this.messenger.sendMessage(Messages.createDestroy(participantId), (error) =>
        this.config.log?.('Failed to send DESTROY message:', error)
      )
    })
  }

  private registerUniversalHandler(): void {
    const handlerConfig: HandlerConfig = {
      participantId: this.participantId,
      methods: this.config.methods,
      log: this.config.log,
    }

    this.universalHandler = createUniversalMessageHandler(this.lifecycle, handlerConfig, () =>
      Object.freeze({
        pairedParticipantId: this.store.get(this.pairedParticipantAtom),
        handshakeCompleted: this.store.get(this.handshakeCompletedAtom),
      })
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
      if (!this.store.get(this.handshakeCompletedAtom)) {
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

  isDestroyed(): boolean {
    return this.destroyed
  }

  sendDestroyMessage(): void {
    if (this.store.get(this.handshakeCompletedAtom)) {
      this.lifecycle.emit('sendDestroy', this.participantId)
      this.config.log?.(`📤 Sending DESTROY for established session: ${this.participantId}`)
    } else {
      this.config.log?.(`⏭️ Skipping DESTROY for unestablished session: ${this.participantId}`)
    }
  }

  // Clean teardown - the beauty of event-driven architecture!
  destroy(): void {
    if (this.destroyed) {
      this.config.log?.(`⏭️ Skipping destroy for already destroyed session: ${this.participantId}`)
      return // Already destroyed
    }

    this.config.log?.(`🔥 Starting destroy for session: ${this.participantId}`)
    this.destroyed = true

    // Remove self from registry FIRST to prevent automatic recreation during cleanup
    this.config.log?.(`🗑️ Removing session ${this.participantId} from registry`)
    this.registry.delete(this.targetWindow)

    this.sendDestroyMessage()
    this.config.log?.(`🧹 Destroying ConnectionSession for participant: ${this.participantId}`)
    this.messenger.destroy()
    this.config.log?.(`✅ ConnectionSession destroyed for participant: ${this.participantId}`)
  }
}
