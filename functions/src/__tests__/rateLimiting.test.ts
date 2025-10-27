import {
  checkRateLimit,
  incrementRateLimit,
  rateLimitMiddleware,
} from '../rateLimiting';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockFirestoreFn: any = jest.fn();
  mockFirestoreFn.FieldValue = {
    increment: jest.fn((n) => ({ _increment: n })),
  };

  return {
    firestore: mockFirestoreFn,
  };
});

import * as admin from 'firebase-admin';

describe('Rate Limiting', () => {
  let mockFirestore: any;
  let mockBatch: any;
  let mockDocRef: any;
  let mockCollectionRef: any;

  beforeEach(() => {
    // Create mock objects for the Firestore chain
    mockDocRef = {
      get: jest.fn(),
      set: jest.fn(),
    };

    mockCollectionRef = {
      doc: jest.fn().mockReturnValue(mockDocRef),
    };

    mockBatch = {
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    mockFirestore = {
      collection: jest.fn().mockReturnValue(mockCollectionRef),
      batch: jest.fn().mockReturnValue(mockBatch),
    };

    // Make admin.firestore() return our mock
    ((admin.firestore as unknown) as jest.Mock).mockReturnValue(mockFirestore);
  });

  describe('checkRateLimit', () => {
    it('should allow requests within minute limit', async () => {
      // Mock: 10 requests in current minute (aiChat limit is 15/min)
      // Need to mock all three time window checks (minute, hour, day)
      mockDocRef.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ count: 10 }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ count: 50 }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ count: 100 }),
        });

      const result = await checkRateLimit('user123', 'aiChat');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should block 31st request in a minute (aiChat: 15/min)', async () => {
      // Mock: 15 requests in current minute (at limit)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 15 }),
      });
      // Hour and day checks won't be called because minute limit is hit

      const result = await checkRateLimit('user123', 'aiChat');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should block 31st request in a minute (translation: 30/min)', async () => {
      // Mock: 30 requests in current minute (at limit)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 30 }),
      });
      // Hour and day checks won't be called because minute limit is hit

      const result = await checkRateLimit('user123', 'translation');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should allow requests when no previous usage', async () => {
      // Mock: No document exists (first request)
      // Need to mock all three time window checks
      mockDocRef.get
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: false });

      const result = await checkRateLimit('user123', 'aiChat');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should check hour limit if minute passes', async () => {
      // Mock: 10 requests in current minute (passes)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 10 }),
      });
      // Mock: 100 requests in current hour (at limit)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 100 }),
      });

      const result = await checkRateLimit('user123', 'aiChat');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should check day limit if minute and hour pass', async () => {
      // Mock: 5 requests in minute (passes)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 5 }),
      });
      // Mock: 50 requests in hour (passes)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 50 }),
      });
      // Mock: 300 requests in day (at limit)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 300 }),
      });

      const result = await checkRateLimit('user123', 'aiChat');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should return correct remaining count', async () => {
      // Mock: 10 requests in minute, 50 in hour, 150 in day
      mockDocRef.get
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 10 }) }) // minute
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 50 }) }) // hour
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 150 }) }); // day

      const result = await checkRateLimit('user123', 'aiChat');

      expect(result.allowed).toBe(true);
      // Remaining should be min(15-10, 100-50, 300-150) = min(5, 50, 150) = 5
      expect(result.remaining).toBe(5);
    });
  });

  describe('incrementRateLimit', () => {
    it('should increment all three time windows', async () => {
      await incrementRateLimit('user123', 'aiChat');

      expect(mockBatch.set).toHaveBeenCalledTimes(3);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it('should use correct document keys', async () => {
      await incrementRateLimit('user123', 'aiChat');

      // Verify the collection.doc calls include correct keys
      expect(mockCollectionRef.doc).toHaveBeenCalledWith(
        expect.stringContaining('user123_aiChat_minute_')
      );
      expect(mockCollectionRef.doc).toHaveBeenCalledWith(
        expect.stringContaining('user123_aiChat_hour_')
      );
      expect(mockCollectionRef.doc).toHaveBeenCalledWith(
        expect.stringContaining('user123_aiChat_day_')
      );
    });

    it('should handle batch commit errors', async () => {
      mockBatch.commit.mockRejectedValue(new Error('Firestore error'));

      await expect(incrementRateLimit('user123', 'aiChat')).rejects.toThrow('Firestore error');
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should not throw when rate limit is not exceeded', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ count: 5 }),
      });

      await expect(rateLimitMiddleware('user123', 'aiChat')).resolves.not.toThrow();
    });

    it('should throw HttpsError when rate limit exceeded', async () => {
      // Mock: At the limit
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 15 }),
      });

      await expect(rateLimitMiddleware('user123', 'aiChat')).rejects.toThrow();
    });

    it('should throw error with correct type (resource-exhausted)', async () => {
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 15 }),
      });

      try {
        await rateLimitMiddleware('user123', 'aiChat');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('resource-exhausted');
        expect(error.message).toContain('Rate limit exceeded');
        expect(error.message).toContain('aiChat');
      }
    });

    it('should include resetAt timestamp in error', async () => {
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 15 }),
      });

      try {
        await rateLimitMiddleware('user123', 'aiChat');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.details).toHaveProperty('resetAt');
        expect(typeof error.details.resetAt).toBe('number');
      }
    });

    it('should handle different feature types', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ count: 0 }),
      });

      await expect(rateLimitMiddleware('user123', 'translation')).resolves.not.toThrow();
      await expect(rateLimitMiddleware('user123', 'aiChat')).resolves.not.toThrow();
      await expect(rateLimitMiddleware('user123', 'slangExplanation')).resolves.not.toThrow();
      await expect(rateLimitMiddleware('user123', 'culturalContext')).resolves.not.toThrow();
    });
  });

  describe('Rate Limit Values', () => {
    it('should enforce correct limits for translation', async () => {
      // Test minute limit: 30
      // First call: 29 requests (should pass)
      mockDocRef.get
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 29 }) })
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 50 }) })
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 100 }) });
      let result = await checkRateLimit('user123', 'translation');
      expect(result.allowed).toBe(true);

      // Second call: 30 requests (should fail)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 30 }),
      });
      result = await checkRateLimit('user123', 'translation');
      expect(result.allowed).toBe(false);
    });

    it('should enforce correct limits for aiChat', async () => {
      // Test minute limit: 15
      // First call: 14 requests (should pass)
      mockDocRef.get
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 14 }) })
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 50 }) })
        .mockResolvedValueOnce({ exists: true, data: () => ({ count: 100 }) });
      let result = await checkRateLimit('user123', 'aiChat');
      expect(result.allowed).toBe(true);

      // Second call: 15 requests (should fail)
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ count: 15 }),
      });
      result = await checkRateLimit('user123', 'aiChat');
      expect(result.allowed).toBe(false);
    });
  });
});
