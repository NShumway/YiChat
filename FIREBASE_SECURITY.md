# Firebase Security Rules Deployment

This document explains how to deploy and test Firebase security rules for YiChat.

## Prerequisites

1. Firebase CLI installed globally:
```bash
npm install -g firebase-tools
```

2. Firebase project created and configured in `.env.local`

## Deployment

### First-Time Setup

1. Login to Firebase:
```bash
firebase login
```

2. Initialize Firebase in the project (if not already done):
```bash
firebase init
```
- Select **Firestore** and **Storage**
- Choose your existing Firebase project
- Accept the default file names (firestore.rules, storage.rules)
- **Do NOT overwrite** the existing rules files

### Deploy Security Rules

Deploy both Firestore and Storage rules:
```bash
firebase deploy --only firestore:rules,storage
```

Or deploy them separately:
```bash
# Deploy Firestore rules only
firebase deploy --only firestore:rules

# Deploy Storage rules only
firebase deploy --only storage
```

## Security Rules Overview

### Firestore Rules

Located in `firestore.rules`. Key protections:

- **Users Collection**: 
  - ✅ Authenticated users can read any user profile
  - ✅ Users can only write to their own profile
  
- **Chats Collection**:
  - ✅ Users can only access chats they're participants in
  - ✅ Users can only create chats where they're a participant
  
- **Messages Collection**:
  - ✅ Users can only read messages in chats they're in
  - ✅ Users can only send messages as themselves (no spoofing)
  - ✅ Read receipts can be updated by chat participants
  
- **Typing Indicators**:
  - ✅ Users can only write their own typing status
  - ✅ Authenticated users can read typing indicators

### Storage Rules

Located in `storage.rules`. Key protections:

- **Profile Pictures** (`/profile_pictures/{userId}/{fileName}`):
  - ✅ Authenticated users can read any profile picture
  - ✅ Users can only upload to their own folder
  - ✅ Max file size: 5MB
  - ✅ Only image files allowed
  
- **Chat Media** (`/chat_media/{chatId}/{fileName}`):
  - ✅ Authenticated users can read
  - ✅ Authenticated users can upload
  - ✅ Max file size: 10MB

## Testing Security Rules

### Manual Testing

1. Create two test accounts in your Firebase Auth console
2. Use the app on two different devices/simulators
3. Try these scenarios:

**Should FAIL (blocked by security rules):**
- User A tries to read User B's private chat
- User A tries to update User B's profile
- Unauthenticated user tries to read any data
- User A tries to send a message with User B's senderId

**Should SUCCEED:**
- User A reads their own chats
- User A updates their own profile
- User A sends a message in a chat they're in
- User A reads another user's public profile

### Firebase Emulator Testing (Optional)

For local testing without affecting production:

```bash
# Start emulator
firebase emulators:start

# Run your app against the emulator
# Update firebase.ts to connect to emulator in dev mode
```

## Security Best Practices

✅ **DO:**
- Keep Firebase config in environment variables
- Deploy security rules before going to production
- Test security rules with multiple accounts
- Review rules after any data model changes

❌ **DON'T:**
- Never put OpenAI API keys in client code or Firebase config
- Never disable security rules (allow read, write: if true)
- Never trust client-side validation alone
- Never expose admin credentials

## Troubleshooting

### Permission Denied Errors

If you see "permission-denied" errors:

1. Check that the user is authenticated
2. Verify the user is a participant in the chat
3. Check the Firebase console logs for rule evaluation details
4. Ensure rules are deployed: `firebase deploy --only firestore:rules,storage`

### Rules Not Updating

If changes aren't taking effect:

1. Redeploy rules: `firebase deploy --only firestore:rules,storage`
2. Clear app cache and reload
3. Check Firebase console → Firestore/Storage → Rules tab to verify deployed version

## Additional Resources

- [Firestore Security Rules Guide](https://firebase.google.com/docs/firestore/security/get-started)
- [Storage Security Rules Guide](https://firebase.google.com/docs/storage/security/start)
- [Firebase Security Rules Language](https://firebase.google.com/docs/rules/rules-language)

