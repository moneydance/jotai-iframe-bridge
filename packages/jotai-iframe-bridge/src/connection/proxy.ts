import { generateId, safeAssignment } from '../utils'
import type { WindowMessenger } from './messaging'
import type {
  CallMessage,
  Message,
  MethodPath,
  Methods,
  RemoteProxy,
  ReplyHandler,
  ReplyMessage,
} from './types'
import { isCallMessage, isReplyMessage, NAMESPACE } from './types'

// ==================== Helper Functions ====================

function formatMethodPath(methodPath: string[]): string {
  return methodPath.join('.')
}

function getMethodAtMethodPath(
  methodPath: string[],
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property traversal requires any for safe property access
  methods: Record<string, any>
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property traversal requires any for safe property access
): ((...args: any[]) => any) | undefined {
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

// ==================== Remote Proxy Creation ====================

export function createRemoteProxy<T extends Methods>(
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
          // Only throw error if we're deep in a method path (not the root proxy)
          // This allows Promise.resolve(remoteProxy) to work while still catching
          // mistakes like await remoteProxy.methodName (without calling it)
          if (path.length > 0) {
            throw new Error(
              `Remote function ${formatMethodPath(
                path
              )} was accessed but not called. Did you forget to add () at the end?`
            )
          }
          // Return undefined for root proxy to indicate it's not thenable
          return undefined
        }

        if (typeof prop === 'string') {
          return createRemoteProxy<T>(callback, log, [...path, prop])
        }

        return undefined
      },
      apply(_target, _thisArg, args: unknown[]) {
        return callback(path, args)
      },
    }
  ) as RemoteProxy<T>
}

export function connectRemoteProxy<T extends Methods>(
  messenger: WindowMessenger,
  channel: string | undefined,
  log?: (...args: unknown[]) => void,
  timeout = 30000
): { remoteProxy: RemoteProxy<T>; destroy: () => void } {
  const replyHandlers = new Map<string, ReplyHandler>()
  let isDestroyed = false

  const handleMessage = (message: Message) => {
    if (isDestroyed || !isReplyMessage(message)) {
      return
    }

    const replyHandler = replyHandlers.get(message.callId)
    if (!replyHandler) {
      return
    }

    replyHandlers.delete(message.callId)

    if (replyHandler.timeoutId) {
      clearTimeout(replyHandler.timeoutId)
    }

    if (message.isError) {
      replyHandler.reject(
        new Error(typeof message.value === 'string' ? message.value : String(message.value))
      )
    } else {
      replyHandler.resolve(message.value)
    }
  }

  messenger.addMessageHandler(handleMessage)

  const makeMethodCall = async (methodPath: MethodPath, args: unknown[]): Promise<unknown> => {
    if (isDestroyed) {
      throw new Error(
        `Method call ${formatMethodPath(methodPath)}() failed due to destroyed connection`
      )
    }

    return new Promise((resolve, reject) => {
      const callId = generateId()

      const callMessage: CallMessage = {
        namespace: NAMESPACE,
        channel,
        type: 'CALL',
        id: callId,
        methodPath,
        args,
      }

      const replyHandler: ReplyHandler = {
        methodPath,
        resolve,
        reject,
      }

      if (timeout > 0) {
        replyHandler.timeoutId = setTimeout(() => {
          replyHandlers.delete(callId)
          reject(
            new Error(`Method call ${formatMethodPath(methodPath)}() timed out after ${timeout}ms`)
          )
        }, timeout) as unknown as number
      }

      replyHandlers.set(callId, replyHandler)

      const [ok, error] = safeAssignment(() => {
        log?.(`Sending ${formatMethodPath(methodPath)}() call`, callMessage)
        messenger.sendMessage(callMessage)
      })

      if (!ok) {
        replyHandlers.delete(callId)

        if (replyHandler.timeoutId) {
          clearTimeout(replyHandler.timeoutId)
        }

        reject(error)
      }
    })
  }

  const remoteProxy = createRemoteProxy<T>(makeMethodCall, log)

  const destroy = () => {
    if (isDestroyed) {
      return
    }

    isDestroyed = true
    messenger.removeMessageHandler(handleMessage)

    for (const { reject, methodPath, timeoutId } of replyHandlers.values()) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

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

interface CallHandlerConfig {
  messenger: WindowMessenger
  methods: Methods
  channel: string | undefined
  log?: (...args: unknown[]) => void
}

interface CallHandlerState {
  isDestroyed: boolean
}

async function executeMethodCall(
  message: CallMessage,
  methods: Methods,
  channel: string | undefined
): Promise<ReplyMessage> {
  const { methodPath, args, id: callId } = message

  try {
    const method = getMethodAtMethodPath(methodPath, methods)

    if (!method) {
      throw new Error(`Method \`${formatMethodPath(methodPath)}\` is not found.`)
    }

    const value = await method(...args)

    return {
      namespace: NAMESPACE,
      channel,
      type: 'REPLY',
      callId,
      value,
    }
  } catch (error) {
    return {
      namespace: NAMESPACE,
      channel,
      type: 'REPLY',
      callId,
      value: error instanceof Error ? error.message : String(error),
      isError: true,
    }
  }
}

function sendReplyMessage(
  replyMessage: ReplyMessage,
  config: CallHandlerConfig,
  methodPath: MethodPath
): void {
  const { messenger, log } = config

  const [ok, sendError] = safeAssignment(() => {
    log?.(`Sending ${formatMethodPath(methodPath)}() reply`, replyMessage)
    messenger.sendMessage(replyMessage)
  })

  if (!ok) {
    log?.('Failed to send reply:', sendError)
  }
}

function createCallMessageHandler(
  config: CallHandlerConfig,
  state: CallHandlerState
): (message: Message) => Promise<void> {
  const { methods, channel, log } = config

  return async (message: Message) => {
    if (state.isDestroyed || !isCallMessage(message)) {
      return
    }

    log?.(`Received ${formatMethodPath(message.methodPath)}() call`, message)

    const replyMessage = await executeMethodCall(message, methods, channel)

    if (state.isDestroyed) {
      return
    }

    sendReplyMessage(replyMessage, config, message.methodPath)
  }
}

export function connectCallHandler(
  messenger: WindowMessenger,
  methods: Methods,
  channel: string | undefined,
  log?: (...args: unknown[]) => void
): () => void {
  const config: CallHandlerConfig = {
    messenger,
    methods,
    channel,
    log,
  }

  const state: CallHandlerState = {
    isDestroyed: false,
  }

  const handleMessage = createCallMessageHandler(config, state)
  messenger.addMessageHandler(handleMessage)

  return () => {
    state.isDestroyed = true
    messenger.removeMessageHandler(handleMessage)
  }
}
