# Complete Firebase Project Setup Guide

## Overview

This guide walks you through setting up a complete Firebase project for YiChat with Web, Android, and iOS apps. If you're setting up from scratch, follow all sections. If you already have a web app configured, skip to the mobile sections.

**What you'll create:**
- 🌐 Web app (for web deployment and Firebase config)
- 🤖 Android app (for mobile APK with push notifications)
- 🍎 iOS app (for mobile IPA with push notifications)

All three apps in **one Firebase project**.

---

## 🔥 Create Firebase Project (If Starting Fresh)

### Step 1: Create New Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `YiChat` (or your preferred name)
4. Click **Continue**
5. Google Analytics (optional):
   - Toggle OFF if you don't need it (simpler)
   - Toggle ON if you want analytics
6. Click **Create project**
7. Wait for setup (~30 seconds)
8. Click **Continue**

### Step 2: Enable Required Firebase Services

**Firestore Database:**
1. In Firebase Console sidebar → **Firestore Database**
2. Click **Create database**
3. Select **Production mode** (we'll add security rules later)
4. Choose location: **us-central** (or closest to your users)
5. Click **Enable**
6. **IMPORTANT:** Create a named database called `yichat`:
   - Click the dropdown at top (shows "(default)")
   - Click **"Create database"**
   - Name: `yichat`
   - Location: same as default
   - Click **Create**

**Authentication:**
1. Sidebar → **Authentication**
2. Click **Get started**
3. Click **Email/Password** → Toggle **Enable** → Save
4. (Optional) Enable **Google** sign-in if you want OAuth

**Storage:**
1. Sidebar → **Storage**
2. Click **Get started**
3. Select **Production mode** → Next
4. Choose same location as Firestore → Done

**Cloud Functions (for AI features later):**
1. Sidebar → **Functions**
2. Click **Get started**
3. Click **Upgrade** if prompted (can use Blaze plan with budget alerts)
4. Note: Required for AI translation features

---

## 🌐 Add Web App to Firebase

### Step 1: Register Web App

1. In Firebase Console → Click **gear icon** (⚙️) → **Project settings**
2. Scroll to **"Your apps"** section
3. Click the **Web icon** (`</>`)
4. Register app:
   - **App nickname:** `YiChat Web`
   - **Firebase Hosting:** Leave unchecked (optional)
5. Click **Register app**

### Step 2: Copy Firebase Configuration

You'll see a code snippet like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "yichat-xxxxx.firebaseapp.com",
  projectId: "yichat-xxxxx",
  storageBucket: "yichat-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

### Step 3: Add to .env.local

Create/edit `.env.local` in project root:

```bash
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=yichat-xxxxx.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=yichat-xxxxx
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=yichat-xxxxx.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

**Replace the `XXXXX` values with your actual Firebase config!**

### Step 4: Verify Configuration

```bash
# Check that .env.local exists and has all variables
cat .env.local | grep FIREBASE

# Should show 6 lines of Firebase config
```

**✅ Web app setup complete!**

---

## 📱 Add Android App to Firebase

### Step 1: Open Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your YiChat project
3. Click the **gear icon** (⚙️) next to "Project Overview" → **Project settings**

### Step 2: Add Android App

1. Scroll down to **"Your apps"** section
2. Click the **Android icon** (robot)
3. You'll see a registration form:

**Android package name:** `com.yichat.app`
- ⚠️ **IMPORTANT:** Must match `package` in `app.config.js` exactly
- Check yours: `cat app.config.js | grep "package:"`

**App nickname (optional):** `YiChat Android`

**Debug signing certificate SHA-1 (optional):** Leave blank for now

4. Click **"Register app"**

### Step 3: Download google-services.json

1. Click **"Download google-services.json"**
2. Save to your project root:
   ```
   D:\code\Repos\Gauntlet\YiChat\google-services.json
   ```

3. Click **"Next"** (skip SDK setup steps - Expo handles this)
4. Click **"Continue to console"**

### Step 4: Verify File Location

```bash
# Should see the file
ls -la google-services.json

# Should look like this (abbreviated):
cat google-services.json
```

Expected content structure:
```json
{
  "project_info": {
    "project_number": "123456789",
    "project_id": "yichat-xxxxx",
    "storage_bucket": "yichat-xxxxx.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:123456789:android:abcdef...",
        "android_client_info": {
          "package_name": "com.yichat.app"
        }
      }
    }
  ]
}
```

**✅ Android setup complete!**

---

## 🍎 Add iOS App to Firebase

### Step 1: Add iOS App

1. Still in Firebase Console → Project settings
2. Scroll to **"Your apps"**
3. Click the **Apple icon** (🍎)

**iOS bundle ID:** `com.yichat.app`
- ⚠️ **IMPORTANT:** Must match `bundleIdentifier` in `app.config.js`
- Check yours: `cat app.config.js | grep "bundleIdentifier:"`

**App nickname (optional):** `YiChat iOS`

**App Store ID (optional):** Leave blank (you don't have one yet)

4. Click **"Register app"**

### Step 2: Download GoogleService-Info.plist

1. Click **"Download GoogleService-Info.plist"**
2. Save to your project root:
   ```
   D:\code\Repos\Gauntlet\YiChat\GoogleService-Info.plist
   ```

3. Click **"Next"** (skip SDK setup - Expo handles this)
4. Click **"Continue to console"**

### Step 3: Verify File Location

```bash
# Should see the file
ls -la GoogleService-Info.plist

# Should be XML format
cat GoogleService-Info.plist
```

Expected content (abbreviated):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CLIENT_ID</key>
  <string>123456789-abcdefg.apps.googleusercontent.com</string>
  <key>BUNDLE_ID</key>
  <string>com.yichat.app</string>
  ...
</dict>
</plist>
```

**✅ iOS setup complete!**

---

## 🔍 Verify Complete Setup

You should now have **3 apps** in Firebase Console:

```
Your apps:
├── 🌐 YiChat Web
├── 🤖 YiChat Android (com.yichat.app)
└── 🍎 YiChat iOS (com.yichat.app)
```

**Verify in Firebase Console:**
- Project Settings → Your apps
- Should see all 3 listed

**Verify local files:**
```bash
# Check environment variables
cat .env.local | grep FIREBASE

# Should show 6 Firebase config lines

# Check mobile config files
ls -la google-services.json GoogleService-Info.plist

# Should show both files
```

---

## 🔒 Deploy Security Rules

Your Firebase services are currently open to anyone. Deploy security rules:

### Firestore Rules

Create/verify `firestore.rules` in project root:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/yichat/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create: if isOwner(userId);
      allow update: if isOwner(userId);
    }

    // Messages collection
    match /messages/{messageId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() &&
        request.resource.data.senderId == request.auth.uid;
    }

    // Chats collection
    match /chats/{chatId} {
      allow read: if isAuthenticated() &&
        request.auth.uid in resource.data.participants;
      allow create: if isAuthenticated();
      allow update: if isAuthenticated() &&
        request.auth.uid in resource.data.participants;
    }
  }
}
```

### Storage Rules

Create/verify `storage.rules` in project root:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /chats/{chatId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

### Deploy Rules

```bash
# Install Firebase CLI (if not installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase (if first time)
firebase init firestore
firebase init storage

# Deploy security rules
firebase deploy --only firestore:rules
firebase deploy --only storage
```

---

## 📋 Complete Setup Checklist

### Firebase Project
- [ ] Firebase project created
- [ ] Firestore database created (named `yichat`)
- [ ] Authentication enabled (Email/Password)
- [ ] Storage enabled
- [ ] Security rules deployed

### Web App
- [ ] Web app registered in Firebase
- [ ] Firebase config copied to `.env.local`
- [ ] All 6 environment variables set

### Android App
- [ ] Android app added to Firebase
- [ ] Package name: `com.yichat.app`
- [ ] `google-services.json` downloaded to project root
- [ ] File in `.gitignore` ✅ (already configured)

### iOS App
- [ ] iOS app added to Firebase
- [ ] Bundle ID: `com.yichat.app`
- [ ] `GoogleService-Info.plist` downloaded to project root
- [ ] File in `.gitignore` ✅ (already configured)

### Verification
- [ ] All 3 apps visible in Firebase Console
- [ ] `.env.local` has all Firebase config
- [ ] `google-services.json` exists in project root
- [ ] `GoogleService-Info.plist` exists in project root
- [ ] Security rules deployed

### EAS Build (Next Step)
- [ ] Upload `google-services.json` as EAS Secret (see [EAS_SETUP.md](./EAS_SETUP.md#step-3-upload-firebase-config-files-to-eas-secrets))
- [ ] Upload `GoogleService-Info.plist` as EAS Secret

**Note:** The files in your project root work for local development (Expo Go). For EAS cloud builds, you must upload them as secrets since they're gitignored. See **[EAS_SETUP.md](./EAS_SETUP.md)** for detailed instructions.

---

## 🚨 Common Issues

### "Package name already exists"

If you get this error, it means you (or someone) already created an Android/iOS app with this package name in Firebase.

**Solution:**
- Use a different package name in `app.config.js`
- Or find the existing Firebase project that has this package

### "Invalid package name format"

Package names must:
- Be all lowercase
- Use dots (.) to separate segments
- Example: `com.company.appname`

### Files not showing up in project

```bash
# Check current directory
pwd

# Should be: D:\code\Repos\Gauntlet\YiChat

# List files
ls -la *.json *.plist
```

---

## 🔐 Security Note

Both files contain your Firebase configuration (API keys, project IDs). These are **public by design** (client apps have them), but:

- ✅ They're protected by Firebase Security Rules
- ✅ Still best practice to gitignore them
- ✅ Don't commit to public repos
- ❌ Not secret like server API keys (those go in Cloud Functions)

The `.gitignore` is already configured to exclude these files.

---

## ✅ Next Steps

After completing this setup:

1. Run `eas init` (if you haven't)
2. Build development version:
   ```bash
   eas build --profile development --platform android
   ```

The build process will use `google-services.json` automatically!
