import type { SessionLifecycle } from './SessionLifecycle'
import type {
  Ack1Message,
  Ack2Message,
  CallMessage,
  DestroyMessage,
  Message,
  Methods,
  SynMessage,
} from './types'
import {
  isAck1Message,
  isAck2Message,
  isCallMessage,
  isDestroyMessage,
  isReplyMessage,
  isSynMessage,
} from './types'

// ==================== Helper Functions ====================

function getMethodAtMethodPath(methodPath: string[], methods: Methods): (...args: any[]) => any {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property traversal requires any for safe property access
  let target: any = methods
  for (const segment of methodPath) {
    target = target[segment]
    if (target === undefined) {
      throw new Error(`Method ${methodPath.join('.')} not found`)
    }
  }

  if (typeof target !== 'function') {
    throw new Error(`${methodPath.join('.')} is not a function`)
  }

  return target
}

// Configuration for handlers
export interface HandlerConfig {
  participantId: string
  methods?: Methods
  log?: (...args: unknown[]) => void
}

// ==================== Pure Stateless Handlers ====================

export function handleSynMessage(
  message: SynMessage,
  lifecycle: SessionLifecycle,
  config: HandlerConfig,
  currentPairedParticipant: string | null
): void {
  const { participantId, log } = config

  log?.('Received SYN message from participant:', message.participantId)

  // Pair with participant if not already paired
  if (!currentPairedParticipant) {
    lifecycle.emit('pairedWith', message.participantId)
    log?.(`Paired with participant: ${message.participantId}`)

    // Send additional SYN only when first pairing
    lifecycle.emit('sendSyn', participantId)
    log?.('Requesting additional SYN message')
  } else if (currentPairedParticipant !== message.participantId) {
    log?.(
      `Ignoring SYN from ${message.participantId}, already paired with ${currentPairedParticipant}`
    )
    return
  } else {
    // Already paired with this participant - no need to send another SYN
    log?.(`Already paired with ${message.participantId}, skipping additional SYN`)
  }

  // Determine leadership
  const isHandshakeLeader = participantId > message.participantId
  log?.(`Leadership check: ${participantId} > ${message.participantId} = ${isHandshakeLeader}`)

  if (isHandshakeLeader) {
    sendAck1Message(lifecycle, config, message.participantId)
  }
}

export function handleAck1Message(
  message: Ack1Message,
  lifecycle: SessionLifecycle,
  config: HandlerConfig,
  currentPairedParticipant: string | null
): void {
  const { participantId, log } = config

  // Validate message is for us
  if (message.toParticipantId !== participantId) {
    log?.(
      `Ignoring ACK1 not meant for us (to: ${message.toParticipantId}, our ID: ${participantId})`
    )
    return
  }

  // Check pairing
  if (currentPairedParticipant && currentPairedParticipant !== message.fromParticipantId) {
    log?.(`Ignoring ACK1 from unpaired participant ${message.fromParticipantId}`)
    return
  }

  if (!currentPairedParticipant) {
    lifecycle.emit('pairedWith', message.fromParticipantId)
    log?.(`Paired with participant: ${message.fromParticipantId}`)
  }

  log?.('Received ACK1 message, sending ACK2 response')

  // Send ACK2 via event
  lifecycle.emit('sendAck2', participantId, message.fromParticipantId)
  log?.('Requested ACK2 response')

  establishConnection(lifecycle, config, 'follower')
}

export function handleAck2Message(
  message: Ack2Message,
  lifecycle: SessionLifecycle,
  config: HandlerConfig,
  currentPairedParticipant: string | null
): void {
  const { participantId, log } = config

  // Validate message
  if (message.toParticipantId !== participantId) {
    log?.(
      `Ignoring ACK2 not meant for us (to: ${message.toParticipantId}, our ID: ${participantId})`
    )
    return
  }

  if (currentPairedParticipant !== message.fromParticipantId) {
    log?.(`Ignoring ACK2 from unpaired participant ${message.fromParticipantId}`)
    return
  }

  log?.('Received ACK2 message, establishing connection')
  establishConnection(lifecycle, config, 'leader')
}

export function handleDestroyMessage(
  message: DestroyMessage,
  lifecycle: SessionLifecycle,
  config: HandlerConfig,
  currentPairedParticipant: string | null
): void {
  const { log } = config

  // Check if DESTROY is from paired participant
  if (currentPairedParticipant && message.fromParticipantId === currentPairedParticipant) {
    log?.(`Received DESTROY from paired participant: ${message.fromParticipantId}`)
    log?.('Cleared pairing, ready for new connections')

    // Emit event to let ConnectionSession handle cleanup
    lifecycle.emit('destroyReceived', message.fromParticipantId)
  } else {
    log?.(`Ignoring DESTROY from unpaired participant: ${message.fromParticipantId}`)
  }
}

export function handleMethodCall(
  message: CallMessage,
  lifecycle: SessionLifecycle,
  config: HandlerConfig,
  handshakeCompleted: boolean
): void {
  const { methods, log } = config

  if (!methods) {
    log?.('Received method call but no methods configured')
    return
  }

  if (!handshakeCompleted) {
    log?.('Received method call before handshake completion, ignoring')
    return
  }

  log?.(`Received method call: ${message.methodPath.join('.')}`)

  // Execute method and send reply via event
  executeAndReplyToMethodCall(message, methods, lifecycle, log)
}

// ==================== Helper Functions ====================

function sendAck1Message(
  lifecycle: SessionLifecycle,
  config: HandlerConfig,
  toParticipantId: string
): void {
  const { participantId, log } = config

  // Send ACK1 via event
  lifecycle.emit('sendAck1', participantId, toParticipantId)
  log?.('Requesting ACK1 message as leader')
}

function establishConnection(
  lifecycle: SessionLifecycle,
  config: HandlerConfig,
  role: 'leader' | 'follower'
): void {
  const { log } = config

  log?.(`Connection established successfully (${role})`)

  // Just emit event - ConnectionSession will handle proxy creation and state
  lifecycle.emit('connectionEstablished')
}

async function executeAndReplyToMethodCall(
  message: CallMessage,
  methods: Methods,
  lifecycle: SessionLifecycle,
  log?: (...args: unknown[]) => void
): Promise<void> {
  try {
    // Navigate to method
    const method = getMethodAtMethodPath(message.methodPath, methods)
    // Execute method
    const result = await method(...message.args)
    // Send success reply via event
    lifecycle.emit('sendMethodReply', message.id, false, result)
    log?.(`Method call ${message.methodPath.join('.')} completed successfully`)
  } catch (error) {
    // Send error reply via event
    const errorValue = error instanceof Error ? error.message : String(error)
    lifecycle.emit('sendMethodReply', message.id, true, errorValue)
    log?.(`Method call ${message.methodPath.join('.')} failed:`, error)
  }
}

// ==================== Universal Message Router ====================

export function createUniversalMessageHandler(
  lifecycle: SessionLifecycle,
  config: HandlerConfig,
  getState: () => { pairedParticipantId: string | null; handshakeCompleted: boolean }
): (message: Message) => void {
  return (message: Message) => {
    const { log } = config
    const state = getState()

    log?.('📨 Processing message:', message.type)

    // Route to appropriate handler with current state values
    if (isSynMessage(message)) {
      handleSynMessage(message, lifecycle, config, state.pairedParticipantId)
    } else if (isAck1Message(message)) {
      handleAck1Message(message, lifecycle, config, state.pairedParticipantId)
    } else if (isAck2Message(message)) {
      handleAck2Message(message, lifecycle, config, state.pairedParticipantId)
    } else if (isDestroyMessage(message)) {
      handleDestroyMessage(message, lifecycle, config, state.pairedParticipantId)
    } else if (isCallMessage(message)) {
      handleMethodCall(message, lifecycle, config, state.handshakeCompleted)
    } else if (isReplyMessage(message)) {
      // Reply messages are handled by the RemoteProxy, not here
      log?.('📨 Ignoring REPLY message (handled by RemoteProxy)')
    } else {
      log?.('📨 Ignoring unknown message type:', (message as any).type)
    }
  }
}
