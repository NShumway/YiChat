# Google Sign-In Setup Guide

## Current Status: ✅ Code is ready, just need Firebase config

## Quick Setup (5 minutes)

### 1. Firebase Console Configuration

#### A. Set Project Public Info
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your YiChat project
3. Click **⚙️ (gear icon)** → **Project Settings**
4. Scroll to **Public settings**:
   - **Public-facing name**: `YiChat` (or whatever you want users to see)
   - **Support email**: Your email address
5. Click **Save**

#### B. Enable Google Sign-In
1. Go to **Authentication** → **Sign-in method** (left sidebar)
2. Find **Google** in the provider list
3. Click on it, then **Enable** the toggle
4. Fill in:
   - **Project support email**: Select your email from dropdown
   - **Project public-facing name**: Should auto-fill
5. Click **Save**

#### C. Get Web Client ID
1. Still in the **Google** provider settings
2. Look for **Web SDK configuration** section
3. You'll see something like:
   ```
   Web client ID: 123456789-abcdefghijklmnop.apps.googleusercontent.com
   ```
4. **Copy this entire string** (it's long!)

### 2. Add to Your .env.local File

Open your `.env.local` file and add:

```bash
# Google OAuth (required for "Continue with Google")
GOOGLE_WEB_CLIENT_ID=paste-your-web-client-id-here.apps.googleusercontent.com

# These are optional for Expo Go testing (only needed for production builds)
# GOOGLE_IOS_CLIENT_ID=
# GOOGLE_ANDROID_CLIENT_ID=
```

### 3. Restart Expo Dev Server

```bash
# Stop the current server (Ctrl+C) and restart
npm start
```

### 4. Test It!

1. Open app in Expo Go
2. Go to Login or Sign Up screen
3. Tap **"Continue with Google"** button
4. Should open Google sign-in in browser
5. Select your Google account
6. Should redirect back to app and log you in! ✅

---

## Troubleshooting

### "Google sign-in failed"
- Check that Web Client ID is correctly copied (no extra spaces)
- Make sure Google provider is **Enabled** in Firebase Console
- Restart Expo dev server after adding env vars

### "Failed to get Google authentication tokens"
- This usually means the OAuth flow was cancelled or failed
- Try again - sometimes the browser doesn't redirect properly on first try

### Works in Expo Go but want production builds?
You'll need to set up iOS/Android client IDs:

#### For iOS:
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID for **iOS**
3. Set bundle ID: `com.yichat.app` (from app.config.js)
4. Add to .env.local as `GOOGLE_IOS_CLIENT_ID`

#### For Android:
1. Get SHA-1 fingerprint:
   ```bash
   # For Expo managed workflow
   npx expo credentials:manager
   # Select Android → Keystore → View keystore info
   ```
2. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
3. Create OAuth 2.0 Client ID for **Android**
4. Set package name: `com.yichat.app`
5. Add SHA-1 fingerprint from step 1
6. Add to .env.local as `GOOGLE_ANDROID_CLIENT_ID`

---

## What Users Will See

When they tap "Continue with Google":
1. Browser opens with Google sign-in
2. Shows: "YiChat wants to access your Google Account"
3. Lists permissions: Email, profile, basic account info
4. User clicks **Allow**
5. Redirects back to app
6. User is logged in! 🎉

First-time users automatically get:
- Display name from Google
- Email from Google
- Profile picture from Google
- Default language: English (they can change this later)

---

## Security Notes

✅ **What we're doing right (Firebase handles this):**
- OAuth tokens never stored in app code
- Google validates the user, not us
- Firebase manages the authentication session
- Tokens automatically refresh

❌ **What NOT to do:**
- Don't commit .env.local to git (already in .gitignore)
- Don't share your OAuth client IDs publicly
- Don't disable Firebase Security Rules

---

## Current Implementation

The code is already implemented in:
- `services/googleAuth.ts` - OAuth flow logic
- `app/(auth)/login.tsx` - "Continue with Google" button
- `app/(auth)/signup.tsx` - Same button on signup
- `app.config.js` - Expo config with OAuth client IDs

You just need to:
1. Configure Firebase Console (steps above)
2. Add Web Client ID to .env.local
3. Test it!

