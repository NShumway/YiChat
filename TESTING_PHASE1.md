# Phase 1: Authentication Testing Guide

## 🎯 Test Coverage Summary

This guide covers all authentication features implemented in Phase 1:
- ✅ Email/Password Sign Up
- ✅ Email/Password Login
- ✅ Auth State Persistence
- ✅ Logout
- ✅ Form Validation
- ✅ Firestore Security Rules

## ⚠️ Google Sign-In Status

Google Sign-In code exists but is **NOT FUNCTIONAL** in Expo Go due to OAuth redirect URI limitations. It will only work in production standalone builds. For MVP testing, use **email/password authentication only**.

---

## Prerequisites

### Before Testing:
1. ✅ Firebase project created and configured
2. ✅ Email/Password authentication enabled in Firebase Console
3. ✅ Firestore database created (named "yichat")
4. ✅ Firestore API enabled in Google Cloud Console
5. ✅ `.env.local` file configured with Firebase credentials
6. ✅ Expo dev server running (`npm start`)

### NOT Required for MVP Testing:
- ❌ Google Sign-In setup (not functional in Expo Go)
- ❌ Production security rules (test mode is fine for development)

### Check Your Setup:
```bash
# Verify environment variables
cat .env.local

# Should show:
# FIREBASE_API_KEY=...
# FIREBASE_AUTH_DOMAIN=...
# FIREBASE_PROJECT_ID=...
# FIREBASE_STORAGE_BUCKET=...
# FIREBASE_MESSAGING_SENDER_ID=...
# FIREBASE_APP_ID=...
# GOOGLE_WEB_CLIENT_ID=...
```

---

## Test 1: Email/Password Sign Up ⭐ CRITICAL

### Steps:
1. Launch app in Expo Go
2. Should land on **Login** screen
3. Tap **"Sign Up"** link at bottom
4. Fill in form:
   ```
   Display Name: Test User
   Email: testuser@example.com
   Password: password123
   Confirm Password: password123
   Preferred Language: Spanish 🇪🇸
   ```
5. Tap **"Create Account"** button

### Expected Results:
- ✅ Loading spinner shows on button
- ✅ Button disabled during submission
- ✅ After 2-3 seconds, navigates to main chat screen
- ✅ Shows profile section with:
  - Avatar with "T" (first letter of name)
  - Name: "Test User"
  - Spanish flag 🇪🇸 and "ES" text
  - Green online status dot
- ✅ Info box shows "✅ Phase 1 Complete!"

### Verify in Firebase Console:
1. Open **Firestore Database**
2. Navigate to `users` collection
3. Find document with your UID
4. Verify fields:
   ```javascript
   {
     uid: "...",
     displayName: "Test User",
     email: "testuser@example.com",
     preferredLanguage: "es",
     status: "online",
     createdAt: Timestamp,
     lastSeen: Timestamp
   }
   ```

### Verify in Firebase Authentication:
1. Open **Authentication** → **Users** tab
2. Should see new user with email "testuser@example.com"
3. Provider: "Password"

---

## ~~Test 2: Google Sign-In~~ ❌ SKIPPED

**Status:** Google Sign-In does NOT work in Expo Go due to OAuth redirect URI limitations.

**Reason:** Google's Web OAuth requires real domains but Expo Go uses `exp://` scheme which is rejected.

**Future:** Will work in production standalone builds (EAS Build) only.

**For MVP:** Email/password authentication only.

---

## Test 3: Logout and Login ⭐ CRITICAL

### Part A: Logout
1. From main screen (logged in), tap **"Log Out"** button
2. Alert appears: "Are you sure you want to log out?"
3. Tap **"Log Out"** in alert

**Expected:**
- ✅ Returns to Login screen
- ✅ All user data cleared from app

**Verify in Firestore:**
- User's `status` field updated to "offline"
- `lastSeen` timestamp updated

### Part B: Login
1. On Login screen, enter:
   ```
   Email: testuser@example.com
   Password: password123
   ```
2. Tap **"Log In"** button

**Expected:**
- ✅ Loading spinner shows
- ✅ After 1-2 seconds, navigates to main screen
- ✅ Shows same user profile as before (name, language preserved)
- ✅ Online status restored

**Verify in Firestore:**
- `status` field updated back to "online"
- `lastSeen` timestamp updated

---

## Test 4: Auth State Persistence ⭐ CRITICAL

### Test 4A: App Restart
1. Log in with email/password or Google
2. Verify you're on main screen
3. **Force quit the app** (swipe up from app switcher / close completely)
4. Wait 5 seconds
5. Reopen app

**Expected:**
- ✅ Shows loading screen briefly (<1 second)
- ✅ Automatically logs you in (no login screen shown)
- ✅ Goes directly to main chat screen
- ✅ User data still present (name, language, etc.)

### Test 4B: App Backgrounding
1. Log in
2. Press home button (app goes to background)
3. Wait 30 seconds
4. Reopen app

**Expected:**
- ✅ Still logged in
- ✅ No re-authentication needed
- ✅ Immediate access to main screen

### Test 4C: After Phone Restart
1. Log in
2. Restart your phone
3. Open app

**Expected:**
- ✅ Still logged in (Firebase persists across device restarts)

---

## ~~Test 5: Google Sign-In (Returning User)~~ ❌ SKIPPED

Not applicable - Google Sign-In not implemented in MVP.

---

## Test 6: Form Validation

### Test 6A: Missing Fields
1. Go to Sign Up screen
2. Leave **Display Name** empty
3. Tap "Create Account"

**Expected:** ✅ Alert: "Please enter your name"

4. Fill name, leave **Email** empty
5. Tap "Create Account"

**Expected:** ✅ Alert: "Please enter your email"

### Test 6B: Invalid Email
1. Enter email: `notanemail`
2. Tap "Create Account"

**Expected:** ✅ Alert: "Please enter a valid email address"

### Test 6C: Weak Password
1. Enter password: `123`
2. Confirm password: `123`
3. Tap "Create Account"

**Expected:** ✅ Alert: "Password must be at least 6 characters"

### Test 6D: Password Mismatch
1. Enter password: `password123`
2. Confirm password: `password456`
3. Tap "Create Account"

**Expected:** ✅ Alert: "Passwords do not match"

### Test 6E: Email Already Exists
1. Try to sign up with email from Test 1 again
2. Tap "Create Account"

**Expected:** ✅ Alert: "This email is already registered. Please log in instead."

### Test 6F: Invalid Login
1. Go to Login screen
2. Enter wrong password
3. Tap "Log In"

**Expected:** ✅ Alert: "Invalid email or password"

---

## Test 7: Network Conditions

### Test 7A: Offline Sign Up
1. **Enable airplane mode** on device
2. Go to Sign Up screen
3. Fill in form
4. Tap "Create Account"

**Expected:** ✅ Alert: "Network error. Please check your connection."

### Test 7B: Slow Network
1. Disable airplane mode
2. Use iOS Network Link Conditioner or Android equivalent
3. Set to "3G" or "Edge"
4. Try to sign up

**Expected:**
- ✅ Loading spinner shows longer (5-10 seconds)
- ✅ Eventually succeeds or shows timeout error
- ✅ App remains responsive (no freeze)

---

## Test 8: UI/UX Testing

### Visual Checks:
- ✅ Language selection chips scroll horizontally
- ✅ Selected language chip is blue background
- ✅ Unselected chips are white with gray border
- ✅ "Continue with Google" button has:
  - White background
  - Gray border
  - Blue "G" icon
  - Black text
- ✅ Email/password buttons are blue
- ✅ Loading indicators are white (blue buttons) or black (Google button)

### Keyboard Behavior:
- ✅ Keyboard doesn't cover input fields
- ✅ Can scroll form when keyboard is open (Sign Up screen)
- ✅ Tapping "Next" on keyboard moves to next field
- ✅ Tapping "Done" on password field submits form

### Navigation:
- ✅ "Sign Up" link on Login screen works
- ✅ "Log In" link on Sign Up screen works
- ✅ Can't navigate back to auth screens when logged in
- ✅ Can't access main app when logged out

### Status Indicators:
- ✅ Green dot = Online
- ✅ Gray dot = Offline (after logout)
- ✅ Orange dot = Reconnecting (not used in Phase 1)

---

## Test 9: Security Testing

### Test 9A: Firestore Security Rules
1. Open Firebase Console → **Firestore Database**
2. Click **Rules** tab
3. Click **Simulator** button

**Test unauthenticated read:**
- Type: `get`
- Path: `/users/test-uid`
- Authenticated: ❌ (unchecked)
- Click "Run"
- **Expected:** ❌ Denied (with permission-denied error)

**Test authenticated read:**
- Type: `get`
- Path: `/users/test-uid`
- Authenticated: ✅ (checked)
- Firebase UID: (any value)
- Click "Run"
- **Expected:** ✅ Allowed

**Test unauthorized write:**
- Type: `set`
- Path: `/users/other-user-uid`
- Authenticated: ✅
- Firebase UID: `my-uid` (different from path)
- Data: `{ displayName: "Hacker" }`
- Click "Run"
- **Expected:** ❌ Denied (users can't write to other profiles)

### Test 9B: Environment Variable Security
```bash
# Verify .env.local is in .gitignore
cat .gitignore | grep .env.local

# Expected output: .env.local
```

**Check Git:**
```bash
git status
# Should NOT show .env.local as untracked
```

---

## Test 10: Multi-Account Testing

### Test 10A: Two Email Accounts
1. Sign up with email A: `user1@example.com`
2. Log out
3. Sign up with email B: `user2@example.com`
4. Verify both accounts exist in Firebase Console

**Expected:**
- ✅ Two separate user documents in Firestore
- ✅ Both users in Firebase Authentication
- ✅ Can switch between accounts by logging out/in

### Test 10B: Email + Google Same Address
1. Sign up with email: `test@gmail.com`
2. Log out
3. Try to sign in with Google using `test@gmail.com`

**Expected (depends on Firebase config):**
- ✅ May automatically link accounts (seamless)
- OR shows error: "An account already exists with this email using a different sign-in method"

---

## Test 11: Edge Cases

### Test 11A: Very Long Display Name
1. Sign up with display name: `This Is A Very Long Display Name That Exceeds Normal Length`

**Expected:** ✅ Accepted, may truncate in UI if too long

### Test 11B: Special Characters in Name
1. Sign up with display name: `José García-López 李明`

**Expected:** ✅ Accepted and displayed correctly

### Test 11C: Rapid Button Taps
1. Fill in sign up form
2. Tap "Create Account" 5 times rapidly

**Expected:** ✅ Button disabled after first tap, only one account created

---

## Performance Benchmarks

Use a stopwatch or `console.time()` to measure:

| Action | Target | Pass/Fail |
|--------|--------|-----------|
| App launch to login screen | < 2s | |
| Email/password sign up | < 3s | |
| Email/password login | < 2s | |
| Google sign-in (OAuth flow) | < 5s | |
| Auth state check on restart | < 1s | |
| Logout | < 1s | |

**How to measure:**
```javascript
// Add to your code temporarily:
console.time('signup');
// ... sign up code ...
console.timeEnd('signup');  // Logs: signup: 2145ms
```

---

## Common Issues & Solutions

### Issue: "Google sign-in failed"
**Solutions:**
1. Check `GOOGLE_WEB_CLIENT_ID` is correct in `.env.local`
2. Restart Expo dev server
3. Verify Google provider is enabled in Firebase Console
4. Check browser allows popups

### Issue: "Permission denied" in Firestore
**Solutions:**
1. Deploy security rules: `firebase deploy --only firestore:rules`
2. Check rules file exists: `firestore.rules`
3. Verify user is authenticated

### Issue: Auth doesn't persist after restart
**Solutions:**
1. Check `onAuthStateChanged` is in `app/_layout.tsx`
2. Clear app data and reinstall
3. Verify Firebase SDK version is correct

### Issue: Loading screen shows forever
**Solutions:**
1. Check Firebase config in `.env.local`
2. Verify network connection
3. Check console for errors

---

## Test Sign-Off Checklist

Before marking Phase 1 as complete:

- [ ] Test 1: Email/Password Sign Up - PASSED
- [ ] Test 3: Logout and Login - PASSED
- [ ] Test 4: Auth State Persistence - PASSED
- [ ] Test 6: Form Validation (all sub-tests) - PASSED
- [ ] Test 7: Network Conditions - PASSED
- [ ] Test 8: UI/UX - PASSED
- [ ] Test 9: Security - PASSED
- [ ] Test 10: Multi-Account (email only) - PASSED
- [ ] Test 11: Edge Cases - PASSED
- [ ] Performance Benchmarks - PASSED
- [ ] No console errors during normal usage
- [ ] Works on both iOS and Android (Expo Go)

### Not Required for MVP:
- ⏭️ Google Sign-In tests (skipped - not functional in Expo Go)

---

## Next Steps

After Phase 1 testing passes:
1. ✅ Mark Phase 1 as complete in tasks.md
2. 🚀 Begin Phase 2: Core Messaging Infrastructure
3. 📝 Keep Phase 1 test account credentials for Phase 2 testing

