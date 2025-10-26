# YiChat - AI-Powered International Messaging App

YiChat is a cross-platform messaging application designed for seamless communication across language barriers. Built with React Native, Expo, and Firebase, it combines real-time messaging with AI-powered translation and cultural context features.

**🚀 New to the project? Start here: [QUICK_START.md](./QUICK_START.md)**

## 🌟 Features

### ✅ Completed (MVP)

**Core Messaging:**
- 🔐 Email/password authentication with session persistence
- 💬 Real-time one-on-one and group chat
- 📱 Offline support with message queuing and auto-sync
- ⚡ Optimistic UI updates (<16ms message display)
- 📊 Read receipts and typing indicators
- 🟢 Online/offline presence indicators
- 🔔 Push notifications (foreground)
- 📲 App lifecycle handling (background/foreground sync)
- 🚀 60 FPS scrolling through 1000+ messages
- 💾 Local-first SQLite + Firestore sync architecture

**Performance:**
- Sub-200ms message delivery on good network
- Sub-1 second sync after reconnection
- Zero message loss with exponential backoff retry
- Battery-efficient listener management

### 🚧 In Progress

**AI Features (Coming Soon):**
- 🌍 Real-time message translation
- 🎭 Cultural context hints
- 📝 Formality level adjustment
- 💡 Slang and idiom explanations
- 🤖 Context-aware smart replies
- 💬 AI conversational context menu
- 👥 Relationship context for personalized AI

## 📖 Feature Details

### Read Receipts

**Direct Chats:**
- ✓ = Message sent to server
- ✓✓ (gray) = Message delivered to recipient's device
- ✓✓ (blue) = Message read by recipient

**Group Chats:**
- No indicator = Message not yet read by anyone
- "Read by some" = At least one person (not all) has read the message
- "Read by all" = Every participant has read the message

Tap any read receipt indicator in a group chat to see:
- Who has read the message (with timestamp)
- Who hasn't read it yet

Read receipts update in real-time as participants view messages.

### Online/Offline Presence

- 🟢 Green dot = User is currently online
- ⚫ Gray dot = User is offline

**How it works:**
- Presence is updated every 15 seconds while the app is active
- Users are marked offline after 30 seconds of inactivity
- Status updates automatically when app backgrounds/foregrounds
- Works in both direct chats and group chats

### Typing Indicators

See "..." when someone is typing in a direct chat. Indicators disappear when:
- User stops typing for 3 seconds
- User sends the message
- User leaves the chat

## 🛠️ Tech Stack

**Frontend:**
- React Native (Expo)
- Expo Router (file-based navigation)
- TypeScript
- Zustand (state management)
- Expo SQLite (local persistence)
- FlashList (high-performance lists)

**Backend:**
- Firebase Authentication
- Firestore (real-time database)
- Firebase Cloud Functions
- Firebase Cloud Messaging
- Firebase Storage

**AI Services (Planned):**
- OpenAI GPT-4 Turbo
- Vercel AI SDK
- Pinecone (vector database for RAG)

## 📋 Prerequisites

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- Firebase account (free tier works)
- Expo account (free)

**For iOS Development:**
- macOS with Xcode (for simulator)
- Free Apple ID (no paid developer license needed for development)

**For Android Development:**
- Android Studio with emulator OR physical Android device

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd YiChat
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Firebase configuration (see Setup Guide below).

### 3. Run on Expo Go (Quick Testing)

```bash
npm start
```

Scan the QR code with:
- **iOS:** Camera app
- **Android:** Expo Go app

**Note:** Expo Go has limitations (no background push notifications, limited lifecycle handling). For full features, use EAS Build (see below).

### 4. Run with EAS Build (Full Features) ⭐ RECOMMENDED

**First time setup:**
```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Initialize EAS project
eas init
```

**Download Firebase config files:**
1. Get `google-services.json` from Firebase Console (Android app)
2. Get `GoogleService-Info.plist` from Firebase Console (iOS app)
3. Place both in project root (they're in .gitignore)
4. No env variables needed - Expo finds them automatically!

**Build development versions:**
```bash
# Android APK (install on any Android device)
eas build --profile development --platform android

# iOS development build (requires free Apple ID)
eas build --profile development --platform ios
```

After build completes (~5-10 min), download and install on your device. Then start the dev server:
```bash
npm start
```

The development build will connect to your local dev server with full native features!

**📖 For detailed instructions, see [EAS_SETUP.md](./EAS_SETUP.md)**

## 🔧 Detailed Setup Guide

### Firebase Setup

YiChat requires a complete Firebase project with Web, Android, and iOS apps configured.

**📖 Follow the comprehensive guide: [FIREBASE_APP_SETUP.md](./FIREBASE_APP_SETUP.md)**

This guide covers:
- Creating a Firebase project from scratch
- Enabling required services (Firestore, Auth, Storage, Functions)
- Adding Web, Android, and iOS apps to Firebase
- Downloading configuration files
- Deploying security rules
- Complete verification checklist

**Quick Summary (see guide for details):**

1. Create Firebase project and enable services
2. Add Web app → Copy config to `.env.local`
3. Add Android app → Download `google-services.json`
4. Add iOS app → Download `GoogleService-Info.plist`
5. Deploy security rules

### EAS Build Setup (Required for Full Features)

**📖 Follow the comprehensive guide: [EAS_SETUP.md](./EAS_SETUP.md)**

EAS Build provides:
- ✅ Background push notifications
- ✅ Proper app lifecycle handling
- ✅ All native features
- ✅ Production-ready builds

**Quick Summary (see guide for details):**

1. Install EAS CLI: `npm install -g eas-cli`
2. Login: `eas login`
3. Initialize: `eas init`
4. Build: `eas build --profile development --platform android`
5. Install on device and run `npm start`

See **[EAS_SETUP.md](./EAS_SETUP.md)** for:
- Detailed setup instructions
- Push notification configuration
- Troubleshooting common issues
- Build profile explanations
- Cost breakdown

## 📱 Available Scripts

```bash
npm start              # Start Expo dev server
npm run android        # Run on Android (Expo Go)
npm run ios            # Run on iOS (Expo Go)
npm run web            # Run in web browser

# EAS Build commands
eas build --profile development --platform android
eas build --profile development --platform ios
eas build --profile preview --platform all
```

## 🗂️ Project Structure

```
YiChat/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Authentication screens
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (tabs)/            # Main tab navigation
│   │   ├── index.tsx      # Chat list
│   │   └── profile.tsx    # User profile
│   ├── chat/
│   │   └── [chatId].tsx   # Chat screen (dynamic route)
│   ├── new-chat.tsx       # New conversation modal
│   ├── new-group.tsx      # New group chat modal
│   └── _layout.tsx        # Root layout (auth routing)
├── components/            # Reusable UI components
│   ├── ChatListItem.tsx
│   ├── MessageBubble.tsx
│   └── ConnectionBanner.tsx
├── services/              # Core business logic
│   ├── database.ts        # SQLite operations
│   ├── messageQueue.ts    # Offline queue + retry logic
│   ├── messageSync.ts     # Firestore sync + app lifecycle
│   ├── firebase.ts        # Firebase initialization
│   └── firestoreHelpers.ts # Safe offline Firestore operations
├── store/                 # Zustand state management
│   └── useStore.ts
├── types/                 # TypeScript type definitions
│   ├── Message.ts
│   ├── User.ts
│   └── Chat.ts
├── hooks/                 # Custom React hooks
├── firestore.rules        # Firestore security rules
├── storage.rules          # Firebase Storage security rules
└── eas.json              # EAS Build configuration
```

## 🏗️ Architecture

YiChat uses a **three-layer data architecture** for resilience and performance:

1. **SQLite (Local Storage)** - Primary data source
   - Instant UI updates (no loading states)
   - Offline-first architecture
   - Indexed queries (<10ms for 1000 messages)

2. **Message Queue** - Offline resilience
   - Queues messages when offline
   - Exponential backoff retry (1s, 2s, 5s, 10s, 30s)
   - Persists pending messages to SQLite

3. **Firestore** - Cloud sync
   - Real-time synchronization across devices
   - Uses named database `'yichat'`
   - Delta sync on app foreground

### Message Flow

**Sending:**
1. Insert to SQLite immediately (optimistic UI)
2. Add to message queue
3. Queue sends to Firestore with retry logic
4. On success: update local ID to Firestore ID

**Receiving:**
1. Firestore listener detects new message
2. Insert/update in SQLite
3. UI re-renders from SQLite data

See `architecture.md` for detailed diagrams and architecture decision records.

## 🔒 Security

- All Firebase API keys are public by design (protected by Security Rules)
- AI API keys stored in Cloud Functions only (never in client)
- Security Rules enforce access control:
  - Users can only read chats they're participants in
  - Users can only send messages as themselves
  - Unauthenticated users have no access

## 🧪 Testing

**Current Testing Approach:**
- Manual testing on real devices
- Expo Go for quick UI iteration
- EAS development builds for full feature testing

**Test Accounts:**
Create test users via the signup screen for testing chat functionality.

**Offline Testing:**
1. Enable airplane mode
2. Send messages (will queue)
3. Disable airplane mode
4. Verify messages send automatically

## 🚀 Deployment

### Development Builds (Current)
```bash
eas build --profile development --platform all
```

### Preview Builds (Share with Testers)
```bash
eas build --profile preview --platform all
```

Generates shareable links for installation.

### Production Builds (App Store/Play Store)
```bash
eas build --profile production --platform all
```

**Note:** iOS production requires Apple Developer Program ($99/year).

## 🛣️ Roadmap

### Phase 3: AI Features (In Progress)
- [ ] Real-time message translation
- [ ] Language detection
- [ ] Cultural context hints
- [ ] Formality level adjustment
- [ ] Slang/idiom explanations
- [ ] AI conversational context menu
- [ ] Relationship context
- [ ] Context-aware smart replies
- [ ] RAG pipeline for conversation history

### Phase 4: Polish & Production
- [ ] Performance optimization
- [ ] Comprehensive testing suite
- [ ] App Store submission
- [ ] Play Store submission

### Future Features (Low Priority)
- [ ] Link unfurling (rich media previews)
- [ ] Voice messages
- [ ] Video calls
- [ ] End-to-end encryption

## 📚 Documentation

- `PRD.md` - Product Requirements Document
- `tasks.md` - Detailed user stories and implementation guide
- `architecture.md` - Architecture diagrams and decision records
- `CLAUDE.md` - AI assistant context for development

## 🐛 Troubleshooting

### "Permission denied" in Firestore
- Deploy Security Rules: `firebase deploy --only firestore:rules`
- Verify rules allow authenticated users

### "App doesn't persist login"
- Firebase Auth auto-persists using AsyncStorage
- Clear app data and reinstall if corrupted

### Build fails with EAS
- Ensure `eas.json` is configured correctly
- Check that all dependencies are compatible with Expo SDK
- Run `npx expo-doctor` to check for issues

### Messages not syncing
- Check internet connection
- Verify Firestore database name is `'yichat'`
- Check Firebase console for errors

## 📄 License

[Your License Here]

## 🙏 Acknowledgments

Built for the Gauntlet AI MessageAI Project.

---

**Current Version:** MVP Complete (Core Messaging)
**Next Phase:** AI Features Implementation
**Last Updated:** 2025-10-25
