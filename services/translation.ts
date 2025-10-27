import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from './firebase';

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
export function getLanguageName(languageCode: string | undefined | null): string {
  // Handle null/undefined/empty
  if (!languageCode) {
    return 'Unknown';
  }

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
    // Debug: Check auth state before calling function
    const { auth } = await import('./firebase');
    if (!auth.currentUser) {
      console.warn('⚠️ detectLanguage: No authenticated user, skipping');
      return userLanguage;
    }

    console.log('🔍 detectLanguage: Auth user exists:', auth.currentUser.uid);

    // Get auth token
    const token = await auth.currentUser.getIdToken();
    console.log('✅ Auth token retrieved, length:', token.length);
    console.log('Token first 20 chars:', token.substring(0, 20));

    // Call HTTPS endpoint directly (not callable function)
    const functionUrl = 'https://us-central1-yichat-3f1b4.cloudfunctions.net/detectLanguage';
    console.log('📞 Calling detectLanguage HTTPS endpoint:', functionUrl);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        userLanguage,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ HTTP error:', response.status, errorData);
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Cloud Function returned successfully:', result.language);
    return result.language;
  } catch (error: any) {
    console.error('❌ Language detection failed:', error);
    console.error('Error message:', error.message);

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
    // Debug: Check auth state before calling function
    const { auth } = await import('./firebase');
    if (!auth.currentUser) {
      console.warn('⚠️ batchTranslate: No authenticated user, skipping translation');
      return {
        translations: {},
        tone: null,
        contextUsed: false,
      };
    }

    console.log(
      `🌐 Translating to ${uniqueTargetLanguages.length} languages:`,
      uniqueTargetLanguages.join(', ')
    );
    console.log('🔍 batchTranslate: Auth user exists:', auth.currentUser.uid);

    // Get auth token
    const token = await auth.currentUser.getIdToken();
    const functionUrl = 'https://us-central1-yichat-3f1b4.cloudfunctions.net/batchTranslate';

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        sourceLang,
        targetLanguages: uniqueTargetLanguages,
        chatId,
        senderId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ HTTP error:', response.status, errorData);
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Translation complete:', result);

    return {
      translations: result.translations || {},
      tone: result.tone || null,
      contextUsed: result.contextUsed || false,
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
