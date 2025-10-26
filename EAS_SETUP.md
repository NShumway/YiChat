# EAS Build Setup Guide

This guide walks you through setting up EAS Build for YiChat, enabling full native features like background push notifications and proper app lifecycle handling.

## 🎯 Why EAS Build?

**Expo Go Limitations:**
- ❌ No background push notifications
- ❌ Limited app lifecycle handling
- ❌ Can't properly test production features

**EAS Build Advantages:**
- ✅ Full native features (push notifications, background sync)
- ✅ Production-ready builds
- ✅ Free for development (no paid Apple license needed)
- ✅ Still uses Expo managed workflow (no ejecting)

---

## 📋 Prerequisites

1. **Expo Account:**
   ```bash
   # Sign up at https://expo.dev
   # Then login via CLI
   npx expo login
   ```

2. **EAS CLI:**
   ```bash
   npm install -g eas-cli
   eas login
   ```

3. **For iOS Testing:**

   You have several options:

   **Option A: iOS Simulator (Easiest, 100% Free)**
   - ✅ No Apple account needed
   - ✅ No payment required
   - ✅ Use `eas build --local` on Mac
   - ❌ Requires Mac computer
   - ❌ Cannot test on physical device

   **Option B: Free Apple ID + Physical Device**
   - ✅ Free (no $99/year license needed for development)
   - ✅ Test on real iPhone/iPad
   - ⚠️ Requires Apple Developer account setup:
     1. Go to https://developer.apple.com/
     2. Sign in with your Apple ID
     3. Accept Apple Developer Agreement
     4. This creates your "Personal Team"
   - ⚠️ Limited to your own devices only

   **Option C: Paid Apple Developer Program ($99/year)**
   - Required for App Store submission
   - Can use TestFlight for beta testing
   - Not needed until you're ready to publish

4. **Android:**
   - ✅ No account or payment needed!
   - ✅ Works immediately with EAS Build

---

## 🚀 First-Time Setup

### Step 1: Configure EAS Project

```bash
# In project root
eas init
```

This will:
- Create an Expo project ID
- Link your local project to Expo
- Generate `app.json` extras (if needed)

### Step 2: Download Firebase Configuration Files

**For Android (Required for Push Notifications):**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings → Your apps → Android app
4. Click "Download google-services.json"
5. Save to project root: `./google-services.json`

**For iOS (Required for Push Notifications):**

1. In Firebase Console, go to iOS app settings
2. Download `GoogleService-Info.plist`
3. Save to project root: `./GoogleService-Info.plist`

**IMPORTANT:** Both files are in `.gitignore` - never commit them!

### Step 3: Upload Firebase Config Files as EAS Environment Variables

Since these files are gitignored, EAS Build won't have access to them during the build. You need to upload them as **EAS environment variables** with type `file`.

**Upload google-services.json (Android):**

```bash
# Upload the file to EAS as an environment variable
eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

**Upload GoogleService-Info.plist (iOS):**

```bash
# Upload the file to EAS as an environment variable
eas env:create --scope project --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist
```

**Verify environment variables were uploaded:**

```bash
# List all environment variables for your project
eas env:list

# Should show:
# Name: GOOGLE_SERVICES_JSON (Type: file)
# Name: GOOGLE_SERVICE_INFO_PLIST (Type: file)
```

**How it works:**
1. You upload the file as an environment variable with type `file`
2. During EAS build, the file is created at a temporary location and `process.env.VARIABLE_NAME` is set to that path
3. Your `app.config.js` reads the path from `process.env.GOOGLE_SERVICES_JSON` (or falls back to local file for development)
4. EAS environment variables are **automatically available** - no need to reference them in `eas.json`
5. Build proceeds with the Firebase config
6. After build, the file is discarded (keeps it secure)

**⚠️ Important Notes:**
- You only need to upload these **once per project**
- Upload happens from your local machine (files must exist locally first)
- If you update the files (e.g., add new Firebase feature), delete and re-upload:
  ```bash
  eas env:delete --scope project --name GOOGLE_SERVICES_JSON
  eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
  ```
- Environment variables are **project-scoped** - shared across all builds for this project
- Environment variables are **encrypted** and stored securely on EAS servers
- Note: The old `eas secret:*` commands are deprecated - always use `eas env:*` instead

---

## 🔨 Building Your First Development Build

**Before building, ensure:**
- ✅ EAS initialized (`eas init`)
- ✅ Firebase config files uploaded as environment variables (see Step 3 above)

### Android (Easiest - No Setup Required)

```bash
# Build development APK
eas build --profile development --platform android

# Wait 5-10 minutes...
# Download APK from link provided
# Install on Android device
```

**Note:** First build is slow (~10-15 min). Subsequent builds are faster (~5-7 min).

**What EAS does automatically:**
1. Creates file from `GOOGLE_SERVICES_JSON` environment variable and sets the path in `process.env`
2. Your `app.config.js` reads this path and configures Firebase
3. Runs the build with Firebase config
4. Deletes the file after build (keeps it secure)

### iOS

You have multiple options for iOS development:

#### Option A: iOS Simulator (Mac Only, No Apple Account)

```bash
# Build for iOS Simulator - 100% free, no Apple account needed!
eas build --profile development --platform ios --local

# Requires Mac computer
# After build, open with Simulator app
```

**Pros:**
- ✅ No Apple account needed
- ✅ Free
- ✅ Fast iteration

**Cons:**
- ❌ Mac required
- ❌ Can't test on physical device
- ❌ Can't test push notifications (needs real device)

#### Option B: Physical Device (Free Apple ID)

**IMPORTANT: One-time Apple Developer setup required**

Before building, set up your free Apple Developer account:

1. **Go to https://developer.apple.com/**
2. **Sign in with your Apple ID**
3. **Click "Account"**
4. **Accept the Apple Developer Agreement** (required!)
5. This creates your "Personal Team" (free)

Then build:

```bash
# Build for physical iOS device
eas build --profile development --platform ios
```

**First time:** EAS will prompt you to:
1. Enter your Apple ID (the one you set up above)
2. Automatically create signing certificates
3. Register your device(s)

**After build completes:**
1. Download IPA from link
2. Install via [Apple Configurator 2](https://apps.apple.com/us/app/apple-configurator-2/id1037126344) (Mac)
3. Or scan QR code on device to install directly

#### iOS Encryption Declaration

**Already configured!** The app includes `ITSAppUsesNonExemptEncryption: false` in `app.config.js`.

**Why this matters:**
- Apple requires all apps to declare whether they use encryption
- YiChat only uses standard HTTPS/TLS (via Firebase)
- This qualifies for an **exemption** from export compliance documentation
- Setting to `false` means no additional compliance paperwork needed

**If you modify the app to add custom encryption:**
- End-to-end encryption (beyond HTTPS)
- Custom cryptographic algorithms
- Proprietary encryption protocols

Then you must:
1. Change `ITSAppUsesNonExemptEncryption: true` in `app.config.js`
2. Complete Apple's export compliance documentation
3. Potentially file export compliance with U.S. government

For standard Firebase apps with only HTTPS, `false` is correct.

---

## 📱 Using Development Builds

Once installed, development builds work like Expo Go:

```bash
# Start dev server
npm start

# Development build on your device will auto-connect
# Hot reload works!
# All native features available!
```

**Tips:**
- Keep development build installed on device
- Only rebuild when native dependencies change
- Use Expo Go for quick UI iteration, dev build for feature testing

---

## 🎨 Build Profiles Explained

### `development` - Daily Development
```bash
eas build --profile development --platform android
```

**Features:**
- Full debugging
- Fast refresh
- Connects to local dev server
- All native features

**Use for:**
- Testing push notifications
- App lifecycle testing
- Background sync
- Daily development

### `preview` - Sharing with Testers
```bash
eas build --profile preview --platform android
```

**Features:**
- Production-like build
- No debugging
- Standalone (doesn't connect to dev server)
- Shareable link

**Use for:**
- Sharing with testers
- QA testing
- Demo builds

### `production` - App Store/Play Store
```bash
eas build --profile production --platform all
```

**Features:**
- Optimized for production
- Code minification
- Ready for store submission

**Use for:**
- App Store submission (iOS)
- Play Store submission (Android)

---

## 🔔 Push Notifications Setup

### Android

1. **Ensure google-services.json is configured** (done above)

2. **Test push notifications:**
   ```bash
   # In Expo dashboard or Firebase Console
   # Send test notification to your device
   ```

3. **Verify background notifications work:**
   - Force quit app
   - Send notification
   - Should still receive it!

### iOS

1. **Development push notifications work automatically** with development builds

2. **For production APNs:**
   - Need Apple Developer Program ($99/year)
   - Configure in Expo dashboard
   - Upload APNs key from Apple Developer portal

**For development:** Free Apple ID + development build = push notifications work!

---

## 🛠️ Common Commands

```bash
# Build development (daily use)
eas build --profile development --platform android
eas build --profile development --platform ios

# Build both platforms
eas build --profile development --platform all

# Build preview (testers)
eas build --profile preview --platform android

# Build production (store submission)
eas build --profile production --platform all

# Check build status
eas build:list

# View build logs
eas build:view [build-id]

# Cancel a build
eas build:cancel [build-id]
```

---

## 📊 Build Status Monitoring

**View builds in browser:**
```bash
eas build:list
# Click on build link to view in browser
```

**Monitor in terminal:**
```bash
# Follow build progress
eas build --profile development --platform android

# Shows build queue position
# Shows build logs in real-time
# Provides download link when done
```

---

## 🐛 Troubleshooting

### Build fails with "You have no team associated with your Apple account"

**This means your Apple Developer account isn't set up yet.**

**Solution:**
1. Go to https://developer.apple.com/
2. Sign in with your Apple ID
3. Click "Account" in the top navigation
4. **Accept the Apple Developer Agreement**
5. Wait a few minutes for Apple to process
6. Try building again with `eas build --platform ios`

**Alternative - Use iOS Simulator instead (no Apple account needed):**
```bash
# If you have a Mac, build for simulator instead
eas build --profile development --platform ios --local
```

### Build fails with "Invalid credentials"

**iOS:**
```bash
# Clear credentials and re-authenticate
eas credentials
# Select "Remove credentials" → "All credentials"
# Then rebuild - EAS will re-create them
```

### "Could not find google-services.json"

**If building locally:**
```bash
# Ensure file exists in project root
ls -la google-services.json

# Should show: google-services.json

# Ensure app.config.js references it
cat app.config.js | grep googleServicesFile

# Should show: googleServicesFile: "./google-services.json"
```

**If building with EAS:**
```bash
# Ensure environment variable was uploaded
eas env:list

# Should show GOOGLE_SERVICES_JSON

# If missing, upload it:
eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

**If you need to update the file:**
```bash
# Delete old environment variable
eas env:delete --scope project --name GOOGLE_SERVICES_JSON

# Upload new version
eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

### Build succeeds but can't install on device

**Android:**
- Enable "Install from Unknown Sources" in device settings
- Check APK isn't corrupted (re-download)

**iOS:**
- Device must be registered with your Apple ID
- Use Apple Configurator 2 to install
- Or use QR code link from EAS

### Push notifications don't work

**Development builds:**
- Should work automatically with google-services.json (Android)
- Should work automatically with free Apple ID (iOS)

**If still broken:**
```bash
# Verify Firebase configuration
cat .env.local | grep FIREBASE

# Verify notification permissions in app
# Check expo-notifications is configured in app.config.js
cat app.config.js | grep expo-notifications
```

### App won't connect to dev server

```bash
# Ensure both device and computer on same network
# Restart dev server
npm start

# Ensure development build (not preview/production)
# Shake device → "Reload"
```

---

## 💰 Cost

**Development & Testing:**
- **Android:** 100% free forever
- **iOS Simulator:** 100% free (requires Mac)
- **iOS Physical Device:** Free with Apple ID (no $99 license needed)
  - Requires one-time Apple Developer account setup
  - Limited to your own devices

**Distribution (App Stores):**
- **Android:** $25 one-time fee (Google Play Console)
- **iOS:** $99/year (Apple Developer Program - required for App Store)

**EAS Build:**
- **Free tier:** Generous free builds
- **Paid plans:** For priority builds, more build minutes, or team features

**Summary for YiChat Development:**
- Start with Android (100% free, no setup)
- Add iOS later when ready to test notifications on real device

---

## 🚀 Next Steps

After successful build:

1. ✅ Install development build on your device
2. ✅ Test push notifications (force quit app, send notification)
3. ✅ Test app lifecycle (background/foreground transitions)
4. ✅ Test offline message queuing
5. ✅ Start building AI features!

**Quick test:**
```bash
# Terminal 1: Start dev server
npm start

# Device: Open development build
# Should auto-connect and show your app
# Make a change in code
# Should hot reload instantly!
```

---

## 📚 Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Build Configuration](https://docs.expo.dev/build/eas-json/)
- [Push Notifications Guide](https://docs.expo.dev/push-notifications/overview/)
- [Apple Developer](https://developer.apple.com/)
- [Google Play Console](https://play.google.com/console)

---

## ✅ Complete Setup Checklist

Before your first build:

### EAS Setup
- [ ] EAS CLI installed (`npm install -g eas-cli`)
- [ ] Logged into Expo (`eas login`)
- [ ] Project initialized (`eas init`)

### Firebase Files (Local)
- [ ] `google-services.json` downloaded and in project root
- [ ] `GoogleService-Info.plist` downloaded and in project root
- [ ] Both files work locally (`npm start` in Expo Go)

### EAS Environment Variables (For Cloud Builds)
- [ ] `GOOGLE_SERVICES_JSON` uploaded (`eas env:create...`)
- [ ] `GOOGLE_SERVICE_INFO_PLIST` uploaded (`eas env:create...`)
- [ ] Environment variables verified (`eas env:list` shows both)

### Environment Variables
- [ ] `.env.local` has all 6 Firebase web config variables
- [ ] Variables start with `EXPO_PUBLIC_FIREBASE_*`

### iOS Configuration (Already Done)
- [x] Encryption declaration set (`ITSAppUsesNonExemptEncryption: false`)
- [x] Background modes configured for notifications
- [x] Bundle identifier set

### Ready to Build
- [ ] Run `eas build --profile development --platform android`
- [ ] Or `eas build --profile development --platform ios`

**You're all set for EAS Build! 🎉**

---

## 📝 Summary: Local vs EAS Files

| File | Local Development | EAS Build |
|------|-------------------|-----------|
| `.env.local` | ✅ Used directly | ❌ Gitignored (not uploaded) |
| `google-services.json` | ✅ Used directly | ❌ Gitignored, use EAS env variable instead |
| `GoogleService-Info.plist` | ✅ Used directly | ❌ Gitignored, use EAS env variable instead |
| EAS Environment Variables | ❌ Not used | ✅ Created as files during build |

**Key Points:**
- Local files stay local (gitignored for security)
- EAS environment variables (type `file`) provide the same files during cloud builds
- Your `app.config.js` uses `process.env.VARIABLE_NAME || "./local-file.json"` pattern for fallback
- EAS environment variables are **automatically available** during builds - no eas.json configuration needed
- During local development, the fallback path (`"./local-file.json"`) is used
- The old `eas secret:*` commands are deprecated - use `eas env:*` instead
