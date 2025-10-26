# YiChat Product Requirements Document
**Project:** AI-Powered Messaging for International Communication  
**Stack:** React Native (Expo) + Firebase

---

## Executive Summary
YiChat is a messaging app designed for people communicating across language barriers—friends, family, and colleagues who speak different languages. It provides real-time translation, cultural context, and intelligent language assistance to make international communication effortless.

**Core Value Proposition:** Chat naturally in your language while recipients read in theirs—no copy-paste, no switching apps, no awkward translations.

**Development Status:** MVP messaging infrastructure complete. Now implementing AI features.

---

## Target Users: International Communicators

**Who They Are:**
- Immigrant families staying connected across countries
- International students with multilingual friend groups
- Remote workers on global teams
- People in multilingual relationships
- Expats maintaining home connections

**Pain Points:**
1. **Language Barriers:** Constantly switching between messaging and translation apps
2. **Translation Nuances:** Google Translate misses context, tone, and cultural meaning
3. **Copy-Paste Overhead:** 5-10 seconds per message to translate externally
4. **Learning Difficulty:** Want to learn languages but need real-time help
5. **Formality Confusion:** Unsure when to use formal vs casual language

---

## Authentication & User Management

### Sign-Up Methods
1. **Email/Password** - Traditional account creation ✅ IMPLEMENTED
   - Display name input
   - Preferred language selection (12 languages supported)
   - Nationality selection (for AI cultural context)
   - Email verification (optional)
   
2. **Google Sign-In (OAuth 2.0)** - One-tap authentication ⚠️ NOT IN MVP
   - Code exists but not functional in Expo Go
   - Requires production standalone builds (EAS Build)
   - Will be added post-MVP for production releases

### Supported Languages
- 🇬🇧 English
- 🇪🇸 Spanish
- 🇫🇷 French
- 🇩🇪 German
- 🇨🇳 Chinese
- 🇯🇵 Japanese
- 🇰🇷 Korean
- 🇵🇹 Portuguese
- 🇷🇺 Russian
- 🇸🇦 Arabic
- 🇮🇳 Hindi
- 🇮🇹 Italian

### Auth Features
- **Auto-persistence**: Stay logged in after app restart
- **Session management**: Firebase handles token refresh automatically
- **Security**: All auth tokens server-side, never in client code
- **Logout**: Secure sign out with status update to "offline"

---

## Core Messaging Infrastructure

### Real-Time Messaging (Sub-200ms delivery)
- **WebSocket Connection:** Firebase Firestore real-time listeners
- **Optimistic UI:** Messages appear instantly, update on server confirmation
- **Message States:** Sending → Sent → Delivered → Read
- **Typing Indicators:** Throttled (2s max), disabled in groups >10 users
- **Online/Offline Presence:** Real-time status updates
- **Battery Optimization:** Listeners detach after 5 min in background
- **App Lifecycle Handling:** Clean reconnection on foreground/background transitions

### Offline Support & Persistence
- **Local-First Architecture:** Expo SQLite as source of truth
- **Message Queue:** Pending messages stored locally, auto-send on reconnect
- **Delta Sync:** Only fetch messages since `lastSeenAt` timestamp
- **Connection States:** Online, Offline, Reconnecting (with UI indicators)
- **Sub-1s Sync:** After reconnection, immediate delta fetch
- **Exponential Backoff:** 1s, 2s, 5s, 10s, 30s retry delays for failed sends
- **Network Resilience:** Works on 3G with long polling, handles packet loss gracefully

### Group Chat (3+ Users)
- **Message Attribution:** Name, avatar, language indicator per message
- **Read Receipts:** Per-user delivery and read tracking
- **Member List:** Online status, preferred language, profile info
- **Performance Target:** Smooth with 10+ active users

### Media Support
- **Images:** Progressive loading with placeholders
- **Profile Pictures:** Cached locally, CDN-backed
- **File Attachments:** Basic support (optional for MVP)

---

## Required AI Features (All 5 + Conversational Context Menu)

### 1. Real-Time Translation (Inline)
**User Flow:**
- User sends message in Spanish: "¿Cómo estás?"
- Recipient (English speaker) sees: "How are you?" with small "Translated from Spanish" indicator
- Tap translation to see original text
- All messages auto-translate based on recipient's preferred language

**Technical:**
- Detect language on send via Cloud Function
- Store original + translated versions in Firestore
- Each user's app shows messages in their preferred language
- Cache translations to reduce API calls
- **Target:** <2s for short messages (<50 words), <3s for long messages (50-200 words)

### 2. Language Detection & Auto-Translate
**User Flow:**
- User receives message in French (unexpected)
- App auto-detects French, shows in user's preferred language (e.g., English)
- User can tap to see original

**Technical:**
- GPT-4/Claude language detection via Cloud Function
- Store detected language in message metadata
- Auto-translate based on recipient's language preference
- Handle mixed-language messages (code-switching)

### 3. Cultural Context Hints
**User Flow:**
- User receives "打扰一下" (Chinese, literally "disturb you")
- Translation shows: "Excuse me" with hint: "💡 This is a polite way to get someone's attention in Chinese culture"

**Technical:**
- LLM prompt identifies culturally-specific phrases
- Returns translation + cultural context explanation
- Shown as expandable hint below message
- **Trigger:** Long-press message or auto-show for idioms

### 4. Formality Level Adjustment
**User Flow:**
- User drafts: "Hey, can you send that?"
- Tap "Adjust Tone" → Select "Formal"
- Suggests: "Hello, could you please send that when you have a moment?"

**Technical:**
- LLM rewrites message at requested formality level
- Options: Casual, Neutral, Formal, Very Formal
- Preserve meaning, adjust grammar/vocabulary/politeness markers
- Works across languages (e.g., Spanish tú/usted, Japanese -san/-sama)

### 5. Slang/Idiom Explanations
**User Flow:**
- British friend sends: "I'm absolutely knackered"
- Tap message → "🔍 Explain"
- Shows: "Knackered = very tired (British slang)"

**Technical:**
- LLM identifies slang, idioms, regional expressions
- Provides simple explanation + region/register context
- Store common explanations for caching
- **UI:** Tooltip or bottom sheet
- **Target:** <2s response time

### 6. AI Conversational Context Menu (NEW)
**User Flow:**
- User long-presses any message
- Context menu appears with AI options
- Select "Ask AI About This" → Opens minimizable chat overlay
- User can ask follow-up questions:
  - "Tell me more about this cultural reference"
  - "Explain this idiom further"
  - "What's the history behind this phrase?"
  - "Is this appropriate for my relationship with them?"
- AI has full conversation context + relationship context
- Chat overlay can be minimized to bottom-right bubble or maximized to full screen

**Technical:**
- Component: Press-and-hold gesture handler on messages
- AI chat overlay: Minimizable/maximizable modal
- Cloud Function: `aiConversation` (stateful, multi-turn)
- Maintains conversation history within the AI chat session
- Access to full message history for context
- **Target:** <2s per AI response
- **UI:** Non-intrusive, doesn't take permanent screen real estate

---

## Relationship Context Feature (NEW)

**Purpose:** Provide AI with relationship context for better cultural recommendations and formality suggestions.

**User Flow:**
- User can optionally set a relationship label for each contact
- Examples: "father-in-law", "best friend", "boss", "colleague"
- Set in contact profile or chat settings
- Relationship applies to direct messages AND group chats with that person
- AI uses this context for:
  - Cultural tips (e.g., "In Mexican culture, bringing a gift to family gatherings is customary")
  - Formality suggestions (but conversation context takes priority)
  - Appropriate response generation

**Technical:**
```typescript
// In User document
relationships: {
  [contactUserId]: string  // e.g., "father-in-law", "best friend", "boss"
}
```

**AI Integration:**
- Relationship included in system prompt when available
- AI prioritizes conversation context over relationship setting
  - Example: Even if relationship is "boss" (formal), if messages are casual, AI stays casual
- Used for cultural context recommendations
  - Example: "Your father-in-law is Mexican (from their profile). In Mexican culture..."
- If relationship text is nonsensical (e.g., "asdlfjadkl"), AI ignores it

**Data Sources for Cultural Context:**
- Contact's nationality (from their user profile)
- User's nationality (from their user profile)
- Relationship label (user-defined)
- Conversation history and tone

---

## Advanced AI Capability: Context-Aware Smart Replies

**Features:**
- Analyzes conversation context + user's typical responses
- Generates 3 reply options in user's native language
- Learns user's tone, emoji usage, common phrases
- **Bonus:** Shows translations of suggested replies for language learning

**Technical:**
- RAG pipeline: Fetch last 20 messages for context
- User preference storage: Track reply patterns, emoji frequency, formality
- Generate replies using GPT-4 with user style profile
- Vercel AI SDK for agent framework with tool calling
- **Target:** <4s generation time for 3 options

**Example:**
- Friend (Spanish): "¿Vamos al cine mañana?" (Want to go to the movies tomorrow?)
- Smart Replies:
  - "¡Sí, me encantaría!" (Yes, I'd love to!)
  - "No puedo, tengo trabajo" (Can't, I have work)
  - "¿A qué hora?" (What time?)

---

## Technical Architecture

### Frontend (React Native + Expo)
```
├── Expo Router (navigation)
├── Expo SQLite (local message storage)
├── Firebase SDK (auth, Firestore real-time)
├── Expo Notifications (push)
└── Zustand (global state: user, connection status, async state)
```

### Backend (Firebase)
```
├── Firestore (messages, users, groups)
├── Cloud Functions (AI calls, translation)
├── Firebase Auth (email/password + Google OAuth 2.0)
├── Firebase Cloud Messaging (push notifications)
├── Firebase Storage (profile pictures, media)
└── Firestore Security Rules (protect data, prevent direct AI API access)
```

**Security Architecture:**
- All AI API keys stored in Cloud Functions config (never in client)
- Firebase config in app is public (by design, protected by Security Rules)
- Google OAuth Client IDs in environment variables (not committed to git)
- Security Rules enforce: users can only read chats they're participants in
- Message writes validated: senderId must match authenticated user
- OAuth tokens managed by Firebase (never stored in app)

### AI Stack
```
├── OpenAI GPT-4 Turbo (translation, context, smart replies)
├── Vercel AI SDK (agent framework with tool calling)
├── Pinecone (vector database for RAG pipeline)
├── OpenAI text-embedding-3-small (conversation embeddings)
└── Function Calling (structured data extraction, tool use)
```

### Data Models

**Users Collection:**
```javascript
{
  uid: string,
  displayName: string,
  photoURL: string,
  preferredLanguage: string, // ISO 639-1 code (e.g., "en", "es")
  nationality: string, // e.g., "American", "Mexican", "Japanese"
  email: string,
  status: 'online' | 'offline',
  lastSeen: timestamp,
  relationships: { [contactUserId]: string }, // e.g., { "uid123": "father-in-law" }
  createdAt: timestamp
}
```

**Messages Collection:**
```javascript
{
  id: string,
  chatId: string,
  senderId: string,
  text: string, // Original text
  originalLanguage: string,
  translations: {
    en: string,
    es: string,
    // ... per-language translations
  },
  culturalContext?: string, // Optional hint
  timestamp: timestamp,
  status: 'sending' | 'sent' | 'delivered' | 'read',
  readBy: { [userId: string]: timestamp }, // Map for scalable group chats
  deliveredTo: { [userId: string]: timestamp }, // Separate delivery tracking
  mediaURL?: string
}
```

**Note:** `readBy` uses a map structure instead of array for scalability. In group chats with 50+ users, array operations become expensive and cause write conflicts. Map structure allows atomic per-user updates.

**Chats Collection:**
```javascript
{
  id: string,
  type: 'direct' | 'group',
  participants: string[], // User IDs
  lastMessage: string,
  lastMessageTimestamp: timestamp,
  unreadCount: { [userId: string]: number }
}
```

---

## User Flows

### First-Time Setup
1. **Sign up with email/password OR Google Sign-In**
   - Email/password: Set display name, choose preferred language
   - Google Sign-In: Auto-imports name and profile picture, default language English
2. Grant notification permissions
3. Tutorial: "See translation" tap demo (optional)

### Send Message with Translation
1. User types message in their language
2. Press send → Optimistic UI shows immediately
3. Cloud Function detects language, translates for each recipient
4. Recipients see message in their preferred language
5. Read receipts update in real-time

### Receive Message in Foreign Language
1. Push notification (in user's preferred language)
2. Open app → Message appears translated
3. Small "Translated from X" badge
4. Tap badge to see original + cultural context (if applicable)

### Use Smart Replies
1. User opens conversation with unread message
2. Bottom of screen shows 3 smart reply chips
3. Tap chip → Message sent (in user's native language)
4. Translation happens automatically for recipient

---

## Performance Targets

| Metric | Target | Max Acceptable | Architecture Requirement |
|--------|--------|----------------|-------------------------|
| Message delivery | <200ms | <500ms | WebSocket with optimistic UI |
| App launch to chat screen | <2s | <3s | SQLite cache, lazy loading |
| Scroll 1000+ messages | 60 FPS | 55 FPS | FlashList with memoization |
| Offline sync after reconnect | <1s | <2s | Delta sync with lastSyncTimestamp |
| **AI Features:** | | | |
| Translation (short <50 words) | <1s | <2s | Cloud Functions with caching |
| Translation (long 50-200 words) | <2s | <3s | Streaming, parallel processing |
| Language detection | <500ms | <1s | GPT-4 with low token count |
| Cultural context | <1.5s | <3s | Cached common phrases |
| Formality adjustment | <1.5s | <3s | Single API call |
| Slang explanation | <1s | <2s | Cached common slang |
| Smart replies (3 options) | <2s | <4s | Streaming, RAG pipeline |
| AI context menu chat | <2s per msg | <4s | Stateful conversation |
| **Other:** | | | |
| Image load (progressive) | <1s first pixel | <2s | Progressive JPEG, CDN caching |
| Battery drain (background) | <2% per hour | <3% | Detach listeners after 5 min |
| Network resilience | Works on 3G (100kbps) | Works on 2G | Exponential backoff, compression |
| Group read receipts (50 users) | <1s update | <2s | Map structure, not array |
| Sync after 1-hour offline | <2s for 100 messages | <4s | Parallel delta queries |

---

## MVP Status - ✅ COMPLETE

### Core Messaging Features ✅
- [x] User authentication (Firebase Auth - Email/Password)
- [x] Auth state persistence (stay logged in)
- [x] User profiles with language preference
- [x] Logout with status update
- [x] One-on-one chat with real-time delivery
- [x] Message persistence (SQLite)
- [x] Optimistic UI updates
- [x] Online/offline indicators
- [x] Connection status banner
- [x] Timestamps and read receipts
- [x] Group chat (3+ users)
- [x] Push notifications (foreground)
- [x] Offline message queuing
- [x] App lifecycle handling (background/foreground sync)

### Architecture Foundations ✅
- [x] Battery-efficient listener management
- [x] Exponential backoff for failed requests (1s, 2s, 5s, 10s, 30s)
- [x] Firestore security rules deployed
- [x] Delta sync with lastSyncTimestamp tracking
- [x] Scalable read receipt data model (map structure)
- [x] Typing indicator throttling (2s max)
- [x] Connection state management with retry logic
- [x] Message deduplication (INSERT OR REPLACE)
- [x] 60 FPS scrolling (FlashList)

**Next Phase:** AI Features Implementation

---

## Project Requirements Checklist

### Core Messaging ✅
- [x] Sub-200ms delivery on good network
- [x] Offline queuing + auto-sync
- [x] Group chat with 3+ users, smooth performance
- [x] App lifecycle handling (background/foreground/force quit)
- [x] 60 FPS scrolling through 1000+ messages
- [x] Message persistence (force quit recovery)
- [x] Typing indicators and read receipts
- [x] Online/offline presence

### AI Features (6 Features)
- [ ] Real-time inline translation (auto-translate all messages)
- [ ] Auto language detection
- [ ] Cultural context hints
- [ ] Formality adjustment tool
- [ ] Slang/idiom explanations
- [ ] AI conversational context menu (ask follow-up questions)

### Advanced AI Capability
- [ ] Context-aware smart replies (3 options, learns user style)

### Supporting AI Features
- [ ] Relationship context (per-contact labels)
- [ ] Nationality in user profiles
- [ ] RAG pipeline for conversation history
- [ ] Function calling/tool use
- [ ] AI request rate limiting
- [ ] Response streaming for long operations

### Architecture & Security
- [x] Clean, well-organized code
- [ ] API keys secured (Cloud Functions only, never in client)
- [ ] Function calling/tool use implemented
- [ ] RAG pipeline for conversation context
- [ ] Rate limiting implemented
- [ ] Response streaming (where applicable)

### Deployment & Documentation
- [x] README with setup instructions
- [x] Environment variables template (.env.example)
- [ ] Architecture diagrams
- [ ] EAS Build deployment (Android APK + iOS dev builds)
- [ ] Works on real devices
- [ ] Fast and reliable

### Final Deliverables
- [ ] Demo video (2 devices, all features)
- [ ] Documentation explaining technical decisions
- [ ] Production-ready builds

---

## Deployment Strategy

### Development (Current)
- **Platform:** EAS Build (free Apple ID for iOS)
- **Android:** Development APK (full features)
- **iOS:** Development build (full features, no App Store submission)
- **Testing:** Real devices + simulators
- **Deployment:** `eas build --profile development`

### Distribution
- Android APK shareable directly (no Play Store needed)
- iOS ad-hoc builds (up to 100 test devices)
- No paid Apple Developer license required until App Store submission

### Production (Future)
- Android: Google Play Store ($25 one-time fee)
- iOS: App Store ($99/year Apple Developer Program)

---

## Future Features (Low Priority)
- [ ] Link unfurling (rich media previews)
- [ ] Voice messages
- [ ] Video calls
- [ ] End-to-end encryption
- [ ] Message search
- [ ] Chat archiving

---

## Success Criteria

**Messaging Infrastructure (must be rock-solid):**
- Zero message loss in testing
- Reconnection works 100% of time
- App lifecycle tested on real devices
- 60 FPS scrolling verified

**AI Features (must be genuinely useful):**
- 90%+ translation accuracy (native speaker verified)
- Cultural hints appear for idioms/culturally-specific phrases
- Smart replies sound natural, match user's tone
- All features respond within target times

**Polish:**
- Professional UI (language flags, smooth animations)
- Clear loading states for AI operations
- Error handling with user-friendly messages
- Works on both iOS and Android (Expo Go)