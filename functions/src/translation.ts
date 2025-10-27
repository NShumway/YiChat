import * as functions from 'firebase-functions/v1';
import OpenAI from 'openai';
import { rateLimitMiddleware, incrementRateLimit } from './rateLimiting';
import { getContextForTranslation } from './embeddings';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: functions.config().openai?.key || process.env.OPENAI_API_KEY,
});

/**
 * Extract base language from BCP 47 tag
 * e.g., 'en-US' -> 'en', 'zh-CN' -> 'zh'
 */
function getBaseLanguage(languageTag: string): string {
  return languageTag.split('-')[0];
}

/**
 * Check if two languages are the same (ignoring country)
 * e.g., 'en-US' and 'en-GB' are considered the same
 */
function isSameLanguage(lang1: string, lang2: string): boolean {
  return getBaseLanguage(lang1) === getBaseLanguage(lang2);
}

/**
 * Cloud Function: Detect Language
 *
 * Auto-detects the language of a text, with user's preferred language as context
 *
 * @param data.text - Text to detect language for
 * @param data.userLanguage - User's preferred language (for context)
 * @returns Detected language in BCP 47 format
 */
export const detectLanguage = functions.https.onCall(async (request) => {
  // 1. Check authentication
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be logged in'
    );
  }

  // 2. Rate limiting (use translation limit since it's similar cost)
  await rateLimitMiddleware(request.auth.uid, 'translation');

  // 3. Validate input
  const { text, userLanguage } = request.data;

  if (!text || typeof text !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Text is required and must be a string'
    );
  }

  try {
    console.log(`🔍 Detecting language for: "${text.substring(0, 50)}..."`);

    // 4. Call OpenAI to detect language
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a language detection expert. Detect the language of the given text and return it in BCP 47 format (e.g., 'en-US', 'es-MX', 'zh-CN').

Context: The user's preferred language is ${userLanguage}. Use this as a hint if the text is ambiguous.

Return ONLY the language code, nothing else.

Examples:
- "Hello world" -> en-US
- "Hola mundo" -> es-ES
- "你好世界" -> zh-CN
- "Bonjour le monde" -> fr-FR`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.1,
      max_tokens: 10,
    });

    const detectedLanguage = response.choices[0]?.message?.content?.trim();

    if (!detectedLanguage) {
      throw new Error('Empty language detection result');
    }

    console.log(`✅ Detected language: ${detectedLanguage}`);

    await incrementRateLimit(request.auth.uid, 'translation');

    return {
      language: detectedLanguage,
      text,
    };
  } catch (error: any) {
    console.error('❌ Language detection error:', error);

    throw new functions.https.HttpsError(
      'internal',
      'Language detection failed. Please try again.'
    );
  }
});

/**
 * Cloud Function: Batch Translate
 *
 * Translates a message to multiple target languages
 * Used when sending a message in a group chat with users of different languages
 *
 * @param data.text - Text to translate
 * @param data.sourceLang - Source language (BCP 47)
 * @param data.targetLanguages - Array of target languages (BCP 47)
 * @param data.chatId - Chat ID (for RAG context)
 * @param data.senderId - Sender ID (for RAG context)
 * @returns Object with translations for each language
 */
export const batchTranslate = functions.https.onCall(async (request) => {
  // 1. Check authentication
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be logged in'
    );
  }

  // 2. Validate input
  const { text, sourceLang, targetLanguages, chatId, senderId } = request.data;

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

  // Filter out same language
  const uniqueTargetLanguages = [...new Set(targetLanguages)].filter(
    (lang) => !isSameLanguage(sourceLang, lang)
  );

  if (uniqueTargetLanguages.length === 0) {
    // All target languages are same as source
    return {
      translations: {},
      tone: null,
    };
  }

  // Rate limit based on number of translations
  for (let i = 0; i < uniqueTargetLanguages.length; i++) {
    await rateLimitMiddleware(request.auth.uid, 'translation');
  }

  try {
    console.log(
      `🌐 Batch translating to ${uniqueTargetLanguages.length} languages: ${uniqueTargetLanguages.join(', ')}`
    );
    console.time('batch-translation');

    // Get RAG context once (shared for all translations)
    let contextInfo = { context: '', messageCount: 0, tokenCount: 0 };
    if (chatId && senderId) {
      try {
        contextInfo = await getContextForTranslation(chatId, senderId, text, 3000);
      } catch (error) {
        console.warn('⚠️ Failed to get context, proceeding without it:', error);
      }
    }

    // Build system prompt
    let systemPrompt = `You are a professional translator with expertise in tone and emotion detection.

Translate the following text from ${sourceLang} to these languages: ${uniqueTargetLanguages.join(', ')}.

IMPORTANT:
- Preserve the emotional tone (friendly, formal, excited, sad, angry, etc.)
- Keep proper nouns unchanged
- Maintain any emoji or punctuation
- Match the formality level of the original`;

    if (contextInfo.context) {
      systemPrompt += `

CONTEXT - Previous messages from this sender in this conversation:
${contextInfo.context}

Use this context to understand the sender's communication style and tone.`;
    }

    systemPrompt += `

Format your response as JSON:
{
  "translations": {
    "en-US": "English translation",
    "es-MX": "Spanish translation",
    ...
  },
  "tone": "brief description of emotional tone (1-2 words)"
}`;

    // Call OpenAI once for all translations
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
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const resultText = response.choices[0]?.message?.content?.trim();

    if (!resultText) {
      throw new Error('Empty translation received from OpenAI');
    }

    const result = JSON.parse(resultText);
    const translations = result.translations;
    const tone = result.tone;

    console.timeEnd('batch-translation');
    console.log(`✅ Batch translation complete: ${Object.keys(translations).length} languages (tone: ${tone})`);

    if (contextInfo.messageCount > 0) {
      console.log(`📝 Used context: ${contextInfo.messageCount} messages, ~${contextInfo.tokenCount} tokens`);
    }

    // Increment rate limit for each translation
    for (let i = 0; i < uniqueTargetLanguages.length; i++) {
      await incrementRateLimit(request.auth.uid, 'translation');
    }

    return {
      translations,
      tone,
      sourceLang,
      contextUsed: contextInfo.messageCount > 0,
      contextMessageCount: contextInfo.messageCount,
      contextTokenCount: contextInfo.tokenCount,
      model: 'gpt-4-turbo',
    };
  } catch (error: any) {
    console.error('❌ Batch translation error:', error);

    if (error.code === 'insufficient_quota') {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Translation service temporarily unavailable. Please try again later.'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      'Batch translation failed. Please try again.'
    );
  }
});
