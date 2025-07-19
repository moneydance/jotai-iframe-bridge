import { safeAssignment } from '../utils'
import type { WindowMessenger } from './messaging'
import { connectCallHandler, connectRemoteProxy } from './proxy'
import type { Ack1Message, Ack2Message, Message, Methods, RemoteProxy, SynMessage } from './types'
import { isAck1Message, isAck2Message, isSynMessage, NAMESPACE } from './types'

// ==================== Shared Handshake Logic ====================

export interface HandshakeConfig {
  messenger: WindowMessenger
  participantId: string
  timeout: number
  log?: (...args: unknown[]) => void
  methods?: Methods
  // biome-ignore lint/suspicious/noExplicitAny: Generic handshake callback accepts any type of RemoteProxy
  onConnectionEstablished: (remoteProxy: RemoteProxy<any>) => void
  onError: (error: Error) => void
}

interface HandshakeState {
  handshakeCompleted: boolean
  callHandlerDestroy: (() => void) | null
  remoteProxyDestroy: (() => void) | null
  messageHandler: ((message: Message) => void) | null
}

// ==================== Message Handlers ====================

function handleSynMessage<_TRemoteMethods extends Methods>(
  message: SynMessage,
  config: HandshakeConfig,
  _state: HandshakeState
): void {
  const { messenger, participantId, log } = config

  log?.('Received SYN message from participant:', message.participantId)

  // Send another SYN in case the other participant wasn't ready for our first one
  const synMessage: SynMessage = {
    namespace: NAMESPACE,
    type: 'SYN',
    participantId,
  }

  const [synOk, synError] = safeAssignment(() => messenger.sendMessage(synMessage))
  if (!synOk) {
    log?.('Failed to send additional SYN:', synError)
  } else {
    log?.('Sent additional SYN message')
  }

  // Determine leadership by comparing participant IDs (lexicographical)
  const isHandshakeLeader = participantId > message.participantId
  log?.(`Leadership check: ${participantId} > ${message.participantId} = ${isHandshakeLeader}`)

  if (isHandshakeLeader) {
    sendAck1Message(config)
  }
  // If not leader, wait for ACK1 from the leader
}

function sendAck1Message(config: HandshakeConfig): void {
  const { messenger, log, onError } = config

  // We are the leader, send ACK1
  const ack1Message: Ack1Message = {
    namespace: NAMESPACE,
    type: 'ACK1',
  }

  const [ack1Ok, ack1Error] = safeAssignment(() => messenger.sendMessage(ack1Message))
  if (!ack1Ok) {
    log?.('Failed to send ACK1:', ack1Error)
    onError(
      new Error(
        `Failed to send ACK1: ${ack1Error instanceof Error ? ack1Error.message : String(ack1Error)}`
      )
    )
  } else {
    log?.('Sending ACK1 message as leader', ack1Message)
  }
}

function handleAck1Message<TRemoteMethods extends Methods>(
  _message: Ack1Message,
  config: HandshakeConfig,
  state: HandshakeState
): void {
  const { messenger, log, onError } = config

  log?.('Received ACK1 message, sending ACK2 response')

  // Respond with ACK2
  const ack2Message: Ack2Message = {
    namespace: NAMESPACE,
    type: 'ACK2',
  }

  const [ack2Ok, ack2Error] = safeAssignment(() => messenger.sendMessage(ack2Message))
  if (!ack2Ok) {
    log?.('Failed to send ACK2:', ack2Error)
    onError(
      new Error(
        `Failed to send ACK2: ${ack2Error instanceof Error ? ack2Error.message : String(ack2Error)}`
      )
    )
    return
  }

  log?.('Sent ACK2 response')

  // Establish connection (follower establishes after sending ACK2)
  establishConnection<TRemoteMethods>(config, state, 'follower')
}

function handleAck2Message<TRemoteMethods extends Methods>(
  _message: Ack2Message,
  config: HandshakeConfig,
  state: HandshakeState
): void {
  const { log } = config

  log?.('Received ACK2 message, establishing connection')

  // Establish connection (leader establishes after receiving ACK2)
  establishConnection<TRemoteMethods>(config, state, 'leader')
}

function establishConnection<TRemoteMethods extends Methods>(
  config: HandshakeConfig,
  state: HandshakeState,
  role: 'leader' | 'follower'
): void {
  const { messenger, log, timeout, onConnectionEstablished } = config

  state.handshakeCompleted = true

  // Remove the message handler if it exists
  if (state.messageHandler) {
    messenger.removeMessageHandler(state.messageHandler)
  }

  const { remoteProxy, destroy } = connectRemoteProxy<TRemoteMethods>(
    messenger,
    undefined,
    log,
    timeout
  )

  state.remoteProxyDestroy = destroy
  onConnectionEstablished(remoteProxy)
  log?.(`Connection established successfully (${role})`)
}

function createMessageHandler<TRemoteMethods extends Methods>(
  config: HandshakeConfig,
  state: HandshakeState
): (message: Message) => void {
  const { log } = config

  return (message: Message) => {
    log?.('📨 Handshake handler received message:', message.type, message)

    if (state.handshakeCompleted) {
      log?.('⚠️ Handshake already completed, ignoring message')
      return
    }

    if (isSynMessage(message)) {
      handleSynMessage<TRemoteMethods>(message, config, state)
    } else if (isAck1Message(message)) {
      handleAck1Message<TRemoteMethods>(message, config, state)
    } else if (isAck2Message(message)) {
      handleAck2Message<TRemoteMethods>(message, config, state)
    } else {
      log?.('📨 Ignoring non-handshake message:', message.type)
    }
  }
}

function sendInitialSynMessage(config: HandshakeConfig): boolean {
  const { messenger, participantId, log, onError } = config

  // Send initial SYN message
  const synMessage: SynMessage = {
    namespace: NAMESPACE,
    type: 'SYN',
    participantId,
  }

  const [initialSynOk, initialSynError] = safeAssignment(() => messenger.sendMessage(synMessage))
  if (!initialSynOk) {
    onError(
      new Error(
        `Failed to send SYN: ${initialSynError instanceof Error ? initialSynError.message : String(initialSynError)}`
      )
    )
    return false
  }

  log?.('Sending SYN message', synMessage)
  return true
}

// ==================== Main Handler Creation ====================

export function createHandshakeHandler<TRemoteMethods extends Methods = Methods>(
  config: HandshakeConfig
): () => void {
  const { messenger, methods, timeout, log, onError } = config

  const state: HandshakeState = {
    handshakeCompleted: false,
    callHandlerDestroy: null,
    remoteProxyDestroy: null,
    messageHandler: null,
  }

  // Set up call handler for incoming method calls
  if (methods) {
    state.callHandlerDestroy = connectCallHandler(
      messenger,
      methods,
      undefined, // channel
      log
    )
  }

  // Set up handshake message handler
  const handleHandshakeMessage = createMessageHandler<TRemoteMethods>(config, state)
  state.messageHandler = handleHandshakeMessage
  messenger.addMessageHandler(handleHandshakeMessage)

  // Send initial SYN message
  const synSent = sendInitialSynMessage(config)
  if (!synSent) {
    return () => {} // Return empty cleanup if initial SYN failed
  }

  // Set up timeout
  const timeoutId = setTimeout(() => {
    if (!state.handshakeCompleted) {
      messenger.removeMessageHandler(handleHandshakeMessage)
      onError(new Error(`Connection timeout after ${timeout}ms`))
    }
  }, timeout)

  // Return cleanup function
  return () => {
    clearTimeout(timeoutId)
    messenger.removeMessageHandler(handleHandshakeMessage)
    state.callHandlerDestroy?.()
    state.remoteProxyDestroy?.()
  }
}
