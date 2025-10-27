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

/**
 * Get relationship context for a specific contact
 */
async function getRelationshipContext(
  viewerUserId: string,
  contactUserId: string
): Promise<string | null> {
  if (viewerUserId === contactUserId) {
    return null;
  }

  try {
    const db = admin.firestore();
    const contactDoc = await db
      .collection('users')
      .doc(viewerUserId)
      .collection('contacts')
      .doc(contactUserId)
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
    // Get auth token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).send('Unauthorized');
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      console.warn('⚠️ Auth token verification failed:', authError);
      res.status(401).send('Unauthorized');
      return;
    }
    const userId = decodedToken.uid;

    // Rate limiting
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

    // Parse request body
    const {
      messages,
      messageContext,
      messageText,
      messageLang,
      senderId,
      senderNationality,
      userNationality,
      hasPreGeneratedInsight,
      preGeneratedInsight,
    } = req.body;

    console.log(`🤖 AI Chat request from user ${userId}`);

    // Get relationship context if discussing a specific message
    let relationshipContext = '';
    if (senderId && senderId !== userId) {
      const relationship = await getRelationshipContext(userId, senderId);
      if (relationship) {
        relationshipContext = `\n\nRELATIONSHIP: You're viewing a message from your ${relationship}.`;
      }
    }

    // Build system prompt
    let systemPrompt = `You are a helpful AI assistant specializing in cross-cultural communication.

Your expertise includes:
- Explaining idioms, slang, and informal language
- Providing cultural context for messages
- Answering questions about communication nuances
- Helping users understand tone and intent

USER CONTEXT:
- User's nationality: ${userNationality || 'Unknown'}
${relationshipContext}`;

    // If discussing a specific message, add message context
    if (messageContext && messageText) {
      systemPrompt += `\n\nMESSAGE CONTEXT:
- Message text: "${messageText}"
- Message language: ${messageLang || 'Unknown'}
- Sender nationality: ${senderNationality || 'Unknown'}`;

      // If pre-generated insight exists, show it first
      if (hasPreGeneratedInsight && preGeneratedInsight) {
        systemPrompt += `\n\nYou have already analyzed this message. Here's your previous analysis:\n"${preGeneratedInsight}"

The user can now ask follow-up questions about this message or request additional clarification.`;
      } else {
        systemPrompt += `\n\nThe user wants to understand this message better. Analyze it for:
- Any idioms or slang that might need explanation
- Cultural references that might be unfamiliar
- Tone and emotional context
- Any nuances that might be lost in translation

Provide your analysis in a conversational, helpful tone.`;
      }
    }

    systemPrompt += `\n\nGUIDELINES:
- Be conversational and friendly
- Keep responses concise (2-3 paragraphs max unless asked for more)
- Use examples when explaining idioms or cultural concepts
- If you don't know something, say so honestly
- Respect cultural differences and avoid stereotypes`;

    // Build conversation history
    const conversationMessages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add previous messages from conversation
    if (messages && Array.isArray(messages)) {
      conversationMessages.push(...messages);
    }

    console.log('📡 Starting streaming response...');

    // Call OpenAI with streaming (do this BEFORE writeHead so errors are caught before headers sent)
    const stream = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo',
      messages: conversationMessages,
      temperature: 0.7,
      max_tokens: 1000,
      stream: true,
    });

    // Set up streaming response (only after OpenAI call succeeds)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Stream response chunks
    let fullResponse = '';
    for await (const chunk of stream) {
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

    console.log(`✅ Streamed ${fullResponse.length} characters`);

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
