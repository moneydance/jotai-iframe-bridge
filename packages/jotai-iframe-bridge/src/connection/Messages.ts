import type {
  Ack1Message,
  Ack2Message,
  CallMessage,
  DestroyMessage,
  ReplyMessage,
  SynMessage,
} from './types'
import { NAMESPACE } from './types'

// Message factory functions for type safety and consistency
export const Messages = {
  /**
   * Creates a SYN message to initiate handshake
   */
  createSyn(participantId: string): SynMessage {
    return {
      namespace: NAMESPACE,
      type: 'SYN',
      participantId,
    }
  },

  /**
   * Creates an ACK1 message (first acknowledgment in handshake)
   */
  createAck1(fromParticipantId: string, toParticipantId: string): Ack1Message {
    return {
      namespace: NAMESPACE,
      type: 'ACK1',
      fromParticipantId,
      toParticipantId,
    }
  },

  /**
   * Creates an ACK2 message (final acknowledgment in handshake)
   */
  createAck2(fromParticipantId: string, toParticipantId: string): Ack2Message {
    return {
      namespace: NAMESPACE,
      type: 'ACK2',
      fromParticipantId,
      toParticipantId,
    }
  },

  /**
   * Creates a DESTROY message to signal connection teardown
   */
  createDestroy(fromParticipantId: string): DestroyMessage {
    return {
      namespace: NAMESPACE,
      type: 'DESTROY',
      fromParticipantId,
    }
  },

  /**
   * Creates a CALL message for remote method invocation
   */
  createCall(id: string, methodPath: string[], args: unknown[], channel?: string): CallMessage {
    return {
      namespace: NAMESPACE,
      type: 'CALL',
      id,
      methodPath,
      args,
      ...(channel && { channel }),
    }
  },

  /**
   * Creates a REPLY message for method call responses
   */
  createReply(callId: string, isError: boolean, value: unknown): ReplyMessage {
    return {
      namespace: NAMESPACE,
      type: 'REPLY',
      callId,
      isError,
      value,
    }
  },

  /**
   * Creates a success REPLY message
   */
  createSuccessReply(callId: string, value: unknown): ReplyMessage {
    return Messages.createReply(callId, false, value)
  },

  /**
   * Creates an error REPLY message
   */
  createErrorReply(callId: string, error: Error | string): ReplyMessage {
    const errorValue = error instanceof Error ? error.message : error
    return Messages.createReply(callId, true, errorValue)
  },
} as const
