# YiChat Product Requirements Document
**Project:** AI-Powered Messaging for International Communication  
**Stack:** React Native (Expo) + Firebase

---

## Executive Summary
YiChat is a messaging app designed for people communicating across language barriers—friends, family, and colleagues who speak different languages. It provides real-time translation, cultural context, and intelligent language assistance to make international communication effortless.

**Core Value Proposition:** Chat naturally in your language while recipients read in theirs—no copy-paste, no switching apps, no awkward translations.

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

## Core Messaging Infrastructure

### Real-Time Messaging (Sub-200ms delivery)
- **WebSocket Connection:** Firebase Firestore real-time listeners
- **Optimistic UI:** Messages appear instantly, update on server confirmation
- **Message States:** Sending → Sent → Delivered → Read
- **Typing Indicators:** Debounced, 10s timeout
- **Online/Offline Presence:** Real-time status updates

### Offline Support & Persistence
- **Local-First Architecture:** Expo SQLite as source of truth
- **Message Queue:** Pending messages stored locally, auto-send on reconnect
- **Delta Sync:** Only fetch messages since `lastSeenAt` timestamp
- **Connection States:** Online, Offline, Reconnecting (with UI indicators)
- **Sub-1s Sync:** After reconnection, immediate delta fetch

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

## Required AI Features (All 5)

### 1. Real-Time Translation (Inline)
**User Flow:**
- User sends message in Spanish: "¿Cómo estás?"
- Recipient (English speaker) sees: "How are you?" with small "Translated from Spanish" indicator
- Tap translation to see original text

**Technical:**
- Detect language on send (client-side or Cloud Function)
- Store original + translated versions in Firestore
- Each user's app shows messages in their preferred language
- Cache translations to reduce API calls
- **Target:** <500ms translation time for short messages

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
- **Target:** <3s generation time
- AI SDK by Vercel for agent framework

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
├── React Query (async state management)
└── Zustand (global state: user, connection status)
```

### Backend (Firebase)
```
├── Firestore (messages, users, groups)
├── Cloud Functions (AI calls, translation)
├── Firebase Auth (email/password + optional social)
├── Firebase Cloud Messaging (push notifications)
└── Firebase Storage (profile pictures, media)
```

### AI Stack
```
├── OpenAI GPT-4 Turbo (translation, context, smart replies)
├── AI SDK by Vercel (agent framework for smart replies)
├── Vector Store (Pinecone/Chroma) for RAG pipeline
└── Function Calling (structured data extraction)
```

### Data Models

**Users Collection:**
```javascript
{
  uid: string,
  displayName: string,
  photoURL: string,
  preferredLanguage: string, // ISO 639-1 code
  email: string,
  status: 'online' | 'offline',
  lastSeen: timestamp,
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
  readBy: string[], // Array of user IDs
  mediaURL?: string
}
```

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
1. Sign up with email/password
2. Set display name and profile picture
3. **Select preferred language** (critical for YiChat)
4. Grant notification permissions
5. Tutorial: "See translation" tap demo

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

| Metric | Target |
|--------|--------|
| Message delivery | <200ms |
| App launch to chat screen | <2s |
| Scroll 1000+ messages | 60 FPS |
| Offline sync after reconnect | <1s |
| Translation (short message) | <500ms |
| Smart reply generation | <3s |
| Image load (progressive) | <1s first pixel |

---

## MVP Checklist (24 Hours)

- [ ] User authentication (Firebase Auth)
- [ ] One-on-one chat with real-time delivery
- [ ] Message persistence (SQLite)
- [ ] Optimistic UI updates
- [ ] Online/offline indicators
- [ ] Timestamps and read receipts
- [ ] Basic group chat (3+ users)
- [ ] Push notifications (foreground working)
- [ ] Local emulator deployment

**AI Not Required for MVP** - Focus on messaging infrastructure first

---

## Final Submission Requirements

### Core Messaging ✓
- [ ] Sub-200ms delivery on good network
- [ ] Offline queuing + auto-sync
- [ ] Group chat with 3+ users, smooth performance
- [ ] App lifecycle handling (background/foreground/force quit)
- [ ] 60 FPS scrolling through 1000+ messages

### AI Features (All 5)
- [ ] Real-time inline translation
- [ ] Auto language detection
- [ ] Cultural context hints
- [ ] Formality adjustment tool
- [ ] Slang/idiom explanations

### Advanced AI
- [ ] Context-aware smart replies (3 options, <3s generation)

### Deliverables
- [ ] GitHub repo with README
- [ ] 5-7 min demo video (2 devices, all features)
- [ ] Expo Go deployment link
- [ ] 1-page document explaining user needs and technical decisions
- [ ] Social media post tagging @GauntletAI

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