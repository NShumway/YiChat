graph TB
    subgraph "Mobile App (React Native + Expo)"
        UI[UI Layer<br/>Expo Router + React Native]
        LocalDB[(SQLite<br/>Local Message Store)]
        State[State Management<br/>Zustand]
        Cache[Translation Cache<br/>AsyncStorage]
        ConnMgr[Connection Manager<br/>Battery-Optimized Listeners]
        
        UI --> State
        State --> LocalDB
        State --> Cache
        State --> ConnMgr
    end
    
    subgraph "Firebase Backend"
        Auth[Firebase Auth<br/>User Authentication]
        Firestore[(Firestore<br/>Messages, Users, Chats)]
        CloudFn[Cloud Functions<br/>AI Orchestration]
        FCM[Firebase Cloud Messaging<br/>Push Notifications]
        Storage[Firebase Storage<br/>Media & Profiles]
        Rules[Security Rules<br/>Access Control]
        
        CloudFn --> Firestore
        CloudFn --> FCM
        Rules --> Firestore
    end
    
    subgraph "AI Services"
        OpenAI[OpenAI GPT-4 Turbo<br/>Translation & Context]
        VectorDB[(Pinecone/Chroma<br/>Message Embeddings)]
        Agent[AI SDK Agent<br/>Smart Replies]
        
        Agent --> VectorDB
        Agent --> OpenAI
    end
    
    subgraph "Key Data Flows"
        direction LR
        Send[Send Message] --> Opt[Optimistic UI<br/>Show Immediately]
        Opt --> SaveLocal[Save to SQLite]
        SaveLocal --> Upload[Upload to Firestore]
        Upload --> Retry{Success?}
        Retry -->|No| Backoff[Exponential Backoff<br/>1s, 2s, 5s, 10s, 30s]
        Retry -->|Yes| Translate[Cloud Function:<br/>Detect & Translate]
        Translate --> Notify[Push to Recipients]
        Backoff --> Upload
    end
    
    UI -->|Real-time Listener| Firestore
    UI -->|Authentication| Auth
    UI -->|Upload Media| Storage
    State -->|Sync Messages| Firestore
    ConnMgr -->|Manage Lifecycle| Firestore
    
    Firestore -->|Trigger| CloudFn
    CloudFn -->|API Calls| OpenAI
    CloudFn -->|RAG Query| VectorDB
    CloudFn -->|Agent Tasks| Agent
    
    LocalDB -.->|Offline Queue| State
    State -.->|On Reconnect| Firestore
    
    FCM -->|Push Events| UI
    
    style UI fill:#e1f5ff
    style LocalDB fill:#fff4e1
    style Firestore fill:#ffe1e1
    style CloudFn fill:#f0e1ff
    style OpenAI fill:#e1ffe1
    style Agent fill:#e1ffe1
    style Rules fill:#ffe1f0
    style ConnMgr fill:#fff4e1
    
    classDef critical fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    class LocalDB,Firestore,ConnMgr critical

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
