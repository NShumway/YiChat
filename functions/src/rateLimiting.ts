import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Rate limits per user per feature
const RATE_LIMITS = {
  translation: {
    maxPerMinute: 30,
    maxPerHour: 200,
    maxPerDay: 1000,
  },
  aiConversation: {
    maxPerMinute: 10,
    maxPerHour: 50,
    maxPerDay: 200,
  },
  smartReplies: {
    maxPerMinute: 5,
    maxPerHour: 30,
    maxPerDay: 100,
  },
  slangExplanation: {
    maxPerMinute: 10,
    maxPerHour: 50,
    maxPerDay: 200,
  },
  culturalContext: {
    maxPerMinute: 10,
    maxPerHour: 50,
    maxPerDay: 200,
  },
};

type RateLimitFeature = keyof typeof RATE_LIMITS;

interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if user has exceeded rate limit for a given feature
 * Uses sliding window algorithm with Firestore counters
 *
 * @param userId - User ID to check
 * @param feature - Feature name (translation, aiConversation, etc.)
 * @returns RateLimitCheck with allowed status and remaining count
 */
export async function checkRateLimit(
  userId: string,
  feature: RateLimitFeature
): Promise<RateLimitCheck> {
  const db = admin.firestore();
  const now = Date.now();

  const limits = RATE_LIMITS[feature];

  // Check minute limit (most restrictive, fastest to check)
  const minuteKey = `${userId}_${feature}_minute_${Math.floor(now / 60000)}`;
  const minuteDoc = await db.collection('rateLimits').doc(minuteKey).get();
  const minuteCount = minuteDoc.exists ? (minuteDoc.data()?.count || 0) : 0;

  if (minuteCount >= limits.maxPerMinute) {
    const resetAt = Math.ceil(now / 60000) * 60000; // Next minute
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Check hour limit
  const hourKey = `${userId}_${feature}_hour_${Math.floor(now / 3600000)}`;
  const hourDoc = await db.collection('rateLimits').doc(hourKey).get();
  const hourCount = hourDoc.exists ? (hourDoc.data()?.count || 0) : 0;

  if (hourCount >= limits.maxPerHour) {
    const resetAt = Math.ceil(now / 3600000) * 3600000; // Next hour
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Check day limit
  const dayKey = `${userId}_${feature}_day_${Math.floor(now / 86400000)}`;
  const dayDoc = await db.collection('rateLimits').doc(dayKey).get();
  const dayCount = dayDoc.exists ? (dayDoc.data()?.count || 0) : 0;

  if (dayCount >= limits.maxPerDay) {
    const resetAt = Math.ceil(now / 86400000) * 86400000; // Next day
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // All checks passed
  const remaining = Math.min(
    limits.maxPerMinute - minuteCount,
    limits.maxPerHour - hourCount,
    limits.maxPerDay - dayCount
  );

  return {
    allowed: true,
    remaining,
    resetAt: Math.ceil(now / 60000) * 60000, // Next minute for UI display
  };
}

/**
 * Increment rate limit counters after successful API call
 * Should be called AFTER the AI request succeeds
 *
 * @param userId - User ID
 * @param feature - Feature name
 */
export async function incrementRateLimit(
  userId: string,
  feature: RateLimitFeature
): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();

  // Increment all three counters atomically
  const batch = db.batch();

  const minuteKey = `${userId}_${feature}_minute_${Math.floor(now / 60000)}`;
  const hourKey = `${userId}_${feature}_hour_${Math.floor(now / 3600000)}`;
  const dayKey = `${userId}_${feature}_day_${Math.floor(now / 86400000)}`;

  batch.set(
    db.collection('rateLimits').doc(minuteKey),
    { count: admin.firestore.FieldValue.increment(1), timestamp: now },
    { merge: true }
  );

  batch.set(
    db.collection('rateLimits').doc(hourKey),
    { count: admin.firestore.FieldValue.increment(1), timestamp: now },
    { merge: true }
  );

  batch.set(
    db.collection('rateLimits').doc(dayKey),
    { count: admin.firestore.FieldValue.increment(1), timestamp: now },
    { merge: true }
  );

  await batch.commit();
}

/**
 * Middleware to check rate limit before calling AI function
 * Throws HttpsError if rate limit exceeded
 *
 * Usage in Cloud Function:
 * await rateLimitMiddleware(userId, 'translation');
 */
export async function rateLimitMiddleware(
  userId: string,
  feature: RateLimitFeature
): Promise<void> {
  const check = await checkRateLimit(userId, feature);

  if (!check.allowed) {
    const resetDate = new Date(check.resetAt);
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Rate limit exceeded for ${feature}. Try again after ${resetDate.toLocaleTimeString()}.`,
      { resetAt: check.resetAt }
    );
  }
}
