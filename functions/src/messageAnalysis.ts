import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { _analyzeAndTranslate } from './aiAnalysis';

/**
 * Internal function for auto-analyzing and translating messages
 * Exported for testing purposes
 */
export async function _processMessageAnalysis(
  messageData: any,
  messageId: string,
  updateRef: any
): Promise<void> {
  try {
    // Check if message needs translation
    const shouldTranslate =
      messageData.text &&
      messageData.originalLanguage &&
      messageData.chatId &&
      messageData.senderId &&
      !messageData.translations; // Not already translated

    if (!shouldTranslate) {
      console.log(`⏭️  Skipping translation for message ${messageId} (already translated or missing fields)`);
      return;
    }

    console.log(`🌐 Auto-translating message ${messageId}...`);

    // Get chat data to determine recipient languages
    const db = admin.firestore();
    const chatDoc = await db.collection('chats').doc(messageData.chatId).get();

    if (!chatDoc.exists) {
      console.warn(`⚠️ Chat ${messageData.chatId} not found`);
      return;
    }

    const chatData = chatDoc.data();
    if (!chatData) return;

    // Get participant languages
    const participantIds = chatData.participants || [];
    const participantLanguages: string[] = [];

    // Fetch each participant's preferred language
    const languagePromises = participantIds.map(async (uid: string) => {
      if (uid === messageData.senderId) return null; // Skip sender

      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          return userData?.preferredLanguage;
        }
        return null;
      } catch (error) {
        console.warn(`⚠️ Failed to get language for user ${uid}:`, error);
        return null;
      }
    });

    const languages = await Promise.all(languagePromises);
    languages.forEach((lang) => {
      if (lang && !participantLanguages.includes(lang)) {
        participantLanguages.push(lang);
      }
    });

    if (participantLanguages.length === 0) {
      console.log(`⏭️  No translation needed - all participants speak ${messageData.originalLanguage}`);
      return;
    }

    // Get sender's nationality for cultural context
    let senderNationality = 'Unknown';
    try {
      const senderDoc = await db.collection('users').doc(messageData.senderId).get();
      if (senderDoc.exists) {
        const senderData = senderDoc.data();
        senderNationality = senderData?.nationality || 'Unknown';
      }
    } catch (error) {
      console.warn('⚠️ Failed to get sender nationality:', error);
    }

    // Call internal analyzeAndTranslate function
    const result = await _analyzeAndTranslate({
      text: messageData.text,
      sourceLang: messageData.originalLanguage,
      targetLanguages: participantLanguages,
      chatId: messageData.chatId,
      senderId: messageData.senderId,
      senderNationality,
      participantIds,
      requestingUserId: messageData.senderId, // Sender is making the request
    });

    // Update message with translations and AI insights
    const updateData: any = {
      translations: result.translations || {},
      tone: result.tone || null,
    };

    // Only add aiInsights if they exist
    if (result.aiInsights && Object.keys(result.aiInsights).length > 0) {
      updateData.aiInsights = result.aiInsights;
    }

    await updateRef.update(updateData);

    console.log(
      `✅ Auto-translated message ${messageId} to ${participantLanguages.length} languages` +
      (result.aiInsights ? ' with AI insights' : '')
    );
  } catch (error) {
    console.error(`❌ Failed to auto-translate message ${messageId}:`, error);
    // Don't throw - we don't want to fail the message send
    // The message will stay without translation and can be retried
  }
}

/**
 * Firestore Trigger: Auto-Analyze and Translate Messages
 *
 * Automatically analyzes and translates messages when they're created
 * Fires asynchronously - doesn't block message sending
 *
 * Flow:
 * 1. Message created with original text
 * 2. Trigger fires in background
 * 3. Calls analyzeAndTranslate with recipient languages
 * 4. Updates message with translations and aiInsights
 * 5. Client receives update and shows translated text + AI indicator
 */
export const autoAnalyzeAndTranslate = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    const messageId = context.params.messageId;
    await _processMessageAnalysis(data, messageId, snapshot.ref);
  });

/**
 * HTTP-Callable: Retry Failed Translations
 *
 * Manually retry translating messages that failed
 * Useful for recovering from temporary AI service outages
 */
export const retryFailedTranslations = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const db = admin.firestore();

  try {
    console.log('🔄 Retrying failed translations...');

    // Find messages with originalLanguage but no translations
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const failedMessagesSnapshot = await db
      .collection('messages')
      .where('originalLanguage', '!=', null)
      .where('translations', '==', null)
      .where('timestamp', '>', oneDayAgo)
      .limit(50) // Retry 50 at a time
      .get();

    if (failedMessagesSnapshot.empty) {
      return { success: true, retried: 0 };
    }

    console.log(`📊 Found ${failedMessagesSnapshot.size} messages to retry`);

    let retriedCount = 0;

    // Process each message
    for (const doc of failedMessagesSnapshot.docs) {
      try {
        const data = doc.data();

        // Get chat to determine target languages
        const chatDoc = await db.collection('chats').doc(data.chatId).get();
        if (!chatDoc.exists) continue;

        const chatData = chatDoc.data();
        if (!chatData) continue;

        const participantIds = chatData.participants || [];
        const participantLanguages: string[] = [];

        // Get participant languages
        for (const uid of participantIds) {
          if (uid === data.senderId) continue;

          const userDoc = await db.collection('users').doc(uid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            const lang = userData?.preferredLanguage;
            if (lang && !participantLanguages.includes(lang)) {
              participantLanguages.push(lang);
            }
          }
        }

        if (participantLanguages.length === 0) continue;

        // Get sender nationality
        let senderNationality = 'Unknown';
        const senderDoc = await db.collection('users').doc(data.senderId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          senderNationality = senderData?.nationality || 'Unknown';
        }

        // Call internal analyzeAndTranslate function
        const result = await _analyzeAndTranslate({
          text: data.text,
          sourceLang: data.originalLanguage,
          targetLanguages: participantLanguages,
          chatId: data.chatId,
          senderId: data.senderId,
          senderNationality,
          participantIds,
          requestingUserId: data.senderId,
        });

        // Update message
        const updateData: any = {
          translations: result.translations || {},
          tone: result.tone || null,
        };

        if (result.aiInsights && Object.keys(result.aiInsights).length > 0) {
          updateData.aiInsights = result.aiInsights;
        }

        await doc.ref.update(updateData);

        retriedCount++;
        console.log(`✅ Retried message ${doc.id}`);
      } catch (error) {
        console.error(`❌ Failed to retry message ${doc.id}:`, error);
        // Continue with next message
      }
    }

    console.log(`✅ Retried ${retriedCount} translations`);

    return {
      success: true,
      retried: retriedCount,
    };
  } catch (error: any) {
    console.error('❌ Retry failed:', error);
    throw new functions.https.HttpsError('internal', 'Retry failed');
  }
});
