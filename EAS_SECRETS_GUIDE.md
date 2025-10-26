# EAS Secrets - Quick Reference

## Why EAS Secrets?

**Problem:** Firebase config files (`google-services.json`, `GoogleService-Info.plist`) are in `.gitignore`, so EAS Build can't access them during cloud builds.

**Solution:** Upload them as EAS Secrets - encrypted files stored on EAS servers that are injected into your build environment.

---

## 📤 Upload Secrets (One-Time Setup)

After you've downloaded the Firebase config files to your project root, upload them to EAS:

```bash
# Android config
eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json

# iOS config
eas secret:create --scope project --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist
```

**Verify:**
```bash
eas secret:list
```

Should show:
```
Name: GOOGLE_SERVICES_JSON (Type: file)
Name: GOOGLE_SERVICE_INFO_PLIST (Type: file)
```

---

## 🔄 How It Works

### Local Development (Expo Go / `npm start`)
```
Your local files are used directly:
./google-services.json  ← Used
./GoogleService-Info.plist  ← Used
```

### EAS Cloud Build
```
1. Your code is uploaded (but NOT gitignored files)
2. EAS injects secrets into build environment:
   GOOGLE_SERVICES_JSON → ./google-services.json
   GOOGLE_SERVICE_INFO_PLIST → ./GoogleService-Info.plist
3. Build proceeds normally
4. Files are discarded after build
```

---

## 🔧 Update Secrets

If you change Firebase configuration (add a new feature, change settings, etc.):

```bash
# Delete old secret
eas secret:delete --scope project --name GOOGLE_SERVICES_JSON

# Upload new version
eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

Repeat for iOS if needed.

---

## 📋 Complete Workflow

### First Time Setup:
1. Download `google-services.json` from Firebase Console
2. Download `GoogleService-Info.plist` from Firebase Console
3. Place both in project root
4. Upload both as EAS Secrets (commands above)
5. Build with EAS: `eas build --profile development --platform android`

### Daily Development:
1. `npm start` (uses local files)
2. Make changes, test locally
3. When ready: `eas build ...` (uses EAS secrets)

### When Firebase Config Changes:
1. Download new files from Firebase Console
2. Update local files
3. Delete and re-upload EAS secrets
4. Rebuild

---

## 🔍 Troubleshooting

### "Could not find google-services.json" during EAS build

```bash
# Check if secret exists
eas secret:list

# If missing, upload it
eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

### Local files work but EAS build fails

You forgot to upload secrets! Run the upload commands above.

### Want to verify what's uploaded

```bash
# List secrets (shows names, not content - content is encrypted)
eas secret:list

# To see if it's the right file, delete and re-upload
eas secret:delete --scope project --name GOOGLE_SERVICES_JSON
eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

---

## 🔐 Security Notes

- ✅ Secrets are **encrypted** on EAS servers
- ✅ Only accessible during **your builds**
- ✅ Automatically **discarded** after build
- ✅ **Project-scoped** - not shared across projects
- ✅ Can't be downloaded (can only be replaced)

These files contain client-side API keys (safe to be in app bundle), but keeping them as secrets:
1. Prevents accidental commits
2. Allows different configs for dev/staging/prod
3. Keeps your Firebase project structure private

---

## 📖 Related Docs

- [EAS_SETUP.md](./EAS_SETUP.md) - Complete EAS Build setup
- [FIREBASE_APP_SETUP.md](./FIREBASE_APP_SETUP.md) - Firebase project setup
- [GOOGLE_SERVICES_EXPLAINED.md](./GOOGLE_SERVICES_EXPLAINED.md) - What these files are

---

## ✅ Quick Checklist

Before your first EAS build:

- [ ] `google-services.json` downloaded and in project root
- [ ] `GoogleService-Info.plist` downloaded and in project root
- [ ] Both files uploaded as EAS secrets (`eas secret:list` shows them)
- [ ] Ready to build: `eas build --profile development --platform android`
