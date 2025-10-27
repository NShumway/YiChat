import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { getOpenAIKey, getPineconeKey } from './secrets';

// Initialize clients with Secret Manager
// See SECRETS_MIGRATION.md for setup instructions
let pinecone: Pinecone | null = null;
let openai: OpenAI | null = null;

function initializePinecone() {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: getPineconeKey() });
  }
  return pinecone;
}

function initializeOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: getOpenAIKey() });
  }
  return openai;
}

const PINECONE_INDEX_NAME = 'yichat-messages';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1024; // Reduced from default 1536 for Pinecone compatibility

/**
 * Get Pinecone index for message embeddings
 */
function getPineconeIndex() {
  const pc = initializePinecone();
  return pc.index(PINECONE_INDEX_NAME);
}

/**
 * Generate embedding for a text using OpenAI
 *
 * @param text - Text to embed
 * @returns Embedding vector (1024 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = initializeOpenAI();

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS, // Specify custom dimensions
  });

  return response.data[0].embedding;
}

/**
 * Embed a message to Pinecone for RAG
 *
 * @param messageId - Message ID
 * @param chatId - Chat ID
 * @param senderId - Sender user ID
 * @param text - Message text
 * @param language - Message language
 * @param timestamp - Message timestamp
 */
export async function embedMessage(
  messageId: string,
  chatId: string,
  senderId: string,
  text: string,
  language: string,
  timestamp: number
): Promise<void> {
  try {
    console.log(`📊 Embedding message ${messageId} to Pinecone`);

    // Generate embedding
    const embedding = await generateEmbedding(text);

    // Upsert to Pinecone
    const index = getPineconeIndex();
    await index.upsert([
      {
        id: messageId,
        values: embedding,
        metadata: {
          chatId,
          senderId,
          text: text.substring(0, 1000), // Limit text size in metadata
          language,
          timestamp,
        },
      },
    ]);

    console.log(`✅ Message ${messageId} embedded successfully`);
  } catch (error) {
    console.error(`❌ Failed to embed message ${messageId}:`, error);
    throw error;
  }
}

/**
 * Query Pinecone for similar messages in a chat
 * Used for RAG to understand sender's tone and communication style
 *
 * @param chatId - Chat ID to filter by
 * @param senderId - Sender ID to filter by
 * @param queryText - Text to find similar messages for
 * @param topK - Number of results to return
 * @param maxAge - Maximum age of messages in milliseconds (default: 7 days)
 * @returns Array of similar messages with metadata
 */
export async function querySimilarMessages(
  chatId: string,
  senderId: string,
  queryText: string,
  topK: number = 20,
  maxAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): Promise<Array<{ text: string; language: string; timestamp: number; score: number }>> {
  try {
    console.log(`🔍 Querying Pinecone for similar messages: chatId=${chatId}, senderId=${senderId}, topK=${topK}`);

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(queryText);

    // Query Pinecone with filters
    const index = getPineconeIndex();
    const minTimestamp = Date.now() - maxAge;

    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      filter: {
        chatId: { $eq: chatId },
        senderId: { $eq: senderId },
        timestamp: { $gte: minTimestamp },
      },
    });

    // Extract and return results
    const results = queryResponse.matches
      .filter((match) => match.metadata && match.score)
      .map((match) => ({
        text: match.metadata!.text as string,
        language: match.metadata!.language as string,
        timestamp: match.metadata!.timestamp as number,
        score: match.score!,
      }));

    console.log(`✅ Found ${results.length} similar messages`);
    return results;
  } catch (error) {
    console.error('❌ Failed to query Pinecone:', error);
    throw error;
  }
}

/**
 * Estimate token count for a text
 * Rough approximation: 1 token ≈ 4 characters for English, 1 token ≈ 2 characters for Chinese/Japanese
 *
 * @param text - Text to estimate tokens for
 * @param language - Language code (optional, for better estimation)
 * @returns Estimated token count
 */
export function estimateTokens(text: string, language?: string): number {
  const isCJK = language && ['zh', 'ja', 'ko'].some(l => language.startsWith(l));
  const ratio = isCJK ? 2 : 4;
  return Math.ceil(text.length / ratio);
}

/**
 * Get context messages for RAG within token limit
 * Adaptively selects messages to stay under token limit
 *
 * @param chatId - Chat ID
 * @param senderId - Sender ID
 * @param queryText - Query text
 * @param maxTokens - Maximum tokens for context (default: 3000)
 * @returns Context text built from similar messages
 */
export async function getContextForTranslation(
  chatId: string,
  senderId: string,
  queryText: string,
  maxTokens: number = 3000
): Promise<{ context: string; messageCount: number; tokenCount: number }> {
  try {
    // Query more messages than we need, then filter by token limit
    const similarMessages = await querySimilarMessages(chatId, senderId, queryText, 100);

    if (similarMessages.length === 0) {
      return { context: '', messageCount: 0, tokenCount: 0 };
    }

    // Sort by timestamp (most recent first)
    similarMessages.sort((a, b) => b.timestamp - a.timestamp);

    // Build context within token limit
    const contextLines: string[] = [];
    let totalTokens = 0;
    let messageCount = 0;

    for (const msg of similarMessages) {
      const msgTokens = estimateTokens(msg.text, msg.language);

      // Check if adding this message would exceed limit
      if (totalTokens + msgTokens > maxTokens) {
        break;
      }

      const timestamp = new Date(msg.timestamp).toISOString();
      contextLines.push(`[${timestamp}] ${msg.text}`);
      totalTokens += msgTokens;
      messageCount++;
    }

    const context = contextLines.join('\n');

    console.log(`📝 Built context: ${messageCount} messages, ~${totalTokens} tokens`);

    return { context, messageCount, tokenCount: totalTokens };
  } catch (error) {
    console.error('❌ Failed to get context:', error);
    // Return empty context on error - translation can still proceed
    return { context: '', messageCount: 0, tokenCount: 0 };
  }
}

/**
 * Batch embed messages to Pinecone
 * Used by scheduled Cloud Function to embed messages that need translation context
 *
 * @param messages - Array of messages to embed
 */
export async function batchEmbedMessages(
  messages: Array<{
    id: string;
    chatId: string;
    senderId: string;
    text: string;
    originalLanguage: string;
    timestamp: number;
  }>
): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  console.log(`📦 Batch embedding ${messages.length} messages`);

  try {
    const client = initializeOpenAI();

    // Generate embeddings in batch (OpenAI supports up to 2048 inputs)
    const texts = messages.map(m => m.text);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS, // Specify custom dimensions
    });

    // Prepare vectors for Pinecone
    const vectors = messages.map((msg, idx) => ({
      id: msg.id,
      values: response.data[idx].embedding,
      metadata: {
        chatId: msg.chatId,
        senderId: msg.senderId,
        text: msg.text.substring(0, 1000),
        language: msg.originalLanguage,
        timestamp: msg.timestamp,
      },
    }));

    // Upsert to Pinecone (supports up to 1000 vectors per batch)
    const index = getPineconeIndex();
    const batchSize = 1000;

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
      console.log(`✅ Upserted batch ${i / batchSize + 1} (${batch.length} vectors)`);
    }

    console.log(`✅ Batch embedding complete: ${messages.length} messages`);
  } catch (error) {
    console.error('❌ Batch embedding failed:', error);
    throw error;
  }
}
