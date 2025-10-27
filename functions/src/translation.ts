import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { rateLimitMiddleware, incrementRateLimit } from './rateLimiting';
import { getContextForTranslation } from './embeddings';
import { getOpenAIKey } from './secrets';

// Lazy-initialize OpenAI client (secrets only available at runtime)
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: getOpenAIKey() });
  }
  return openai;
}

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
export const detectLanguage = functions
  .runWith({
    secrets: ['OPENAI_API_KEY'],
  })
  .https.onRequest(async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    console.log('🔍 detectLanguage called');

    // 1. Verify Firebase ID token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ No authorization header');
      res.status(401).json({ error: 'Unauthorized - No token provided' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    console.log('✅ Auth check passed, uid:', uid);

    // 2. Rate limiting
    await rateLimitMiddleware(uid, 'translation');

    // 3. Validate input
    const { text, userLanguage } = req.body;

    if (!text || typeof text !== 'string') {
      console.error('❌ Invalid input: text is required');
      res.status(400).json({ error: 'Text is required and must be a string' });
      return;
    }

    console.log(`🔍 Detecting language for: "${text.substring(0, 50)}..."`);

    // 4. Call OpenAI to detect language
    const response = await getOpenAI().chat.completions.create({
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
      console.error('❌ Empty language detection result from OpenAI');
      res.status(500).json({ error: 'Language detection failed - empty result' });
      return;
    }

    console.log(`✅ Detected language: ${detectedLanguage}`);

    // 5. Increment rate limit and return success
    await incrementRateLimit(uid, 'translation');

    res.status(200).json({
      language: detectedLanguage,
      text,
    });
  } catch (error: any) {
    console.error('❌ Language detection error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Language detection failed. Please try again.',
        details: error.message,
      });
    }
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
export const batchTranslate = functions
  .runWith({
    secrets: ['OPENAI_API_KEY', 'PINECONE_API_KEY'],
  })
  .https.onCall(async (request) => {
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
    const response = await getOpenAI().chat.completions.create({
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
