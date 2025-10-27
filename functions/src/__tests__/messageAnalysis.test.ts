import { autoAnalyzeAndTranslate } from '../messageAnalysis';

// Mock the internal analyze function
jest.mock('../aiAnalysis', () => ({
  _analyzeAndTranslate: jest.fn(),
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  return {
    firestore: jest.fn(),
  };
});

import * as admin from 'firebase-admin';
import { _analyzeAndTranslate } from '../aiAnalysis';

describe('Message Analysis Trigger', () => {
  let mockFirestore: any;
  let mockSnapshot: any;
  let mockContext: any;
  let mockDocRef: any;
  let mockCollectionRef: any;

  beforeAll(() => {
    // Set environment variable required by Firebase Functions
    process.env.GCLOUD_PROJECT = 'test-project';
  });

  afterAll(() => {
    delete process.env.GCLOUD_PROJECT;
  });

  beforeEach(() => {
    // Setup Firestore mock chain
    mockDocRef = {
      get: jest.fn(),
    };

    mockCollectionRef = {
      doc: jest.fn().mockReturnValue(mockDocRef),
    };

    mockFirestore = {
      collection: jest.fn().mockReturnValue(mockCollectionRef),
    };

    ((admin.firestore as unknown) as jest.Mock).mockReturnValue(mockFirestore);

    // Setup typical message data
    mockSnapshot = {
      data: () => ({
        text: 'Break a leg!',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user123',
        timestamp: Date.now(),
        readBy: { user123: Date.now() },
      }),
      ref: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    mockContext = {
      params: {
        messageId: 'msg123',
      },
      resource: {
        name: 'projects/test-project/databases/(default)/documents/messages/msg123',
      },
      eventType: 'providers/cloud.firestore/eventTypes/document.create',
    };
  });

  describe('Trigger Conditions', () => {
    it('should process messages with required fields', async () => {
      // Mock chat with participants
      mockDocRef.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            participants: ['user123', 'user456'],
            type: 'direct',
          }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ preferredLanguage: 'es-MX' }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ nationality: 'American' }),
        });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': '¡Buena suerte!' },
        aiInsights: { 'es-MX': 'Este es un modismo' },
        tone: 'encouraging',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      expect(_analyzeAndTranslate).toHaveBeenCalled();
      expect(mockSnapshot.ref.update).toHaveBeenCalled();
    });

    it('should skip messages without text', async () => {
      mockSnapshot.data = () => ({
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user123',
        // Missing text field
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
      expect(mockSnapshot.ref.update).not.toHaveBeenCalled();
    });

    it('should skip messages without originalLanguage', async () => {
      mockSnapshot.data = () => ({
        text: 'Hello',
        chatId: 'chat123',
        senderId: 'user123',
        // Missing originalLanguage
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should skip messages already translated', async () => {
      mockSnapshot.data = () => ({
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user123',
        translations: { 'es-MX': 'Hola' }, // Already has translations
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should skip messages without chatId', async () => {
      mockSnapshot.data = () => ({
        text: 'Hello',
        originalLanguage: 'en-US',
        senderId: 'user123',
        // Missing chatId
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });
  });

  describe('Participant Language Detection', () => {
    it('should fetch participant languages from user profiles', async () => {
      // Mock user language preferences
      mockDocRef.get
        .mockResolvedValueOnce({
          // Chat data
          exists: true,
          data: () => ({
            participants: ['user123', 'user456'],
            type: 'direct',
          }),
        })
        .mockResolvedValueOnce({
          // user456 profile
          exists: true,
          data: () => ({ preferredLanguage: 'es-MX' }),
        })
        .mockResolvedValueOnce({
          // sender profile
          exists: true,
          data: () => ({ nationality: 'American' }),
        });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Traducción' },
        aiInsights: {},
        tone: 'neutral',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      // Should call _analyzeAndTranslate with correct target languages
      expect(_analyzeAndTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          targetLanguages: ['es-MX'],
        })
      );
    });

    it('should skip sender language from target languages', async () => {
      mockDocRef.get
        .mockResolvedValueOnce({
          // Chat data
          exists: true,
          data: () => ({
            participants: ['user123', 'user456', 'user789'],
            type: 'group',
          }),
        })
        .mockResolvedValueOnce({
          // user456 profile (same language as sender)
          exists: true,
          data: () => ({ preferredLanguage: 'en-US' }),
        })
        .mockResolvedValueOnce({
          // user789 profile (different language)
          exists: true,
          data: () => ({ preferredLanguage: 'es-MX' }),
        })
        .mockResolvedValueOnce({
          // sender profile
          exists: true,
          data: () => ({ nationality: 'American' }),
        });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Traducción' },
        aiInsights: {},
        tone: 'neutral',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      // Should only include languages different from sender
      const callArgs = (_analyzeAndTranslate as jest.Mock).mock.calls[0][0];
      expect(callArgs.targetLanguages).toEqual(['es-MX']);
      expect(callArgs.targetLanguages).not.toContain('en-US');
    });

    it('should skip translation if all participants speak same language', async () => {
      mockDocRef.get
        .mockResolvedValueOnce({
          // Chat data
          exists: true,
          data: () => ({
            participants: ['user123', 'user456'],
            type: 'direct',
          }),
        })
        .mockResolvedValueOnce({
          // user456 profile (same language)
          exists: true,
          data: () => ({ preferredLanguage: 'en-US' }),
        });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      // Should not call translation if no different languages
      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should deduplicate participant languages', async () => {
      mockDocRef.get
        .mockResolvedValueOnce({
          // Chat data
          exists: true,
          data: () => ({
            participants: ['user123', 'user456', 'user789'],
            type: 'group',
          }),
        })
        .mockResolvedValueOnce({
          // user456 - Spanish
          exists: true,
          data: () => ({ preferredLanguage: 'es-MX' }),
        })
        .mockResolvedValueOnce({
          // user789 - Also Spanish
          exists: true,
          data: () => ({ preferredLanguage: 'es-MX' }),
        })
        .mockResolvedValueOnce({
          // sender profile
          exists: true,
          data: () => ({ nationality: 'American' }),
        });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Traducción' },
        aiInsights: {},
        tone: 'neutral',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      // Should only include es-MX once
      const callArgs = (_analyzeAndTranslate as jest.Mock).mock.calls[0][0];
      expect(callArgs.targetLanguages).toEqual(['es-MX']);
    });
  });

  describe('Message Update', () => {
    it('should update message with translations and tone', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          participants: ['user123', 'user456'],
        }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Traducción' },
        aiInsights: null,
        tone: 'friendly',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      expect(mockSnapshot.ref.update).toHaveBeenCalledWith({
        translations: { 'es-MX': 'Traducción' },
        tone: 'friendly',
      });
    });

    it('should include aiInsights if present', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          participants: ['user123', 'user456'],
        }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Traducción' },
        aiInsights: { 'es-MX': 'Análisis' },
        tone: 'casual',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      expect(mockSnapshot.ref.update).toHaveBeenCalledWith({
        translations: { 'es-MX': 'Traducción' },
        tone: 'casual',
        aiInsights: { 'es-MX': 'Análisis' },
      });
    });

    it('should not include aiInsights if null', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          participants: ['user123', 'user456'],
        }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Hola' },
        aiInsights: null, // No insights for simple greeting
        tone: 'friendly',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      const updateData = (mockSnapshot.ref.update as jest.Mock).mock.calls[0][0];
      expect(updateData).not.toHaveProperty('aiInsights');
    });

    it('should not include aiInsights if empty object', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          participants: ['user123', 'user456'],
        }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Hola' },
        aiInsights: {}, // Empty object
        tone: 'friendly',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      const updateData = (mockSnapshot.ref.update as jest.Mock).mock.calls[0][0];
      expect(updateData).not.toHaveProperty('aiInsights');
    });
  });

  describe('Error Handling', () => {
    it('should not throw if chat document missing', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false, // Chat not found
      });

      await expect(autoAnalyzeAndTranslate(mockSnapshot, mockContext)).resolves.not.toThrow();
      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should not throw if user language fetch fails', async () => {
      mockDocRef.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ participants: ['user123', 'user456'] }),
        })
        .mockRejectedValueOnce(new Error('User fetch failed'));

      await expect(autoAnalyzeAndTranslate(mockSnapshot, mockContext)).resolves.not.toThrow();
    });

    it('should not throw if translation fails', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ participants: ['user123', 'user456'] }),
      });

      (_analyzeAndTranslate as jest.Mock).mockRejectedValue(new Error('OpenAI error'));

      // Should not throw - message should stay without translation
      await expect(autoAnalyzeAndTranslate(mockSnapshot, mockContext)).resolves.not.toThrow();
      expect(mockSnapshot.ref.update).not.toHaveBeenCalled();
    });

    it('should not throw if Firestore update fails', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ participants: ['user123', 'user456'] }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Traducción' },
        aiInsights: null,
        tone: 'neutral',
      });

      mockSnapshot.ref.update.mockRejectedValue(new Error('Firestore error'));

      // Should catch error and not propagate
      await expect(autoAnalyzeAndTranslate(mockSnapshot, mockContext)).resolves.not.toThrow();
    });

    it('should handle missing sender nationality gracefully', async () => {
      mockDocRef.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ participants: ['user123', 'user456'] }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ preferredLanguage: 'es-MX' }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({}), // No nationality field
        });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Traducción' },
        aiInsights: null,
        tone: 'neutral',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      // Should use 'Unknown' as default
      expect(_analyzeAndTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          senderNationality: 'Unknown',
        })
      );
    });
  });

  describe('Context Passing', () => {
    it('should pass all required parameters to _analyzeAndTranslate', async () => {
      mockDocRef.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            participants: ['user123', 'user456', 'user789'],
          }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ preferredLanguage: 'es-MX' }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ preferredLanguage: 'fr-FR' }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ nationality: 'American' }),
        });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Español', 'fr-FR': 'Français' },
        aiInsights: null,
        tone: 'neutral',
      });

      await autoAnalyzeAndTranslate(mockSnapshot, mockContext);

      expect(_analyzeAndTranslate).toHaveBeenCalledWith({
        text: 'Break a leg!',
        sourceLang: 'en-US',
        targetLanguages: expect.arrayContaining(['es-MX', 'fr-FR']),
        chatId: 'chat123',
        senderId: 'user123',
        senderNationality: 'American',
        participantIds: ['user123', 'user456', 'user789'],
        requestingUserId: 'user123',
      });
    });
  });
});
