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

export type AckMessage = MessageBase & {
  type: 'ACK'
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

export type Message = SynMessage | AckMessage | CallMessage | ReplyMessage | DestroyMessage

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

function isAckMessage(message: Message): message is AckMessage {
  return message.type === 'ACK'
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
    if (isSynMessage(data) || isAckMessage(data)) {
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

export interface IframeBridge<
  _TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
> {
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

type LoadableAtom<T> = ReturnType<typeof loadable<T>>

function createReactiveIframeBridge<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(
  config: ConnectionConfig<TLocalMethods>,
  store: Store = getDefaultStore()
): IframeBridge<TLocalMethods, TRemoteMethods> {
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
        if (handshakeCompleted) return

        if (isAckMessage(message)) {
          handshakeCompleted = true
          messenger.removeMessageHandler(handleHandshakeMessage)

          // Create remote proxy
          const { remoteProxy, destroy } = connectRemoteProxy<TRemoteMethods>(
            messenger,
            undefined, // channel
            config.log,
            config.timeout
          )

          // Create connection
          const connection = new ConnectionImpl<TRemoteMethods>(
            Promise.resolve(remoteProxy),
            destroy
          )

          // Resolve the connection promise
          get.peek(connectionDeferredAtom).resolve(connection)
          config.log?.('Connection established successfully')
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

// ==================== Factory Functions ====================

export function createIframeBridge<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(
  config: ConnectionConfig<TLocalMethods>,
  store?: Store
): IframeBridge<TLocalMethods, TRemoteMethods> {
  return createReactiveIframeBridge<TLocalMethods, TRemoteMethods>(config, store)
}

// ==================== Child/Remote Side ====================

export function connectToParent<
  TLocalMethods extends Methods = Methods,
  TParentMethods extends Methods = Methods,
>(config: ChildConnectionConfig<TLocalMethods>): Promise<RemoteProxy<TParentMethods>> {
  const parentOrigins = Array.isArray(config.parentOrigin)
    ? config.parentOrigin
    : [config.parentOrigin]

  const messenger = new WindowMessengerImpl(window.parent, parentOrigins, config.log)

  // Set up call handler for incoming method calls
  let callHandlerDestroy: (() => void) | null = null
  if (config.methods) {
    callHandlerDestroy = connectCallHandler(
      messenger,
      config.methods,
      undefined, // channel
      config.log
    )
  }

  return new Promise((resolve, reject) => {
    let handshakeCompleted = false
    const handshakeTimeout = config.timeout || 10000

    // Set up handshake message handler
    const handleHandshakeMessage = (message: Message) => {
      if (handshakeCompleted) return

      if (isSynMessage(message)) {
        handshakeCompleted = true
        messenger.removeMessageHandler(handleHandshakeMessage)

        // Send ACK message
        const ackMessage: AckMessage = {
          namespace: NAMESPACE,
          type: 'ACK',
        }

        try {
          config.log?.('Sending ACK message', ackMessage)
          messenger.sendMessage(ackMessage)

          // Create remote proxy
          const { remoteProxy } = connectRemoteProxy<TParentMethods>(
            messenger,
            undefined, // channel
            config.log,
            config.timeout
          )

          resolve(remoteProxy)
          config.log?.('Child connection established successfully')
        } catch (error) {
          reject(new Error(`Failed to send ACK: ${(error as Error).message}`))
        }
      }
    }

    messenger.addMessageHandler(handleHandshakeMessage)

    // Set up timeout
    setTimeout(() => {
      if (!handshakeCompleted) {
        messenger.removeMessageHandler(handleHandshakeMessage)
        if (callHandlerDestroy) callHandlerDestroy()
        messenger.destroy()
        reject(new Error(`Child connection timeout after ${handshakeTimeout}ms`))
      }
    }, handshakeTimeout)

    config.log?.('Child waiting for SYN message from parent')
  })
}

// ==================== React Integration ====================

interface IframeBridgeProviderProps {
  children: ReactNode
}

export function makeIframeBridgeHooks<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(bridge: IframeBridge<TLocalMethods, TRemoteMethods>) {
  interface IframeBridgeContextValue {
    bridge: IframeBridge<TLocalMethods, TRemoteMethods>
  }

  const IframeBridgeContext = createContext<IframeBridgeContextValue | null>(null)

  const IframeBridgeProvider = ({ children }: IframeBridgeProviderProps) => {
    const contextValue: IframeBridgeContextValue = {
      bridge,
    }

    return (
      <IframeBridgeContext.Provider value={contextValue}>{children}</IframeBridgeContext.Provider>
    )
  }

  function useIframeBridge(): IframeBridge<TLocalMethods, TRemoteMethods> {
    const context = useContext(IframeBridgeContext)

    if (!context) {
      throw new Error('useIframeBridge must be used within an IframeBridgeProvider')
    }

    return context.bridge
  }

  function useRemoteProxy() {
    const bridge = useIframeBridge()
    const remoteProxyAtom = bridge.getRemoteProxyAtom()
    return useAtomValue(remoteProxyAtom)
  }

  function useConnection() {
    const bridge = useIframeBridge()
    const connectionAtom = bridge.getConnectionAtom()
    return useAtomValue(connectionAtom)
  }

  return {
    IframeBridgeProvider,
    hooks: {
      useIframeBridge,
      useRemoteProxy,
      useConnection,
    },
  }
}

// ==================== Legacy Hook for Compatibility ====================

export function useIframeBridge<
  TLocalMethods extends Methods = Methods,
  TRemoteMethods extends Methods = Methods,
>(config: ConnectionConfig<TLocalMethods>): IframeBridge<TLocalMethods, TRemoteMethods> {
  // For compatibility, create a new bridge instance
  // In production, this should be memoized
  return createIframeBridge<TLocalMethods, TRemoteMethods>(config)
}
