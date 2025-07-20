import { generateId, safeAssignment } from '../utils'
import type { WindowMessenger } from './messaging'
import type { CallMessage, Message, MethodPath, Methods, RemoteProxy, ReplyHandler } from './types'
import { isReplyMessage, NAMESPACE } from './types'

// ==================== Helper Functions ====================

function formatMethodPath(methodPath: string[]): string {
  return methodPath.join('.')
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
