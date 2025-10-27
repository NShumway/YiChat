/**
 * Secret Manager Configuration
 *
 * All secrets are stored in Google Secret Manager for security
 * See SECRETS_MIGRATION.md for setup instructions
 */

/**
 * Get OpenAI API key from Secret Manager
 * Secret must be named: OPENAI_API_KEY
 */
export function getOpenAIKey(): string {
  if (process.env.OPENAI_API_KEY) {
    console.log('✅ Using OpenAI API key from Secret Manager');
    return process.env.OPENAI_API_KEY;
  }

  throw new Error('❌ OpenAI API key not found in Secret Manager! Ensure OPENAI_API_KEY secret exists and Cloud Functions has access.');
}

/**
 * Get Pinecone API key from Secret Manager
 * Secret must be named: PINECONE_API_KEY
 */
export function getPineconeKey(): string {
  if (process.env.PINECONE_API_KEY) {
    console.log('✅ Using Pinecone API key from Secret Manager');
    return process.env.PINECONE_API_KEY;
  }

  throw new Error('❌ Pinecone API key not found in Secret Manager! Ensure PINECONE_API_KEY secret exists and Cloud Functions has access.');
}

/**
 * Check if secrets are properly configured
 * Call this during initialization to fail fast if secrets are missing
 */
export function validateSecrets(): void {
  try {
    getOpenAIKey();
    console.log('✅ OpenAI API key validated');
  } catch (error) {
    console.error('❌ OpenAI API key validation failed:', error);
    throw error;
  }

  try {
    getPineconeKey();
    console.log('✅ Pinecone API key validated');
  } catch (error) {
    console.error('❌ Pinecone API key validation failed:', error);
    throw error;
  }
}
