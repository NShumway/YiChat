import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { rateLimitMiddleware, incrementRateLimit } from './rateLimiting';
import { getOpenAIKey } from './secrets';

// Lazy-initialize OpenAI client (secrets only available at runtime)
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: getOpenAIKey() });
  }
  return openai;
}

// Relationship context lookup removed for performance (saves ~150ms per request)

/**
 * Cloud Function: Stream AI Chat
 *
 * Conversational AI that streams responses using Vercel AI SDK pattern
 * Provides insights about messages, answers questions, explains cultural context
 *
 * @param data.messages - Conversation history [{ role: 'user' | 'assistant', content: string }]
 * @param data.messageContext - Optional: The specific message being discussed
 * @param data.messageText - The actual message text
 * @param data.messageLang - Language of the message
 * @param data.senderId - ID of message sender
 * @param data.senderNationality - Sender's nationality
 * @param data.userNationality - Viewer's nationality
 * @param data.hasPreGeneratedInsight - Whether AI insights already exist for this message
 * @param data.preGeneratedInsight - Pre-generated AI insight (if available)
 * @returns Streaming text response
 */
export const streamAIChat = functions
  .runWith({
    secrets: ['OPENAI_API_KEY'],
  })
  .https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const requestStart = Date.now();
    console.log('🔍 streamAIChat: Request received');

    // Get auth token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).send('Unauthorized');
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify Firebase ID token
    const authStart = Date.now();
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      console.warn('⚠️ Auth token verification failed:', authError);
      res.status(401).send('Unauthorized');
      return;
    }
    const userId = decodedToken.uid;
    console.log(`⏱️ Auth verification: ${Date.now() - authStart}ms`);

    // Rate limiting
    const rateLimitStart = Date.now();
    try {
      await rateLimitMiddleware(userId, 'aiChat');
    } catch (rateLimitError: any) {
      if (rateLimitError.code === 'resource-exhausted') {
        res.status(429).json({
          error: rateLimitError.message,
          details: rateLimitError.details,
        });
        return;
      }
      throw rateLimitError; // Re-throw other errors
    }
    console.log(`⏱️ Rate limit check: ${Date.now() - rateLimitStart}ms`);

    // Parse request body
    const {
      messages,
      messageContext,
      messageText,
      messageLang,
      senderNationality,
      userNationality,
      hasPreGeneratedInsight,
      preGeneratedInsight,
    } = req.body;

    console.log(`🤖 AI Chat request from user ${userId}`);

    // Build system prompt - emphasize brevity for initial responses
    // Skip relationship context lookup to save ~150ms
    const isInitialAnalysis = !messages || messages.length === 0;

    let systemPrompt = isInitialAnalysis
      ? `You are a cross-cultural communication assistant. Be VERY brief - respond in 1-2 sentences only.

USER: ${userNationality || 'Unknown'} nationality`
      : `You are a cross-cultural communication assistant. Keep responses concise (2-3 paragraphs).

USER: ${userNationality || 'Unknown'} nationality`;

    // If discussing a specific message, add message context
    if (messageContext && messageText) {
      systemPrompt += `\n\nMESSAGE: "${messageText}" (${messageLang || 'Unknown'}, from ${senderNationality || 'Unknown'})`;

      // If pre-generated insight exists, reference it
      if (hasPreGeneratedInsight && preGeneratedInsight) {
        systemPrompt += `\n\nPrevious analysis: "${preGeneratedInsight}"\nAnswer follow-up questions concisely.`;
      } else {
        systemPrompt += isInitialAnalysis
          ? `\n\nGive ONE brief insight about idioms, slang, cultural context, or tone. Just 1-2 sentences.`
          : `\n\nExplain: idioms, slang, cultural context, tone. Be brief and friendly.`;
      }
    } else {
      systemPrompt += `\n\nHelp with cross-cultural communication. Be conversational and concise.`;
    }

    // Build conversation history
    const conversationMessages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add previous messages from conversation
    if (messages && Array.isArray(messages)) {
      conversationMessages.push(...messages);
    }

    console.log(`⏱️ Setup complete: ${Date.now() - requestStart}ms`);
    console.log('📡 Starting streaming response...');

    // Determine max_tokens based on whether this is initial analysis or follow-up
    // Initial analysis: Keep it brief (1-2 sentences)
    // Follow-up questions: Allow more detail
    const maxTokens = isInitialAnalysis ? 150 : 300;
    console.log(`🎯 Max tokens: ${maxTokens} (${isInitialAnalysis ? 'initial' : 'follow-up'})`);

    // Call OpenAI with streaming (do this BEFORE writeHead so errors are caught before headers sent)
    // Use gpt-4o-mini for faster responses (5-10x faster than gpt-4-turbo)
    const openaiStart = Date.now();
    const stream = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversationMessages,
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: true,
    });
    console.log(`⏱️ OpenAI stream started: ${Date.now() - openaiStart}ms`);

    // Set up streaming response (only after OpenAI call succeeds)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Stream response chunks
    let fullResponse = '';
    let firstChunkTime = 0;
    for await (const chunk of stream) {
      if (!firstChunkTime) {
        firstChunkTime = Date.now();
        console.log(`⏱️ First token: ${firstChunkTime - openaiStart}ms`);
      }

      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        // Send as Server-Sent Events format
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    console.log(`✅ Streamed ${fullResponse.length} characters in ${Date.now() - requestStart}ms total`);

    // Increment rate limit after successful stream
    await incrementRateLimit(userId, 'aiChat');

  } catch (error: any) {
    console.error('❌ AI Chat streaming error:', error);

    if (!res.headersSent) {
      if (error.code === 'insufficient_quota') {
        res.status(503).json({
          error: 'AI service temporarily unavailable. Please try again later.'
        });
      } else {
        res.status(500).json({
          error: 'AI chat failed. Please try again.'
        });
      }
    } else {
      // If headers already sent, send error through stream
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
      res.end();
    }
  }
});
