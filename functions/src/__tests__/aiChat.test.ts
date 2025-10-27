import { Request, Response } from 'firebase-functions/v1';

// Mock OpenAI - must be before import
const mockOpenAICreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockOpenAICreate,
        },
      },
    })),
  };
});

import { streamAIChat } from '../aiChat';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  return {
    auth: jest.fn(),
    firestore: jest.fn(),
  };
});

// Mock rate limiting
jest.mock('../rateLimiting', () => ({
  rateLimitMiddleware: jest.fn().mockResolvedValue(undefined),
  incrementRateLimit: jest.fn().mockResolvedValue(undefined),
}));

import * as admin from 'firebase-admin';
import { rateLimitMiddleware, incrementRateLimit } from '../rateLimiting';

describe('AI Chat Streaming', () => {
  let mockAuth: any;
  let mockFirestore: any;
  let mockDocRef: any;
  let mockCollectionRef: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockWriteData: string[];

  beforeEach(() => {
    mockWriteData = [];

    // Reset OpenAI mock for each test
    mockOpenAICreate.mockReset();

    // Setup Auth mock
    mockAuth = {
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: 'user123',
        email: 'test@example.com',
      }),
    };
    ((admin.auth as unknown) as jest.Mock).mockReturnValue(mockAuth);

    // Setup Firestore mock chain
    mockDocRef = {
      get: jest.fn().mockResolvedValue({ exists: false }),
    };

    mockCollectionRef = {
      doc: jest.fn().mockReturnValue(mockDocRef),
    };

    mockFirestore = {
      collection: jest.fn().mockReturnValue(mockCollectionRef),
    };

    ((admin.firestore as unknown) as jest.Mock).mockReturnValue(mockFirestore);

    // Setup request mock
    mockRequest = {
      method: 'POST',
      headers: {
        authorization: 'Bearer fake-token',
      },
      body: {
        messages: [],
        messageContext: true,
        messageText: 'Break a leg!',
        messageLang: 'en-US',
        senderId: 'sender123',
        senderNationality: 'American',
        userNationality: 'Mexican',
        hasPreGeneratedInsight: false,
        preGeneratedInsight: null,
      },
    };

    // Setup response mock
    mockResponse = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
      writeHead: jest.fn(),
      write: jest.fn((data) => {
        mockWriteData.push(data);
        return true;
      }) as any,
      end: jest.fn(),
    };
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      mockRequest.headers = {};

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.send).toHaveBeenCalledWith('Unauthorized');
    });

    it('should reject invalid bearer tokens', async () => {
      mockAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should verify Firebase ID token', async () => {
      // Mock successful streaming
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Test' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('fake-token');
    });
  });

  describe('Rate Limiting', () => {
    it('should check rate limit before streaming', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Test' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(rateLimitMiddleware).toHaveBeenCalledWith('user123', 'aiChat');
    });

    it('should increment rate limit after successful stream', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Test' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(incrementRateLimit).toHaveBeenCalledWith('user123', 'aiChat');
    });

    it('should not increment on rate limit error', async () => {
      (rateLimitMiddleware as jest.Mock).mockRejectedValue(new Error('Rate limit exceeded'));

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(incrementRateLimit).not.toHaveBeenCalled();
    });
  });

  describe('Streaming Response', () => {
    it('should stream OpenAI response as SSE format', async () => {
      // Mock streaming response
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Hello ' } }] };
          yield { choices: [{ delta: { content: 'world!' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      // Should set SSE headers
      expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }));

      // Should write chunks in SSE format
      expect(mockWriteData).toContain('data: {"text":"Hello "}\n\n');
      expect(mockWriteData).toContain('data: {"text":"world!"}\n\n');
      expect(mockWriteData).toContain('data: {"done":true}\n\n');
    });

    it('should handle empty chunks', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: {} }] }; // Empty delta
          yield { choices: [{ delta: { content: 'Text' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      // Should only write non-empty content
      const textChunks = mockWriteData.filter(d => d.includes('"text"'));
      expect(textChunks).toHaveLength(1);
      expect(textChunks[0]).toContain('"text":"Text"');
    });

    it('should send completion signal at end', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Done' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockWriteData[mockWriteData.length - 1]).toBe('data: {"done":true}\n\n');
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe('Message Context', () => {
    it('should include message context in system prompt', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Analysis' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      const callArgs = (mockOpenAICreate as jest.Mock).mock.calls[0][0];
      const systemMessage = callArgs.messages.find((m: any) => m.role === 'system');

      expect(systemMessage.content).toContain('Break a leg!');
      expect(systemMessage.content).toContain('en-US');
      expect(systemMessage.content).toContain('American');
      expect(systemMessage.content).toContain('Mexican');
    });

    it('should show pre-generated insights in prompt when available', async () => {
      mockRequest.body = {
        ...mockRequest.body,
        hasPreGeneratedInsight: true,
        preGeneratedInsight: 'This idiom means good luck',
      };

      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Answer' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      const callArgs = (mockOpenAICreate as jest.Mock).mock.calls[0][0];
      const systemMessage = callArgs.messages.find((m: any) => m.role === 'system');

      expect(systemMessage.content).toContain('This idiom means good luck');
      expect(systemMessage.content).toContain('already analyzed');
    });

    it('should include conversation history', async () => {
      mockRequest.body = {
        ...mockRequest.body,
        messages: [
          { role: 'user', content: 'What does this mean?' },
          { role: 'assistant', content: 'It means good luck.' },
        ],
      };

      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'More context' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      const callArgs = (mockOpenAICreate as jest.Mock).mock.calls[0][0];
      expect(callArgs.messages).toContainEqual({
        role: 'user',
        content: 'What does this mean?',
      });
      expect(callArgs.messages).toContainEqual({
        role: 'assistant',
        content: 'It means good luck.',
      });
    });

    it('should fetch relationship context when sender is different', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ relationship: 'friend' }),
      });

      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Reply' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      const callArgs = (mockOpenAICreate as jest.Mock).mock.calls[0][0];
      const systemMessage = callArgs.messages.find((m: any) => m.role === 'system');

      expect(systemMessage.content).toContain('friend');
    });

    it('should not fetch relationship context for own messages', async () => {
      mockRequest.body = {
        ...mockRequest.body,
        senderId: 'user123', // Same as authenticated user
      };

      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Reply' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      // Should not query Firestore for relationship
      expect(mockFirestore.collection).not.toHaveBeenCalledWith('users');
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI API errors', async () => {
      (mockOpenAICreate as jest.Mock).mockRejectedValue(
        new Error('OpenAI error')
      );

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should handle insufficient quota error', async () => {
      const quotaError: any = new Error('Insufficient quota');
      quotaError.code = 'insufficient_quota';

      (mockOpenAICreate as jest.Mock).mockRejectedValue(quotaError);

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
    });

    it('should send error through stream if headers already sent', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Start' } }] };
          throw new Error('Stream error');
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      // Should write error to stream
      const errorChunk = mockWriteData.find(d => d.includes('error'));
      expect(errorChunk).toBeTruthy();
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe('HTTP Method Validation', () => {
    it('should reject GET requests', async () => {
      mockRequest.method = 'GET';

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(405);
      expect(mockResponse.send).toHaveBeenCalledWith('Method not allowed');
    });

    it('should handle OPTIONS requests for CORS', async () => {
      mockRequest.method = 'OPTIONS';

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.set).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    });
  });

  describe('OpenAI Configuration', () => {
    it('should use correct model and parameters', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Test' } }] };
        },
      });

      await streamAIChat(mockRequest as Request, mockResponse as Response);

      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo',
          temperature: 0.7,
          max_tokens: 1000,
          stream: true,
        })
      );
    });
  });
});
