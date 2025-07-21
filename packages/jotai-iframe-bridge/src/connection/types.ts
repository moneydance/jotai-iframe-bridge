// ==================== Core Connection Types ====================

// biome-ignore lint/suspicious/noExplicitAny: Methods type that accepts both strict interfaces and loose records
export type Methods = Record<string, (...args: any[]) => any>

export type MethodPath = string[]

export type RemoteProxy<T extends Record<keyof T, (...args: any[]) => any>> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R ? (...args: P) => Promise<R> : never
}

// ==================== Message Types ====================

export const NAMESPACE = 'jotai-iframe-bridge'

type MessageBase = {
  namespace: string
  fromParticipantId: string
  channel?: string
}

export type SynMessage = MessageBase & {
  type: 'SYN'
}

export type Ack1Message = MessageBase & {
  type: 'ACK1'
  toParticipantId: string // Host's participant ID (from SYN)
  methodPaths?: string[]
}

export type Ack2Message = MessageBase & {
  type: 'ACK2'
  toParticipantId: string // Child's participant ID (from ACK1)
}

export type DestroyMessage = MessageBase & {
  type: 'DESTROY'
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

export type Message =
  | SynMessage
  | Ack1Message
  | Ack2Message
  | CallMessage
  | ReplyMessage
  | DestroyMessage

// ==================== Connection Utility Types ====================

export type ReplyHandler = {
  methodPath: MethodPath
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeoutId?: number
}

// ==================== Message Type Guards ====================

export function isMessage(data: unknown): data is Message {
  return (
    typeof data === 'object' &&
    data !== null &&
    'namespace' in data &&
    'type' in data &&
    'fromParticipantId' in data &&
    (data as Record<string, unknown>).namespace === NAMESPACE &&
    typeof (data as Record<string, unknown>).fromParticipantId === 'string'
  )
}

export function isSynMessage(message: Message): message is SynMessage {
  return message.type === 'SYN'
}

export function isAck1Message(message: Message): message is Ack1Message {
  return message.type === 'ACK1'
}

export function isAck2Message(message: Message): message is Ack2Message {
  return message.type === 'ACK2'
}

export function isDestroyMessage(message: Message): message is DestroyMessage {
  return message.type === 'DESTROY'
}

export function isCallMessage(message: Message): message is CallMessage {
  return message.type === 'CALL'
}

export function isReplyMessage(message: Message): message is ReplyMessage {
  return message.type === 'REPLY'
}
