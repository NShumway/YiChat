# YiChat User Stories - MVP Implementation

## Phase 0: Project Initialization

### US-0.1: Initialize Expo Project with TypeScript ✅ COMPLETED
**As a** developer  
**I want** to set up the base Expo project with TypeScript  
**So that** I have a solid foundation with type safety

**Implementation:**
```bash
npx create-expo-app@latest YiChat --template expo-template-blank-typescript
cd YiChat
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

**Setup:**
- Configure `app.json` with proper app name, slug, and bundle identifiers
- Set up `app/_layout.tsx` as root layout with Expo Router
- Create folder structure: `app/(tabs)`, `components/`, `services/`, `types/`, `utils/`
- Add `.env` to `.gitignore` immediately

**Acceptance Criteria:**
- ✅ App runs on iOS and Android simulators
- ✅ TypeScript compilation works without errors
- ✅ Hot reload works
- ✅ Folder structure matches plan

---

### US-0.2: Install and Configure Firebase ✅ COMPLETED
**As a** developer  
**I want** to set up Firebase for auth, Firestore, and storage  
**So that** I have backend infrastructure ready

**Implementation:**
```bash
npm install firebase
npx expo install expo-constants
```

**Note:** We use the web Firebase SDK (not `@react-native-firebase`) because it works with Expo managed workflow without ejecting.

**Setup:**
1. Create Firebase project in console
2. Add a **Web app** (not iOS/Android native apps - web SDK doesn't need them)
3. Copy Firebase config values (you'll add these to environment variables)
4. Create `services/firebase.ts`:
```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import Constants from 'expo-constants';

const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId,
  // ... rest from Firebase console
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

**For React Native (Expo):**
- Firestore offline persistence is **automatic** in React Native (uses AsyncStorage)
- No need for `enableIndexedDbPersistence` (that's web-only)
- Network settings are configured via `initializeFirestore` if needed, not `db._settings`

5. Add Firebase config to `app.config.js` (reading from env vars)
6. Enable Firestore, Auth (Email/Password), and Storage in Firebase console

**Acceptance Criteria:**
- ✅ Firebase initializes without errors
- ✅ Can connect to Firestore from app
- ✅ API keys NOT committed to git (use env vars)
- ✅ Both iOS and Android connect successfully

---

### US-0.3: Set Up SQLite for Local Storage ✅ COMPLETED
**As a** developer  
**I want** to configure Expo SQLite  
**So that** I can persist messages locally

**Implementation:**
```bash
npx expo install expo-sqlite
```

**Setup:**
Create `services/database.ts`:
```typescript
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('yichat.db');

export const initDatabase = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      text TEXT NOT NULL,
      originalLanguage TEXT,
      timestamp INTEGER NOT NULL,
      status TEXT DEFAULT 'sending',
      readBy TEXT DEFAULT '{}',
      mediaURL TEXT,
      localOnly INTEGER DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_messages_chatId ON messages(chatId);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      participants TEXT NOT NULL,
      lastMessage TEXT,
      lastMessageTimestamp INTEGER,
      unreadCount INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS pending_messages (
      id TEXT PRIMARY KEY,
      messageData TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);
};

export const dbOperations = {
  insertMessage: (message: Message) => {
    db.runSync(
      'INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [message.id, message.chatId, message.senderId, message.text, 
       message.originalLanguage, message.timestamp, message.status,
       JSON.stringify(message.readBy), message.mediaURL, message.localOnly ? 1 : 0]
    );
  },
  
  getMessagesByChat: (chatId: string): Message[] => {
    return db.getAllSync('SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC', [chatId]);
  },
  
  // ... more operations
};
```

**Leverage Library Strengths:**
- Use `openDatabaseSync` for synchronous operations (simpler than async for local data)
- SQLite handles indexing automatically for fast queries
- Transactions built-in for atomic operations

**Acceptance Criteria:**
- ✅ Database initializes on app launch
- ✅ Can insert and retrieve messages from SQLite
- ✅ Queries execute in <10ms for 1000 messages
- ✅ Database persists after app restart

---

### US-0.4: Set Up State Management with Zustand ✅ COMPLETED
**As a** developer  
**I want** to configure Zustand for global state  
**So that** I can manage user, connection status, and UI state

**Implementation:**
```bash
npm install zustand
```

**Setup:**
Create `store/useStore.ts`:
```typescript
import { create } from 'zustand';

interface User {
  uid: string;
  displayName: string;
  photoURL?: string;
  preferredLanguage: string;
}

interface AppState {
  user: User | null;
  connectionStatus: 'online' | 'offline' | 'reconnecting';
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setConnectionStatus: (status: 'online' | 'offline' | 'reconnecting') => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  connectionStatus: 'online',
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
```

**Leverage Library Strengths:**
- Zustand is lightweight (no providers needed)
- Auto re-renders only affected components
- DevTools integration available

**Acceptance Criteria:**
- ✅ State updates trigger component re-renders
- ✅ State persists across component unmounts
- ✅ Multiple components can access same state
- ✅ No prop drilling needed

---

### US-0.5: API Key Security & Firestore Security Rules ✅ COMPLETED
**As a** developer  
**I want** to secure API keys and enforce data access rules  
**So that** users can't access unauthorized data or expose secrets

**Implementation:**

**1. Environment Variable Setup:**
Already handled in US-0.2, but emphasize:
```javascript
// app.config.js
export default {
  extra: {
    // Firebase config is PUBLIC by design (protected by Security Rules)
    firebaseApiKey: process.env.FIREBASE_API_KEY,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    // NEVER put OpenAI keys here - those go in Cloud Functions only
  }
};
```

**2. Firestore Security Rules:**
Create `firestore.rules` in project root:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return request.auth.uid == userId;
    }
    
    function isChatParticipant(chatId) {
      return isAuthenticated() && 
        request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
    }
    
    // Users: Can read any user, can only write own profile
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId);
    }
    
    // Chats: Can only read/write chats where user is participant
    match /chats/{chatId} {
      allow read: if isChatParticipant(chatId);
      allow create: if isAuthenticated() && 
        request.auth.uid in request.resource.data.participants;
      allow update: if isChatParticipant(chatId);
    }
    
    // Messages: Can only read messages in chats you're in
    // Can only create messages where you're the sender
    match /messages/{messageId} {
      allow read: if isAuthenticated() && 
        isChatParticipant(resource.data.chatId);
      
      allow create: if isAuthenticated() && 
        request.auth.uid == request.resource.data.senderId &&
        isChatParticipant(request.resource.data.chatId);
      
      // Allow updates for read receipts
      allow update: if isAuthenticated() && 
        isChatParticipant(resource.data.chatId);
    }
    
    // Typing indicators: Can only write your own, read for chats you're in
    match /typing/{typingId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && 
        request.resource.data.userId == request.auth.uid;
    }
  }
}
```

**3. Deploy Security Rules:**
```bash
# Install Firebase CLI if not already
npm install -g firebase-tools

# Login and init
firebase login
firebase init firestore

# Deploy rules
firebase deploy --only firestore:rules
```

**4. Storage Security Rules (for profile pictures):**
Create `storage.rules`:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Profile pictures: Anyone can read, only owner can write
    match /profile_pictures/{userId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId && 
        request.resource.size < 5 * 1024 * 1024 && // Max 5MB
        request.resource.contentType.matches('image/.*');
    }
    
    // Chat media: Only participants can read/write
    match /chat_media/{chatId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        request.resource.size < 10 * 1024 * 1024; // Max 10MB
    }
  }
}
```

Deploy:
```bash
firebase deploy --only storage
```

**5. Test Security Rules:**
```typescript
// In a test file or during manual testing
const testSecurityRules = async () => {
  try {
    // Try to read another user's private data
    const otherUserDoc = await getDoc(doc(db, 'users', 'other-uid'));
    console.log('✅ Can read other user profiles');
    
    // Try to write to another user's profile (should fail)
    await updateDoc(doc(db, 'users', 'other-uid'), { displayName: 'Hacker' });
    console.log('❌ SECURITY ISSUE: Can write to other profiles!');
  } catch (error) {
    console.log('✅ Cannot write to other profiles');
  }
  
  try {
    // Try to read messages from chat you're not in (should fail)
    const q = query(collection(db, 'messages'), where('chatId', '==', 'not-my-chat'));
    await getDocs(q);
    console.log('❌ SECURITY ISSUE: Can read messages from other chats!');
  } catch (error) {
    console.log('✅ Cannot read messages from chats you\'re not in');
  }
};
```

**Leverage Library Strengths:**
- Firestore Security Rules run server-side (can't be bypassed)
- Rules compiled and evaluated before data access
- Firebase SDK automatically sends auth token with requests

**Acceptance Criteria:**
- ✅ Firestore rules deployed successfully
- ✅ Storage rules deployed successfully
- ✅ Users cannot read messages from chats they're not in
- ✅ Users cannot write to other users' profiles
- ✅ Users cannot send messages with spoofed senderId
- ✅ Unauthenticated users cannot access any data
- ✅ Firebase config in client doesn't contain any AI API keys
- ✅ Rules tested manually (try unauthorized access, verify fails)

**Testing:**
- Create two accounts on different devices
- Try to access Device A's private chat from Device B (should fail)
- Verify Firebase console shows "Permission Denied" errors for unauthorized access
- Test file upload size limits and content type restrictions

---

## Phase 1: Authentication (MVP Critical)

### US-1.1: Build Sign Up Screen ✅ COMPLETED
**As a** new user  
**I want** to create an account with email/password  
**So that** I can start using YiChat

**Implementation:**
Create `app/(auth)/signup.tsx`:
```typescript
import { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  
  const handleSignUp = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName });
      
      // Create user document in Firestore with retry logic
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        displayName,
        email,
        preferredLanguage,
        status: 'online',
        createdAt: new Date(),
      });
      
      router.replace('/(tabs)');
    } catch (error) {
      // Handle error with user-friendly message
    }
  };
  
  // UI with TextInput for email, password, name, language picker
}
```

**Firebase Console Setup:**
1. Enable Email/Password Sign-In: **Authentication** → **Sign-in method** → **Email/Password** → Enable

**Leverage Library Strengths:**
- Firebase Auth handles password validation, email verification
- Firestore `setDoc` is atomic
- AsyncStorage provides automatic auth persistence

**Acceptance Criteria:**
- ✅ User can sign up with valid email/password
- ✅ Display name and preferred language saved to Firestore
- ✅ Form validation shows helpful errors
- ✅ Password must be 6+ characters
- ✅ User document created in Firestore users collection
- ✅ Redirects to main app after signup
- ✅ Retry logic for Firestore writes (handles network issues)

**Testing:**
See **Phase 1 Testing Guide** below for comprehensive test scenarios.

---

### US-1.2: Build Login Screen ✅ COMPLETED
**As a** returning user  
**I want** to log in with my credentials  
**So that** I can access my messages

**Implementation:**
Create `app/(auth)/login.tsx`:
```typescript
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

const handleLogin = async () => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Get user data from Firestore with retry logic
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
    
    // Update online status
    await updateDoc(doc(db, 'users', userCredential.user.uid), {
      status: 'online',
      lastSeen: new Date(),
    });
    
    router.replace('/(tabs)');
  } catch (error) {
    // Handle error with fallback to Firebase Auth data if Firestore unavailable
  }
};
```

**Acceptance Criteria:**
- ✅ User can log in with email/password
- ✅ Invalid credentials show clear error
- ✅ User status updated to 'online' in Firestore
- ✅ Redirects to chat list after login
- ✅ Retry logic with fallback if Firestore unavailable
- ✅ Loading states with proper error handling

**Testing:**
See **Phase 1 Testing Guide** below for comprehensive test scenarios.

---

### US-1.3: Implement Auth State Persistence ✅ COMPLETED
**As a** user  
**I want** to stay logged in after closing the app  
**So that** I don't have to log in every time

**Implementation:**
In `app/_layout.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import { useStore } from '@/store/useStore';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter, useSegments } from 'expo-router';

export default function RootLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const { setUser, isAuthenticated } = useStore();
  const segments = useSegments();
  const router = useRouter();
  
  useEffect(() => {
    // Initialize SQLite database
    initDatabase();
    
    // Set up Firebase auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch full user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUser({
            uid: firebaseUser.uid,
            displayName: userData.displayName,
            email: userData.email,
            preferredLanguage: userData.preferredLanguage,
            status: 'online',
            photoURL: userData.photoURL,
          });
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    
    return unsubscribe;
  }, []);
  
  // Handle authentication-based routing
  useEffect(() => {
    if (isLoading) return;
    
    const inAuthGroup = segments[0] === '(auth)';
    
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isLoading]);
  
  // Show loading screen while checking auth
  if (isLoading) {
    return <LoadingScreen />;
  }
}
```

**Leverage Library Strengths:**
- Firebase Auth with `@react-native-async-storage/async-storage` persists auth state across app restarts
- `onAuthStateChanged` handles token refresh automatically
- `initializeAuth` with `getReactNativePersistence` enables session persistence
- Expo Router handles navigation based on auth state

**Acceptance Criteria:**
- ✅ User stays logged in after app restart
- ✅ Auth state loads before showing UI
- ✅ Loading screen shown while checking auth
- ✅ User redirected to login if not authenticated
- ✅ User redirected to main app if authenticated
- ✅ Works correctly after force quit
- ✅ Logout clears persisted session
- ✅ Handles missing Firestore data gracefully

**Testing:**
See **Phase 1 Testing Guide** below for comprehensive test scenarios.

---

## Phase 1: Testing Guide

### Test Scenario 1: Email/Password Sign Up
**Steps:**
1. Launch app (should show login screen)
2. Tap "Sign Up" link
3. Enter:
   - Display Name: "Test User"
   - Email: "testuser@example.com"
   - Password: "password123"
   - Confirm Password: "password123"
4. Select preferred language (e.g., Spanish 🇪🇸)
5. Tap "Create Account"

**Expected Results:**
- ✅ Loading indicator shows briefly
- ✅ Navigates to main chat screen
- ✅ Shows user profile with name "Test User"
- ✅ Shows Spanish flag (🇪🇸) and "ES" language code
- ✅ Green online status dot visible
- ✅ Info box shows "✅ Phase 1 Complete!"

**Verify in Firestore:**
- Open Firebase Console → Firestore Database
- Check `users` collection → Should see document with your UID
- Verify fields: `displayName`, `email`, `preferredLanguage: "es"`, `status: "online"`

---

### Test Scenario 2: Logout and Login
**Steps:**
1. From main screen, tap "Log Out" button
2. Confirm logout in alert dialog
3. Should return to login screen
4. Enter email and password from Test Scenario 1
5. Tap "Log In"

**Expected Results:**
- ✅ Logout shows confirmation alert
- ✅ After logout, shows login screen
- ✅ Can log back in with same credentials
- ✅ User data preserved (name, language, etc.)
- ✅ Status updates to "online" in Firestore

**Verify in Firestore:**
- Check user document → `status` should be "offline" after logout
- After login → `status` should be "online"
- `lastSeen` timestamp should update

---

### Test Scenario 3: Auth State Persistence
**Steps:**
1. Log in with email/password
2. **Force quit the app** (swipe up from app switcher)
3. Reopen the app

**Expected Results:**
- ✅ Shows loading screen briefly
- ✅ Automatically logs you in (no login screen)
- ✅ Goes directly to main chat screen
- ✅ User data still present (name, language, status)

**Additional Test:**
1. Log in
2. Wait 5 seconds
3. Put app in background (go to home screen)
4. Wait 10 seconds
5. Reopen app

**Expected:**
- ✅ Still logged in
- ✅ No need to re-authenticate

---

### Test Scenario 4: Form Validation
**Test 6A: Invalid Email**
1. Go to Sign Up screen
2. Enter email: "notanemail"
3. Tap "Create Account"

**Expected:** ✅ Shows "Please enter a valid email address"

**Test 6B: Password Too Short**
1. Enter password: "123"
2. Confirm password: "123"
3. Tap "Create Account"

**Expected:** ✅ Shows "Password must be at least 6 characters"

**Test 6C: Passwords Don't Match**
1. Enter password: "password123"
2. Confirm password: "password456"
3. Tap "Create Account"

**Expected:** ✅ Shows "Passwords do not match"

**Test 6D: Email Already Exists**
1. Try to sign up with email from Test Scenario 1
2. Tap "Create Account"

**Expected:** ✅ Shows "This email is already registered. Please log in instead."

---

### Test Scenario 5: Network Errors
**Test 7A: Offline Sign Up**
1. Enable airplane mode
2. Try to sign up
3. Tap "Create Account"

**Expected:** ✅ Shows "Network error. Please check your connection."

**Test 7B: Invalid Login Credentials**
1. Disable airplane mode
2. Go to Login screen
3. Enter wrong password
4. Tap "Log In"

**Expected:** ✅ Shows "Invalid email or password"

---

### Test Scenario 6: UI/UX Testing
**Checklist:**
- ✅ Language selection chips scroll horizontally
- ✅ Selected language highlighted in blue
- ✅ Loading indicators show during authentication
- ✅ Input fields disabled during submission
- ✅ Keyboard doesn't cover input fields (KeyboardAvoidingView)
- ✅ Can scroll sign up form if screen is small
- ✅ Login/Sign Up links work correctly
- ✅ Status dot colors correct (green=online, gray=offline)

---

### Test Scenario 7: Security Verification
**Steps:**
1. Sign up with a test account
2. Open Firebase Console → Firestore Database
3. Try to manually edit another user's document

**Expected:**
- ✅ Firebase Console allows edit (admin access)
- But from app, Security Rules should block unauthorized access

**Test in Firebase Console → Firestore → Rules tab:**
1. Click "Simulator"
2. Type: `get`, Path: `/users/some-user-id`
3. Authenticated: unchecked
4. Click "Run"

**Expected:** ✅ Shows "❌ Denied" (unauthenticated users blocked)

5. Check "Authenticated", set Firebase UID
6. Click "Run"

**Expected:** ✅ Shows "✅ Allowed" (authenticated users can read user profiles)

---

### Performance Testing
**Acceptance Criteria:**
- ✅ App launch to login screen: <2 seconds
- ✅ Sign up with email: <3 seconds (including Firestore write)
- ✅ Login with email: <2 seconds
- ✅ Auth state check on app restart: <1 second

**How to Test:**
- Use stopwatch or `console.time()` to measure
- Test on both fast and slow network (Network Link Conditioner on iOS)

---

### Known Issues / Limitations
1. **Google Sign-In**: NOT IMPLEMENTED in MVP - OAuth redirect URIs incompatible with Expo Go development workflow
2. **Profile pictures**: Not implemented in Phase 1 (Phase 2 feature)
3. **Email verification**: Not required for MVP (can add in future)

---

### Troubleshooting

**"Permission denied" in Firestore**
- Deploy Security Rules: `firebase deploy --only firestore:rules`
- Check rules allow authenticated users to read/write

**"User document not found"**
- Check Firestore write succeeded after sign up
- Verify Firebase project ID matches `.env.local`

**"App doesn't persist login"**
- Firebase Auth auto-persists using AsyncStorage
- Clear app data and reinstall if corrupted
- Check `onAuthStateChanged` listener in `app/_layout.tsx`

---

## Phase 2: Core Messaging Infrastructure

### US-2.1: Create Chat List Screen
**As a** user  
**I want** to see all my conversations  
**So that** I can access my chats

**Implementation:**
Create `app/(tabs)/index.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { FlatList } from 'react-native';

export default function ChatListScreen() {
  const [chats, setChats] = useState<Chat[]>([]);
  const user = useStore((state) => state.user);
  
  useEffect(() => {
    if (!user) return;
    
    // Real-time listener for chats where user is participant
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageTimestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChats(chatData);
    });
    
    return unsubscribe;
  }, [user]);
  
  return (
    <FlatList
      data={chats}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ChatListItem chat={item} />}
    />
  );
}
```

**Leverage Library Strengths:**
- Firestore `onSnapshot` provides real-time updates automatically
- `array-contains` query finds user in participants efficiently
- FlatList handles large lists with built-in virtualization

**Acceptance Criteria:**
- ✅ Shows list of user's chats
- ✅ Updates in real-time when new messages arrive
- ✅ Sorted by most recent message first
- ✅ Shows chat preview, last message, timestamp
- ✅ Smooth 60 FPS scrolling
- ✅ Empty state when no chats exist

---

### US-2.2: Implement New Chat Creation
**As a** user  
**I want** to start a new conversation  
**So that** I can message another user

**Implementation:**
Create `app/(modals)/new-chat.tsx`:
```typescript
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

const createNewChat = async (recipientId: string) => {
  const user = useStore.getState().user;
  
  // Check if chat already exists
  const existingChatQuery = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', user.uid)
  );
  const existingChats = await getDocs(existingChatQuery);
  
  const existingChat = existingChats.docs.find(doc => 
    doc.data().participants.includes(recipientId) && 
    doc.data().type === 'direct'
  );
  
  if (existingChat) {
    router.push(`/chat/${existingChat.id}`);
    return;
  }
  
  // Create new chat
  const newChat = await addDoc(collection(db, 'chats'), {
    type: 'direct',
    participants: [user.uid, recipientId],
    lastMessage: '',
    lastMessageTimestamp: new Date(),
    unreadCount: { [user.uid]: 0, [recipientId]: 0 },
  });
  
  router.push(`/chat/${newChat.id}`);
};
```

**Acceptance Criteria:**
- ✅ User can search for other users by email/name
- ✅ Selecting user creates new chat or opens existing
- ✅ No duplicate chats created
- ✅ New chat appears in chat list immediately
- ✅ Navigates to chat screen after creation

---

### US-2.3: Build Chat Screen with Message Display (CRITICAL: 60 FPS with 1000+ messages)
**As a** user  
**I want** to view messages in a conversation  
**So that** I can read my chat history

**Implementation:**
Create `app/chat/[chatId].tsx`:
```typescript
import { useEffect, useState, useCallback, memo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { FlashList } from '@shopify/flash-list';
import { dbOperations } from '@/services/database';

// CRITICAL: Memoize MessageBubble to prevent unnecessary re-renders
const MessageBubble = memo(({ message, isOwn }: { message: Message, isOwn: boolean }) => {
  return (
    <View style={isOwn ? styles.ownMessage : styles.otherMessage}>
      <Text style={styles.messageText}>{message.text}</Text>
      <Text style={styles.timestamp}>
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}, (prev, next) => {
  // Only re-render if message content or status changes
  return prev.message.id === next.message.id && 
         prev.message.status === next.message.status;
});

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const user = useStore((state) => state.user);
  
  // Load from SQLite first (instant, no loading state needed)
  useEffect(() => {
    const localMessages = dbOperations.getMessagesByChat(chatId);
    setMessages(localMessages);
  }, [chatId]);
  
  // Then sync with Firestore (incremental updates only)
  useEffect(() => {
    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', chatId),
      orderBy('timestamp', 'desc'), // DESC for latest first
      limit(100) // Pagination: load 100 at a time
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // CRITICAL: Only process changes, not full dataset
      snapshot.docChanges().forEach((change) => {
        const message = { id: change.doc.id, ...change.doc.data() } as Message;
        
        if (change.type === 'added' || change.type === 'modified') {
          dbOperations.insertMessage(message);
        } else if (change.type === 'removed') {
          dbOperations.deleteMessage(message.id);
        }
      });
      
      // Reload from SQLite (indexed queries are <10ms)
      const updatedMessages = dbOperations.getMessagesByChat(chatId);
      setMessages(updatedMessages);
    });
    
    return unsubscribe;
  }, [chatId]);
  
  // CRITICAL: Memoize render function
  const renderMessage = useCallback(({ item }: { item: Message }) => {
    return <MessageBubble message={item} isOwn={item.senderId === user?.uid} />;
  }, [user?.uid]);
  
  // CRITICAL: Memoize keyExtractor
  const keyExtractor = useCallback((item: Message) => item.id, []);
  
  return (
    <FlashList
      data={messages}
      renderItem={renderMessage}
      keyExtractor={keyExtractor}
      estimatedItemSize={80}
      inverted // Messages scroll from bottom
      // CRITICAL: Performance optimizations
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      windowSize={21}
      // CRITICAL: Maintain scroll position on new messages
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
      }}
    />
  );
}
```

**CRITICAL SQLite Optimization in `services/database.ts`:**
```typescript
export const dbOperations = {
  // CRITICAL: Use indexed query for fast retrieval
  getMessagesByChat: (chatId: string, limit = 1000): Message[] => {
    // Index on (chatId, timestamp) makes this <10ms even with 10k messages
    const result = db.getAllSync(
      'SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC LIMIT ?',
      [chatId, limit]
    );
    
    return result.map(row => ({
      ...row,
      readBy: JSON.parse(row.readBy as string),
      localOnly: row.localOnly === 1,
    }));
  },
  
  // CRITICAL: Batch insert for initial sync
  batchInsertMessages: (messages: Message[]) => {
    db.runSync('BEGIN TRANSACTION');
    try {
      messages.forEach(message => {
        db.runSync(
          'INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [message.id, message.chatId, message.senderId, message.text, 
           message.originalLanguage, message.timestamp, message.status,
           JSON.stringify(message.readBy), message.mediaURL, message.localOnly ? 1 : 0]
        );
      });
      db.runSync('COMMIT');
    } catch (error) {
      db.runSync('ROLLBACK');
      throw error;
    }
  },
};
```

**Install FlashList:**
```bash
npm install @shopify/flash-list
```

**Leverage Library Strengths:**
- FlashList recycles cells like iOS UITableView (5-10x faster than FlatList)
- FlashList's `estimatedItemSize` enables accurate scroll without measuring all items
- SQLite indexed queries return 1000 messages in <10ms
- React.memo prevents re-rendering unchanged message bubbles
- `removeClippedSubviews` unmounts off-screen components (critical for Android)
- `inverted` FlashList automatically handles bottom-anchored chat UI

**Acceptance Criteria:**
- ✅ Messages load from SQLite in <50ms (no loading spinner needed)
- ✅ Real-time updates from Firestore appear within 200ms
- ✅ **60 FPS scrolling through 1000+ messages (measure with React DevTools)**
- ✅ **60 FPS scrolling through 5000+ messages with pagination**
- ✅ New message arrives while scrolled up: doesn't jump scroll position
- ✅ Messages sorted chronologically (oldest at top when inverted)
- ✅ Each message shows sender name, text, timestamp
- ✅ Auto-scrolls to bottom when new message arrives AND user is near bottom
- ✅ Memory usage stays flat when scrolling (no memory leaks)

**Testing:**
- **Performance test:** Load chat with 1000 messages, enable React DevTools FPS monitor, scroll rapidly, verify stays at 60 FPS
- **Stress test:** Create 5000 messages in SQLite, verify smooth scrolling with pagination
- **Real-time test:** Send message on Device A, verify appears on Device B in <200ms
- **Scroll position test:** Scroll to top, receive new message, verify doesn't auto-scroll
- **Memory test:** Scroll through 1000 messages, check memory in Xcode/Android Studio, verify no leaks

---

### US-2.4: Implement Optimistic UI for Sending Messages (CRITICAL: <16ms UI update)
**As a** user  
**I want** my messages to appear instantly when I send them  
**So that** the app feels responsive

**Implementation:**
```typescript
const sendMessage = async (text: string) => {
  const user = useStore.getState().user;
  const tempId = `temp_${Date.now()}_${Math.random()}`;
  const timestamp = Date.now();
  
  // 1. Create optimistic message
  const optimisticMessage: Message = {
    id: tempId,
    chatId,
    senderId: user.uid,
    text,
    originalLanguage: user.preferredLanguage,
    timestamp,
    status: 'sending',
    readBy: { [user.uid]: timestamp }, // Map structure for scalable groups
    deliveredTo: { [user.uid]: timestamp },
    localOnly: true,
  };
  
  // 2. CRITICAL: Insert to SQLite + update state in same tick (synchronous)
  dbOperations.insertMessage(optimisticMessage);
  setMessages(prev => [...prev, optimisticMessage]); // Instant UI update
  
  // 3. CRITICAL: Clear input immediately (responsive feel)
  setMessageText('');
  
  // 4. Queue for offline support
  if (useStore.getState().connectionStatus === 'offline') {
    queueMessage(optimisticMessage);
    return;
  }
  
  try {
    // 5. Send to Firestore (async, don't block UI)
    const docRef = await addDoc(collection(db, 'messages'), {
      chatId,
      senderId: user.uid,
      text,
      originalLanguage: user.preferredLanguage,
      timestamp: serverTimestamp(), // Server-side timestamp for consistency
      status: 'sent',
      readBy: { [user.uid]: Date.now() }, // Map structure for scalable groups
      deliveredTo: { [user.uid]: Date.now() },
    });
    
    // 6. Update local message with real ID and status
    dbOperations.updateMessageId(tempId, docRef.id);
    dbOperations.updateMessageStatus(docRef.id, 'sent');
    
    // 7. Update state (triggers checkmark update)
    setMessages(prev => 
      prev.map(m => m.id === tempId 
        ? { ...m, id: docRef.id, status: 'sent', localOnly: false }
        : m
      )
    );
    
    // 8. Update chat's lastMessage (don't await, fire and forget)
    updateDoc(doc(db, 'chats', chatId), {
      lastMessage: text,
      lastMessageTimestamp: serverTimestamp(),
    });
    
  } catch (error) {
    console.error('Send failed:', error);
    
    // 9. Mark as failed with retry option
    dbOperations.updateMessageStatus(tempId, 'failed');
    setMessages(prev => 
      prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
    );
  }
};

// CRITICAL: Add to database operations
export const dbOperations = {
  // ... existing operations
  
  updateMessageId: (oldId: string, newId: string) => {
    db.runSync('UPDATE messages SET id = ? WHERE id = ?', [newId, oldId]);
  },
  
  updateMessageStatus: (id: string, status: MessageStatus) => {
    db.runSync('UPDATE messages SET status = ? WHERE id = ?', [status, id]);
  },
};
```

**CRITICAL Performance Details:**
- **Synchronous SQLite insert** (<1ms) ensures no UI lag
- **Optimistic state update** happens immediately, before network call
- **Input clearing** happens before network, not after
- **serverTimestamp()** ensures messages are ordered correctly across devices (critical for consistency)
- **Fire-and-forget** lastMessage update doesn't block UI

**Leverage Library Strengths:**
- SQLite synchronous operations prevent async bottlenecks
- Firestore `serverTimestamp()` handles clock skew between devices
- React state update batching (React 18) keeps UI smooth
- Firestore offline cache persists messages during network issues

**Acceptance Criteria:**
- ✅ **Message appears in UI in <16ms (one frame at 60 FPS)**
- ✅ Input field clears immediately, not after network response
- ✅ Message shows "sending" indicator (single checkmark)
- ✅ Updates to "sent" (double checkmark) when Firestore confirms
- ✅ Failed messages show retry button
- ✅ Message order preserved even if network is slow or messages arrive out of order
- ✅ Temp ID replaced with server ID seamlessly (no UI flicker)
- ✅ Works offline: message shows "sending" and queues for later

**Testing:**
- **Performance:** Send message, measure time to UI update (should be <16ms using React DevTools)
- **Offline:** Enable airplane mode, send 5 messages, verify all show "sending"
- **Recovery:** Disable airplane mode, verify messages send and update to "sent"
- **Order preservation:** Throttle network to 2G, send 10 rapid messages, verify order stays correct
- **Failure:** Block Firestore in Firebase console, send message, verify shows retry button

---

### US-2.5: Implement Offline Message Queue (CRITICAL: Zero message loss)
**As a** user  
**I want** messages I send while offline to be queued and sent when I reconnect  
**So that** I never lose messages

**Implementation:**
Create `services/messageQueue.ts`:
```typescript
import NetInfo from '@react-native-community/netinfo';
import { useStore } from '@/store/useStore';
import { dbOperations } from './database';

let messageQueue: Message[] = [];
let isProcessing = false;

export const initMessageQueue = () => {
  // Load pending messages from SQLite on app start
  const pending = dbOperations.getPendingMessages();
  messageQueue = pending;
  
  console.log(`Loaded ${pending.length} pending messages from SQLite`);
  
  // CRITICAL: Listen for network state changes
  NetInfo.addEventListener(state => {
    const wasOffline = useStore.getState().connectionStatus === 'offline';
    
    if (state.isConnected && state.isInternetReachable) {
      useStore.getState().setConnectionStatus('online');
      
      // Only process if we just came back online
      if (wasOffline && messageQueue.length > 0) {
        console.log(`Network restored, processing ${messageQueue.length} queued messages`);
        processPendingMessages();
      }
    } else {
      useStore.getState().setConnectionStatus('offline');
    }
  });
  
  // CRITICAL: Check initial state
  NetInfo.fetch().then(state => {
    if (state.isConnected && state.isInternetReachable) {
      useStore.getState().setConnectionStatus('online');
      if (messageQueue.length > 0) {
        processPendingMessages();
      }
    }
  });
};

// CRITICAL: Exponential backoff for network resilience
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000]; // 1s, 2s, 5s, 10s, 30s
let retryAttempts = new Map<string, number>();

const sendWithRetry = async (message: Message): Promise<void> => {
  const attempts = retryAttempts.get(message.id) || 0;
  
  try {
    await sendMessageToFirestore(message);
    retryAttempts.delete(message.id); // Success - clear retry count
  } catch (error) {
    // Check if it's a transient network error or permanent error
    const isTransientError = 
      error.code === 'unavailable' || 
      error.code === 'deadline-exceeded' ||
      error.message?.includes('network') ||
      error.message?.includes('timeout');
    
    if (isTransientError && attempts < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[attempts];
      retryAttempts.set(message.id, attempts + 1);
      
      console.log(`Retry ${attempts + 1}/${RETRY_DELAYS.length} for ${message.id} in ${delay}ms`);
      
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendWithRetry(message); // Recursive retry
    } else {
      // Permanent error (auth, permissions) or max retries exceeded
      throw error;
    }
  }
};

const processPendingMessages = async () => {
  if (isProcessing || messageQueue.length === 0) return;
  
  isProcessing = true;
  useStore.getState().setConnectionStatus('reconnecting');
  
  console.log(`Processing ${messageQueue.length} pending messages`);
  
  // CRITICAL: Process in order, one at a time to preserve sequence
  const errors: { message: Message; error: any }[] = [];
  
  for (const message of [...messageQueue]) {
    try {
      await sendWithRetry(message); // Now with exponential backoff
      
      // Success: remove from queue
      dbOperations.deletePendingMessage(message.id);
      messageQueue = messageQueue.filter(m => m.id !== message.id);
      
      console.log(`Sent queued message ${message.id}`);
      
    } catch (error) {
      console.error(`Failed to send pending message ${message.id} after retries:`, error);
      errors.push({ message, error });
      
      // CRITICAL: Stop processing on persistent error (e.g., auth expired)
      // Will retry on next reconnect
      // Clear retry count to start fresh on next network change
      retryAttempts.delete(message.id);
      break;
    }
  }
  
  isProcessing = false;
  
  if (messageQueue.length === 0) {
    useStore.getState().setConnectionStatus('online');
    console.log('All queued messages sent successfully');
  } else {
    console.warn(`${messageQueue.length} messages still pending after processing`);
  }
  
  return errors;
};

export const queueMessage = (message: Message) => {
  // CRITICAL: Persist to SQLite immediately
  dbOperations.insertPendingMessage(message);
  messageQueue.push(message);
  
  console.log(`Queued message ${message.id}, queue size: ${messageQueue.length}`);
};

const sendMessageToFirestore = async (message: Message) => {
  const docRef = await addDoc(collection(db, 'messages'), {
    chatId: message.chatId,
    senderId: message.senderId,
    text: message.text,
    originalLanguage: message.originalLanguage,
    timestamp: serverTimestamp(),
    status: 'sent',
    readBy: message.readBy,
  });
  
  // Update local SQLite with real ID
  dbOperations.updateMessageId(message.id, docRef.id);
  dbOperations.updateMessageStatus(docRef.id, 'sent');
  
  // Update chat lastMessage
  await updateDoc(doc(db, 'chats', message.chatId), {
    lastMessage: message.text,
    lastMessageTimestamp: serverTimestamp(),
  });
  
  return docRef;
};

// CRITICAL: Manual retry function for failed messages
export const retryFailedMessages = async () => {
  const failedMessages = dbOperations.getFailedMessages();
  
  for (const message of failedMessages) {
    queueMessage(message);
  }
  
  if (useStore.getState().connectionStatus === 'online') {
    await processPendingMessages();
  }
};
```

**Update `services/database.ts` with pending message operations:**
```typescript
export const dbOperations = {
  // ... existing operations
  
  insertPendingMessage: (message: Message) => {
    db.runSync(
      'INSERT INTO pending_messages VALUES (?, ?, ?)',
      [message.id, JSON.stringify(message), message.timestamp]
    );
  },
  
  getPendingMessages: (): Message[] => {
    const rows = db.getAllSync(
      'SELECT messageData FROM pending_messages ORDER BY timestamp ASC'
    );
    return rows.map(row => JSON.parse(row.messageData as string));
  },
  
  deletePendingMessage: (id: string) => {
    db.runSync('DELETE FROM pending_messages WHERE id = ?', [id]);
  },
  
  getFailedMessages: (): Message[] => {
    const rows = db.getAllSync(
      "SELECT * FROM messages WHERE status = 'failed' ORDER BY timestamp ASC"
    );
    return rows.map(row => ({
      ...row,
      readBy: JSON.parse(row.readBy as string),
    }));
  },
};
```

**Install NetInfo:**
```bash
npx expo install @react-native-community/netinfo
```

**CRITICAL: Call initMessageQueue in app startup (`app/_layout.tsx`):**
```typescript
useEffect(() => {
  initDatabase(); // Initialize SQLite first
  initMessageQueue(); // Then initialize queue
}, []);
```

**Leverage Library Strengths:**
- NetInfo provides reliable network state across platforms with `isInternetReachable` check
- SQLite transaction ensures queue persists even if app crashes mid-send
- Firestore offline cache provides backup persistence
- Sequential processing preserves message order (critical for conversations)

**Acceptance Criteria:**
- ✅ **Zero message loss**: Messages sent offline are queued in SQLite
- ✅ **Queue processes automatically** within 1 second of reconnect
- ✅ Connection status indicator shows: online/offline/reconnecting
- ✅ Queued messages send **in correct order** (timestamp-based)
- ✅ Failed messages can be manually retried
- ✅ **Queue persists after force quit** (SQLite backed)
- ✅ Processing stops on auth errors (prevents spam)
- ✅ Large queues (50+ messages) process without blocking UI

**Testing:**
- **Offline queue test:** Send 5 messages in airplane mode, verify all queued in SQLite
- **Reconnect test:** Exit airplane mode, verify all 5 send within 2 seconds, in order
- **Force quit test:** Queue 3 messages, force quit app, reopen, verify all send
- **Order preservation:** Queue 10 messages with 1-second intervals, verify Firestore timestamps match order
- **Auth failure:** Expire auth token, queue message, reconnect, verify doesn't spam retries
- **Large queue:** Queue 100 messages, verify processes without UI freeze (use background task)

---

### US-2.6: Add Typing Indicators
**As a** user  
**I want** to see when someone is typing  
**So that** I know they're responding

**Implementation:**
```typescript
// In ChatScreen
import { doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

const [isTyping, setIsTyping] = useState(false);
const typingTimeoutRef = useRef<NodeJS.Timeout>();
const lastTypingUpdateRef = useRef<number>(0);

// CRITICAL: Check if typing indicators should be enabled for this chat
const shouldShowTypingIndicators = chat.participants.length <= 10;

// Custom throttle implementation (no external dependency needed)
const throttle = (fn: Function, delay: number) => {
  let lastCall = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
};

// CRITICAL: Throttle typing updates to max once per 2 seconds
const updateTypingStatus = throttle((chatId: string, userId: string) => {
  if (!shouldShowTypingIndicators) return; // Disable for large groups
  
  setDoc(doc(db, 'typing', `${chatId}_${userId}`), {
    userId,
    chatId,
    timestamp: Date.now(),
  }, { merge: true }).catch(err => {
    console.warn('Failed to update typing status:', err);
  });
  
  lastTypingUpdateRef.current = Date.now();
}, 2000); // Max once per 2 seconds

const handleTextChange = (text: string) => {
  setMessageText(text);
  
  if (!shouldShowTypingIndicators) return; // Skip in large groups
  
  // Local UI update (immediate)
  if (!isTyping) {
    setIsTyping(true);
  }
  
  // Throttled Firestore update (max once per 2s)
  updateTypingStatus(chatId, user.uid);
  
  // Clear typing after 3 seconds of inactivity
  clearTimeout(typingTimeoutRef.current);
  typingTimeoutRef.current = setTimeout(() => {
    setIsTyping(false);
    deleteDoc(doc(db, 'typing', `${chatId}_${user.uid}`)).catch(err => {
      console.warn('Failed to clear typing status:', err);
    });
  }, 3000);
};

// Listen for other users typing
useEffect(() => {
  if (!shouldShowTypingIndicators) return; // Skip listener in large groups
  
  const q = query(
    collection(db, 'typing'),
    where('chatId', '==', chatId)
  );
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const typingUsers = snapshot.docs
      .filter(doc => {
        const data = doc.data();
        // Filter out own user and stale indicators (>10s old)
        return data.userId !== user.uid && 
               (Date.now() - data.timestamp < 10000);
      })
      .map(doc => doc.data().userId);
    
    setOthersTyping(typingUsers.length > 0);
  }, (error) => {
    console.error('Typing indicator listener error:', error);
  });
  
  return unsubscribe;
}, [chatId, shouldShowTypingIndicators]);

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (isTyping) {
      deleteDoc(doc(db, 'typing', `${chatId}_${user.uid}`)).catch(() => {});
    }
  };
}, []);
```

**Leverage Library Strengths:**
- Firestore real-time updates perfect for ephemeral data
- Throttling prevents excessive writes (battery + cost optimization)
- Disabled in groups >10 users to avoid N² scaling issues

**Performance Optimizations:**
- **Throttle to 2s max:** Prevents battery drain from rapid keystroke updates
- **Disable in large groups:** Groups >10 users don't need typing indicators
- **Stale indicator filtering:** Ignores indicators >10s old (handles crashes)
- **Error handling:** Failures don't break chat functionality

**Acceptance Criteria:**
- ✅ Typing indicator appears within 500ms (local state)
- ✅ Firestore updates max once per 2 seconds (throttled)
- ✅ Disappears 3 seconds after last keystroke
- ✅ Shows "User is typing..." text
- ✅ **Disabled in groups with >10 participants**
- ✅ Stale indicators (>10s) ignored automatically
- ✅ Only shows for other users (not self)
- ✅ Works in group chats (shows multiple users)
- ✅ Doesn't lag or affect message input performance

---

### US-2.7: Implement Read Receipts
**As a** user  
**I want** to see when my messages have been read  
**So that** I know recipients saw them

**Implementation:**
```typescript
// Mark messages as read when chat is opened
useEffect(() => {
  if (!chatId || !user) return;
  
  const markMessagesAsRead = async () => {
    const unreadMessages = messages.filter(
      m => m.senderId !== user.uid && !m.readBy[user.uid]
    );
    
    // Batch update for efficiency
    const batch = writeBatch(db);
    
    unreadMessages.forEach(message => {
      const messageRef = doc(db, 'messages', message.id);
      batch.update(messageRef, {
        [`readBy.${user.uid}`]: Date.now(), // Atomic map update
        status: 'read',
      });
    });
    
    await batch.commit();
  };
  
  markMessagesAsRead();
}, [chatId, messages, user]);

// Display read status
const MessageBubble = ({ message }) => {
  if (message.senderId === user.uid) {
    return (
      <View>
        <Text>{message.text}</Text>
        {message.status === 'read' && <Text>✓✓ Read</Text>}
        {message.status === 'delivered' && <Text>✓✓ Delivered</Text>}
        {message.status === 'sent' && <Text>✓ Sent</Text>}
      </View>
    );
  }
  // ...
};
```

**Leverage Library Strengths:**
- Firestore `arrayUnion` prevents duplicates
- `writeBatch` updates up to 500 docs atomically
- Real-time updates automatically reflect status changes

**Acceptance Criteria:**
- ✅ Messages marked read when chat screen is visible
- ✅ Sender sees checkmarks: ✓ sent, ✓✓ delivered, ✓✓ read (blue)
- ✅ Read receipts update in real-time
- ✅ Batch update used for efficiency
- ✅ Works in group chats (shows list of readers)

---

### US-2.8: Build Basic Group Chat
**As a** user  
**I want** to create a group chat with 3+ people  
**So that** I can message multiple friends at once

**Implementation:**
Create `app/(modals)/new-group.tsx`:
```typescript
const createGroupChat = async (name: string, participantIds: string[]) => {
  const user = useStore.getState().user;
  
  const newGroup = await addDoc(collection(db, 'chats'), {
    type: 'group',
    name,
    participants: [user.uid, ...participantIds],
    createdBy: user.uid,
    lastMessage: '',
    lastMessageTimestamp: new Date(),
    unreadCount: Object.fromEntries(
      [user.uid, ...participantIds].map(id => [id, 0])
    ),
  });
  
  // Send system message
  await addDoc(collection(db, 'messages'), {
    chatId: newGroup.id,
    senderId: 'system',
    text: `${user.displayName} created the group`,
    timestamp: serverTimestamp(),
    type: 'system',
  });
  
  router.push(`/chat/${newGroup.id}`);
};
```

**Modify ChatScreen to show participant names in group chats:**
```typescript
const MessageBubble = ({ message }) => {
  const [sender, setSender] = useState<User>();
  
  useEffect(() => {
    if (chat.type === 'group') {
      getDoc(doc(db, 'users', message.senderId)).then(doc => {
        setSender(doc.data() as User);
      });
    }
  }, [message.senderId]);
  
  return (
    <View>
      {chat.type === 'group' && <Text>{sender?.displayName}</Text>}
      <Text>{message.text}</Text>
    </View>
  );
};
```

**Acceptance Criteria:**
- ✅ Can create group with 3+ participants
- ✅ Group chat shows participant names on messages
- ✅ All participants see messages in real-time
- ✅ Group name displayed in chat header
- ✅ System message announces group creation
- ✅ Read receipts work (show who read each message)

---

### US-2.9: Add Push Notifications (Foreground)
**As a** user  
**I want** to see notifications when I receive messages  
**So that** I don't miss important conversations

**Implementation:**
```bash
npx expo install expo-notifications
```

Setup in `app/_layout.tsx`:
```typescript
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });
    
    return () => subscription.remove();
  }, []);
  
  // Request permissions on login
  const requestPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      const token = await Notifications.getExpoPushTokenAsync();
      // Save token to Firestore user document
      await updateDoc(doc(db, 'users', user.uid), {
        pushToken: token.data,
      });
    }
  };
}
```

**Leverage Library Strengths:**
- Expo Notifications handles permissions automatically
- Works on both iOS and Android without native config
- Foreground notifications work out of the box

**Acceptance Criteria:**
- ✅ User prompted for notification permissions on first launch
- ✅ Foreground notifications show when app is open
- ✅ Notification shows sender name and message preview
- ✅ Tapping notification navigates to correct chat
- ✅ Push token saved to user's Firestore document
- ✅ Works on both iOS and Android simulators

**Note:** Background/killed app notifications require Firebase Cloud Messaging setup (can be done post-MVP)

---

### US-2.10: Implement Online/Offline Presence
**As a** user  
**I want** to see when my contacts are online  
**So that** I know if they're available to chat

**Implementation:**
Setup presence system using Firestore:
```typescript
// In app/_layout.tsx after auth
useEffect(() => {
  if (!user) return;
  
  const userRef = doc(db, 'users', user.uid);
  
  // Set online when app opens
  updateDoc(userRef, {
    status: 'online',
    lastSeen: serverTimestamp(),
  });
  
  // Set offline when app closes
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      updateDoc(userRef, {
        status: 'offline',
        lastSeen: serverTimestamp(),
      });
    } else if (nextAppState === 'active') {
      updateDoc(userRef, {
        status: 'online',
        lastSeen: serverTimestamp(),
      });
    }
  };
  
  const subscription = AppState.addEventListener('change', handleAppStateChange);
  
  return () => {
    updateDoc(userRef, { status: 'offline', lastSeen: serverTimestamp() });
    subscription.remove();
  };
}, [user]);

// Display in chat header
const ChatHeader = ({ chatId }) => {
  const [recipientStatus, setRecipientStatus] = useState<'online' | 'offline'>('offline');
  
  useEffect(() => {
    // Get recipient ID from chat
    const chat = chats.find(c => c.id === chatId);
    const recipientId = chat.participants.find(id => id !== user.uid);
    
    const unsubscribe = onSnapshot(doc(db, 'users', recipientId), (doc) => {
      setRecipientStatus(doc.data()?.status || 'offline');
    });
    
    return unsubscribe;
  }, [chatId]);
  
  return (
    <View>
      <Text>{recipientName}</Text>
      <View style={{ width: 8, height: 8, backgroundColor: recipientStatus === 'online' ? 'green' : 'gray' }} />
    </View>
  );
};
```

**Leverage Library Strengths:**
- React Native's AppState detects background/foreground automatically
- Firestore real-time listeners update presence instantly
- `serverTimestamp()` ensures accurate "last seen" times

**Acceptance Criteria:**
- ✅ Green dot shows when contact is online
- ✅ Gray dot shows when offline
- ✅ "Last seen" timestamp displays for offline users
- ✅ Status updates within 2 seconds of app state change
- ✅ Works across app backgrounding/foregrounding
- ✅ Status persists after force quit

---

### US-2.11: Handle App Lifecycle (Background/Foreground/Force Quit) - CRITICAL
**As a** user  
**I want** the app to handle being backgrounded gracefully  
**So that** I don't lose messages or connection state

**Implementation:**
Enhanced lifecycle handling in `services/messageSync.ts`:
```typescript
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

let firestoreUnsubscribers: (() => void)[] = [];
let lastSyncTimestamp = Date.now();

export const initMessageSync = (userId: string) => {
  let appState = AppState.currentState;
  
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log('App state change:', appState, '->', nextAppState);
    
    // Going to background
    if (appState.match(/active/) && nextAppState.match(/inactive|background/)) {
      console.log('App backgrounded - Firestore listeners stay active briefly');
      
      // CRITICAL: Save last sync time before backgrounding
      await AsyncStorage.setItem('lastSyncTimestamp', Date.now().toString());
      
      // CRITICAL: Update user status to offline
      if (userId) {
        await updateDoc(doc(db, 'users', userId), {
          status: 'offline',
          lastSeen: serverTimestamp(),
        });
      }
      
      // Firestore listeners stay active for ~60 seconds in background
      // They'll auto-disconnect, then reconnect on foreground
    }
    
    // Coming to foreground
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App foregrounded - syncing messages');
      
      // CRITICAL: Update user status to online immediately
      if (userId) {
        await updateDoc(doc(db, 'users', userId), {
          status: 'online',
          lastSeen: serverTimestamp(),
        });
      }
      
      // Check if we're online
      const netState = await NetInfo.fetch();
      if (netState.isConnected && netState.isInternetReachable) {
        useStore.getState().setConnectionStatus('reconnecting');
        
        // CRITICAL: Delta sync missed messages (target: <1 second)
        await syncMissedMessages(userId);
        
        // CRITICAL: Process pending queue
        await processPendingMessages();
        
        useStore.getState().setConnectionStatus('online');
      } else {
        useStore.getState().setConnectionStatus('offline');
      }
    }
    
    appState = nextAppState;
  };
  
  const subscription = AppState.addEventListener('change', handleAppStateChange);
  
  return () => {
    subscription.remove();
    firestoreUnsubscribers.forEach(unsub => unsub());
  };
};

const syncMissedMessages = async (userId: string) => {
  const startTime = Date.now();
  
  try {
    // Get last sync timestamp
    const lastSyncStr = await AsyncStorage.getItem('lastSyncTimestamp');
    const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr) : Date.now() - 86400000; // 24h ago fallback
    
    console.log(`Syncing messages since ${new Date(lastSyncTime).toISOString()}`);
    
    // CRITICAL: Get user's chats first (batch query)
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', userId)
    );
    
    const chatsSnapshot = await getDocs(chatsQuery);
    const chatIds = chatsSnapshot.docs.map(doc => doc.id);
    
    console.log(`Found ${chatIds.length} chats to sync`);
    
    if (chatIds.length === 0) {
      console.log('No chats to sync');
      return;
    }
    
    // CRITICAL: Batch fetch messages for all chats (parallel queries)
    // Limit parallelism to avoid overwhelming poor networks
    const PARALLEL_LIMIT = 5;
    const allNewMessages: Message[] = [];
    
    for (let i = 0; i < chatIds.length; i += PARALLEL_LIMIT) {
      const batchChatIds = chatIds.slice(i, i + PARALLEL_LIMIT);
      
      const messagePromises = batchChatIds.map(async (chatId) => {
        try {
          const messagesQuery = query(
            collection(db, 'messages'),
            where('chatId', '==', chatId),
            where('timestamp', '>', lastSyncTime),
            orderBy('timestamp', 'asc'),
            limit(100) // Limit per chat to avoid huge syncs
          );
          
          const messagesSnapshot = await getDocs(messagesQuery);
          return messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
        } catch (error) {
          console.error(`Failed to sync chat ${chatId}:`, error);
          return []; // Skip failed chats, don't block others
        }
      });
      
      const messageArrays = await Promise.all(messagePromises);
      allNewMessages.push(...messageArrays.flat());
    }
    
    console.log(`Fetched ${allNewMessages.length} new messages across ${chatIds.length} chats`);
    
    // CRITICAL: Batch insert to SQLite (transaction for speed)
    if (allNewMessages.length > 0) {
      dbOperations.batchInsertMessages(allNewMessages);
      
      // Deduplicate after sync (in case of race conditions)
      dbOperations.deduplicateMessages();
    }
    
    // Update last sync timestamp
    await AsyncStorage.setItem('lastSyncTimestamp', Date.now().toString());
    
    const syncDuration = Date.now() - startTime;
    console.log(`Delta sync completed in ${syncDuration}ms`);
    
    // CRITICAL: Target is <1 second for 100 messages, <2s for 100+
    const target = allNewMessages.length > 100 ? 2000 : 1000;
    if (syncDuration > target) {
      console.warn(`Sync took ${syncDuration}ms, target is <${target}ms for ${allNewMessages.length} messages`);
    }
    
    return allNewMessages.length;
  } catch (error) {
    console.error('Delta sync failed:', error);
    // Don't throw - app should continue working with local data
    return 0;
  }
};

// CRITICAL: Add this to handle Firestore listener reconnection
export const setupRealtimeListeners = (chatIds: string[]) => {
  // Unsubscribe from old listeners
  firestoreUnsubscribers.forEach(unsub => unsub());
  firestoreUnsubscribers = [];
  
  // Set up new listeners for each chat
  chatIds.forEach(chatId => {
    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', chatId),
      where('timestamp', '>', lastSyncTimestamp),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const message = { id: change.doc.id, ...change.doc.data() } as Message;
        
        if (change.type === 'added' || change.type === 'modified') {
          dbOperations.insertMessage(message);
        }
      });
    }, (error) => {
      console.error('Firestore listener error:', error);
      // CRITICAL: Attempt reconnection on error
      setTimeout(() => setupRealtimeListeners(chatIds), 5000);
    });
    
    firestoreUnsubscribers.push(unsubscribe);
  });
};
```

**Install AsyncStorage:**
```bash
npx expo install @react-native-async-storage/async-storage
```

**CRITICAL: Initialize in app/_layout.tsx:**
```typescript
useEffect(() => {
  if (user) {
    initMessageSync(user.uid);
  }
}, [user]);
```

**Leverage Library Strengths:**
- AppState API handles iOS/Android platform differences automatically
- Firestore maintains connection briefly in background (~60s on iOS, varies on Android)
- AsyncStorage persists across app restarts (backed by native storage)
- Parallel Promise.all for chat queries minimizes sync time
- Batch SQLite inserts use transactions for atomic writes

**Acceptance Criteria:**
- ✅ App backgrounding maintains Firestore connection briefly (~60s)
- ✅ **Foregrounding triggers delta sync in <1 second**
- ✅ Messages received while backgrounded appear immediately on foreground
- ✅ **Force quit + reopen shows full chat history from SQLite instantly**
- ✅ **Pending messages send after force quit + reopen**
- ✅ **No duplicate messages after sync** (INSERT OR REPLACE in SQLite)
- ✅ Connection status indicator shows sync progress (reconnecting → online)
- ✅ User status updates (online/offline) on app state changes
- ✅ Sync works with 10+ active chats without performance degradation
- ✅ Failed Firestore listeners auto-reconnect after 5s

**Testing:**
- **Background test:** Send 10 messages on Device A while Device B is backgrounded for 5 minutes, foreground Device B, verify all 10 messages appear within 1 second
- **Force quit test:** Send 5 messages, force quit app before they send, reopen, verify messages send automatically
- **Large sync test:** Background app for 1 hour, receive 100+ messages across multiple chats, foreground, measure sync time (target <2s for 100 messages)
- **Network failure test:** Disconnect network while backgrounded, reconnect while foregrounding, verify graceful recovery
- **Status test:** Background app, verify user status changes to offline in Firestore
- **Duplicate test:** Receive same message via background notification and foreground sync, verify appears only once

---

## Additional Critical User Story: Message Deduplication

### US-2.12: Implement Message Deduplication (CRITICAL: Prevent duplicates)
**As a** user  
**I want** each message to appear only once  
**So that** conversations aren't confusing with duplicate messages

**Implementation:**
Update `services/database.ts` to use `INSERT OR REPLACE`:
```typescript
export const dbOperations = {
  // CRITICAL: Use INSERT OR REPLACE to prevent duplicates
  insertMessage: (message: Message) => {
    db.runSync(
      'INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [message.id, message.chatId, message.senderId, message.text, 
       message.originalLanguage || '', message.timestamp, message.status,
       JSON.stringify(message.readBy || []), message.mediaURL || '', message.localOnly ? 1 : 0]
    );
  },
  
  // CRITICAL: Batch insert also uses OR REPLACE
  batchInsertMessages: (messages: Message[]) => {
    db.runSync('BEGIN TRANSACTION');
    try {
      const stmt = db.prepareSync(
        'INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      
      messages.forEach(message => {
        stmt.executeSync([
          message.id, message.chatId, message.senderId, message.text,
          message.originalLanguage || '', message.timestamp, message.status,
          JSON.stringify(message.readBy || []), message.mediaURL || '', message.localOnly ? 1 : 0
        ]);
      });
      
      stmt.finalizeSync();
      db.runSync('COMMIT');
    } catch (error) {
      db.runSync('ROLLBACK');
      throw error;
    }
  },
};
```

**Update Firestore listeners to use document IDs consistently:**
```typescript
// In ChatScreen and message sync
const unsubscribe = onSnapshot(q, (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    // CRITICAL: Always use doc.id, never generate client-side IDs after initial optimistic send
    const message = { 
      id: change.doc.id, // Firestore document ID is source of truth
      ...change.doc.data() 
    } as Message;
    
    if (change.type === 'added' || change.type === 'modified') {
      dbOperations.insertMessage(message); // OR REPLACE handles duplicates
    } else if (change.type === 'removed') {
      dbOperations.deleteMessage(message.id);
    }
  });
  
  // Reload from SQLite (deduped data)
  const updatedMessages = dbOperations.getMessagesByChat(chatId);
  setMessages(updatedMessages);
});
```

**Leverage Library Strengths:**
- SQLite's `INSERT OR REPLACE` is atomic and idempotent
- Firestore document IDs are globally unique
- Prepared statements optimize batch inserts

**Acceptance Criteria:**
- ✅ **Zero duplicate messages** in UI or SQLite
- ✅ Same message received via multiple paths (real-time + sync) appears once
- ✅ Optimistic message replaced with server version seamlessly
- ✅ Batch sync of 100+ messages has no duplicates
- ✅ Message updates (status changes) don't create duplicates

**Testing:**
- **Multi-path test:** Send message on Device A, have Device B receive via real-time listener AND background sync, verify appears once
- **Optimistic test:** Send message, verify temp ID replaced with server ID, no duplicate
- **Batch test:** Background app, send 50 messages, foreground, verify each appears exactly once
- **Status update test:** Mark message as read, verify doesn't create duplicate entry

---

## Additional Critical User Story: Connection Status UI

### US-2.13: Add Connection Status Indicator (CRITICAL: User visibility)
**As a** user  
**I want** to see my connection status  
**So that** I know if messages will send immediately

**Implementation:**
Create `components/ConnectionBanner.tsx`:
```typescript
import { useStore } from '@/store/useStore';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export const ConnectionBanner = () => {
  const connectionStatus = useStore((state) => state.connectionStatus);
  
  if (connectionStatus === 'online') return null;
  
  const bannerConfig = {
    offline: {
      color: '#dc2626',
      text: 'No internet connection',
      icon: '📡',
    },
    reconnecting: {
      color: '#f59e0b',
      text: 'Reconnecting...',
      icon: '🔄',
    },
  };
  
  const config = bannerConfig[connectionStatus];
  
  return (
    <Animated.View 
      entering={FadeIn} 
      exiting={FadeOut}
      style={[styles.banner, { backgroundColor: config.color }]}
    >
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={styles.text}>{config.text}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 8,
  },
  icon: {
    fontSize: 16,
  },
  text: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
```

**Add to main layout:**
```typescript
// In app/_layout.tsx or at top of chat screens
<View style={{ flex: 1 }}>
  <ConnectionBanner />
  {/* rest of app */}
</View>
```

**Install react-native-reanimated:**
```bash
npx expo install react-native-reanimated
```

**Leverage Library Strengths:**
- Reanimated provides 60 FPS animations on native thread
- Zustand triggers re-render only when connectionStatus changes
- FadeIn/FadeOut gives polished UX

**Acceptance Criteria:**
- ✅ Banner shows immediately when offline (<100ms)
- ✅ "Reconnecting" banner shows during sync (<1s)
- ✅ Banner disappears when back online
- ✅ Smooth fade animations
- ✅ Doesn't block UI or cause jank
- ✅ Works across all screens

---

## Performance Validation Checklist

Before considering MVP complete, validate these critical requirements:

### Message Delivery Performance
- [ ] **<200ms delivery** on good network (measure with timestamps)
- [ ] **Sub-1s sync** after reconnection (measure in syncMissedMessages)
- [ ] **Zero message loss** in offline scenarios (test with 50+ queued messages)

### UI Performance  
- [ ] **60 FPS scrolling** through 1000+ messages (use React DevTools FPS monitor)
- [ ] **<16ms optimistic UI** update when sending (measure setState to render)
- [ ] **<2s app launch** to chat screen (measure from splash to interactive)

### Offline/Lifecycle
- [ ] Messages queue correctly in airplane mode
- [ ] Queue processes in correct order on reconnect
- [ ] Force quit + reopen preserves all data
- [ ] Background → foreground syncs in <1s

### Real-Time Features
- [ ] Typing indicators appear in <500ms
- [ ] Read receipts update in real-time
- [ ] Online/offline status updates in <2s

### Data Integrity
- [ ] Zero duplicate messages across all scenarios
- [ ] Message order preserved (server timestamps)
- [ ] SQLite indexes optimize queries (<10ms for 1000 messages)

**Testing Tools:**
- React DevTools: FPS monitoring
- Xcode Instruments / Android Profiler: Memory leaks
- Network Link Conditioner: Simulate poor networks (3G, packet loss)
- Firebase Emulator: Test without costs during development

---

## MVP Complete! 🎉

At this point, you have a fully functional messaging app with:
- ✅ Authentication with persistence
- ✅ Real-time one-on-one and group chat
- ✅ Offline support with message queuing
- ✅ Optimistic UI updates
- ✅ Read receipts and typing indicators
- ✅ Online/offline presence
- ✅ Push notifications (foreground)
- ✅ App lifecycle handling
- ✅ 60 FPS scrolling through 1000+ messages
- ✅ Local-first architecture with SQLite + Firestore sync

---

## Phase 3: AI Features (Post-MVP)

### US-3.1: Set Up Firebase Cloud Functions for AI
**As a** developer  
**I want** to create Cloud Functions that call OpenAI  
**So that** API keys stay secure on the server

**Implementation:**
```bash
cd functions
npm init -y
npm install firebase-functions firebase-admin openai
```

Create `functions/src/index.ts`:
```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

admin.initializeApp();

const openai = new OpenAI({
  apiKey: functions.config().openai.key,
});

export const translateMessage = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const { text, targetLanguage, sourceLanguage } = data;
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Preserve tone and meaning. Only return the translation, no explanations.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });
    
    return {
      translatedText: completion.choices[0].message.content,
      sourceLanguage,
      targetLanguage,
    };
  } catch (error) {
    console.error('Translation error:', error);
    throw new functions.https.HttpsError('internal', 'Translation failed');
  }
});

export const detectLanguage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const { text } = data;
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'Detect the language of the following text. Respond with only the ISO 639-1 language code (e.g., "en", "es", "zh"). If multiple languages, return the primary one.',
      },
      {
        role: 'user',
        content: text,
      },
    ],
    temperature: 0,
    max_tokens: 10,
  });
  
  return {
    language: completion.choices[0].message.content.trim().toLowerCase(),
  };
});
```

**Deploy:**
```bash
firebase functions:config:set openai.key="YOUR_OPENAI_API_KEY"
firebase deploy --only functions
```

**In React Native app, call functions:**
```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

const translateText = async (text: string, targetLang: string, sourceLang: string) => {
  const translateMessage = httpsCallable(functions, 'translateMessage');
  
  const result = await translateMessage({
    text,
    targetLanguage: targetLang,
    sourceLanguage: sourceLang,
  });
  
  return result.data.translatedText;
};
```

**Leverage Library Strengths:**
- Firebase Functions automatically scale
- `onCall` handles authentication automatically
- Functions config keeps API keys secure
- Callable functions have built-in error handling

**Acceptance Criteria:**
- ✅ Cloud Functions deploy successfully
- ✅ OpenAI API key stored securely in Functions config
- ✅ Translation function callable from React Native app
- ✅ Language detection function works
- ✅ Authentication enforced (only logged-in users can call)
- ✅ Error handling returns user-friendly messages
- ✅ Response time <2 seconds for short texts

**Testing:**
- Call `translateMessage` with "Hello" → "es", verify returns "Hola"
- Call `detectLanguage` with "Bonjour", verify returns "fr"
- Try calling without auth, verify fails with auth error

---

This completes the MVP user stories and sets up the first AI feature. The structure shows:

1. **Clear implementation details** with code examples
2. **Leverages library strengths** (Firestore real-time, FlashList performance, etc.)
3. **Specific acceptance criteria** that can be tested
4. **Testing scenarios** where critical (offline sync, lifecycle handling)
5. **Progressive complexity** from setup → core features → AI

Want me to continue with the remaining AI features (cultural context, formality adjustment, slang explanations, and smart replies)?
