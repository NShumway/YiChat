# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YiChat is a cross-platform (iOS, Android, Web) real-time messaging application built with React Native, Expo, Firebase, and TypeScript. The app supports direct messaging, group chats, offline functionality, message queuing, and real-time synchronization.

## Development Commands

### Running the app
```bash
npm start                # Start Expo development server
npm run android          # Run on Android device/emulator
npm run ios              # Run on iOS device/simulator
npm run web              # Run in web browser
```

### TypeScript
- The project uses TypeScript with strict mode enabled
- TypeScript config extends `expo/tsconfig.base`
- No dedicated build/lint/test commands configured

## Architecture

### State Management
- **Zustand** (`store/useStore.ts`): Global state management for:
  - User authentication state
  - Connection status (online/offline/reconnecting)
  - UI state (loading, errors)
  - Uses a simple, functional API with `create()` pattern

### Data Layer Architecture

The app uses a **three-layer data architecture** for resilience and performance:

1. **SQLite (Local Storage)** - Primary data source
   - Location: `services/database.ts`
   - Stores messages, chats, and pending messages locally
   - Provides instant UI updates (no loading states)
   - Falls back to in-memory storage on web platform
   - Key operations: `dbOperations.insertMessage()`, `dbOperations.getMessagesByChat()`, etc.

2. **Message Queue System** - Offline resilience
   - Location: `services/messageQueue.ts`
   - Queues messages when offline, sends when reconnected
   - Implements exponential backoff retry (1s, 2s, 5s, 10s, 30s)
   - Persists pending messages to SQLite for durability
   - Network state monitoring via `@react-native-community/netinfo`

3. **Firestore (Cloud Sync)** - Real-time synchronization
   - Location: `services/firebase.ts`, `services/messageSync.ts`
   - Syncs messages across devices in real-time
   - **Important**: Uses named database `'yichat'` (not default database)
   - Delta sync on app foreground (only fetches messages since last sync)
   - Real-time listeners for active chats

### Message Flow

**Sending messages:**
1. Create message with local ID (timestamp-based)
2. Insert to SQLite immediately (optimistic UI)
3. Add to message queue
4. Queue attempts to send to Firestore
5. On success: update local ID to Firestore ID
6. On failure: retry with exponential backoff or queue for later

**Receiving messages:**
1. Firestore listener detects new message
2. Insert/update in SQLite
3. UI re-renders from SQLite data
4. Message notifications triggered (if app backgrounded)

### App Lifecycle Management

- **Location**: `services/messageSync.ts`, `app/_layout.tsx`
- `AppState` listener tracks foreground/background transitions
- On background: saves sync timestamp, updates user status to offline
- On foreground: syncs missed messages, processes pending queue, updates user status to online
- Delta sync targets <1s for 100 messages, <2s for 100+

### Firebase Configuration

- Config loaded from environment variables via `expo-constants`
- **Platform-Specific Credentials**: Each platform (web/Android/iOS) requires its own API key and App ID
- Required variables in `.env.local` (copy from `.env.example`):
  - `FIREBASE_API_KEY_WEB` - Web app API key
  - `FIREBASE_API_KEY_ANDROID` - Android app API key
  - `FIREBASE_API_KEY_IOS` - iOS app API key
  - `FIREBASE_APP_ID_WEB` - Web app ID (format: `1:xxx:web:xxx`)
  - `FIREBASE_APP_ID_ANDROID` - Android app ID (format: `1:xxx:android:xxx`)
  - `FIREBASE_APP_ID_IOS` - iOS app ID (format: `1:xxx:ios:xxx`)
  - `FIREBASE_AUTH_DOMAIN` - Shared across platforms
  - `FIREBASE_PROJECT_ID` - Shared across platforms
  - `FIREBASE_STORAGE_BUCKET` - Shared across platforms
  - `FIREBASE_MESSAGING_SENDER_ID` - Shared across platforms
- **Why Platform-Specific?** Cloud Functions verify the calling app using App ID. Using wrong credentials (e.g., web on Android) causes "app verification missing" errors with 401 status
- **Security**: `.env.local` is in `.gitignore` - NEVER commit it! Firebase API keys/App IDs are public by design (protected by Security Rules)
- **Implementation**: `services/firebase.ts` selects correct credentials based on `Platform.OS`
- **Critical**: Database name is `'yichat'`, not the default database
- **Critical**: Cloud Functions region is `'us-central1'` - must match deployment region
- Auth persistence: AsyncStorage on mobile, browser storage on web

### Routing

- **Expo Router** with file-based routing (v6)
- Route groups:
  - `(auth)/` - Login/signup screens
  - `(tabs)/` - Main app with tab navigation
  - `chat/[chatId]` - Dynamic chat screen
  - `new-chat`, `new-group` - Modal screens
- Authentication routing logic in `app/_layout.tsx`
- Navigation guards redirect based on auth state

### Key Features Implementation

**Offline Support:**
- All UI operates on local SQLite data
- Message queue buffers sends when offline
- Connection banner shows online/offline/reconnecting status

**Real-time Updates:**
- Firestore `onSnapshot` listeners for messages and typing indicators
- Read receipts track when users view messages
- Typing indicators with debounced Firestore updates

**Notifications:**
- Push notifications via `expo-notifications`
- Foreground notifications listener in `app/_layout.tsx`
- Hook: `hooks/useMessageNotifications.ts`
- Tapping notification navigates to chat

**Group Chats:**
- Chat type: `'direct'` or `'group'`
- Participants array tracks members
- System messages for join/leave events
- Unread count per user stored as object `{ [userId]: count }`

## Critical Implementation Details

### SQLite Database Schema

Tables:
- **messages**: id, chatId, senderId, text, originalLanguage, timestamp, status, readBy (JSON), mediaURL, localOnly
- **chats**: id, type, participants (JSON), lastMessage, lastMessageTimestamp, unreadCount
- **pending_messages**: id, messageData (JSON), timestamp

Indexes:
- `idx_messages_chatId` on messages(chatId)
- `idx_messages_timestamp` on messages(timestamp)

### Message Status Flow
1. `sending` - Initial state, in queue
2. `sent` - Successfully sent to Firestore
3. `delivered` - Message received by recipient device (future)
4. `read` - Message viewed by recipient
5. `failed` - All retry attempts exhausted

### Platform Considerations

- **Web**: SQLite not available, uses in-memory storage fallback
- **Mobile**: Full SQLite support, background sync, push notifications
- Use `Platform.OS` checks for platform-specific code

### Initialization Sequence (app/_layout.tsx)

1. Initialize SQLite database
2. Initialize message queue system
3. Set up Firebase auth state listener
4. On auth: fetch user data from Firestore, initialize message sync
5. Set up notification listeners (mobile only)
6. Set up authentication-based routing

## Common Patterns

### Reading Messages for a Chat
```typescript
// Always read from SQLite first for instant UI
const messages = dbOperations.getMessagesByChat(chatId);
setMessages(messages);

// Then set up Firestore listener for real-time updates
const unsubscribe = onSnapshot(query(...), (snapshot) => {
  snapshot.docChanges().forEach(change => {
    // Insert to SQLite, which updates UI
    dbOperations.insertMessage(message);
  });
});
```

### Sending a Message
```typescript
// 1. Create optimistic message
const tempId = `temp_${Date.now()}`;
const message: Message = { id: tempId, ...data, status: 'sending' };

// 2. Insert to SQLite (instant UI update)
dbOperations.insertMessage(message);

// 3. Queue for Firestore
queueMessage(message);

// 4. Message queue handles retry and ID mapping
```

### Handling Connection Status
```typescript
const connectionStatus = useStore(state => state.connectionStatus);

// Show banner
if (connectionStatus === 'offline') {
  return <ConnectionBanner />;
}

// Queue processes automatically when status changes to 'online'
```

## TypeScript Types

Key types located in `types/`:

- `Message` - Chat message with status, readBy, timestamps
- `Chat` - Chat metadata (direct or group)
- `User` - User profile with auth data
- `PendingMessage` - Queued message wrapper

## Important Notes

- Never call Firestore operations directly for messages; always go through SQLite + message queue
- Always check `Platform.OS === 'web'` before using SQLite operations
- Message IDs change from temp IDs to Firestore IDs; handle this in UI
- Connection status drives UI (online banner) and queue processing
- Firestore database name is `'yichat'`, not `'(default)'`
- All Firestore timestamps use `serverTimestamp()` for consistency
- Message sync uses delta queries (timestamp-based) to minimize data transfer
- Unread counts for group chats are per-user objects, not single numbers

## AI Features Development

### Development Workflow

**Testing AI Features:**
```bash
# 1. Set up Cloud Functions environment
cd functions
npm install

# 2. Set API keys (NEVER commit these!)
firebase functions:config:set openai.key="sk-..."
firebase functions:config:set pinecone.key="..."

# 3. Deploy functions
firebase deploy --only functions

# 4. Test in app with EAS Build (not Expo Go)
eas build --profile development --platform android
```

**Local Testing with Emulators:**
```bash
# Start Firebase emulators
firebase emulators:start

# In separate terminal, start app
npm start

# Note: AI features won't work in emulators (need real OpenAI API)
# But you can test Cloud Function structure and auth
```

### AI Service Architecture

**Cloud Functions Structure:**
```
functions/
├── src/
│   ├── index.ts           # Exports all functions
│   ├── rateLimiting.ts    # Rate limit middleware
│   ├── translation.ts     # Translation services
│   ├── embeddings.ts      # Pinecone RAG
│   ├── aiConversation.ts  # Streaming AI chat
│   └── smartReplies.ts    # Context-aware suggestions
```

**Common AI Pattern:**
```typescript
// Every AI Cloud Function follows this pattern:
export const aiFeature = functions.https.onCall(async (data, context) => {
  // 1. Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  // 2. Check rate limit FIRST
  await rateLimitMiddleware(context, 'featureName');

  // 3. Extract and validate input
  const { text, targetLanguage } = data;
  if (!text || !targetLanguage) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // 4. Call AI service
  const result = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [...],
    temperature: 0.7,
    max_tokens: 500,
  });

  // 5. Return result
  return { translatedText: result.choices[0].message.content };
});
```

### RAG Pipeline Usage

**When to Use RAG:**
- Smart replies (needs conversation history)
- AI context menu (needs message context)
- Cultural context (can reference past conversations)

**When NOT to Use RAG:**
- Simple translation (just translate the text)
- Language detection (single message)
- Slang explanation (just explain the phrase)

**RAG Query Pattern:**
```typescript
import { queryConversationContext } from './embeddings';

// In AI function
const relevantMessages = await queryConversationContext(
  chatId,
  userQuery,  // "What did we talk about food?"
  topK: 20    // Return 20 most relevant messages
);

// Build context for GPT-4
const context = relevantMessages.map(msg =>
  `[${new Date(msg.timestamp).toLocaleString()}] ${msg.text}`
).join('\n');

const prompt = `Based on this conversation:\n${context}\n\nUser asks: ${userQuery}`;
```

### Performance Optimization

**Translation Caching:**
```typescript
// Cache translations in Firestore to avoid re-translating
const cacheKey = `${text}_${sourceLang}_${targetLang}`;
const cached = await db.collection('translationCache').doc(cacheKey).get();

if (cached.exists) {
  return cached.data().translation;  // <10ms cache hit
}

// Otherwise translate and cache
const translation = await openai.chat.completions.create({...});
await db.collection('translationCache').doc(cacheKey).set({
  translation: result,
  createdAt: Date.now(),
});
```

**Streaming for Long Responses:**
```typescript
// Use streaming for AI conversations to reduce perceived latency
import { streamText } from 'ai';

const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: conversationHistory,
});

// Stream chunks to client
for await (const chunk of result.textStream) {
  res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
}
```

### Response Time Targets

| Feature | Target | Max | Strategy |
|---------|--------|-----|----------|
| Translation (short) | <1s | <2s | Cache + GPT-4-turbo |
| Translation (long) | <2s | <3s | Streaming |
| Smart replies | <2s | <4s | RAG + streaming + parallel gen |
| AI chat | <2s/msg | <4s | Streaming + context caching |

### Common Pitfalls

**1. Forgetting Rate Limiting:**
```typescript
// ❌ BAD - No rate limiting
export const translate = functions.https.onCall(async (data, context) => {
  return await openai.chat.completions.create({...});
});

// ✅ GOOD - Rate limit FIRST
export const translate = functions.https.onCall(async (data, context) => {
  await rateLimitMiddleware(context, 'translation');  // CRITICAL!
  return await openai.chat.completions.create({...});
});
```

**2. Not Handling Offline Errors:**
```typescript
// ❌ BAD - Crashes if offline
const translation = await callCloudFunction('translate', { text });

// ✅ GOOD - Graceful offline handling
try {
  const translation = await callCloudFunction('translate', { text });
  return translation;
} catch (error) {
  if (error.code === 'unavailable') {
    Alert.alert('Offline', 'Translation requires internet connection');
    return null;  // Or return original text
  }
  throw error;
}
```

**3. Embedding Without Context:**
```typescript
// ❌ BAD - Embeds just the text
await embedMessage(messageId, chatId, text);

// ✅ GOOD - Include metadata for filtering
await index.upsert([{
  id: messageId,
  values: embedding,
  metadata: {
    chatId,        // Filter by chat
    userId,        // Know who sent it
    timestamp,     // Chronological ordering
    text,          // Return original text
  },
}]);
```

### Deployment Checklist

Before deploying AI features:

- [ ] Rate limiting implemented and tested (make 31 calls, verify 31st fails)
- [ ] API keys set in Cloud Functions config (NEVER in .env.local)
- [ ] Error handling for offline/network failures
- [ ] Response time measured (use console.time/timeEnd)
- [ ] Cost estimation done (see PRD performance targets section)
- [ ] Cache implemented for frequently-requested translations
- [ ] User feedback for loading states (show spinner during AI calls)

### Testing AI Features

**Unit Tests (Cloud Functions):**
```bash
cd functions
npm test
```

**Manual Testing:**
```typescript
// Test translation
1. Send message in Spanish
2. Verify recipient sees English translation <2s
3. Tap translation indicator, verify shows original Spanish

// Test rate limiting
1. Make 31 translation calls in 1 minute
2. Verify 31st call fails with user-friendly error
3. Wait 1 minute, verify can translate again

// Test RAG
1. Send 20 messages about food
2. Use AI context menu: "What did we talk about food?"
3. Verify AI references previous food messages

// Test offline
1. Enable airplane mode
2. Try to translate
3. Verify user-friendly error (not crash)
4. Disable airplane mode
5. Verify translation works again
```

### Monitoring & Debugging

**Cloud Functions Logs:**
```bash
# View all function logs
firebase functions:log

# Follow logs in real-time
firebase functions:log --only translateMessage

# Filter by severity
firebase functions:log --severity ERROR
```

**Cost Monitoring:**
```typescript
// Add cost tracking to rate limits collection
await db.collection('aiCosts').add({
  userId: context.auth.uid,
  feature: 'translation',
  model: 'gpt-4-turbo',
  inputTokens: 50,
  outputTokens: 30,
  estimatedCost: 0.0015,  // $0.01 per 1K input + $0.03 per 1K output
  timestamp: Date.now(),
});
```

**Performance Monitoring:**
```typescript
// In Cloud Functions
console.time('translation');
const result = await openai.chat.completions.create({...});
console.timeEnd('translation');  // Shows in Cloud Functions logs
```

## File Structure

```
app/                    # Expo Router screens
  (auth)/              # Authentication screens
  (tabs)/              # Main tab navigation
  chat/[chatId].tsx    # Chat screen
  _layout.tsx          # Root layout with auth + lifecycle
components/            # Reusable UI components
services/              # Core business logic
  database.ts          # SQLite operations
  messageQueue.ts      # Offline queue + retry
  messageSync.ts       # Firestore sync + lifecycle
  firebase.ts          # Firebase initialization
  notifications.ts     # Push notification setup
store/                 # Zustand state management
types/                 # TypeScript type definitions
hooks/                 # Custom React hooks
functions/             # Cloud Functions
  src/
    embeddings.ts      # Pinecone RAG service
    translation.ts     # Language detection & translation
    batchEmbedding.ts  # Scheduled embedding job
    rateLimiting.ts    # Rate limit middleware
```

## Real-Time Translation Architecture

### Overview

The app supports real-time translation with tone awareness using a three-tier architecture:

1. **Language Detection** - Auto-detects message language with user context
2. **Translation Caching** - Stores translations in message document (no separate cache needed)
3. **RAG-Based Tone Detection** - Uses Pinecone to understand sender's communication style

### Translation Flow

**When a message is sent:**

1. **Detect Language** (`detectLanguage`)
   - Auto-detects using OpenAI GPT-4-turbo
   - User's preferred language provided as context for ambiguous cases
   - Returns BCP 47 language tag (e.g., 'en-US', 'es-MX', 'zh-CN')

2. **Check if Translation Needed**
   - Get all recipient languages from chat participants
   - Compare base languages (en-US and en-GB are considered same)
   - Skip translation if all users speak same base language

3. **Batch Translate** (`batchTranslate`)
   - Translates to all recipient languages in single API call
   - Queries Pinecone for sender's recent messages (RAG context)
   - Uses up to 3000 tokens of context to understand tone
   - Returns: `{ translations: { 'en-US': '...', 'es-MX': '...' }, tone: 'friendly' }`

4. **Store Message**
   - Message document contains original text + all translations
   - Example:
     ```javascript
     {
       text: "Hello!",
       originalLanguage: "en-US",
       translations: {
         "es-MX": "¡Hola!",
         "zh-CN": "你好！",
         "fr-FR": "Bonjour!"
       },
       tone: "friendly"
     }
     ```

5. **Embed to Pinecone** (Async)
   - Scheduled job runs every 5 minutes
   - Only embeds messages that were translated
   - Only embeds messages from last 30 days
   - Optimized for Pinecone free tier (2GB storage, 2M writes/month)

### Message Display

**On recipient device:**

1. Read message from SQLite/Firestore
2. Check if `translations[userLanguage]` exists
3. Display translation by default
4. Show indicator: "Auto-translated (Spanish). See original?"
5. User can toggle to see original text (local UI state only)
6. On app restart, show translation again

### Pinecone Integration

**Purpose**: Store message embeddings for RAG-based tone detection

**Index Configuration**:
- Name: `yichat-messages`
- Dimensions: 1024 (reduced from default 1536 for storage efficiency)
- Metric: cosine similarity
- Model: OpenAI text-embedding-3-small with custom dimensions

**What Gets Embedded**:
- Only messages that were translated (not same-language messages)
- Only messages from last 30 days
- Max 500 messages per batch job run (every 5 minutes)

**RAG Query Pattern**:
```typescript
// Get context for translation
const context = await getContextForTranslation(
  chatId,        // Filter to this conversation
  senderId,      // Only messages from this sender
  messageText,   // Query text
  3000           // Max tokens (adaptive message selection)
);

// Context example:
// [2025-01-15T10:30:00Z] Hey! How's it going?
// [2025-01-15T10:35:00Z] That's awesome!!! 🎉
// [2025-01-15T10:40:00Z] Sounds good to me
```

**Free Tier Limits**:
- Storage: 2 GB (~200k messages)
- Writes: 2 million/month (~66k/day)
- Reads: 1 million/month (~33k/day)

**Monitoring**:
```typescript
// Call from admin panel
const stats = await getEmbeddingStats();
// Returns:
// {
//   total: { embeddedMessages: 50000, estimatedStorageGB: 0.4 },
//   usage: { storagePercent: "20%", writesPercent: "2.5%" }
// }
```

### Cloud Functions

**Translation Functions** (`functions/src/translation.ts`):
- `detectLanguage(text, userLanguage)` - Auto-detect with context
- `translateWithTone(text, sourceLang, targetLang, chatId, senderId)` - Single translation with RAG
- `batchTranslate(text, sourceLang, targetLanguages[], chatId, senderId)` - Multi-language translation

**Embedding Functions** (`functions/src/embeddings.ts`):
- `generateEmbedding(text)` - Create embedding using OpenAI
- `embedMessage(...)` - Store single message in Pinecone
- `querySimilarMessages(chatId, senderId, queryText, topK)` - RAG query
- `getContextForTranslation(chatId, senderId, queryText, maxTokens)` - Adaptive context

**Batch Jobs** (`functions/src/batchEmbedding.ts`):
- `scheduledBatchEmbedMessages` - Runs every 5 minutes, embeds up to 500 messages
- `getEmbeddingStats` - Monitor Pinecone usage
- `cleanupOldEmbeddings` - Remove old embeddings to manage storage

### Translation Caching Strategy

**Key Insight**: No separate cache collection needed!

Translations are stored directly in the message document:
- ✅ Instant access (no extra Firestore read)
- ✅ Syncs with message (SQLite + Firestore)
- ✅ Works offline (cached in SQLite)
- ✅ No cache invalidation logic needed

**Example Message Document**:
```javascript
{
  id: "msg123",
  chatId: "chat456",
  senderId: "user789",
  text: "Hello, how are you?",
  originalLanguage: "en-US",
  translations: {
    "es-MX": "Hola, ¿cómo estás?",
    "zh-CN": "你好，你好吗？",
    "fr-FR": "Bonjour, comment allez-vous?"
  },
  tone: "friendly",
  timestamp: 1705334400000,
  embedded: true
}
```

### Performance Optimization

**Same-Language Optimization**:
- Check if all recipients speak same base language
- Skip translation if so (saves 80% of API calls)
- Example: User sends English to 10 English-speaking users → No translation

**Batch Translation**:
- One API call for all languages (not per-recipient)
- Group chat with 5 languages: 1 API call vs 5
- Reduces latency and cost

**Adaptive RAG Context**:
- Start with 50 most recent messages
- Estimate tokens: ~4 chars per token (English), ~2 for CJK
- If < 2000 tokens, expand to 100 messages
- If > 4000 tokens, reduce to 25 messages
- Target: 3000 tokens max

**Embedding Batching**:
- OpenAI supports up to 2048 inputs per embedding call
- Batch up to 500 messages per scheduled run
- Reduces API calls by 500x

### Cost Estimation

**OpenAI Costs** (GPT-4-turbo + text-embedding-3-small):
- Language detection: ~$0.0001 per message
- Translation (no RAG): ~$0.002 per message
- Translation (with RAG): ~$0.010 per message
- Embedding: ~$0.00002 per message

**Monthly Cost Example** (1000 users, 50 messages/day each):
- 50k messages/day = 1.5M messages/month
- Assume 20% need translation: 300k translations/month
- Cost: 300k × $0.010 = **$3,000/month**

**Cost Reduction Strategies**:
1. Skip same-language messages (saves 80%)
2. Cache translations in message (no re-translation)
3. Rate limit to 30 translations/minute per user
4. Use batch translate for groups

### Rate Limiting

**Limits** (per user, per feature):
- Translation: 30/minute, 200/hour, 1000/day
- AI Conversation: 10/minute, 50/hour, 200/day
- Other AI features: Similar limits

**Implementation**:
- Firestore-based sliding window counters
- Three time windows: minute, hour, day
- Atomic increments with `FieldValue.increment()`
- User-friendly error messages with reset time

### Setup Instructions

See `TRANSLATION_IMPLEMENTATION.md` for:
- Pinecone account setup
- Index creation
- API key configuration
- Cloud Functions deployment
- Client-side implementation guide
- Testing checklist
