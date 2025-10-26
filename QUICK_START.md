# Quick Start Guide

New to the project? Follow these steps in order:

## 1️⃣ Clone and Install (5 minutes)

```bash
git clone <repository-url>
cd YiChat
npm install
```

## 2️⃣ Firebase Setup (20 minutes)

**📖 Follow: [FIREBASE_APP_SETUP.md](./FIREBASE_APP_SETUP.md)**

You'll:
- Create a Firebase project (or use existing)
- Add Web, Android, and iOS apps
- Download config files
- Deploy security rules

**Result:** You'll have:
- `.env.local` with Firebase web config
- `google-services.json` in project root
- `GoogleService-Info.plist` in project root

## 3️⃣ EAS Build Setup (20 minutes)

**📖 Follow: [EAS_SETUP.md](./EAS_SETUP.md)**

You'll:
- Install EAS CLI
- Login to Expo
- Initialize EAS project
- Build your first development build

**Result:** A development APK/IPA running on your device with full native features!

## 4️⃣ Start Developing!

```bash
# Start dev server
npm start

# Your development build will auto-connect
# Make changes, see them instantly with hot reload!
```

---

## 📖 Additional Guides

| Guide | Purpose | When to Read |
|-------|---------|--------------|
| [README.md](./README.md) | Project overview | First |
| [FIREBASE_APP_SETUP.md](./FIREBASE_APP_SETUP.md) | Complete Firebase setup | During setup |
| [EAS_SETUP.md](./EAS_SETUP.md) | EAS Build guide | During setup |
| [GOOGLE_SERVICES_EXPLAINED.md](./GOOGLE_SERVICES_EXPLAINED.md) | Why we gitignore config files | If curious |
| [PRD.md](./PRD.md) | Product requirements | Planning features |
| [tasks.md](./tasks.md) | Implementation details | Building features |
| [architecture.md](./architecture.md) | System design | Understanding architecture |
| [CLAUDE.md](./CLAUDE.md) | AI context for development | AI features work |

---

## ⏱️ Time Estimates

- **First-time setup:** ~45 minutes
  - Clone & install: 5 min
  - Firebase setup: 20 min
  - EAS build: 20 min

- **Subsequent builds:** ~5 minutes
  - Only rebuild when native deps change
  - Otherwise just `npm start`

---

## 🆘 Troubleshooting

See troubleshooting sections in:
- [FIREBASE_APP_SETUP.md](./FIREBASE_APP_SETUP.md#-common-issues)
- [EAS_SETUP.md](./EAS_SETUP.md#-troubleshooting)

---

## ✅ Verification Checklist

After setup, you should have:

**Files:**
- [x] `.env.local` with 6 Firebase variables
- [x] `google-services.json` in project root
- [x] `GoogleService-Info.plist` in project root
- [x] Development build installed on device

**Firebase Console:**
- [x] 3 apps registered (Web, Android, iOS)
- [x] Firestore database named `yichat`
- [x] Authentication enabled
- [x] Storage enabled
- [x] Security rules deployed

**Can You:**
- [x] Run `npm start` successfully
- [x] Open development build on device
- [x] See app connect to dev server
- [x] Make code change and see hot reload
- [x] Create account and login

**If all checked, you're ready to develop!** 🎉
