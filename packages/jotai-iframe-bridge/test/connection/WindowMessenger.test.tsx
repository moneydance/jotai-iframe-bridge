import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WindowMessenger } from '../../src/connection/messaging'
import { Messages } from '../../src/connection/Messages'

describe('WindowMessenger', () => {
  let messenger: WindowMessenger
  let mockLog: ReturnType<typeof vi.fn>
  let postMessageSpy: ReturnType<typeof vi.spyOn>
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>
  let messageHandler: (event: MessageEvent) => void

  beforeEach(() => {
    mockLog = vi.fn()

    // Spy on window methods
    postMessageSpy = vi.spyOn(window, 'postMessage')
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    messenger = new WindowMessenger(
      window, // Use actual window as target
      ['http://localhost:5174', 'http://localhost:5175'], // Allow specific origins
      'test-participant-id',
      mockLog
    )

    // Capture the message handler that was registered
    expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
    messageHandler = addEventListenerSpy.mock.calls[0][1] as (event: MessageEvent) => void
  })

  afterEach(() => {
    messenger.destroy()
  })

  describe('Self-Message Filtering Bug Fix', () => {
    it('should reject self-messages and not call handlers', () => {
      const selfMessage = Messages.createSyn('test-participant-id') // Same as messenger's participantId
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      // Simulate receiving a self-message from allowed origin
      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:5174',
        data: selfMessage,
      })

      messageHandler(messageEvent)

      // Handler should NOT be called for self-message
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should accept messages from different participants', () => {
      const validMessage = Messages.createSyn('different-participant-id')
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:5174',
        data: validMessage,
      })

      messageHandler(messageEvent)

      // Handler SHOULD be called for non-self message
      expect(mockHandler).toHaveBeenCalledWith(validMessage)
    })

    it('should reject multiple self-message types', () => {
      const mockHandler = vi.fn()
      messenger.addMessageHandler(mockHandler)

      // Test different message types with same participantId
      const selfMessages = [
        Messages.createSyn('test-participant-id'),
        Messages.createAck1('test-participant-id', 'other-participant'),
        Messages.createAck2('test-participant-id', 'other-participant'),
      ]

      selfMessages.forEach((selfMessage) => {
        const messageEvent = new MessageEvent('message', {
          origin: 'http://localhost:5174',
          data: selfMessage,
        })
        messageHandler(messageEvent)
      })

      // No handlers should be called for any self-messages
      expect(mockHandler).not.toHaveBeenCalled()
    })
  })

  describe('Origin Validation', () => {
    it('should reject messages from disallowed origins', () => {
      const validMessage = Messages.createSyn('other-participant')
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      // Message from disallowed origin
      const messageEvent = new MessageEvent('message', {
        origin: 'http://malicious-site.com',
        data: validMessage,
      })

      messageHandler(messageEvent)

      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should accept messages from allowed origins', () => {
      const validMessage = Messages.createSyn('other-participant')
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      // Test both allowed origins
      const allowedOrigins = ['http://localhost:5174', 'http://localhost:5175']

      allowedOrigins.forEach((origin, index) => {
        const messageEvent = new MessageEvent('message', {
          origin,
          data: validMessage,
        })
        messageHandler(messageEvent)
      })

      expect(mockHandler).toHaveBeenCalledTimes(2)
      expect(mockHandler).toHaveBeenCalledWith(validMessage)
    })

    it('should handle wildcard origins', () => {
      // Create new messenger with wildcard origin
      const wildcardMessenger = new WindowMessenger(window, ['*'], 'test-participant-id', mockLog)

      const validMessage = Messages.createSyn('other-participant')
      const mockHandler = vi.fn()

      wildcardMessenger.addMessageHandler(mockHandler)

      // Get the handler for wildcard messenger
      const wildcardHandler = addEventListenerSpy.mock.calls[1][1] as (event: MessageEvent) => void

      // Any origin should be allowed with ['*']
      const messageEvent = new MessageEvent('message', {
        origin: 'http://any-domain.com',
        data: validMessage,
      })

      wildcardHandler(messageEvent)

      expect(mockHandler).toHaveBeenCalledWith(validMessage)

      wildcardMessenger.destroy()
    })
  })

  describe('Message Validation', () => {
    it('should ignore non-bridge messages', () => {
      const nonBridgeMessage = {
        type: 'some-other-message',
        data: 'not a bridge message',
      }
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:5174',
        data: nonBridgeMessage,
      })

      messageHandler(messageEvent)

      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should process valid bridge messages', () => {
      const bridgeMessage = Messages.createSyn('other-participant')
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:5174',
        data: bridgeMessage,
      })

      messageHandler(messageEvent)

      expect(mockHandler).toHaveBeenCalledWith(bridgeMessage)
    })

    it('should handle malformed messages gracefully', () => {
      const malformedMessage = {
        namespace: 'jotai-iframe-bridge',
        // Missing required fields
      }
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      expect(() => {
        const messageEvent = new MessageEvent('message', {
          origin: 'http://localhost:5174',
          data: malformedMessage,
        })
        messageHandler(messageEvent)
      }).not.toThrow()

      // Should not process malformed messages
      expect(mockHandler).not.toHaveBeenCalled()
    })
  })

  describe('Message Handler Management', () => {
    it('should call all registered handlers for valid messages', () => {
      const validMessage = Messages.createSyn('other-participant')
      const mockHandler1 = vi.fn()
      const mockHandler2 = vi.fn()
      const mockHandler3 = vi.fn()

      messenger.addMessageHandler(mockHandler1)
      messenger.addMessageHandler(mockHandler2)
      messenger.addMessageHandler(mockHandler3)

      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:5174',
        data: validMessage,
      })

      messageHandler(messageEvent)

      expect(mockHandler1).toHaveBeenCalledWith(validMessage)
      expect(mockHandler2).toHaveBeenCalledWith(validMessage)
      expect(mockHandler3).toHaveBeenCalledWith(validMessage)
    })

    it('should properly remove handlers', () => {
      const validMessage = Messages.createSyn('other-participant')
      const mockHandler1 = vi.fn()
      const mockHandler2 = vi.fn()

      messenger.addMessageHandler(mockHandler1)
      messenger.addMessageHandler(mockHandler2)

      // Remove one handler
      messenger.removeMessageHandler(mockHandler1)

      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:5174',
        data: validMessage,
      })

      messageHandler(messageEvent)

      // Only handler2 should be called
      expect(mockHandler1).not.toHaveBeenCalled()
      expect(mockHandler2).toHaveBeenCalledWith(validMessage)
    })

    it('should handle empty handlers gracefully', () => {
      const validMessage = Messages.createSyn('other-participant')

      // No handlers registered
      expect(() => {
        const messageEvent = new MessageEvent('message', {
          origin: 'http://localhost:5174',
          data: validMessage,
        })
        messageHandler(messageEvent)
      }).not.toThrow()
    })
  })

  describe('Destroyed Messenger', () => {
    it('should ignore all messages when destroyed', () => {
      const validMessage = Messages.createSyn('other-participant')
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)
      messenger.destroy()

      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:5174',
        data: validMessage,
      })

      messageHandler(messageEvent)

      expect(mockHandler).not.toHaveBeenCalled()
      expect(mockLog).toHaveBeenCalledWith('❌ Message ignored: WindowMessenger destroyed')
    })

    it('should properly clean up event listeners', () => {
      // Clear the spy call history from constructor
      removeEventListenerSpy.mockClear()

      // Destroy the messenger
      messenger.destroy()

      // Verify removeEventListener was called
      expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
    })
  })

  describe('Message Sending', () => {
    it('should send messages using postMessage', async () => {
      const testMessage = Messages.createSyn('test-participant-id')

      await messenger.sendMessage(testMessage)

      expect(postMessageSpy).toHaveBeenCalledWith(
        testMessage,
        '*' // Should use wildcard initially
      )
    })

    it('should use concrete origin after receiving valid message', async () => {
      // First, establish concrete origin by receiving a message
      const incomingMessage = Messages.createSyn('other-participant')
      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:5174',
        data: incomingMessage,
      })
      messageHandler(messageEvent)

      // Clear previous postMessage calls
      postMessageSpy.mockClear()

      // Now send a non-SYN message (SYN messages always use '*' by design)
      const testMessage = Messages.createAck1('test-participant-id', 'other-participant')
      await messenger.sendMessage(testMessage)

      expect(postMessageSpy).toHaveBeenCalledWith(
        testMessage,
        'http://localhost:5174' // Should use concrete origin for non-SYN messages
      )
    })

    it('should handle send errors gracefully', async () => {
      const testMessage = Messages.createSyn('test-participant-id')
      const mockError = new Error('Send failed')

      // Mock postMessage to throw
      postMessageSpy.mockImplementation(() => {
        throw mockError
      })

      const errorCallback = vi.fn()
      await messenger.sendMessage(testMessage, errorCallback)

      expect(errorCallback).toHaveBeenCalledWith(mockError)
      expect(mockLog).toHaveBeenCalledWith(
        '❌ Failed to send message:',
        'SYN',
        'Error:',
        'Send failed'
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle messages with missing fromParticipantId', () => {
      const messageWithoutParticipantId = {
        namespace: 'jotai-iframe-bridge',
        type: 'SYN',
        // fromParticipantId is missing
      }
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      expect(() => {
        const messageEvent = new MessageEvent('message', {
          origin: 'http://localhost:5174',
          data: messageWithoutParticipantId,
        })
        messageHandler(messageEvent)
      }).not.toThrow()

      // Message without fromParticipantId should be rejected by isMessage validation
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should handle rapid message processing correctly', () => {
      const message1 = Messages.createSyn('participant-1')
      const message2 = Messages.createSyn('participant-2')
      const mockHandler = vi.fn()

      messenger.addMessageHandler(mockHandler)

      // Process messages rapidly
      messageHandler(
        new MessageEvent('message', {
          origin: 'http://localhost:5174',
          data: message1,
        })
      )

      messageHandler(
        new MessageEvent('message', {
          origin: 'http://localhost:5175',
          data: message2,
        })
      )

      // Both should be processed
      expect(mockHandler).toHaveBeenCalledTimes(2)
      expect(mockHandler).toHaveBeenNthCalledWith(1, message1)
      expect(mockHandler).toHaveBeenNthCalledWith(2, message2)
    })
  })
})
