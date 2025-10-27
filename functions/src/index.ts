import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { rateLimitMiddleware, incrementRateLimit } from './rateLimiting';
import { getOpenAIKey } from './secrets';

// Initialize Firebase Admin
admin.initializeApp();

// Export translation and embedding functions
export { detectLanguage, batchTranslate } from './translation';
export {
  // scheduledBatchEmbedMessages, // NOTE: v1 scheduled functions have CPU config issues
  getEmbeddingStats,
  cleanupOldEmbeddings,
} from './batchEmbedding';

// Export async message embedding (Firestore trigger)
export { autoEmbedMessage, retryFailedEmbeddings } from './messageEmbedding';

// Export AI analysis and chat features
export { analyzeAndTranslate } from './aiAnalysis';
export { streamAIChat } from './aiChat';
export { autoAnalyzeAndTranslate, retryFailedTranslations } from './messageAnalysis';

// Lazy-initialize OpenAI client (secrets only available at runtime)
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: getOpenAIKey() });
  }
  return openai;
}

/**
 * Cloud Function: Explain Slang
 *
 * Explains slang or informal language in cultural context
 *
 * @param data.text - Slang text to explain
 * @param data.sourceLang - Language of the slang
 * @param data.userNationality - User's nationality for context
 * @returns Explanation of the slang
 */
export const explainSlang = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be logged in'
    );
  }

  await rateLimitMiddleware(request.auth.uid, 'slangExplanation');

  const { text, sourceLang, userNationality } = request.data;

  if (!text || !sourceLang) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Text and source language are required'
    );
  }

  try {
    console.log(`🔍 Explaining slang: "${text}" (${sourceLang})`);

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a cultural linguist. Explain slang and informal language to someone from ${userNationality || 'another'} culture.

Format your response as:
1. **Literal meaning**: What the words mean
2. **Actual meaning**: What the phrase really means in context
3. **When to use it**: Appropriate situations
4. **Cultural note**: Any cultural context

Keep it concise (2-3 sentences per section).`,
        },
        {
          role: 'user',
          content: `Explain this ${sourceLang} slang: "${text}"`,
        },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    const explanation = response.choices[0]?.message?.content?.trim();

    if (!explanation) {
      throw new Error('Empty explanation received from OpenAI');
    }

    console.log(`✅ Slang explained`);

    await incrementRateLimit(request.auth.uid, 'slangExplanation');

    return {
      explanation,
      text,
      sourceLang,
    };
  } catch (error: any) {
    console.error('❌ Slang explanation error:', error);

    throw new functions.https.HttpsError(
      'internal',
      'Failed to explain slang. Please try again.'
    );
  }
});

/**
 * Cloud Function: Get Cultural Context
 *
 * Provides cultural context for a message based on sender's nationality
 *
 * @param data.text - Message text
 * @param data.senderNationality - Sender's nationality
 * @param data.userNationality - Viewer's nationality
 * @returns Cultural context explanation
 */
export const getCulturalContext = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be logged in'
    );
  }

  await rateLimitMiddleware(request.auth.uid, 'culturalContext');

  const { text, senderNationality, userNationality } = request.data;

  if (!text || !senderNationality) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Text and sender nationality are required'
    );
  }

  // Skip if same nationality
  if (senderNationality === userNationality) {
    return { context: null };
  }

  try {
    console.log(
      `🌍 Getting cultural context: ${senderNationality} → ${userNationality}`
    );

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a cultural advisor. Help ${userNationality} people understand messages from ${senderNationality} people.

Analyze this message for:
- Cultural references that might be unfamiliar
- Communication style differences (direct vs indirect, formal vs casual)
- Potential misunderstandings due to cultural norms

If the message is straightforward with no cultural nuances, respond with "No additional context needed."

Keep your explanation concise (2-3 sentences max).`,
        },
        {
          role: 'user',
          content: `Message from ${senderNationality} person: "${text}"`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const contextText = response.choices[0]?.message?.content?.trim();

    if (!contextText) {
      throw new Error('Empty context received from OpenAI');
    }

    // Return null if no context needed
    if (contextText.toLowerCase().includes('no additional context needed')) {
      return { context: null };
    }

    console.log(`✅ Cultural context provided`);

    await incrementRateLimit(request.auth.uid, 'culturalContext');

    return {
      context: contextText,
      senderNationality,
      userNationality,
    };
  } catch (error: any) {
    console.error('❌ Cultural context error:', error);

    throw new functions.https.HttpsError(
      'internal',
      'Failed to get cultural context. Please try again.'
    );
  }
});

