import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const functions = getFunctions();
const db = getFirestore();

/**
 * Extract base language from BCP 47 tag
 * e.g., 'en-US' -> 'en', 'zh-CN' -> 'zh'
 */
export function getBaseLanguage(languageTag: string): string {
  return languageTag.split('-')[0];
}

/**
 * Check if two languages are the same (ignoring country)
 * e.g., 'en-US' and 'en-GB' are considered the same
 */
export function isSameLanguage(lang1: string, lang2: string): boolean {
  return getBaseLanguage(lang1) === getBaseLanguage(lang2);
}

/**
 * Get human-readable language name from BCP 47 code
 */
export function getLanguageName(languageCode: string): string {
  const names: { [key: string]: string } = {
    'en-US': 'English',
    'en-GB': 'English (UK)',
    'es-MX': 'Spanish',
    'es-ES': 'Spanish (Spain)',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
    'fr-FR': 'French',
    'de-DE': 'German',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
    'pt-BR': 'Portuguese (Brazil)',
    'ru-RU': 'Russian',
    'ar-SA': 'Arabic',
    'hi-IN': 'Hindi',
    'it-IT': 'Italian',
    'nl-NL': 'Dutch',
    'pl-PL': 'Polish',
    'tr-TR': 'Turkish',
    'vi-VN': 'Vietnamese',
    'th-TH': 'Thai',
  };

  // Return the full name if available, otherwise return the code
  if (names[languageCode]) {
    return names[languageCode];
  }

  // Try base language
  const baseCode = languageCode.split('-')[0];
  const baseName = Object.entries(names).find(([key]) => key.startsWith(baseCode))?.[1];
  return baseName || languageCode;
}

/**
 * Detect the language of a text message
 */
export async function detectLanguage(
  text: string,
  userLanguage: string
): Promise<string> {
  try {
    const detectLang = httpsCallable(functions, 'detectLanguage');
    const result: HttpsCallableResult<{ language: string }> = await detectLang({
      text,
      userLanguage,
    });

    return result.data.language;
  } catch (error: any) {
    console.error('❌ Language detection failed:', error);

    // Fallback: return user's language
    return userLanguage;
  }
}

/**
 * Get languages of all participants in a chat
 */
export async function getRecipientLanguages(
  participantIds: string[]
): Promise<string[]> {
  const languages: string[] = [];

  for (const uid of participantIds) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      const userData = userDoc.data();
      const language = userData?.preferredLanguage || 'en-US';
      languages.push(language);
    } catch (error) {
      console.error(`❌ Error fetching language for user ${uid}:`, error);
      languages.push('en-US'); // Fallback
    }
  }

  // Return unique languages only
  return [...new Set(languages)];
}

/**
 * Translate a message to multiple languages (batch translation)
 * Returns translations object and detected tone
 */
export async function translateMessage(
  text: string,
  sourceLang: string,
  targetLanguages: string[],
  chatId: string,
  senderId: string
): Promise<{
  translations: { [language: string]: string };
  tone: string | null;
  contextUsed: boolean;
}> {
  // Filter out same language
  const uniqueTargetLanguages = [...new Set(targetLanguages)].filter(
    (lang) => !isSameLanguage(sourceLang, lang)
  );

  if (uniqueTargetLanguages.length === 0) {
    // All recipients speak same language - no translation needed
    return {
      translations: {},
      tone: null,
      contextUsed: false,
    };
  }

  try {
    console.log(
      `🌐 Translating to ${uniqueTargetLanguages.length} languages:`,
      uniqueTargetLanguages.join(', ')
    );

    const batchTranslate = httpsCallable(functions, 'batchTranslate');
    const result: HttpsCallableResult<{
      translations: { [language: string]: string };
      tone: string;
      contextUsed: boolean;
    }> = await batchTranslate({
      text,
      sourceLang,
      targetLanguages: uniqueTargetLanguages,
      chatId,
      senderId,
    });

    console.log('✅ Translation complete:', result.data);

    return {
      translations: result.data.translations || {},
      tone: result.data.tone || null,
      contextUsed: result.data.contextUsed || false,
    };
  } catch (error: any) {
    console.error('❌ Translation failed:', error);

    // Check if it's a rate limit error
    if (error.code === 'resource-exhausted') {
      throw new Error(
        'Translation rate limit exceeded. Please wait a moment and try again.'
      );
    }

    // Check if it's an offline error
    if (error.code === 'unavailable') {
      throw new Error(
        'Translation requires internet connection. Message will send without translation.'
      );
    }

    // Generic error
    throw new Error('Translation failed. Message will send without translation.');
  }
}

/**
 * Prepare message with translations for sending
 * Returns message object with translations if needed
 */
export async function prepareMessageWithTranslation(
  text: string,
  chatId: string,
  senderId: string,
  userLanguage: string,
  participantIds: string[]
): Promise<{
  originalLanguage: string;
  translations?: { [language: string]: string };
  tone?: string;
}> {
  try {
    // 1. Detect language
    console.log('🔍 Detecting language...');
    const detectedLanguage = await detectLanguage(text, userLanguage);
    console.log(`✅ Detected language: ${detectedLanguage}`);

    // 2. Get recipient languages
    const recipientLanguages = await getRecipientLanguages(participantIds);
    console.log('👥 Recipient languages:', recipientLanguages.join(', '));

    // 3. Check if translation is needed
    const needsTranslation = recipientLanguages.some(
      (lang) => !isSameLanguage(detectedLanguage, lang)
    );

    if (!needsTranslation) {
      console.log('✅ All recipients speak same language - no translation needed');
      return {
        originalLanguage: detectedLanguage,
      };
    }

    // 4. Translate to all recipient languages
    const { translations, tone } = await translateMessage(
      text,
      detectedLanguage,
      recipientLanguages,
      chatId,
      senderId
    );

    return {
      originalLanguage: detectedLanguage,
      translations,
      tone: tone || undefined,
    };
  } catch (error: any) {
    console.error('❌ Error preparing message with translation:', error);

    // Return without translations on error
    return {
      originalLanguage: userLanguage,
    };
  }
}
