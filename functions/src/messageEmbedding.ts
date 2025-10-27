import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { batchEmbedMessages } from './embeddings';

/**
 * Firestore Trigger: Auto-Embed Messages
 *
 * Automatically embeds messages to Pinecone when they're created
 * Fires asynchronously - doesn't block message sending
 *
 * Criteria for embedding:
 * - Has translations object (was translated)
 * - Not already embedded
 * - Less than 30 days old
 */
export const autoEmbedMessage = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    const messageId = context.params.messageId;

    try {
      // Check if message should be embedded
      const shouldEmbed =
        data.translations && // Has translations
        !data.embedded && // Not already embedded
        data.timestamp && // Has timestamp
        data.chatId &&
        data.senderId &&
        data.text &&
        data.originalLanguage;

      if (!shouldEmbed) {
        console.log(`⏭️  Skipping embed for message ${messageId} (no translations or missing fields)`);
        return;
      }

      // Check age (only embed messages less than 30 days old)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      if (data.timestamp < thirtyDaysAgo) {
        console.log(`⏭️  Skipping embed for message ${messageId} (too old)`);
        return;
      }

      console.log(`📦 Auto-embedding message ${messageId}...`);

      // Prepare message for embedding
      const messageToEmbed = {
        id: messageId,
        chatId: data.chatId,
        senderId: data.senderId,
        text: data.text,
        originalLanguage: data.originalLanguage,
        timestamp: data.timestamp,
      };

      // Embed to Pinecone
      await batchEmbedMessages([messageToEmbed]);

      // Mark as embedded
      await snapshot.ref.update({ embedded: true });

      console.log(`✅ Auto-embedded message ${messageId}`);
    } catch (error) {
      console.error(`❌ Failed to auto-embed message ${messageId}:`, error);
      // Don't throw - we don't want to fail the message send
      // The message will stay with embedded: false and can be retried later
    }
  });

/**
 * HTTP-Callable: Retry Failed Embeddings
 *
 * Manually retry embedding messages that failed to embed
 * Useful for recovering from temporary Pinecone outages
 */
export const retryFailedEmbeddings = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const db = admin.firestore();

  try {
    console.log('🔄 Retrying failed embeddings...');

    // Find messages with translations but not embedded
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const failedMessagesSnapshot = await db
      .collection('messages')
      .where('embedded', '==', false)
      .where('translations', '!=', null)
      .where('timestamp', '>', thirtyDaysAgo)
      .limit(100) // Retry 100 at a time
      .get();

    if (failedMessagesSnapshot.empty) {
      return { success: true, retried: 0 };
    }

    console.log(`📊 Found ${failedMessagesSnapshot.size} messages to retry`);

    // Prepare messages for embedding
    const messagesToEmbed = failedMessagesSnapshot.docs
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
      .filter((msg) => msg.chatId && msg.senderId && msg.text && msg.originalLanguage);

    if (messagesToEmbed.length === 0) {
      return { success: true, retried: 0 };
    }

    // Embed to Pinecone
    await batchEmbedMessages(messagesToEmbed);

    // Mark as embedded
    const batch = db.batch();
    messagesToEmbed.forEach((msg) => {
      const docRef = db.collection('messages').doc(msg.id);
      batch.update(docRef, { embedded: true });
    });
    await batch.commit();

    console.log(`✅ Retried ${messagesToEmbed.length} embeddings`);

    return {
      success: true,
      retried: messagesToEmbed.length,
    };
  } catch (error: any) {
    console.error('❌ Retry failed:', error);
    throw new functions.https.HttpsError('internal', 'Retry failed');
  }
});
