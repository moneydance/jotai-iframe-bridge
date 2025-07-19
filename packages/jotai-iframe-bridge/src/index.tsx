import { atom, getDefaultStore, useAtomValue } from 'jotai'
import { loadable } from 'jotai/utils'
import { observe } from 'jotai-effect'
import { createContext, type ReactNode, useContext } from 'react'

// ==================== Core Types ====================

export type Methods = Record<string, (...args: unknown[]) => unknown>

export type MethodPath = string[]

export type RemoteProxy<T extends Methods> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R ? (...args: P) => Promise<R> : never
}

export interface ConnectionConfig<TLocalMethods extends Methods = Methods> {
  allowedOrigins: string[]
  methods?: TLocalMethods
  timeout?: number
  log?: (...args: unknown[]) => void
}

export interface ChildConnectionConfig<TLocalMethods extends Methods = Methods> {
  parentOrigin: string | string[]
  methods?: TLocalMethods
  timeout?: number
  log?: (...args: unknown[]) => void
}

// Store type from Jotai
type Store = ReturnType<typeof getDefaultStore>

// ==================== Message Types ====================

const NAMESPACE = 'jotai-iframe-bridge'

type MessageBase = {
  namespace: string
  channel?: string
}

export type SynMessage = MessageBase & {
  type: 'SYN'
  participantId: string
}

export type Ack1Message = MessageBase & {
  type: 'ACK1'
  methodPaths?: string[]
}

export type Ack2Message = MessageBase & {
  type: 'ACK2'
}

export type CallMessage = MessageBase & {
  type: 'CALL'
  id: string
  methodPath: MethodPath
  args: unknown[]
}

export type ReplyMessage = MessageBase & {
  type: 'REPLY'
  callId: string
} & (
    | {
        value: unknown
        isError?: false
      }
    | {
        value: unknown
        isError: true
      }
  )

export type DestroyMessage = MessageBase & {
  type: 'DESTROY'
}

export type Message =
  | SynMessage
  | Ack1Message
  | Ack2Message
  | CallMessage
  | ReplyMessage
  | DestroyMessage

// ==================== Utility Functions ====================

function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

function formatMethodPath(methodPath: MethodPath): string {
  return methodPath.join('.')
}

function isMessage(data: unknown): data is Message {
  return (
    typeof data === 'object' &&
    data !== null &&
    'namespace' in data &&
    'type' in data &&
    (data as any).namespace === NAMESPACE
  )
}

function isSynMessage(message: Message): message is SynMessage {
  return message.type === 'SYN'
}

function isAck1Message(message: Message): message is Ack1Message {
  return message.type === 'ACK1'
}

function isAck2Message(message: Message): message is Ack2Message {
  return message.type === 'ACK2'
}

function isCallMessage(message: Message): message is CallMessage {
  return message.type === 'CALL'
}

function isReplyMessage(message: Message): message is ReplyMessage {
  return message.type === 'REPLY'
}

function getMethodAtMethodPath(methodPath: MethodPath, methods: Methods): Function | undefined {
  let current: any = methods
  for (const prop of methodPath) {
    if (current && typeof current === 'object' && prop in current) {
      current = current[prop]
    } else {
      return undefined
    }
  }
  return typeof current === 'function' ? current : undefined
}

// ==================== Window Messenger ====================

interface WindowMessenger {
  sendMessage(message: Message, transferables?: Transferable[]): void
  addMessageHandler(callback: (message: Message) => void): void
  removeMessageHandler(callback: (message: Message) => void): void
  destroy(): void
}

class WindowMessengerImpl implements WindowMessenger {
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

    if (!isMessage(data)) {
      return
    }

    if (!this.isAllowedOrigin(origin)) {
      this.log?.(
        `Received a message from origin \`${origin}\` which did not match ` +
          `allowed origins \`[${this.allowedOrigins.join(', ')}]\``
      )
      return
    }

    // Set concrete remote origin for both SYN and ACK messages
    if (isSynMessage(data) || isAck1Message(data) || isAck2Message(data)) {
      this.concreteRemoteOrigin = origin
    }

    for (const callback of this.messageCallbacks) {
      callback(data)
    }
  }
}

// ==================== Deferred Promise Utility ====================

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  status: 'pending' | 'resolved' | 'rejected'
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  let status: Deferred<T>['status'] = 'pending'

  const promise = new Promise<T>((res, rej) => {
    resolve = (value: T) => {
      status = 'resolved'
      res(value)
    }
    reject = (reason: unknown) => {
      status = 'rejected'
      rej(reason)
    }
  })

  return { promise, resolve, reject, status }
}

// ==================== Connection Interface ====================

export interface Connection<T extends Methods = Methods> {
  promise: Promise<RemoteProxy<T>>
  destroy: () => void
}

class ConnectionImpl<T extends Methods = Methods> implements Connection<T> {
  public promise: Promise<RemoteProxy<T>>
  private destroyFn: () => void
  private _destroyed = false

  constructor(promise: Promise<RemoteProxy<T>>, destroyFn: () => void) {
    this.promise = promise
    this.destroyFn = destroyFn
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this.destroyFn()
  }

  get destroyed(): boolean {
    return this._destroyed
  }
}

// ==================== Remote Proxy Creation ====================

type ReplyHandler = {
  methodPath: MethodPath
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeoutId?: number
}

function createRemoteProxy<T extends Methods>(
  callback: (path: MethodPath, args: unknown[]) => Promise<unknown>,
  log?: (...args: unknown[]) => void,
  path: MethodPath = []
): RemoteProxy<T> {
  return new Proxy(
    path.length
      ? () => {
          // Intentionally empty
        }
      : Object.create(null),
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return
        }
        return createRemoteProxy(callback, log, [...path, prop])
      },
      apply(_target, _thisArg, args) {
        return callback(path, args)
      },
    }
  ) as RemoteProxy<T>
}

function connectRemoteProxy<T extends Methods>(
  messenger: WindowMessenger,
  channel: string | undefined,
  log?: (...args: unknown[]) => void,
  timeout?: number
): { remoteProxy: RemoteProxy<T>; destroy: () => void } {
  let isDestroyed = false
  const replyHandlers = new Map<string, ReplyHandler>()

  const handleMessage = (message: Message) => {
    if (!isReplyMessage(message)) {
      return
    }

    const { callId, value, isError } = message
    const replyHandler = replyHandlers.get(callId)

    if (!replyHandler) {
      return
    }

    replyHandlers.delete(callId)
    clearTimeout(replyHandler.timeoutId)

    log?.(`Received ${formatMethodPath(replyHandler.methodPath)}() reply`, message)

    if (isError) {
      replyHandler.reject(value)
    } else {
      replyHandler.resolve(value)
    }
  }

  messenger.addMessageHandler(handleMessage)

  const remoteProxy = createRemoteProxy<T>((methodPath, args) => {
    if (isDestroyed) {
      return Promise.reject(
        new Error(
          `Method call ${formatMethodPath(methodPath)}() failed due to destroyed connection`
        )
      )
    }

    const callId = generateId()

    return new Promise((resolve, reject) => {
      const timeoutId =
        timeout !== undefined
          ? window.setTimeout(() => {
              replyHandlers.delete(callId)
              reject(
                new Error(
                  `Method call ${formatMethodPath(methodPath)}() timed out after ${timeout}ms`
                )
              )
            }, timeout)
          : undefined

      replyHandlers.set(callId, {
        methodPath,
        resolve,
        reject,
        ...(timeoutId !== undefined && { timeoutId }),
      })

      try {
        const callMessage: CallMessage = {
          namespace: NAMESPACE,
          ...(channel !== undefined && { channel }),
          type: 'CALL',
          id: callId,
          methodPath,
          args,
        }
        log?.(`Sending ${formatMethodPath(methodPath)}() call`, callMessage)
        messenger.sendMessage(callMessage)
      } catch (error) {
        replyHandlers.delete(callId)
        clearTimeout(timeoutId)
        reject(new Error(`Transmission failed: ${(error as Error).message}`))
      }
    })
  }, log)

  const destroy = () => {
    isDestroyed = true
    messenger.removeMessageHandler(handleMessage)

    for (const { methodPath, reject, timeoutId } of replyHandlers.values()) {
      clearTimeout(timeoutId)
      reject(
        new Error(
          `Method call ${formatMethodPath(methodPath)}() failed due to destroyed connection`
        )
      )
    }

    replyHandlers.clear()
  }

  return {
    remoteProxy,
    destroy,
  }
}

// ==================== Call Handler ====================

function connectCallHandler(
  messenger: WindowMessenger,
  methods: Methods,
  channel: string | undefined,
  log?: (...args: unknown[]) => void
): () => void {
  let isDestroyed = false

  const handleMessage = async (message: Message) => {
    if (isDestroyed || !isCallMessage(message)) {
      return
    }

    log?.(`Received ${formatMethodPath(message.methodPath)}() call`, message)

    const { methodPath, args, id: callId } = message
    let replyMessage: ReplyMessage

    try {
      const method = getMethodAtMethodPath(methodPath, methods)

      if (!method) {
        throw new Error(`Method \`${formatMethodPath(methodPath)}\` is not found.`)
      }

      const value = await method(...args)

      replyMessage = {
        namespace: NAMESPACE,
        ...(channel !== undefined && { channel }),
        type: 'REPLY',
        callId,
        value,
      }
    } catch (error) {
      replyMessage = {
        namespace: NAMESPACE,
        ...(channel !== undefined && { channel }),
        type: 'REPLY',
        callId,
        value: error instanceof Error ? error.message : String(error),
        isError: true,
      }
    }

    if (isDestroyed) {
      return
    }

    try {
      log?.(`Sending ${formatMethodPath(methodPath)}() reply`, replyMessage)
      messenger.sendMessage(replyMessage)
    } catch (error) {
      log?.('Failed to send reply:', error)
    }
  }

  messenger.addMessageHandler(handleMessage)

  return () => {
    isDestroyed = true
    messenger.removeMessageHandler(handleMessage)
  }
}

// ==================== Reactive Iframe Bridge ====================

type LoadableAtom<T> = ReturnType<typeof loadable<T>>

interface ReactiveIframeBridge<TRemoteMethods extends Methods = Methods> {
  init(remoteWindow: Window): void
  isInitialized(): boolean
  getConnectionPromise(): Promise<Connection<TRemoteMethods>>
  getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>>
  getConnectionAtom(): ReturnType<typeof loadable<Connection<TRemoteMethods>>>
  getRemoteProxyAtom(): ReturnType<typeof loadable<RemoteProxy<TRemoteMethods>>>
  destroy(): void
  cleanup(): void
  retry(): void
}

function createReactiveIframeBridge<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(
  config: ConnectionConfig<TLocalMethods>,
  store: Store = getDefaultStore()
): ReactiveIframeBridge<TRemoteMethods> {
  // Core atoms
  const remoteWindowAtom = atom<Window | null>(null)
  const participantIdAtom = atom(generateId())

  // Messenger atom - creates messenger when window is available
  const messengerAtom = atom<WindowMessenger | null>((get) => {
    const remoteWindow = get(remoteWindowAtom)
    if (!remoteWindow) {
      return null
    }

    const messenger = new WindowMessengerImpl(remoteWindow, config.allowedOrigins, config.log)
    return messenger
  })

  // Connection state atoms
  const connectionDeferredAtom = atom(createDeferred<Connection<TRemoteMethods>>())
  const connectionPromiseAtom = atom(async (get) => get(connectionDeferredAtom).promise)
  const remoteProxyPromiseAtom = atom(async (get) => {
    const connection = await get(connectionPromiseAtom)
    return connection.promise
  })

  // Loadable atoms for React integration
  const connectionAtom = loadable(connectionPromiseAtom)
  const remoteProxyAtom = loadable(remoteProxyPromiseAtom)

  // Effect to manage connection lifecycle based on messenger changes
  const updateConnectionOnMessengerChange = () => {
    return observe((get: any, set: any) => {
      const messenger = get(messengerAtom)

      if (!messenger) {
        // Reset connection when messenger is null
        const connectionDeferred = get.peek(connectionDeferredAtom)
        if (connectionDeferred.status !== 'pending') {
          set(connectionDeferredAtom, createDeferred<Connection<TRemoteMethods>>())
        }
        return
      }

      // Start handshake process
      const participantId = get(participantIdAtom)
      const synMessage: SynMessage = {
        namespace: NAMESPACE,
        type: 'SYN',
        participantId,
      }

      let handshakeCompleted = false
      const handshakeTimeout = config.timeout || 10000
      let callHandlerDestroy: (() => void) | null = null

      // Set up call handler for incoming method calls
      if (config.methods) {
        callHandlerDestroy = connectCallHandler(
          messenger,
          config.methods,
          undefined, // channel
          config.log
        )
      }

      // Set up handshake message handler
      const handleHandshakeMessage = (message: Message) => {
        config.log?.('📨 Handshake handler received message:', message.type, message)

        if (handshakeCompleted) {
          config.log?.('⚠️ Handshake already completed, ignoring message')
          return
        }

        if (isSynMessage(message)) {
          config.log?.('Received SYN message from participant:', message.participantId)

          // Send another SYN in case the other participant wasn't ready for our first one
          try {
            messenger.sendMessage(synMessage)
            config.log?.('Sent additional SYN message')
          } catch (error) {
            config.log?.('Failed to send additional SYN:', error)
          }

          // Determine leadership by comparing participant IDs (lexicographical)
          const isHandshakeLeader = participantId > message.participantId
          config.log?.(
            `Leadership check: ${participantId} > ${message.participantId} = ${isHandshakeLeader}`
          )

          if (isHandshakeLeader) {
            // We are the leader, send ACK1
            const ack1Message: Ack1Message = {
              namespace: NAMESPACE,
              type: 'ACK1',
            }

            try {
              config.log?.('Sending ACK1 message as leader', ack1Message)
              messenger.sendMessage(ack1Message)
            } catch (error) {
              config.log?.('Failed to send ACK1:', error)
              get
                .peek(connectionDeferredAtom)
                .reject(new Error(`Failed to send ACK1: ${(error as Error).message}`))
            }
          }
          // If not leader, wait for ACK1 from the leader
        } else if (isAck1Message(message)) {
          config.log?.('Received ACK1 message, sending ACK2 response')

          // Respond with ACK2
          const ack2Message: Ack2Message = {
            namespace: NAMESPACE,
            type: 'ACK2',
          }

          try {
            messenger.sendMessage(ack2Message)
            config.log?.('Sent ACK2 response')
          } catch (error) {
            config.log?.('Failed to send ACK2:', error)
            get
              .peek(connectionDeferredAtom)
              .reject(new Error(`Failed to send ACK2: ${(error as Error).message}`))
            return
          }

          // Establish connection (follower establishes after sending ACK2)
          handshakeCompleted = true
          messenger.removeMessageHandler(handleHandshakeMessage)

          const { remoteProxy, destroy } = connectRemoteProxy<TRemoteMethods>(
            messenger,
            undefined,
            config.log,
            config.timeout
          )

          const connection = new ConnectionImpl<TRemoteMethods>(
            Promise.resolve(remoteProxy),
            destroy
          )

          get.peek(connectionDeferredAtom).resolve(connection)
          config.log?.('Connection established successfully (follower)')
        } else if (isAck2Message(message)) {
          config.log?.('Received ACK2 message, establishing connection')

          // Establish connection (leader establishes after receiving ACK2)
          handshakeCompleted = true
          messenger.removeMessageHandler(handleHandshakeMessage)

          const { remoteProxy, destroy } = connectRemoteProxy<TRemoteMethods>(
            messenger,
            undefined,
            config.log,
            config.timeout
          )

          const connection = new ConnectionImpl<TRemoteMethods>(
            Promise.resolve(remoteProxy),
            destroy
          )

          get.peek(connectionDeferredAtom).resolve(connection)
          config.log?.('Connection established successfully (leader)')
        } else {
          config.log?.('📨 Ignoring non-handshake message:', message.type)
        }
      }

      config.log?.('🔗 Adding handshake message handler')
      messenger.addMessageHandler(handleHandshakeMessage)

      // Send SYN message
      try {
        config.log?.('Sending SYN message', synMessage)
        messenger.sendMessage(synMessage)
      } catch (error) {
        get
          .peek(connectionDeferredAtom)
          .reject(new Error(`Failed to send SYN: ${(error as Error).message}`))
        return
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!handshakeCompleted) {
          messenger.removeMessageHandler(handleHandshakeMessage)
          get
            .peek(connectionDeferredAtom)
            .reject(new Error(`Connection timeout after ${handshakeTimeout}ms`))
        }
      }, handshakeTimeout)

      // Return cleanup function
      return () => {
        clearTimeout(timeoutId)
        messenger.removeMessageHandler(handleHandshakeMessage)
        if (callHandlerDestroy) {
          callHandlerDestroy()
        }
        messenger.destroy()
      }
    }, store)
  }

  const unsubscribeFromMessengerChange = updateConnectionOnMessengerChange()

  return {
    init(remoteWindow: Window) {
      store.set(remoteWindowAtom, remoteWindow)
    },

    isInitialized(): boolean {
      return store.get(connectionAtom).state === 'hasData'
    },

    getConnectionPromise(): Promise<Connection<TRemoteMethods>> {
      return store.get(connectionPromiseAtom)
    },

    getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> {
      return store.get(remoteProxyPromiseAtom)
    },

    getConnectionAtom(): LoadableAtom<Connection<TRemoteMethods>> {
      return connectionAtom
    },

    getRemoteProxyAtom(): LoadableAtom<RemoteProxy<TRemoteMethods>> {
      return remoteProxyAtom
    },

    retry(): void {
      const window = store.get(remoteWindowAtom)
      this.destroy()
      if (!window) {
        return
      }
      this.init(window)
    },

    destroy(): void {
      store.set(remoteWindowAtom, null)
      unsubscribeFromMessengerChange()
    },

    cleanup(): void {
      unsubscribeFromMessengerChange()
    },
  }
}

// ==================== New Parent/Child Pattern ====================

export interface ParentBridge<
  _TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> {
  id: string
  init(iframeElement: HTMLIFrameElement): void
  connect(): void
  isInitialized(): boolean
  getConnectionPromise(): Promise<Connection<TRemoteMethods>>
  getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>>
  getConnectionAtom(): ReturnType<typeof loadable<Connection<TRemoteMethods>>>
  getRemoteProxyAtom(): ReturnType<typeof loadable<RemoteProxy<TRemoteMethods>>>
  getChildReadyAtom(): ReturnType<typeof atom<boolean>>
  getDebugState(): {
    hasIframeElement: boolean
    iframeReady: boolean
    connectionRequested: boolean
    connectionState: string
  }
  destroy(): void
  cleanup(): void
  retry(): void
}

export interface ChildBridge<
  _TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> {
  id: string
  connect(): void
  isInitialized(): boolean
  getConnectionPromise(): Promise<Connection<TRemoteMethods>>
  getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>>
  getConnectionAtom(): ReturnType<typeof loadable<Connection<TRemoteMethods>>>
  getRemoteProxyAtom(): ReturnType<typeof loadable<RemoteProxy<TRemoteMethods>>>
  destroy(): void
  cleanup(): void
  retry(): void
}

export function createParentBridge<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(
  config: ConnectionConfig<TLocalMethods>,
  store: Store = getDefaultStore()
): ParentBridge<TLocalMethods, TRemoteMethods> {
  // Generate unique ID for this bridge instance
  const bridgeId = generateId()
  config.log?.(`🆔 Creating ParentBridge with ID: ${bridgeId}`)

  // Internal atoms for managing iframe state
  const iframeElementAtom = atom<HTMLIFrameElement | null>(null)
  const iframeReadyAtom = atom<boolean>(false)
  const connectionRequestedAtom = atom<boolean>(false)

  // Observe iframe element changes and set up load listeners
  observe((get, set) => {
    const iframeElement = get(iframeElementAtom)

    config.log?.(
      '🔍 Observer: iframeElement changed:',
      iframeElement ? 'HTMLIFrameElement set' : 'null'
    )

    if (!iframeElement) {
      config.log?.('🔍 Observer: Setting iframeReadyAtom to false (no iframe element)')
      set(iframeReadyAtom, false)
      return
    }

    const handleLoad = () => {
      config.log?.('🎉 Load event fired! Setting iframeReadyAtom to true')
      set(iframeReadyAtom, true)
      config.log?.('Iframe loaded and ready for connection')
    }

    // Never access contentDocument - just use load event listener
    config.log?.('🔧 Observer: Adding load event listener to iframe')
    iframeElement.addEventListener('load', handleLoad, { once: true })

    // Return cleanup function to remove listener if iframe element changes
    return () => {
      config.log?.('🧹 Observer cleanup: Removing load event listener')
      iframeElement.removeEventListener('load', handleLoad)
    }
  }, store)

  // Derived atom - only create messenger when both iframe element is set AND iframe is ready AND connection is requested
  const messengerAtom = atom<WindowMessenger | null>((get) => {
    const iframeElement = get(iframeElementAtom)
    const iframeReady = get(iframeReadyAtom)
    const connectionRequested = get(connectionRequestedAtom)

    config.log?.('📊 Messenger check:', {
      hasIframeElement: !!iframeElement,
      hasContentWindow: !!iframeElement?.contentWindow,
      iframeReady,
      connectionRequested,
    })

    if (!iframeElement?.contentWindow || !iframeReady || !connectionRequested) {
      config.log?.('❌ Messenger not ready - returning null')
      return null
    }

    config.log?.('🎯 Creating WindowMessenger - all conditions met!')
    const messenger = new WindowMessengerImpl(
      iframeElement.contentWindow,
      config.allowedOrigins,
      config.log
    )
    return messenger
  })

  // Connection state atoms
  const connectionDeferredAtom = atom(createDeferred<Connection<TRemoteMethods>>())

  // Lazy connection promise - only starts when connectionRequestedAtom is true
  const connectionPromiseAtom = atom(async (get) => {
    const connectionRequested = get(connectionRequestedAtom)
    if (!connectionRequested) {
      // Return a never-resolving promise for pending state
      return new Promise<Connection<TRemoteMethods>>(() => {})
    }
    return get(connectionDeferredAtom).promise
  })

  const remoteProxyPromiseAtom = atom(async (get) => {
    const connection = await get(connectionPromiseAtom)
    return connection.promise
  })

  // Loadable atoms for React integration
  const connectionAtom = loadable(connectionPromiseAtom)
  const remoteProxyAtom = loadable(remoteProxyPromiseAtom)

  // Effect to manage connection lifecycle based on messenger changes
  const updateConnectionOnMessengerChange = () => {
    return observe((get: any, set: any) => {
      const messenger = get(messengerAtom)

      if (!messenger) {
        // Reset connection when messenger is null
        const connectionDeferred = get.peek(connectionDeferredAtom)
        if (connectionDeferred.status !== 'pending') {
          set(connectionDeferredAtom, createDeferred<Connection<TRemoteMethods>>())
        }
        return
      }

      // Start handshake process (same as existing implementation)
      const participantId = generateId()
      const synMessage: SynMessage = {
        namespace: NAMESPACE,
        type: 'SYN',
        participantId,
      }

      let handshakeCompleted = false
      const handshakeTimeout = config.timeout || 10000
      let callHandlerDestroy: (() => void) | null = null

      // Set up call handler for incoming method calls
      if (config.methods) {
        callHandlerDestroy = connectCallHandler(
          messenger,
          config.methods,
          undefined, // channel
          config.log
        )
      }

      // Set up handshake message handler
      const handleHandshakeMessage = (message: Message) => {
        config.log?.('📨 Handshake handler received message:', message.type, message)

        if (handshakeCompleted) {
          config.log?.('⚠️ Handshake already completed, ignoring message')
          return
        }

        if (isSynMessage(message)) {
          config.log?.('Received SYN message from participant:', message.participantId)

          // Send another SYN in case the other participant wasn't ready for our first one
          try {
            messenger.sendMessage(synMessage)
            config.log?.('Sent additional SYN message')
          } catch (error) {
            config.log?.('Failed to send additional SYN:', error)
          }

          // Determine leadership by comparing participant IDs (lexicographical)
          const isHandshakeLeader = participantId > message.participantId
          config.log?.(
            `Leadership check: ${participantId} > ${message.participantId} = ${isHandshakeLeader}`
          )

          if (isHandshakeLeader) {
            // We are the leader, send ACK1
            const ack1Message: Ack1Message = {
              namespace: NAMESPACE,
              type: 'ACK1',
            }

            try {
              config.log?.('Sending ACK1 message as leader', ack1Message)
              messenger.sendMessage(ack1Message)
            } catch (error) {
              config.log?.('Failed to send ACK1:', error)
              get
                .peek(connectionDeferredAtom)
                .reject(new Error(`Failed to send ACK1: ${(error as Error).message}`))
            }
          }
          // If not leader, wait for ACK1 from the leader
        } else if (isAck1Message(message)) {
          config.log?.('Received ACK1 message, sending ACK2 response')

          // Respond with ACK2
          const ack2Message: Ack2Message = {
            namespace: NAMESPACE,
            type: 'ACK2',
          }

          try {
            messenger.sendMessage(ack2Message)
            config.log?.('Sent ACK2 response')
          } catch (error) {
            config.log?.('Failed to send ACK2:', error)
            get
              .peek(connectionDeferredAtom)
              .reject(new Error(`Failed to send ACK2: ${(error as Error).message}`))
            return
          }

          // Establish connection (follower establishes after sending ACK2)
          handshakeCompleted = true
          messenger.removeMessageHandler(handleHandshakeMessage)

          const { remoteProxy, destroy } = connectRemoteProxy<TRemoteMethods>(
            messenger,
            undefined,
            config.log,
            config.timeout
          )

          const connection = new ConnectionImpl<TRemoteMethods>(
            Promise.resolve(remoteProxy),
            destroy
          )

          get.peek(connectionDeferredAtom).resolve(connection)
          config.log?.('Connection established successfully (follower)')
        } else if (isAck2Message(message)) {
          config.log?.('Received ACK2 message, establishing connection')

          // Establish connection (leader establishes after receiving ACK2)
          handshakeCompleted = true
          messenger.removeMessageHandler(handleHandshakeMessage)

          const { remoteProxy, destroy } = connectRemoteProxy<TRemoteMethods>(
            messenger,
            undefined,
            config.log,
            config.timeout
          )

          const connection = new ConnectionImpl<TRemoteMethods>(
            Promise.resolve(remoteProxy),
            destroy
          )

          get.peek(connectionDeferredAtom).resolve(connection)
          config.log?.('Connection established successfully (leader)')
        } else {
          config.log?.('📨 Ignoring non-handshake message:', message.type)
        }
      }

      messenger.addMessageHandler(handleHandshakeMessage)

      // Send SYN message
      try {
        config.log?.('Sending SYN message', synMessage)
        messenger.sendMessage(synMessage)
      } catch (error) {
        get
          .peek(connectionDeferredAtom)
          .reject(new Error(`Failed to send SYN: ${(error as Error).message}`))
        return
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!handshakeCompleted) {
          messenger.removeMessageHandler(handleHandshakeMessage)
          get
            .peek(connectionDeferredAtom)
            .reject(new Error(`Connection timeout after ${handshakeTimeout}ms`))
        }
      }, handshakeTimeout)

      // Return cleanup function
      return () => {
        clearTimeout(timeoutId)
        messenger.removeMessageHandler(handleHandshakeMessage)
        if (callHandlerDestroy) {
          callHandlerDestroy()
        }
        messenger.destroy()
      }
    }, store)
  }

  const unsubscribeFromMessengerChange = updateConnectionOnMessengerChange()

  return {
    id: bridgeId,
    init(iframeElement: HTMLIFrameElement) {
      config.log?.(
        `🚀 Bridge ${bridgeId} init() called with iframe element:`,
        iframeElement.tagName,
        iframeElement.src
      )
      store.set(iframeElementAtom, iframeElement)
      config.log?.(`✅ Bridge ${bridgeId} init() complete - iframeElementAtom set`)
    },

    connect() {
      config.log?.(`🔗 Bridge ${bridgeId} connect() called`)
      store.set(connectionRequestedAtom, true)
      config.log?.(`Parent bridge ${bridgeId} connect() called, waiting for iframe ready state`)
    },

    isInitialized(): boolean {
      return store.get(connectionAtom).state === 'hasData'
    },

    getConnectionPromise(): Promise<Connection<TRemoteMethods>> {
      return store.get(connectionPromiseAtom)
    },

    getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>> {
      return store.get(remoteProxyPromiseAtom)
    },

    getConnectionAtom(): LoadableAtom<Connection<TRemoteMethods>> {
      return connectionAtom
    },

    getRemoteProxyAtom(): LoadableAtom<RemoteProxy<TRemoteMethods>> {
      return remoteProxyAtom
    },

    getChildReadyAtom(): ReturnType<typeof atom<boolean>> {
      return iframeReadyAtom
    },

    // Debug method to check current state
    getDebugState() {
      const currentState = {
        hasIframeElement: !!store.get(iframeElementAtom),
        iframeReady: store.get(iframeReadyAtom),
        connectionRequested: store.get(connectionRequestedAtom),
        connectionState: store.get(connectionAtom).state,
      }
      config.log?.('🐛 Debug state:', currentState)
      return currentState
    },

    retry(): void {
      // Reset connection state and try again
      store.set(connectionRequestedAtom, false)
      store.set(connectionDeferredAtom, createDeferred<Connection<TRemoteMethods>>())
      store.set(connectionRequestedAtom, true)
    },

    destroy(): void {
      store.set(iframeElementAtom, null)
      store.set(iframeReadyAtom, false)
      store.set(connectionRequestedAtom, false)
      unsubscribeFromMessengerChange()
    },

    cleanup(): void {
      unsubscribeFromMessengerChange()
    },
  }
}

export function createChildBridge<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(
  config: ChildConnectionConfig<TLocalMethods>,
  store?: Store
): ChildBridge<TLocalMethods, TRemoteMethods> {
  // Generate unique ID for this bridge instance
  const bridgeId = generateId()
  config.log?.(`🆔 Creating ChildBridge with ID: ${bridgeId}`)

  // Convert ChildConnectionConfig to ConnectionConfig
  const parentOrigins = Array.isArray(config.parentOrigin)
    ? config.parentOrigin
    : [config.parentOrigin]

  const bridgeConfig: ConnectionConfig<TLocalMethods> = {
    allowedOrigins: parentOrigins,
    ...(config.methods !== undefined && { methods: config.methods }),
    ...(config.timeout !== undefined && { timeout: config.timeout }),
    ...(config.log !== undefined && { log: config.log }),
  }

  const internalBridge = createReactiveIframeBridge<TLocalMethods, TRemoteMethods>(
    bridgeConfig,
    store
  )

  return {
    id: bridgeId,
    connect: () => {
      // Child initiates connection to parent immediately
      internalBridge.init(window.parent)
      config.log?.(`Child bridge ${bridgeId} connect() called, connecting to parent`)
    },
    isInitialized: () => internalBridge.isInitialized(),
    getConnectionPromise: () => internalBridge.getConnectionPromise(),
    getRemoteProxyPromise: () => internalBridge.getRemoteProxyPromise(),
    getConnectionAtom: () => internalBridge.getConnectionAtom(),
    getRemoteProxyAtom: () => internalBridge.getRemoteProxyAtom(),
    destroy: () => internalBridge.destroy(),
    cleanup: () => internalBridge.cleanup(),
    retry: () => internalBridge.retry(),
  }
}

// ==================== React Integration ====================

export interface IframeBridgeProviderProps {
  children: ReactNode
}

export interface ParentBridgeProviderProps<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> extends IframeBridgeProviderProps {
  bridge?: ParentBridge<TLocalMethods, TRemoteMethods>
}

export interface ChildBridgeProviderProps<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> extends IframeBridgeProviderProps {
  bridge?: ChildBridge<TLocalMethods, TRemoteMethods>
}

export function makeParentBridgeHooks<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(defaultBridge: ParentBridge<TLocalMethods, TRemoteMethods>) {
  interface ParentBridgeContextValue {
    bridge: ParentBridge<TLocalMethods, TRemoteMethods>
  }

  const ParentBridgeContext = createContext<ParentBridgeContextValue | null>(null)

  const ParentBridgeProvider = ({
    children,
    bridge = defaultBridge,
  }: ParentBridgeProviderProps<TLocalMethods, TRemoteMethods>) => {
    const contextValue: ParentBridgeContextValue = {
      bridge,
    }

    return (
      <ParentBridgeContext.Provider value={contextValue}>{children}</ParentBridgeContext.Provider>
    )
  }

  function useParentBridge(): ParentBridge<TLocalMethods, TRemoteMethods> {
    const context = useContext(ParentBridgeContext)

    if (!context) {
      throw new Error('useParentBridge must be used within a ParentBridgeProvider')
    }

    return context.bridge
  }

  function useRemoteProxy() {
    const bridge = useParentBridge()
    const remoteProxyAtom = bridge.getRemoteProxyAtom()
    return useAtomValue(remoteProxyAtom)
  }

  function useConnection() {
    const bridge = useParentBridge()
    const connectionAtom = bridge.getConnectionAtom()
    return useAtomValue(connectionAtom)
  }

  function useChildReady() {
    const bridge = useParentBridge()
    const childReadyAtom = bridge.getChildReadyAtom()
    return useAtomValue(childReadyAtom)
  }

  return {
    ParentBridgeProvider,
    hooks: {
      useParentBridge,
      useRemoteProxy,
      useConnection,
      useChildReady,
    },
  }
}

export function makeChildBridgeHooks<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(defaultBridge: ChildBridge<TLocalMethods, TRemoteMethods>) {
  interface ChildBridgeContextValue {
    bridge: ChildBridge<TLocalMethods, TRemoteMethods>
  }

  const ChildBridgeContext = createContext<ChildBridgeContextValue | null>(null)

  const ChildBridgeProvider = ({
    children,
    bridge = defaultBridge,
  }: ChildBridgeProviderProps<TLocalMethods, TRemoteMethods>) => {
    const contextValue: ChildBridgeContextValue = {
      bridge,
    }

    return (
      <ChildBridgeContext.Provider value={contextValue}>{children}</ChildBridgeContext.Provider>
    )
  }

  function useChildBridge(): ChildBridge<TLocalMethods, TRemoteMethods> {
    const context = useContext(ChildBridgeContext)

    if (!context) {
      throw new Error('useChildBridge must be used within a ChildBridgeProvider')
    }

    return context.bridge
  }

  function useRemoteProxy() {
    const bridge = useChildBridge()
    const remoteProxyAtom = bridge.getRemoteProxyAtom()
    return useAtomValue(remoteProxyAtom)
  }

  function useConnection() {
    const bridge = useChildBridge()
    const connectionAtom = bridge.getConnectionAtom()
    return useAtomValue(connectionAtom)
  }

  return {
    ChildBridgeProvider,
    hooks: {
      useChildBridge,
      useRemoteProxy,
      useConnection,
    },
  }
}
