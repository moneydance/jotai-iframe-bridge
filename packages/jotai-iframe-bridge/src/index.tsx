import { atom, getDefaultStore, useAtomValue } from 'jotai'
import { loadable } from 'jotai/utils'
import { observe } from 'jotai-effect'
import { createContext, type ReactNode, useContext } from 'react'

// ==================== Core Types ====================

// biome-ignore lint/suspicious/noExplicitAny: Methods type that accepts both strict interfaces and loose records
export type Methods = Record<string, (...args: any[]) => any>

export type MethodPath = string[]

export type RemoteProxy<T extends Record<keyof T, (...args: any[]) => any>> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R ? (...args: P) => Promise<R> : never
}

// ==================== Configuration Interfaces ====================

export interface ConnectionConfig<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
> {
  allowedOrigins: string[]
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
  return Math.random().toString(36).slice(2, 11)
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
    (data as Record<string, unknown>).namespace === NAMESPACE
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
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property traversal requires any for safe property access
  let current: any = methods
  for (const prop of methodPath) {
    current = current?.[prop]
    if (current === undefined) {
      return undefined
    }
  }
  return typeof current === 'function' ? current : undefined
}

// ==================== Window Messenger ====================

class WindowMessenger {
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

// ==================== Connection ====================

export class Connection<T extends Record<keyof T, (...args: any[]) => any> = Methods> {
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
          channel,
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
        channel,
        type: 'REPLY',
        callId,
        value,
      }
    } catch (error) {
      replyMessage = {
        namespace: NAMESPACE,
        channel,
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

// ==================== Shared Handshake Logic ====================

interface HandshakeConfig {
  messenger: WindowMessenger
  participantId: string
  timeout: number
  log?: (...args: unknown[]) => void
  methods?: Methods
  // biome-ignore lint/suspicious/noExplicitAny: Generic handshake callback accepts any type of RemoteProxy
  onConnectionEstablished: (remoteProxy: RemoteProxy<any>) => void
  onError: (error: Error) => void
}

function createHandshakeHandler<TRemoteMethods extends Methods = Methods>(
  config: HandshakeConfig
): () => void {
  const { messenger, participantId, timeout, log, methods, onConnectionEstablished, onError } =
    config

  let handshakeCompleted = false
  let callHandlerDestroy: (() => void) | null = null
  let remoteProxyDestroy: (() => void) | null = null

  // Set up call handler for incoming method calls
  if (methods) {
    callHandlerDestroy = connectCallHandler(
      messenger,
      methods,
      undefined, // channel
      log
    )
  }

  // Set up handshake message handler
  const handleHandshakeMessage = (message: Message) => {
    log?.('📨 Handshake handler received message:', message.type, message)

    if (handshakeCompleted) {
      log?.('⚠️ Handshake already completed, ignoring message')
      return
    }

    if (isSynMessage(message)) {
      log?.('Received SYN message from participant:', message.participantId)

      // Send another SYN in case the other participant wasn't ready for our first one
      const synMessage: SynMessage = {
        namespace: NAMESPACE,
        type: 'SYN',
        participantId,
      }

      try {
        messenger.sendMessage(synMessage)
        log?.('Sent additional SYN message')
      } catch (error) {
        log?.('Failed to send additional SYN:', error)
      }

      // Determine leadership by comparing participant IDs (lexicographical)
      const isHandshakeLeader = participantId > message.participantId
      log?.(`Leadership check: ${participantId} > ${message.participantId} = ${isHandshakeLeader}`)

      if (isHandshakeLeader) {
        // We are the leader, send ACK1
        const ack1Message: Ack1Message = {
          namespace: NAMESPACE,
          type: 'ACK1',
        }

        try {
          log?.('Sending ACK1 message as leader', ack1Message)
          messenger.sendMessage(ack1Message)
        } catch (error) {
          log?.('Failed to send ACK1:', error)
          onError(new Error(`Failed to send ACK1: ${(error as Error).message}`))
        }
      }
      // If not leader, wait for ACK1 from the leader
    } else if (isAck1Message(message)) {
      log?.('Received ACK1 message, sending ACK2 response')

      // Respond with ACK2
      const ack2Message: Ack2Message = {
        namespace: NAMESPACE,
        type: 'ACK2',
      }

      try {
        messenger.sendMessage(ack2Message)
        log?.('Sent ACK2 response')
      } catch (error) {
        log?.('Failed to send ACK2:', error)
        onError(new Error(`Failed to send ACK2: ${(error as Error).message}`))
        return
      }

      // Establish connection (follower establishes after sending ACK2)
      handshakeCompleted = true
      messenger.removeMessageHandler(handleHandshakeMessage)

      const { remoteProxy, destroy } = connectRemoteProxy<TRemoteMethods>(
        messenger,
        undefined,
        log,
        timeout
      )

      remoteProxyDestroy = destroy
      onConnectionEstablished(remoteProxy)
      log?.('Connection established successfully (follower)')
    } else if (isAck2Message(message)) {
      log?.('Received ACK2 message, establishing connection')

      // Establish connection (leader establishes after receiving ACK2)
      handshakeCompleted = true
      messenger.removeMessageHandler(handleHandshakeMessage)

      const { remoteProxy, destroy } = connectRemoteProxy<TRemoteMethods>(
        messenger,
        undefined,
        log,
        timeout
      )

      remoteProxyDestroy = destroy
      onConnectionEstablished(remoteProxy)
      log?.('Connection established successfully (leader)')
    } else {
      log?.('📨 Ignoring non-handshake message:', message.type)
    }
  }

  messenger.addMessageHandler(handleHandshakeMessage)

  // Send initial SYN message
  const synMessage: SynMessage = {
    namespace: NAMESPACE,
    type: 'SYN',
    participantId,
  }

  try {
    log?.('Sending SYN message', synMessage)
    messenger.sendMessage(synMessage)
  } catch (error) {
    onError(new Error(`Failed to send SYN: ${(error as Error).message}`))
    return () => {}
  }

  // Set up timeout
  const timeoutId = setTimeout(() => {
    if (!handshakeCompleted) {
      messenger.removeMessageHandler(handleHandshakeMessage)
      onError(new Error(`Connection timeout after ${timeout}ms`))
    }
  }, timeout)

  // Return cleanup function
  return () => {
    clearTimeout(timeoutId)
    messenger.removeMessageHandler(handleHandshakeMessage)
    callHandlerDestroy?.()
    remoteProxyDestroy?.()
  }
}

// ==================== Unified Bridge Interface ====================

type LoadableAtom<T> = ReturnType<typeof loadable<T>>

export interface Bridge<
  _TLocalMethods extends Record<keyof _TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
> {
  id: string
  connect(targetWindow?: Window): void
  isInitialized(): boolean
  getConnectionPromise(): Promise<Connection<TRemoteMethods>>
  getRemoteProxyPromise(): Promise<RemoteProxy<TRemoteMethods>>
  getConnectionAtom(): LoadableAtom<Connection<TRemoteMethods>>
  getRemoteProxyAtom(): LoadableAtom<RemoteProxy<TRemoteMethods>>
  destroy(): void
  retry(): void
}

export function createBridge<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
>(
  config: ConnectionConfig<TLocalMethods>,
  store: Store = getDefaultStore()
): Bridge<TLocalMethods, TRemoteMethods> {
  // Generate unique ID for this bridge instance
  const bridgeId = generateId()
  config.log?.(`🆔 Creating Bridge with ID: ${bridgeId}`)

  // Core atoms
  const remoteWindowAtom = atom<Window | null>(null)
  const participantIdAtom = atom(generateId())

  // Messenger atom - creates messenger when window is available
  const messengerAtom = atom<WindowMessenger | null>((get) => {
    const remoteWindow = get(remoteWindowAtom)
    if (!remoteWindow) {
      return null
    }

    const messenger = new WindowMessenger(remoteWindow, config.allowedOrigins, config.log)
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
    return observe((get, set) => {
      const messenger = get(messengerAtom)

      if (!messenger) {
        // Reset connection when messenger is null
        const connectionDeferred = get.peek(connectionDeferredAtom)
        if (connectionDeferred.status !== 'pending') {
          set(connectionDeferredAtom, createDeferred<Connection<TRemoteMethods>>())
        }
        return
      }

      // Start handshake process using shared handler
      const participantId = get(participantIdAtom)
      const handshakeTimeout = config.timeout ?? 10000

      const handshakeCleanup = createHandshakeHandler<TRemoteMethods>({
        ...config,
        messenger,
        participantId,
        timeout: handshakeTimeout,
        onConnectionEstablished: (remoteProxy: RemoteProxy<TRemoteMethods>) => {
          const connection = new Connection<TRemoteMethods>(
            Promise.resolve(remoteProxy),
            () => {} // destroy handled by cleanup
          )
          get.peek(connectionDeferredAtom).resolve(connection)
        },
        onError: (error: Error) => {
          get.peek(connectionDeferredAtom).reject(error)
        },
      })

      // Return cleanup function
      return () => {
        handshakeCleanup()
        messenger.destroy()
      }
    }, store)
  }

  const unsubscribeFromMessengerChange = updateConnectionOnMessengerChange()

  return {
    id: bridgeId,

    connect(targetWindow?: Window): void {
      const window =
        targetWindow ?? (typeof globalThis !== 'undefined' ? globalThis.parent : undefined)
      if (!window) {
        throw new Error('No target window available for connection')
      }
      config.log?.(`🚀 Bridge ${bridgeId} connecting to target window`)
      store.set(remoteWindowAtom, window)
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

    destroy(): void {
      config.log?.(`🧹 Bridge ${bridgeId} destroying`)
      store.set(remoteWindowAtom, null)
      unsubscribeFromMessengerChange()
    },

    retry(): void {
      config.log?.(`🔄 Bridge ${bridgeId} retrying connection`)
      const window = store.get(remoteWindowAtom)
      this.destroy()
      if (!window) {
        return
      }
      this.connect(window)
    },
  }
}

// ==================== Unified React Provider ====================

interface BridgeProviderProps<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> {
  bridge: Bridge<TLocalMethods, TRemoteMethods>
  children: ReactNode
}

export type { BridgeProviderProps }

interface BridgeContextValue<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> {
  bridge: Bridge<TLocalMethods, TRemoteMethods>
}

export function createBridgeProvider<
  TLocalMethods extends Record<keyof TLocalMethods, (...args: any[]) => any> = Methods,
  TRemoteMethods extends Record<keyof TRemoteMethods, (...args: any[]) => any> = Methods,
>() {
  const BridgeContext = createContext<
    BridgeContextValue<TLocalMethods, TRemoteMethods> | undefined
  >(undefined)

  function BridgeProvider({
    bridge,
    children,
  }: BridgeProviderProps<TLocalMethods, TRemoteMethods>) {
    return <BridgeContext.Provider value={{ bridge }}>{children}</BridgeContext.Provider>
  }

  function useBridge(): Bridge<TLocalMethods, TRemoteMethods> {
    const context = useContext(BridgeContext)
    if (!context) {
      throw new Error('useBridge must be used within a BridgeProvider')
    }
    return context.bridge
  }

  function useRemoteProxy() {
    const bridge = useBridge()
    const remoteProxyAtom = bridge.getRemoteProxyAtom()
    return useAtomValue(remoteProxyAtom)
  }

  function useConnection() {
    const bridge = useBridge()
    const connectionAtom = bridge.getConnectionAtom()
    return useAtomValue(connectionAtom)
  }

  return {
    BridgeProvider,
    hooks: {
      useBridge,
      useRemoteProxy,
      useConnection,
    },
  }
}
