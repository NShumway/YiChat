graph TB
    subgraph "Mobile App (React Native + Expo + EAS Build)"
        UI[UI Layer<br/>Expo Router + React Native]
        LocalDB[(SQLite<br/>Local Message Store)]
        State[State Management<br/>Zustand]
        Cache[Translation Cache<br/>AsyncStorage]
        ConnMgr[Connection Manager<br/>Battery-Optimized Listeners]
        AICtxMenu[AI Context Menu<br/>Conversational Interface]

        UI --> State
        State --> LocalDB
        State --> Cache
        State --> ConnMgr
        UI --> AICtxMenu
    end

    subgraph "Firebase Backend"
        Auth[Firebase Auth<br/>User Authentication]
        Firestore[(Firestore 'yichat'<br/>Messages, Users, Chats)]
        CloudFn[Cloud Functions<br/>AI Orchestration + Rate Limiting]
        FCM[Firebase Cloud Messaging<br/>Push Notifications]
        Storage[Firebase Storage<br/>Media & Profiles]
        Rules[Security Rules<br/>Access Control]

        CloudFn --> Firestore
        CloudFn --> FCM
        Rules --> Firestore
    end

    subgraph "AI Infrastructure"
        OpenAI[OpenAI GPT-4 Turbo<br/>Translation, Context, Chat]
        VectorDB[(Pinecone<br/>Conversation Embeddings)]
        AIAgent[Vercel AI SDK<br/>Smart Replies + Streaming]
        Embeddings[OpenAI Embeddings<br/>text-embedding-3-small]
        RateLimit[Rate Limiter<br/>Firestore-based]

        AIAgent --> VectorDB
        AIAgent --> OpenAI
        Embeddings --> VectorDB
        CloudFn --> RateLimit
    end

    subgraph "Message Flow (Optimistic UI)"
        direction LR
        Send[Send Message] --> Opt[Optimistic UI<br/>SQLite Insert<br/><16ms]
        Opt --> Queue[Message Queue<br/>Offline Support]
        Queue --> Upload[Upload to Firestore<br/>serverTimestamp]
        Upload --> Retry{Success?}
        Retry -->|No| Backoff[Exponential Backoff<br/>1s, 2s, 5s, 10s, 30s]
        Retry -->|Yes| Embed[Embed Message<br/>Pinecone]
        Embed --> Translate[Auto-Translate<br/>Cloud Function]
        Translate --> Notify[Push to Recipients<br/>FCM]
        Backoff --> Upload
    end

    subgraph "AI Request Flow"
        direction LR
        AIReq[AI Request] --> CheckLimit[Check Rate Limit<br/>Firestore]
        CheckLimit -->|Allowed| Context[Fetch Context<br/>RAG Query]
        Context --> Generate[Generate Response<br/>GPT-4 + Vercel SDK]
        Generate --> Stream[Stream Response<br/>SSE]
        CheckLimit -->|Denied| Error[429 Error<br/>User-Friendly Message]
    end

    UI -->|Real-time Listener| Firestore
    UI -->|Authentication| Auth
    UI -->|Upload Media| Storage
    UI -->|AI Chat| CloudFn
    State -->|Delta Sync| Firestore
    ConnMgr -->|Lifecycle Events| Firestore
    AICtxMenu -->|Streaming Request| CloudFn

    Firestore -->|onCreate Trigger| CloudFn
    CloudFn -->|API Calls| OpenAI
    CloudFn -->|RAG Query| VectorDB
    CloudFn -->|Agent Tasks| AIAgent
    CloudFn -->|Embed| Embeddings

    LocalDB -.->|Offline Queue| State
    State -.->|On Reconnect <1s| Firestore

    FCM -->|Push Events| UI

    style UI fill:#e1f5ff
    style LocalDB fill:#fff4e1
    style Firestore fill:#ffe1e1
    style CloudFn fill:#f0e1ff
    style OpenAI fill:#e1ffe1
    style AIAgent fill:#e1ffe1
    style Rules fill:#ffe1f0
    style ConnMgr fill:#fff4e1
    style RateLimit fill:#ffd4d4

    classDef critical fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    class LocalDB,Firestore,ConnMgr,RateLimit critical

---

## Architecture Decision Records

### ADR-001: SQLite-First Architecture
**Decision:** Use SQLite as primary data store, Firestore for sync  
**Rationale:**
- 60 FPS scrolling requires instant data access (<10ms)
- Offline-first: App works without network
- Reduces Firestore reads (cost savings)
- Enables complex local queries without network latency

**Trade-offs:**
- Must maintain sync logic between SQLite and Firestore
- Two sources of truth require careful deduplication

---

### ADR-002: Battery-Efficient Listener Management
**Decision:** Detach Firestore listeners after 5 minutes in background  
**Rationale:**
- Always-on WebSocket connections drain battery (3-5% per hour)
- iOS/Android restrict background network after a few minutes anyway
- Delta sync on foreground is fast enough (<1s for 100 messages)

**Implementation:**
```typescript
// services/connectionManager.ts
let backgroundTimer: NodeJS.Timeout;
let firestoreListeners: Unsubscribe[] = [];

const handleBackground = () => {
  backgroundTimer = setTimeout(() => {
    firestoreListeners.forEach(unsub => unsub());
    console.log('Detached listeners for battery optimization');
  }, 5 * 60 * 1000); // 5 minutes
};

const handleForeground = async () => {
  clearTimeout(backgroundTimer);
  await reattachListeners();
  await syncMissedMessages(); // Delta sync
};
```

---

### ADR-003: Scalable Read Receipts (Map vs Array)
**Decision:** Use `{ [userId: string]: timestamp }` instead of `string[]`  
**Rationale:**
- Array operations in Firestore require reading/writing entire array
- In 50-user groups, causes write conflicts and slow updates
- Map allows atomic per-user updates without conflicts

**Before (doesn't scale):**
```javascript
readBy: ["uid1", "uid2", "uid3"] // Must rewrite entire array
```

**After (scalable):**
```javascript
readBy: { "uid1": 1234567890, "uid2": 1234567891 } // Atomic updates
```

---

### ADR-004: Network Resilience with Exponential Backoff
**Decision:** Implement exponential backoff for failed requests  
**Rationale:**
- 3G networks have high latency and packet loss
- Immediate retries waste battery and can cause rate limiting
- Exponential backoff: 1s, 2s, 5s, 10s, 30s

**Implementation:**
```typescript
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];
let retryAttempts = new Map<string, number>();

const sendWithRetry = async (message: Message) => {
  const attempts = retryAttempts.get(message.id) || 0;
  try {
    await sendMessageToFirestore(message);
    retryAttempts.delete(message.id);
  } catch (error) {
    if (attempts < RETRY_DELAYS.length) {
      setTimeout(() => sendWithRetry(message), RETRY_DELAYS[attempts]);
      retryAttempts.set(message.id, attempts + 1);
    }
  }
};
```

---

### ADR-005: API Key Security
**Decision:** All AI API keys in Cloud Functions, never in client
**Rationale:**
- React Native bundles can be decompiled
- Firebase config in client is OK (public by design, protected by Rules)
- OpenAI keys must stay server-side

**Security Rules Example:**
```javascript
// firestore.rules
match /messages/{messageId} {
  allow read: if request.auth.uid in resource.data.chatParticipants;
  allow create: if request.auth.uid == request.resource.data.senderId;
}
```

---

### ADR-006: Vercel AI SDK for Agent Framework
**Decision:** Use Vercel AI SDK instead of LangChain for AI features
**Rationale:**
- **Simpler API:** Streaming is built-in, tool calling is straightforward
- **TypeScript-first:** Better type safety than LangChain
- **Lightweight:** Smaller bundle size, faster cold starts in Cloud Functions
- **Active development:** Regular updates, modern patterns
- **Streaming by default:** Excellent for chat interfaces

**Trade-offs:**
- Less mature ecosystem than LangChain
- Fewer pre-built chains and agents
- But: We don't need complex chains, just streaming chat + tool use

**Example:**
```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: conversationHistory,
  tools: {
    getWeather: { /* tool definition */ },
    translateText: { /* tool definition */ },
  },
});

for await (const chunk of result.textStream) {
  // Stream to client
}
```

---

### ADR-007: Pinecone for Vector Database
**Decision:** Use Pinecone instead of Chroma or self-hosted solutions
**Rationale:**
- **Managed service:** Fits with Firebase-based architecture (no servers to manage)
- **Performance:** Sub-200ms queries, serverless scaling
- **Free tier:** 1 index, 5M vectors (enough for development and small scale)
- **Easy integration:** Good TypeScript SDK, works well with OpenAI embeddings
- **Reliability:** Production-ready, high availability

**Trade-offs:**
- Costs scale with usage (but free tier is generous)
- Vendor lock-in (but embeddings are portable)

**Alternative considered:** Chroma (self-hosted) rejected due to added infrastructure complexity

**Implementation:**
```typescript
// Store embeddings on message creation
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: messageText,
});

await pinecone.index('yichat').upsert([{
  id: messageId,
  values: embedding.data[0].embedding,
  metadata: { chatId, text: messageText },
}]);

// Query for relevant context
const results = await pinecone.index('yichat').query({
  vector: queryEmbedding,
  topK: 20,
  filter: { chatId: { $eq: currentChatId } },
});
```

---

### ADR-008: AI Conversational Context Menu UX Pattern
**Decision:** Use press-and-hold gesture to open minimizable AI chat overlay
**Rationale:**
- **Non-intrusive:** Doesn't take permanent screen real estate
- **Contextual:** Triggered from specific messages
- **Familiar:** iOS/Android users understand long-press
- **Flexible:** Can be minimized to bubble or maximized to full screen

**UX Flow:**
1. User long-presses message
2. Context menu appears with "Ask AI About This"
3. AI chat overlay slides up from bottom
4. User can ask follow-up questions
5. Minimize to bottom-right bubble or close

**Technical Implementation:**
- React Native `Pressable` with `onLongPress`
- Modal with gesture handlers for drag/minimize
- Maintains conversation state within AI chat session
- Separate from main chat (doesn't pollute message history)

**Alternative considered:** Permanent AI chat button rejected (too much screen space)

---

### ADR-009: Relationship Context Storage Model
**Decision:** Store relationships as simple string labels per contact
**Rationale:**
- **User flexibility:** Users define their own relationship labels
- **No rigid schema:** Avoids limiting users to predefined categories
- **AI-tolerant:** AI can interpret free-form text or ignore nonsense
- **Applies globally:** Once set for a contact, applies to all chats with them

**Data Model:**
```typescript
// In User document
relationships: {
  [contactUserId]: string  // e.g., "father-in-law", "best friend", "boss"
}
```

**AI Integration:**
```typescript
// System prompt includes:
`You are helping ${userName} communicate with their ${relationship}.
${userName} is ${userNationality}, contact is ${contactNationality}.`
```

**AI Priority:**
1. **Conversation context** (most important - recent messages set the tone)
2. Relationship label (secondary - provides baseline expectations)
3. Nationality/culture (tertiary - for cultural tips)

**Example:** Even if relationship is "boss" (suggests formal), if recent messages are casual, AI stays casual.

---

### ADR-010: Nationality as Cultural Context Source
**Decision:** Collect nationality during signup, use for AI cultural context
**Rationale:**
- **Better than per-contact:** Each user declares their own nationality
- **Privacy-respecting:** Users control their own data, not labeled by others
- **Accurate:** Self-reported is more reliable than inferred
- **Persistent:** Applies across all conversations

**Data Flow:**
1. User signs up, selects nationality from picker
2. Stored in user profile (Firestore)
3. AI fetches both users' nationalities when providing context
4. Used for cultural tips, formality suggestions, idiom explanations

**Example AI Prompt:**
```
User (American) is messaging their father-in-law (Mexican).
Consider Mexican cultural norms around family, respect, gift-giving...
```

**Alternative considered:** Per-contact cultural labels rejected (inaccurate, privacy issues)

---

### ADR-011: EAS Build for Development and Deployment
**Decision:** Use EAS Build instead of Expo Go for development
**Rationale:**
- **Required features:** Expo Go can't do background push notifications or proper lifecycle handling
- **Free during development:** No Apple Developer license needed for dev builds
- **Maintains Expo workflow:** No ejecting required
- **Production-ready:** Same builds used for testing and shipping

**Build Profiles:**
```json
{
  "development": {  // Full features + debugging
    "developmentClient": true,
    "distribution": "internal"
  },
  "preview": {  // Share with testers
    "distribution": "internal"
  },
  "production": {  // App Store/Play Store
    "distribution": "store"
  }
}
```

**Trade-offs:**
- **Slower iteration:** 5-10 min builds vs instant with Expo Go
- **Mitigation:** Use Expo Go for UI work, EAS Build for feature testing

**iOS Development (Free):**
- Use free Apple ID
- Ad-hoc distribution (up to 100 devices)
- Only need paid license ($99/yr) for App Store submission

---

### ADR-012: Firestore-Based Rate Limiting
**Decision:** Implement rate limiting in Firestore, not Redis or other services
**Rationale:**
- **Already using Firestore:** No additional infrastructure
- **Sufficient performance:** Read + write < 50ms (acceptable overhead)
- **Atomic operations:** Firestore transactions prevent race conditions
- **Persistent:** Rate limit state survives Cloud Function cold starts
- **Simple:** No additional services to manage

**Implementation:**
```typescript
// Document per user per feature
rateLimits/{userId}_{feature}
{
  minuteCount: number,
  hourCount: number,
  dayCount: number,
  minuteResetAt: timestamp,
  hourResetAt: timestamp,
  dayResetAt: timestamp,
}
```

**Cost Protection:**
- Max daily cost per user: ~$6 (with current limits)
- Prevents runaway AI costs from bugs or malicious use

**Alternative considered:** Redis rejected (adds infrastructure complexity, cost)

---
