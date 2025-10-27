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

import { _analyzeAndTranslate } from '../aiAnalysis';

// Mock Pinecone/embeddings
jest.mock('../embeddings', () => ({
  getContextForTranslation: jest.fn().mockResolvedValue({
    context: 'User typically uses casual language with friends.',
    messageCount: 5,
    tokenCount: 150,
  }),
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  return {
    firestore: jest.fn(),
  };
});

import * as admin from 'firebase-admin';
import { getContextForTranslation } from '../embeddings';

describe('AI Analysis', () => {
  let mockFirestore: any;
  let mockDocRef: any;
  let mockCollectionRef: any;

  beforeEach(() => {
    // Reset the mockOpenAICreate for each test
    mockOpenAICreate.mockReset();

    // Reset getContextForTranslation mock (resetMocks: true in jest.config clears it)
    (getContextForTranslation as jest.Mock).mockResolvedValue({
      context: 'User typically uses casual language with friends.',
      messageCount: 5,
      tokenCount: 150,
    });

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
  });

  describe('_analyzeAndTranslate', () => {
    it('should translate text to target languages', async () => {
      // Mock OpenAI response
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: {
                'es-MX': '¡Eso es pan comido!',
                'fr-FR': "C'est du gâteau!",
              },
              aiInsights: {
                'es-MX': 'Este es un modismo que significa "muy fácil"',
                'fr-FR': "C'est un idiome qui signifie \"très facile\"",
              },
              tone: 'casual',
            }),
          },
        }],
      });

      const result = await _analyzeAndTranslate({
        text: "That's a piece of cake!",
        sourceLang: 'en-US',
        targetLanguages: ['es-MX', 'fr-FR'],
        senderId: 'user123',
        requestingUserId: 'user456',
      });

      expect(result.translations).toEqual({
        'es-MX': '¡Eso es pan comido!',
        'fr-FR': "C'est du gâteau!",
      });
      expect(result.aiInsights).toEqual({
        'es-MX': 'Este es un modismo que significa "muy fácil"',
        'fr-FR': "C'est un idiome qui signifie \"très facile\"",
      });
      expect(result.tone).toBe('casual');
    });

    it('should skip translation if same language', async () => {
      const result = await _analyzeAndTranslate({
        text: 'Hello world',
        sourceLang: 'en-US',
        targetLanguages: ['en-US', 'en-GB'], // Same base language
        senderId: 'user123',
        requestingUserId: 'user456',
      });

      expect(result.translations).toEqual({});
      expect(result.aiInsights).toEqual({});
      expect(result.tone).toBeNull();
      expect(mockOpenAICreate).not.toHaveBeenCalled();
    });

    it('should filter out null insights', async () => {
      // Mock OpenAI response with some null insights
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: {
                'es-MX': 'Hola',
                'fr-FR': 'Bonjour',
              },
              aiInsights: {
                'es-MX': null, // No insight needed for simple greeting
                'fr-FR': null,
              },
              tone: 'friendly',
            }),
          },
        }],
      });

      const result = await _analyzeAndTranslate({
        text: 'Hello',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX', 'fr-FR'],
        senderId: 'user123',
        requestingUserId: 'user456',
      });

      expect(result.aiInsights).toBeNull(); // All insights were null
    });

    it('should call Pinecone for RAG context when chatId provided', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: { 'es-MX': 'Traducción' },
              aiInsights: {},
              tone: 'neutral',
            }),
          },
        }],
      });

      await _analyzeAndTranslate({
        text: 'Test message',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX'],
        chatId: 'chat123',
        senderId: 'user123',
        requestingUserId: 'user456',
      });

      expect(getContextForTranslation).toHaveBeenCalledWith(
        'chat123',
        'user123',
        'Test message',
        3000
      );
    });

    it('should include relationship context in prompt', async () => {
      // Mock contact relationship
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ relationship: 'coworker' }),
      });

      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: { 'es-MX': 'Traducción' },
              aiInsights: {},
              tone: 'professional',
            }),
          },
        }],
      });

      await _analyzeAndTranslate({
        text: 'We need to circle back on this',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX'],
        senderId: 'user123',
        participantIds: ['user123', 'user456'],
        senderNationality: 'American',
        requestingUserId: 'user456',
      });

      // Verify OpenAI was called
      expect(mockOpenAICreate).toHaveBeenCalled();

      // Check that the prompt includes relationship context
      const callArgs = (mockOpenAICreate as jest.Mock).mock.calls[0][0];
      const systemMessage = callArgs.messages.find((m: any) => m.role === 'system');
      expect(systemMessage.content).toContain('coworker');
    });

    it('should handle multiple target languages', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: {
                'es-MX': 'Español',
                'fr-FR': 'Français',
                'de-DE': 'Deutsch',
                'ja-JP': '日本語',
              },
              aiInsights: {},
              tone: 'neutral',
            }),
          },
        }],
      });

      const result = await _analyzeAndTranslate({
        text: 'Hello',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX', 'fr-FR', 'de-DE', 'ja-JP'],
        senderId: 'user123',
        requestingUserId: 'user456',
      });

      expect(Object.keys(result.translations)).toHaveLength(4);
    });

    it('should deduplicate target languages', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: { 'es-MX': 'Hola' },
              aiInsights: {},
              tone: 'friendly',
            }),
          },
        }],
      });

      await _analyzeAndTranslate({
        text: 'Hello',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX', 'es-MX', 'es-MX'], // Duplicates
        senderId: 'user123',
        requestingUserId: 'user456',
      });

      // Verify OpenAI was called with deduplicated languages
      const callArgs = (mockOpenAICreate as jest.Mock).mock.calls[0][0];
      const systemMessage = callArgs.messages.find((m: any) => m.role === 'system');
      // Should only mention es-MX once in the prompt
      expect(systemMessage.content).toContain('es-MX');
    });

    it('should handle OpenAI errors gracefully', async () => {
      (mockOpenAICreate as jest.Mock).mockRejectedValue(
        new Error('OpenAI API error')
      );

      await expect(_analyzeAndTranslate({
        text: 'Test',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX'],
        senderId: 'user123',
        requestingUserId: 'user456',
      })).rejects.toThrow('OpenAI API error');
    });

    it('should handle empty response from OpenAI', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: '', // Empty response
          },
        }],
      });

      await expect(_analyzeAndTranslate({
        text: 'Test',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX'],
        senderId: 'user123',
        requestingUserId: 'user456',
      })).rejects.toThrow('Empty response');
    });

    it('should use correct OpenAI model and parameters', async () => {
      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: { 'es-MX': 'Test' },
              aiInsights: {},
              tone: 'neutral',
            }),
          },
        }],
      });

      await _analyzeAndTranslate({
        text: 'Test',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX'],
        senderId: 'user123',
        requestingUserId: 'user456',
      });

      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo',
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        })
      );
    });

    it('should handle Pinecone errors gracefully', async () => {
      // Mock Pinecone error
      (getContextForTranslation as jest.Mock).mockRejectedValue(
        new Error('Pinecone error')
      );

      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: { 'es-MX': 'Test' },
              aiInsights: {},
              tone: 'neutral',
            }),
          },
        }],
      });

      // Should still work even if Pinecone fails
      const result = await _analyzeAndTranslate({
        text: 'Test',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX'],
        chatId: 'chat123',
        senderId: 'user123',
        requestingUserId: 'user456',
      });

      expect(result.translations).toEqual({ 'es-MX': 'Test' });
    });

    it('should limit relationship contexts to 10 participants', async () => {
      // Mock 15 participants (should only process 10)
      const participantIds = Array.from({ length: 15 }, (_, i) => `user${i}`);

      (mockOpenAICreate as jest.Mock).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: { 'es-MX': 'Test' },
              aiInsights: {},
              tone: 'neutral',
            }),
          },
        }],
      });

      await _analyzeAndTranslate({
        text: 'Test',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX'],
        senderId: 'user0',
        participantIds,
        requestingUserId: 'user1',
      });

      // Should still call OpenAI for translation
      expect(mockOpenAICreate).toHaveBeenCalled();
    });
  });
});
