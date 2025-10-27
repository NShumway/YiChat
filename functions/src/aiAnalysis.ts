import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { rateLimitMiddleware, incrementRateLimit } from './rateLimiting';
import { getContextForTranslation } from './embeddings';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: functions.config().openai?.key || process.env.OPENAI_API_KEY,
});

/**
 * Extract base language from BCP 47 tag
 */
function getBaseLanguage(languageTag: string): string {
  return languageTag.split('-')[0];
}

/**
 * Check if two languages are the same (ignoring country)
 */
function isSameLanguage(lang1: string, lang2: string): boolean {
  return getBaseLanguage(lang1) === getBaseLanguage(lang2);
}

/**
 * Get relationship context for sender from contacts
 */
async function getRelationshipContext(
  viewerUserId: string,
  senderUserId: string
): Promise<string | null> {
  if (viewerUserId === senderUserId) {
    return null; // No relationship with self
  }

  try {
    const db = admin.firestore();
    const contactDoc = await db
      .collection('users')
      .doc(viewerUserId)
      .collection('contacts')
      .doc(senderUserId)
      .get();

    if (contactDoc.exists) {
      const data = contactDoc.data();
      return data?.relationship || null;
    }
    return null;
  } catch (error) {
    console.warn('⚠️ Failed to get relationship context:', error);
    return null;
  }
}

/**
 * Get relationship contexts for multiple users (for groups)
 */
async function getGroupRelationshipContexts(
  viewerUserId: string,
  participantIds: string[]
): Promise<{ [userId: string]: string }> {
  // Limit to reasonable size to avoid token overload
  if (participantIds.length > 10) {
    console.log('⚠️ Group too large (>10 participants), skipping relationship contexts');
    return {};
  }

  const relationshipPromises = participantIds
    .filter(id => id !== viewerUserId)
    .map(async (userId) => {
      const relationship = await getRelationshipContext(viewerUserId, userId);
      return { userId, relationship };
    });

  const relationships = await Promise.all(relationshipPromises);

  return relationships.reduce((acc, { userId, relationship }) => {
    if (relationship) {
      acc[userId] = relationship;
    }
    return acc;
  }, {} as { [userId: string]: string });
}

/**
 * Internal function: Analyze and Translate (core logic)
 *
 * Combined function that:
 * 1. Analyzes original message for idioms/slang/cultural context
 * 2. Translates message to target languages
 * 3. Generates AI insights in each target language
 *
 * @param params - Analysis parameters
 * @returns Object with translations and aiInsights for each language
 */
export async function _analyzeAndTranslate(params: {
  text: string;
  sourceLang: string;
  targetLanguages: string[];
  chatId?: string;
  senderId: string;
  senderNationality?: string;
  participantIds?: string[];
  requestingUserId: string; // For relationship context
}) {
  const {
    text,
    sourceLang,
    targetLanguages,
    chatId,
    senderId,
    senderNationality,
    participantIds,
    requestingUserId,
  } = params;

  // Filter out same language
  const uniqueTargetLanguages = [...new Set(targetLanguages)].filter(
    (lang) => !isSameLanguage(sourceLang, lang)
  );

  if (uniqueTargetLanguages.length === 0) {
    // All target languages are same as source - no translation needed
    return {
      translations: {},
      aiInsights: {},
      tone: null,
    };
  }

  console.log(
    `🤖 Analyzing and translating: "${text.substring(0, 50)}..." to ${uniqueTargetLanguages.length} languages`
  );
  console.time('analyze-and-translate');

  // 1. Get RAG context from Pinecone (if available)
  let contextInfo = { context: '', messageCount: 0, tokenCount: 0 };
  if (chatId && senderId) {
    try {
      contextInfo = await getContextForTranslation(chatId, senderId, text, 3000);
    } catch (error) {
      console.warn('⚠️ Failed to get RAG context, proceeding without it:', error);
    }
  }

  // 2. Get relationship contexts for recipients
  const relationshipContexts = await getGroupRelationshipContexts(
    requestingUserId,
    participantIds || []
  );

  // Build relationship context string
  let relationshipContext = '';
  if (Object.keys(relationshipContexts).length > 0) {
    relationshipContext = '\n\nRELATIONSHIP CONTEXT:\n';
    Object.entries(relationshipContexts).forEach(([userId, relationship]) => {
      relationshipContext += `- Recipient ${userId}: ${relationship}\n`;
    });
  }

  // 3. Build comprehensive system prompt
  const systemPrompt = `You are a multilingual communication assistant with expertise in:
- Translation with tone preservation
- Idiom and slang detection
- Cultural context analysis

Analyze and translate the following message from ${sourceLang} to these languages: ${uniqueTargetLanguages.join(', ')}.

SENDER INFORMATION:
- Nationality: ${senderNationality || 'Unknown'}${relationshipContext}

${contextInfo.context ? `\nSENDER'S COMMUNICATION STYLE (from previous messages):\n${contextInfo.context}\n` : ''}

YOUR TASK:
1. Detect any idioms, slang, or cultural references in the original message
2. Translate the message to each target language while preserving tone
3. For each target language, provide cultural insights if the message contains:
   - Idioms that don't translate directly
   - Slang specific to the source culture
   - Cultural references that might be unfamiliar

IMPORTANT:
- Preserve emotional tone (friendly, formal, excited, sad, angry, etc.)
- Keep proper nouns unchanged
- Maintain any emoji or punctuation
- Match the formality level of the original
- Consider relationship context when analyzing (e.g., coworker = watch for work jargon, friend = watch for casual slang)

Format your response as JSON:
{
  "translations": {
    "en-US": "English translation",
    "es-MX": "Spanish translation",
    ...
  },
  "aiInsights": {
    "en-US": "Explanation in English (or null if no insights needed)",
    "es-MX": "Explicación en español (or null if no insights needed)",
    ...
  },
  "tone": "brief description of emotional tone (1-2 words)"
}

GUIDELINES FOR AI INSIGHTS:
- Only include aiInsights for a language if there are idioms, slang, or cultural references to explain
- Write insights in the target language (not the source language)
- Keep insights concise but informative (2-3 sentences)
- Focus on what the recipient might not understand
- If no insights needed, set to null
- Examples:
  - "This idiom means [explanation]"
  - "This is casual slang from [culture] meaning [definition]"
  - "This cultural reference relates to [context]"`;

  // 4. Call OpenAI with structured output
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: text,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000, // Increased for multi-language output
    response_format: { type: 'json_object' },
  });

  const resultText = response.choices[0]?.message?.content?.trim();

  if (!resultText) {
    throw new Error('Empty response received from OpenAI');
  }

  const result = JSON.parse(resultText);
  const translations = result.translations || {};
  const aiInsights = result.aiInsights || {};
  const tone = result.tone;

  // Filter out null insights (clean up response)
  const filteredInsights: { [lang: string]: string } = {};
  Object.entries(aiInsights).forEach(([lang, insight]) => {
    if (insight && typeof insight === 'string' && insight.trim() !== '') {
      filteredInsights[lang] = insight as string;
    }
  });

  console.timeEnd('analyze-and-translate');
  console.log(
    `✅ Analysis complete: ${Object.keys(translations).length} translations, ${Object.keys(filteredInsights).length} insights, tone: ${tone}`
  );

  if (contextInfo.messageCount > 0) {
    console.log(
      `📝 Used RAG context: ${contextInfo.messageCount} messages, ~${contextInfo.tokenCount} tokens`
    );
  }

  if (Object.keys(relationshipContexts).length > 0) {
    console.log(
      `👥 Used relationship context: ${Object.keys(relationshipContexts).length} relationships`
    );
  }

  return {
    translations,
    aiInsights: Object.keys(filteredInsights).length > 0 ? filteredInsights : null,
    tone,
    sourceLang,
    contextUsed: contextInfo.messageCount > 0,
    model: 'gpt-4-turbo',
  };
}

/**
 * Cloud Function: Analyze and Translate
 *
 * Public Cloud Function wrapper for analyzeAndTranslate
 * Handles authentication, rate limiting, and error conversion
 *
 * @param data.text - Original message text
 * @param data.sourceLang - Source language (BCP 47)
 * @param data.targetLanguages - Array of target languages
 * @param data.chatId - Chat ID (for RAG context)
 * @param data.senderId - Sender ID
 * @param data.senderNationality - Sender's nationality
 * @param data.participantIds - All chat participants (for relationship context)
 * @returns Object with translations and aiInsights for each language
 */
export const analyzeAndTranslate = functions.https.onCall(async (request) => {
  // 1. Check authentication
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be logged in'
    );
  }

  // 2. Rate limiting
  await rateLimitMiddleware(request.auth.uid, 'translation');

  // 3. Validate input
  const {
    text,
    sourceLang,
    targetLanguages,
    chatId,
    senderId,
    senderNationality,
    participantIds,
  } = request.data;

  if (!text || typeof text !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Text is required and must be a string'
    );
  }

  if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Target languages must be a non-empty array'
    );
  }

  try {
    // 4. Call internal function
    const result = await _analyzeAndTranslate({
      text,
      sourceLang,
      targetLanguages,
      chatId,
      senderId,
      senderNationality,
      participantIds,
      requestingUserId: request.auth.uid,
    });

    // 5. Increment rate limit
    await incrementRateLimit(request.auth.uid, 'translation');

    return result;
  } catch (error: any) {
    console.error('❌ Analysis and translation error:', error);

    if (error.code === 'insufficient_quota') {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'AI service temporarily unavailable. Please try again later.'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      'Analysis and translation failed. Please try again.'
    );
  }
});
