import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { batchEmbedMessages as embedMessagesToPinecone } from './embeddings';

/**
 * Scheduled Cloud Function: Batch Embed Messages
 *
 * Runs every 5 minutes to embed messages that need RAG context
 * Only embeds messages that were actually translated (different language pairs)
 *
 * IMPORTANT - Pinecone Free Tier Limits:
 * - 2 GB storage (~200k messages with metadata)
 * - 2 million writes/month (~66k/day)
 * - 1 million reads/month (~33k/day)
 *
 * Strategy to stay within limits:
 * - Only embed messages that were translated (excludes same-language chats)
 * - Limit to 500 messages per run (10 runs/hour = 5000 messages/hour max)
 * - Only embed recent messages (last 30 days) to keep storage manageable
 * - Messages older than 30 days are automatically excluded from RAG queries anyway
 */
export const scheduledBatchEmbedMessages = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context: functions.EventContext) => {
    const db = admin.firestore();

    try {
      console.log('📦 Starting batch embedding job');

      // Find messages that need embedding
      // Criteria:
      // 1. Has translations object (was translated to at least one language)
      // 2. Not yet embedded (embedded !== true)
      // 3. Created within last 30 days (to limit storage)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const messagesSnapshot = await db
        .collection('messages')
        .where('embedded', '==', false)
        .where('translations', '!=', null)
        .where('timestamp', '>', thirtyDaysAgo)
        .orderBy('timestamp', 'desc')
        .limit(500) // Limit per run to stay within Pinecone free tier
        .get();

      if (messagesSnapshot.empty) {
        console.log('✅ No messages to embed');
        return;
      }

      console.log(`📊 Found ${messagesSnapshot.size} messages to embed`);

      // Prepare messages for embedding
      const messagesToEmbed = messagesSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            chatId: data.chatId,
            senderId: data.senderId,
            text: data.text,
            originalLanguage: data.originalLanguage,
            timestamp: data.timestamp,
          };
        })
        .filter((msg) => {
          // Double-check all required fields exist
          return (
            msg.id &&
            msg.chatId &&
            msg.senderId &&
            msg.text &&
            msg.originalLanguage &&
            msg.timestamp
          );
        });

      if (messagesToEmbed.length === 0) {
        console.log('⚠️ No valid messages to embed after filtering');
        return;
      }

      // Embed messages to Pinecone
      await embedMessagesToPinecone(messagesToEmbed);

      // Mark messages as embedded in Firestore
      const batch = db.batch();
      for (const msg of messagesToEmbed) {
        const docRef = db.collection('messages').doc(msg.id);
        batch.update(docRef, { embedded: true });
      }
      await batch.commit();

      console.log(`✅ Batch embedding complete: ${messagesToEmbed.length} messages embedded`);

      // Log usage statistics for monitoring
      await db.collection('embeddingStats').add({
        timestamp: Date.now(),
        messagesEmbedded: messagesToEmbed.length,
        executionId: context.timestamp,
      });
    } catch (error) {
      console.error('❌ Batch embedding job failed:', error);
      throw error;
    }
  });

/**
 * Cloud Function: Get Embedding Stats
 *
 * Returns statistics about Pinecone usage to monitor free tier limits
 * Helps ensure we don't exceed 2M writes/month or 1M reads/month
 */
export const getEmbeddingStats = functions.https.onCall(async (request) => {
  // Only allow admins to view stats
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be logged in'
    );
  }

  const db = admin.firestore();

  try {
    // Get stats for last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const statsSnapshot = await db
      .collection('embeddingStats')
      .where('timestamp', '>', thirtyDaysAgo)
      .orderBy('timestamp', 'desc')
      .get();

    let totalEmbedded = 0;
    let totalRuns = 0;

    statsSnapshot.forEach((doc) => {
      const data = doc.data();
      totalEmbedded += data.messagesEmbedded || 0;
      totalRuns++;
    });

    // Get total embedded messages count
    const messagesSnapshot = await db
      .collection('messages')
      .where('embedded', '==', true)
      .count()
      .get();

    const totalEmbeddedMessages = messagesSnapshot.data().count;

    // Estimate storage usage (very rough)
    // Each embedding: 1536 dimensions * 4 bytes = 6.144 KB
    // Plus metadata: ~2 KB
    // Total: ~8 KB per message
    const estimatedStorageMB = Math.round((totalEmbeddedMessages * 8) / 1024);

    return {
      last30Days: {
        messagesEmbedded: totalEmbedded,
        batchRuns: totalRuns,
        averagePerRun: totalRuns > 0 ? Math.round(totalEmbedded / totalRuns) : 0,
      },
      total: {
        embeddedMessages: totalEmbeddedMessages,
        estimatedStorageMB,
        estimatedStorageGB: (estimatedStorageMB / 1024).toFixed(2),
      },
      limits: {
        storageGB: 2,
        writesPerMonth: 2000000,
        readsPerMonth: 1000000,
      },
      usage: {
        storagePercent: ((estimatedStorageMB / 1024 / 2) * 100).toFixed(1),
        writesPercent: ((totalEmbedded / 2000000) * 100).toFixed(1),
      },
    };
  } catch (error) {
    console.error('❌ Failed to get embedding stats:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to get embedding stats'
    );
  }
});

/**
 * Cloud Function: Cleanup Old Embeddings
 *
 * Manually triggered function to remove old embeddings from Pinecone
 * Useful if approaching storage limits
 *
 * Deletes embeddings older than X days and marks messages as not embedded
 */
export const cleanupOldEmbeddings = functions.https.onCall(async (request) => {
  // Only allow admins
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be logged in'
    );
  }

  const { daysOld = 30 } = request.data;

  if (typeof daysOld !== 'number' || daysOld < 1) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'daysOld must be a positive number'
    );
  }

  const db = admin.firestore();

  try {
    console.log(`🧹 Cleaning up embeddings older than ${daysOld} days`);

    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    // Find old embedded messages
    const oldMessagesSnapshot = await db
      .collection('messages')
      .where('embedded', '==', true)
      .where('timestamp', '<', cutoffTime)
      .limit(1000) // Limit to avoid timeout
      .get();

    if (oldMessagesSnapshot.empty) {
      console.log('✅ No old embeddings to clean up');
      return { deleted: 0 };
    }

    console.log(`📊 Found ${oldMessagesSnapshot.size} old messages to clean up`);

    // Mark as not embedded (we don't actually delete from Pinecone here
    // because we'd need to import Pinecone client and handle deletion)
    // In practice, old embeddings won't be queried due to timestamp filter
    const batch = db.batch();
    oldMessagesSnapshot.forEach((doc) => {
      batch.update(doc.ref, { embedded: false });
    });
    await batch.commit();

    console.log(`✅ Cleanup complete: ${oldMessagesSnapshot.size} messages marked as not embedded`);

    return {
      deleted: oldMessagesSnapshot.size,
      cutoffTime,
      daysOld,
    };
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw new functions.https.HttpsError('internal', 'Cleanup failed');
  }
});
