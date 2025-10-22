# Google Authentication Setup for YiChat

## Development vs Production

### Development (Expo Go) - Use Web Client ID
- ✅ Works with dynamic IPs
- ✅ No redirect URI configuration needed
- ✅ Easy testing on multiple devices

### Production (Standalone Builds) - Use Platform-Specific IDs
- iOS builds need iOS Client ID
- Android builds need Android Client ID
- More secure, platform-specific

---

## Setup for Development (Current Stage)

### 1. Create a Web OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Choose **Web application**
4. Name: `YiChat Web (Development)`
5. **Authorized JavaScript origins** (add these):
   ```
   http://localhost
   http://localhost:8081
   ```
6. **Authorized redirect URIs** (leave empty for now - expo-auth-session handles it)
7. Click **Create**
8. Copy the **Client ID** (looks like: `123456789-abc.apps.googleusercontent.com`)

### 2. Add to .env.local

```bash
# Firebase Config
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...

# Google OAuth - Web Client ID (for Expo Go development)
GOOGLE_WEB_CLIENT_ID=123456789-abc.apps.googleusercontent.com

# Optional: Keep iOS/Android for future production builds
# GOOGLE_IOS_CLIENT_ID=...
# GOOGLE_ANDROID_CLIENT_ID=...
```

### 3. Restart Expo

```bash
# Stop current server (Ctrl+C)
npm start
```

### 4. Test

1. Open app in Expo Go
2. Go to Login screen
3. Tap "Continue with Google"
4. Should open browser with Google sign-in
5. Select account
6. Should redirect back to app successfully! ✅

---

## Troubleshooting

### Error: "invalid_request" or "redirect_uri mismatch"
**Solution:** Make sure you're using the **Web Client ID**, not iOS/Android Client ID

### Error: "Client Id property iosClientId must be defined"
**Solution:** We already fixed this - the code uses dummy values when not configured

### Google sign-in opens browser but doesn't redirect back
**Solutions:**
1. Make sure you're using Web Client ID
2. Check that Expo dev server is running
3. Try reloading the app (shake device → Reload)

### Button doesn't appear
**Solution:** Check that `GOOGLE_WEB_CLIENT_ID` is in `.env.local` and dev server was restarted

---

## Future: Production Builds

When you build standalone apps (not Expo Go):

### For iOS:
1. Create iOS OAuth Client ID in Google Cloud Console
2. Set Bundle ID: `com.yichat.app` (from app.config.js)
3. Add to `.env.local`: `GOOGLE_IOS_CLIENT_ID=...`
4. Build with EAS: `eas build --platform ios`

### For Android:
1. Get SHA-1 fingerprint:
   ```bash
   eas credentials
   ```
2. Create Android OAuth Client ID in Google Cloud Console
3. Set package name: `com.yichat.app`
4. Add SHA-1 fingerprint
5. Add to `.env.local`: `GOOGLE_ANDROID_CLIENT_ID=...`
6. Build with EAS: `eas build --platform android`

---

## Current Configuration Summary

✅ **What works now:**
- Email/password authentication (fully functional)
- Google Sign-In with Web Client ID (for development)
- Auth state persistence
- Logout

🚧 **What's pending:**
- Google Sign-In for production iOS builds (need iOS Client ID when ready)
- Google Sign-In for production Android builds (need Android Client ID when ready)

---

## Security Notes

✅ **Safe to store in .env.local:**
- Firebase API Key (public by design, protected by Security Rules)
- Google OAuth Client IDs (public, used for authentication flow)

❌ **NEVER store in .env.local or client code:**
- Google OAuth Client Secret (server-side only!)
- Firebase Admin SDK keys
- OpenAI API keys (use Cloud Functions instead)

---

**Need help?** Check the error message and match it to the troubleshooting section above.

