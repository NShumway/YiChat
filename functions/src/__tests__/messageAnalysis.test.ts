import * as admin from 'firebase-admin';

// Mock the internal analyze function BEFORE importing the trigger
jest.mock('../aiAnalysis', () => ({
  _analyzeAndTranslate: jest.fn(),
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  return {
    firestore: jest.fn(),
  };
});

import { _analyzeAndTranslate } from '../aiAnalysis';
import { _processMessageAnalysis } from '../messageAnalysis';

describe('Message Analysis Trigger', () => {
  let mockFirestore: any;
  let mockDocRef: any;

  beforeEach(() => {
    // Reset the mock
    (_analyzeAndTranslate as jest.Mock).mockReset();

    // Create a map to store document refs per collection/doc path
    const docRefs = new Map<string, any>();

    // Helper to get or create a doc ref
    const getDocRef = (collection: string, docId: string) => {
      const key = `${collection}/${docId}`;
      if (!docRefs.has(key)) {
        docRefs.set(key, {
          get: jest.fn(),
          update: jest.fn().mockResolvedValue(undefined),
        });
      }
      return docRefs.get(key);
    };

    mockFirestore = {
      collection: jest.fn((collectionName: string) => ({
        doc: jest.fn((docId: string) => getDocRef(collectionName, docId)),
      })),
    };

    // Mock admin.firestore to return our mock
    (admin.firestore as unknown as jest.Mock).mockReturnValue(mockFirestore);

    // Expose the main update ref for tests (messages collection)
    mockDocRef = {
      update: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Trigger Conditions', () => {
    it('should process messages with required fields', async () => {
      const messageData = {
        text: 'Break a leg!',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user123',
        timestamp: Date.now(),
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user123');
      const participant1Doc = mockFirestore.collection('users').doc('user456');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user123', 'user456'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      participant1Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': '¡Mucha suerte!' },
        aiInsights: { 'es-MX': 'This is an idiom meaning good luck' },
        tone: 'encouraging',
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).toHaveBeenCalled();
      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          translations: { 'es-MX': '¡Mucha suerte!' },
          aiInsights: { 'es-MX': 'This is an idiom meaning good luck' },
          tone: 'encouraging',
        })
      );
    });

    it('should skip messages without text', async () => {
      const messageData = {
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user123',
        timestamp: Date.now(),
      };

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should skip messages without originalLanguage', async () => {
      const messageData = {
        text: 'Hello',
        chatId: 'chat123',
        senderId: 'user123',
        timestamp: Date.now(),
      };

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should skip messages already translated', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user123',
        translations: { 'es-MX': 'Hola' },
        timestamp: Date.now(),
      };

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should skip messages without chatId', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        senderId: 'user123',
        timestamp: Date.now(),
      };

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });
  });

  describe('Participant Language Detection', () => {
    it('should fetch participant languages from user profiles', async () => {
      const messageData = {
        text: 'Hello everyone!',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');
      const user3Doc = mockFirestore.collection('users').doc('user3');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2', 'user3'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      user3Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'fr-FR' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: {},
        aiInsights: null,
        tone: null,
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          targetLanguages: expect.arrayContaining(['es-MX', 'fr-FR']),
        })
      );
    });

    it('should skip sender language from target languages', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: {},
        aiInsights: null,
        tone: null,
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).toHaveBeenCalled();
    });

    it('should skip translation if all participants speak same language', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should deduplicate participant languages', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');
      const user3Doc = mockFirestore.collection('users').doc('user3');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2', 'user3'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      user3Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: {},
        aiInsights: null,
        tone: null,
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          targetLanguages: ['es-MX'],
        })
      );
    });
  });

  describe('Message Update', () => {
    it('should update message with translations and tone', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Hola' },
        aiInsights: null,
        tone: 'friendly',
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(mockDocRef.update).toHaveBeenCalledWith({
        translations: { 'es-MX': 'Hola' },
        tone: 'friendly',
      });
    });

    it('should include aiInsights if present', async () => {
      const messageData = {
        text: 'Break a leg!',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': '¡Mucha suerte!' },
        aiInsights: { 'es-MX': 'This is an idiom' },
        tone: 'encouraging',
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(mockDocRef.update).toHaveBeenCalledWith({
        translations: { 'es-MX': '¡Mucha suerte!' },
        aiInsights: { 'es-MX': 'This is an idiom' },
        tone: 'encouraging',
      });
    });

    it('should not include aiInsights if null', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Hola' },
        aiInsights: null,
        tone: 'neutral',
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(mockDocRef.update).toHaveBeenCalledWith({
        translations: { 'es-MX': 'Hola' },
        tone: 'neutral',
      });
    });

    it('should not include aiInsights if empty object', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Hola' },
        aiInsights: {},
        tone: 'neutral',
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(mockDocRef.update).toHaveBeenCalledWith({
        translations: { 'es-MX': 'Hola' },
        tone: 'neutral',
      });
    });
  });

  describe('Error Handling', () => {
    it('should not throw if chat document missing', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');

      chatDoc.get.mockResolvedValueOnce({
        exists: false,
      });

      await expect(
        _processMessageAnalysis(messageData, 'msg123', mockDocRef)
      ).resolves.not.toThrow();

      expect(_analyzeAndTranslate).not.toHaveBeenCalled();
    });

    it('should not throw if user language fetch fails', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockRejectedValueOnce(new Error('Firestore error'));

      await expect(
        _processMessageAnalysis(messageData, 'msg123', mockDocRef)
      ).resolves.not.toThrow();
    });

    it('should not throw if translation fails', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockRejectedValue(new Error('OpenAI error'));

      await expect(
        _processMessageAnalysis(messageData, 'msg123', mockDocRef)
      ).resolves.not.toThrow();
    });

    it('should not throw if Firestore update fails', async () => {
      const messageData = {
        text: 'Hello',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: { 'es-MX': 'Hola' },
        aiInsights: null,
        tone: null,
      });

      mockDocRef.update.mockRejectedValue(new Error('Firestore update failed'));

      await expect(
        _processMessageAnalysis(messageData, 'msg123', mockDocRef)
      ).resolves.not.toThrow();
    });

    it('should handle missing sender nationality gracefully', async () => {
      const messageData = {
        text: 'Break a leg!',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: false,
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: {},
        aiInsights: null,
        tone: null,
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          senderNationality: 'Unknown',
        })
      );
    });
  });

  describe('Context Passing', () => {
    it('should pass all required parameters to _analyzeAndTranslate', async () => {
      const messageData = {
        text: 'Break a leg!',
        originalLanguage: 'en-US',
        chatId: 'chat123',
        senderId: 'user1',
      };

      const chatDoc = mockFirestore.collection('chats').doc('chat123');
      const senderDoc = mockFirestore.collection('users').doc('user1');
      const user2Doc = mockFirestore.collection('users').doc('user2');

      chatDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ participants: ['user1', 'user2'] }),
      });

      senderDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ nationality: 'American' }),
      });

      user2Doc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ preferredLanguage: 'es-MX' }),
      });

      (_analyzeAndTranslate as jest.Mock).mockResolvedValue({
        translations: {},
        aiInsights: null,
        tone: null,
      });

      await _processMessageAnalysis(messageData, 'msg123', mockDocRef);

      expect(_analyzeAndTranslate).toHaveBeenCalledWith({
        text: 'Break a leg!',
        sourceLang: 'en-US',
        targetLanguages: ['es-MX'],
        chatId: 'chat123',
        senderId: 'user1',
        senderNationality: 'American',
        participantIds: ['user1', 'user2'],
        requestingUserId: 'user1',
      });
    });
  });
});
