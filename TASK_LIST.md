# YiChat Task List

A concise ordered list of all planned features and their user/developer experience impact.

---

## Phase 0: Project Setup

1. **Initialize Expo Project with TypeScript** ✅
   *Provides type safety and reduces bugs during development*

2. **Install and Configure Firebase** ✅
   *Enables backend services (auth, database, storage) without managing servers*

3. **Set Up SQLite for Local Storage** ✅
   *Enables instant message loading (<10ms) and offline functionality*

4. **Set Up State Management with Zustand** ✅
   *Simplifies global state (user, connection status) with minimal boilerplate*

5. **API Key Security & Firestore Security Rules** ✅
   *Protects user data and prevents unauthorized access*

---

## Phase 1: Authentication

6. **Build Sign Up Screen** ✅
   *Lets new users create accounts with email/password*

7. **Build Login Screen** ✅
   *Lets returning users access their accounts*

8. **Implement Auth State Persistence** ✅
   *Users stay logged in across app restarts*

---

## Phase 2: Core Messaging

9. **Create Chat List Screen**
   *Shows all conversations at a glance with last message preview*

10. **Implement New Chat Creation**
    *Users can start conversations with contacts*

11. **Build Chat Screen with 60 FPS Scrolling**
    *Smooth scrolling even with 1000+ messages (critical UX)*

12. **Implement Optimistic UI for Sending Messages**
    *Messages appear instantly (<16ms) before server confirms (responsive feel)*

13. **Implement Offline Message Queue**
    *Messages never get lost - they queue and send when connection returns*

14. **Add Typing Indicators**
    *Users see when others are composing messages (engagement cue)*

15. **Implement Read Receipts**
    *Senders know when their messages have been seen*

16. **Build Basic Group Chat**
    *Multiple users can chat together in one conversation*

17. **Add Push Notifications (Foreground)**
    *Users get notified of new messages even when app is in background*

18. **Implement Online/Offline Presence**
    *Shows which contacts are currently active*

19. **Handle App Lifecycle (Background/Foreground/Force Quit)**
    *App syncs missed messages and maintains connection state properly*

20. **Implement Message Deduplication**
    *Prevents duplicate messages from appearing (data integrity)*

21. **Add Connection Status Indicator**
    *Users see when they're offline/reconnecting (transparency reduces confusion)*

---

## Phase 3: AI Features (MVP)

22. **Set Up Firebase Cloud Functions for AI**
    *Enables server-side AI processing (keeps API keys secure)*

23. **Add Nationality Field to User Signup**
    *Enables culturally-aware AI suggestions (required for context)*

24. **Set Up EAS Build for Native Features**
    *Enables background notifications and proper lifecycle handling (dev requirement)*

25. **Implement AI Request Rate Limiting**
    *Prevents runaway costs and abuse (protects budget)*

26. **Install and Configure Vercel AI SDK**
    *Provides modern streaming AI chat interface (better UX than polling)*

27. **Set Up Pinecone Vector Database for RAG**
    *Enables AI to reference past conversation context (smarter responses)*

28. **Implement Real-Time Translation (Cloud Function)**
    *Users can translate messages into their preferred language*

29. **Add Translation Caching**
    *Repeated translations load instantly (<10ms) and reduce costs*

30. **Build AI Context Menu (Press & Hold)**
    *Users can ask AI questions about specific messages*

31. **Implement Smart Reply Suggestions**
    *AI generates 3 quick reply options based on conversation context*

32. **Add Slang Detector & Explainer**
    *Helps users understand unfamiliar expressions across cultures*

33. **Implement Cultural Context Tooltips**
    *AI provides background on cultural references in messages*

34. **Build AI Conversational Interface**
    *Users can chat with AI for help understanding conversations*

35. **Implement Relationship Context**
    *AI tailors suggestions based on who user is talking to (boss vs friend)*

36. **Add Message Embedding to Pinecone (Trigger)**
    *Automatically indexes messages for AI context retrieval*

---

## Phase 4: Polish & Enhancement

37. **Implement Media Sharing (Images)**
    *Users can send photos in chats*

38. **Add Voice Messages**
    *Users can send voice recordings instead of typing*

39. **Implement Search (Messages & Chats)**
    *Users can find old conversations and specific messages*

40. **Add User Profile & Settings**
    *Users can customize display name, photo, language preference*

41. **Implement Chat Archive/Mute**
    *Users can hide old chats without deleting them*

42. **Add Reaction Emojis**
    *Quick way to respond to messages without typing*

43. **Implement Message Reply/Quote**
    *Users can reply directly to specific messages in group chats*

44. **Add Dark Mode**
    *Reduces eye strain and saves battery (user comfort)*

45. **Implement Onboarding Tutorial**
    *New users learn how to use AI features (reduces confusion)*

---

## Development Tasks (No User Stories)

- **Write Unit Tests for Message Queue**
  *Ensures offline reliability works correctly*

- **Performance Testing (Stress Test with 5000 Messages)**
  *Verifies app remains fast under heavy usage*

- **Security Audit of Firestore Rules**
  *Ensures no data leakage vulnerabilities*

- **Cost Analysis & Optimization**
  *Keeps AI feature costs under budget*

- **Deploy to TestFlight/Google Play Internal Testing**
  *Enables beta testing with real users*

---

## Summary

**Total User-Facing Features:** 45
**Completed (✅):** 8
**In Progress:** Phase 2 (Core Messaging)
**Next Major Milestone:** Phase 3 (AI Features)

**Critical Path for MVP:**
1. Finish Phase 2 (Core Messaging) - all features marked CRITICAL
2. Complete Phase 3 (AI Features) - translation + smart replies are MVP
3. Phase 4 is post-MVP enhancement
