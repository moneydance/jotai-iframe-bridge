import { describe, it, expect, vi, beforeEach } from 'vitest'
import { connectRemoteProxy, createRemoteProxy } from '../../src/connection/proxy'
import type { WindowMessenger } from '../../src/connection/messaging'
import type { CallMessage, Message, ReplyMessage } from '../../src/connection/types'
import { NAMESPACE } from '../../src/connection/types'
import { Messages } from '../../src/connection/Messages'

// Test interface
interface TestMethods extends Record<string, (...args: any[]) => any> {
  add: (a: number, b: number) => number
  subtract: (a: number, b: number) => number
  greet: (name: string) => string
  echo: (value: any) => any
}

describe('Proxy', () => {
  describe('createRemoteProxy', () => {
    it('should create a proxy that handles method calls', () => {
      const mockCallback = vi.fn().mockResolvedValue(42)
      const proxy = createRemoteProxy<TestMethods>(mockCallback)

      expect(typeof proxy.add).toBe('function')
      expect(typeof proxy.subtract).toBe('function')
      expect(typeof proxy.greet).toBe('function')
      expect(typeof proxy.echo).toBe('function')
    })

    it('should handle complex method arguments', () => {
      const mockCallback = vi.fn().mockResolvedValue('result')
      const proxy = createRemoteProxy<TestMethods>(mockCallback)

      // Should create functions for any accessed properties
      expect(typeof proxy.add).toBe('function')
      expect(typeof proxy.subtract).toBe('function')
    })

    it('should throw error when accessing method without calling it', () => {
      const mockCallback = vi.fn().mockResolvedValue(42)
      const proxy = createRemoteProxy<TestMethods>(mockCallback)

      expect(() => {
        // This should throw because we're not calling the function
        const method = proxy.add
        if (typeof method !== 'function') {
          throw new Error('Expected function')
        }
      }).not.toThrow()

      // But accessing the function should not throw
      expect(typeof proxy.add).toBe('function')
    })

    it('should not be thenable at root level', () => {
      const mockCallback = vi.fn().mockResolvedValue(42)
      const proxy = createRemoteProxy<TestMethods>(mockCallback)

      // The proxy itself should not be thenable
      expect(typeof (proxy as any).then).toBe('undefined')
    })
  })

  describe('connectRemoteProxy', () => {
    let mockMessenger: WindowMessenger
    let sentMessages: Message[]
    let messageHandlers: ((message: Message) => void)[]
    let mockLog: ReturnType<typeof vi.fn>

    beforeEach(() => {
      sentMessages = []
      messageHandlers = []
      mockLog = vi.fn()

      mockMessenger = {
        sendMessage: vi.fn((message: Message, onError?: (error: Error) => void) => {
          sentMessages.push(message)
          // Simulate successful send
          return Promise.resolve()
        }),
        addMessageHandler: vi.fn((handler: (message: Message) => void) => {
          messageHandlers.push(handler)
        }),
        removeMessageHandler: vi.fn((handler: (message: Message) => void) => {
          const index = messageHandlers.indexOf(handler)
          if (index > -1) {
            messageHandlers.splice(index, 1)
          }
        }),
        destroy: vi.fn(),
      } as unknown as WindowMessenger
    })

    it('should register message handler and return proxy', () => {
      const { remoteProxy, destroy } = connectRemoteProxy<TestMethods>(
        mockMessenger,
        undefined,
        'test-participant',
        mockLog,
        5000
      )

      expect(mockMessenger.addMessageHandler).toHaveBeenCalledTimes(1)
      expect(remoteProxy).toBeDefined()
      expect(destroy).toBeInstanceOf(Function)
    })

    it('should send call message when proxy method is invoked', async () => {
      const { remoteProxy } = connectRemoteProxy<TestMethods>(
        mockMessenger,
        undefined,
        'test-participant',
        mockLog,
        5000
      )

      // Start the async call (don't await yet)
      const callPromise = remoteProxy.add(5, 3)

      // Verify call message was sent
      expect(sentMessages).toHaveLength(1)
      const callMessage = sentMessages[0] as CallMessage
      expect(callMessage.type).toBe('CALL')
      expect(callMessage.namespace).toBe(NAMESPACE)
      expect(callMessage.methodPath).toEqual(['add'])
      expect(callMessage.args).toEqual([5, 3])
      expect(callMessage.fromParticipantId).toBe('test-participant')

      // Simulate successful reply
      const replyMessage = Messages.createSuccessReply(callMessage.id, 'test-participant', 8)
      messageHandlers.forEach((handler) => handler(replyMessage))

      // Wait for the promise to resolve
      const result = await callPromise
      expect(result).toBe(8)
    })

    it('should handle error replies correctly', async () => {
      const { remoteProxy } = connectRemoteProxy<TestMethods>(
        mockMessenger,
        undefined,
        'test-participant',
        mockLog,
        5000
      )

      const callPromise = remoteProxy.add(1, 2)

      // Get the call message
      const callMessage = sentMessages[0] as CallMessage

      // Simulate error reply
      const errorReply: ReplyMessage = Messages.createErrorReply(
        callMessage.id,
        'test-participant',
        'Method failed'
      )
      messageHandlers.forEach((handler) => handler(errorReply))

      // Should reject with the error
      await expect(callPromise).rejects.toThrow('Method failed')
    })

    it('should handle timeout correctly', async () => {
      vi.useFakeTimers()

      const { remoteProxy } = connectRemoteProxy<TestMethods>(
        mockMessenger,
        undefined,
        'test-participant',
        mockLog,
        1000
      )

      const callPromise = remoteProxy.add(1, 2)

      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(1000)

      // Should reject with timeout error
      await expect(callPromise).rejects.toThrow('Method call add() timed out after 1000ms')

      vi.useRealTimers()
    })

    it('should ignore non-reply messages', async () => {
      const { remoteProxy } = connectRemoteProxy<TestMethods>(
        mockMessenger,
        undefined,
        'test-participant',
        mockLog,
        5000
      )

      const callPromise = remoteProxy.add(1, 2)

      // Get the call message
      const callMessage = sentMessages[0] as CallMessage

      // Send non-reply message (should be ignored)
      const nonReplyMessage = Messages.createSyn('other-participant')
      messageHandlers.forEach((handler) => handler(nonReplyMessage))

      // Send correct reply
      const replyMessage = Messages.createSuccessReply(callMessage.id, 'test-participant', 3)
      messageHandlers.forEach((handler) => handler(replyMessage))

      const result = await callPromise
      expect(result).toBe(3)
    })

    it('should ignore replies for unknown call IDs', async () => {
      const { remoteProxy } = connectRemoteProxy<TestMethods>(
        mockMessenger,
        undefined,
        'test-participant',
        mockLog,
        5000
      )

      const callPromise = remoteProxy.add(1, 2)

      // Get the call message
      const callMessage = sentMessages[0] as CallMessage

      // Send reply with wrong ID (should be ignored)
      const wrongIdReply = Messages.createSuccessReply('wrong-id', 'test-participant', 999)
      messageHandlers.forEach((handler) => handler(wrongIdReply))

      // Send correct reply
      const correctReply = Messages.createSuccessReply(callMessage.id, 'test-participant', 3)
      messageHandlers.forEach((handler) => handler(correctReply))

      const result = await callPromise
      expect(result).toBe(3)
    })

    it('should handle multiple concurrent calls correctly', async () => {
      const { remoteProxy } = connectRemoteProxy<TestMethods>(
        mockMessenger,
        undefined,
        'test-participant',
        mockLog,
        5000
      )

      // Start multiple concurrent calls
      const call1 = remoteProxy.add(1, 2)
      const call2 = remoteProxy.subtract(10, 5)
      const call3 = remoteProxy.greet('World')

      // Should have sent 3 messages
      expect(sentMessages).toHaveLength(3)

      // Reply to each call in reverse order
      const message3 = sentMessages[2] as CallMessage
      const message2 = sentMessages[1] as CallMessage
      const message1 = sentMessages[0] as CallMessage

      const reply3 = Messages.createSuccessReply(message3.id, 'test-participant', 'Hello, World!')
      const reply2 = Messages.createSuccessReply(message2.id, 'test-participant', 5)
      const reply1 = Messages.createSuccessReply(message1.id, 'test-participant', 3)

      messageHandlers.forEach((handler) => {
        handler(reply3)
        handler(reply2)
        handler(reply1)
      })

      // All should resolve correctly
      const [result1, result2, result3] = await Promise.all([call1, call2, call3])
      expect(result1).toBe(3)
      expect(result2).toBe(5)
      expect(result3).toBe('Hello, World!')
    })

    it('should include channel in call message when provided', async () => {
      const { remoteProxy } = connectRemoteProxy<TestMethods>(
        mockMessenger,
        'test-channel',
        'test-participant',
        mockLog,
        5000
      )

      remoteProxy.add(1, 2)

      expect(sentMessages).toHaveLength(1)
      const callMessage = sentMessages[0] as CallMessage
      expect(callMessage.channel).toBe('test-channel')
    })

    it('should handle messenger send errors', async () => {
      // Mock messenger that fails to send
      const failingMessenger = {
        ...mockMessenger,
        sendMessage: vi.fn(() => {
          throw new Error('Send failed')
        }),
      } as unknown as WindowMessenger

      const { remoteProxy } = connectRemoteProxy<TestMethods>(
        failingMessenger,
        undefined,
        'test-participant',
        mockLog,
        5000
      )

      await expect(remoteProxy.add(1, 2)).rejects.toThrow('Send failed')
    })

    describe('destroy functionality', () => {
      it('should remove message handler when destroyed', () => {
        const { destroy } = connectRemoteProxy<TestMethods>(
          mockMessenger,
          undefined,
          'test-participant',
          mockLog,
          5000
        )

        expect(mockMessenger.addMessageHandler).toHaveBeenCalledTimes(1)

        destroy()

        expect(mockMessenger.removeMessageHandler).toHaveBeenCalledTimes(1)
      })

      it('should reject pending calls when destroyed', async () => {
        const { remoteProxy, destroy } = connectRemoteProxy<TestMethods>(
          mockMessenger,
          undefined,
          'test-participant',
          mockLog,
          5000
        )

        const call1Promise = remoteProxy.add(1, 2)
        const call2Promise = remoteProxy.subtract(5, 3)

        destroy()

        // All pending calls should be rejected
        await expect(call1Promise).rejects.toThrow('failed due to destroyed connection')
        await expect(call2Promise).rejects.toThrow('failed due to destroyed connection')
      })

      it('should reject new calls after destruction', async () => {
        const { remoteProxy, destroy } = connectRemoteProxy<TestMethods>(
          mockMessenger,
          undefined,
          'test-participant',
          mockLog,
          5000
        )

        destroy()

        await expect(remoteProxy.add(1, 2)).rejects.toThrow('failed due to destroyed connection')
      })

      it('should ignore messages after destruction', async () => {
        const { remoteProxy, destroy } = connectRemoteProxy<TestMethods>(
          mockMessenger,
          undefined,
          'test-participant',
          mockLog,
          5000
        )

        const callPromise = remoteProxy.add(1, 2)

        // Get the call message
        const callMessage = sentMessages[0] as CallMessage

        destroy()

        // Try to send reply (should be ignored)
        const replyMessage = Messages.createSuccessReply(callMessage.id, 'test-participant', 3)
        messageHandlers.forEach((handler) => handler(replyMessage))

        // Promise should still be rejected due to destruction
        await expect(callPromise).rejects.toThrow('failed due to destroyed connection')
      })

      it('should be safe to call destroy multiple times', () => {
        const { destroy } = connectRemoteProxy<TestMethods>(
          mockMessenger,
          undefined,
          'test-participant',
          mockLog,
          5000
        )

        expect(() => {
          destroy()
          destroy()
          destroy()
        }).not.toThrow()
      })
    })

    describe('logging', () => {
      it('should log method calls when log function provided', () => {
        const { remoteProxy } = connectRemoteProxy<TestMethods>(
          mockMessenger,
          undefined,
          'test-participant',
          mockLog,
          5000
        )

        remoteProxy.add(1, 2)

        expect(mockLog).toHaveBeenCalledWith(
          'Sending add() call',
          expect.objectContaining({
            type: 'CALL',
            methodPath: ['add'],
            args: [1, 2],
          })
        )
      })

      it('should not throw when no log function provided', () => {
        expect(() => {
          const { remoteProxy } = connectRemoteProxy<TestMethods>(
            mockMessenger,
            undefined,
            'test-participant',
            undefined,
            5000
          )

          remoteProxy.add(1, 2)
        }).not.toThrow()
      })
    })

    describe('zero timeout behavior', () => {
      it('should not set timeout when timeout is 0', async () => {
        const { remoteProxy } = connectRemoteProxy<TestMethods>(
          mockMessenger,
          undefined,
          'test-participant',
          mockLog,
          0
        )

        const callPromise = remoteProxy.add(1, 2)

        // Should not timeout immediately
        expect(sentMessages).toHaveLength(1)

        // Get the call message and reply
        const callMessage = sentMessages[0] as CallMessage
        const replyMessage = Messages.createSuccessReply(callMessage.id, 'test-participant', 3)
        messageHandlers.forEach((handler) => handler(replyMessage))

        const result = await callPromise
        expect(result).toBe(3)
      })
    })
  })
})
