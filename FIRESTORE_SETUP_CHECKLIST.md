# Firestore Setup Checklist

## The Error You're Seeing:
```
PERMISSION_DENIED: Cloud Firestore API has not been used in project yichat-3f1b4 
before or it is disabled.
```

This means the **Firestore API** needs to be explicitly enabled in Google Cloud Console.

---

## Step-by-Step Fix:

### 1. Enable Firestore API in Google Cloud Console

**Click this direct link:**
https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=yichat-3f1b4

You should see a page that says **"Cloud Firestore API"**

**Do you see:**
- ✅ A blue button that says **"ENABLE"**? → Click it!
- ✅ Already shows **"API enabled"**? → Continue to step 2

### 2. Verify in Firebase Console

Go to: https://console.firebase.google.com/project/yichat-3f1b4/firestore

**Check what you see:**

**Option A: You see "Get started" or "Create database" button**
- This means Firestore is NOT set up
- Click **"Create database"**
- Choose **"Start in test mode"**
- Select location (e.g., `us-central1`)
- Click **"Enable"**
- **Wait 2-3 minutes** for it to activate

**Option B: You see your Firestore database with collections/documents**
- This means Firestore IS set up
- But the API might not be enabled (see step 1)

**Option C: You see "Firestore is being provisioned"**
- Wait 2-3 minutes and refresh

---

## 3. Verify Project ID Matches

Check your `.env.local` file:
```bash
FIREBASE_PROJECT_ID=yichat-3f1b4
```

Make sure this **exactly matches** what you see in Firebase Console (top left, project name dropdown).

---

## 4. Test Connection Again

After enabling Firestore API and waiting 2-3 minutes:

```bash
node scripts/test-firebase-connection.js
```

**Expected output:**
```
✅ Firebase App initialized
✅ Successfully wrote to Firestore!
✅ Successfully read from Firestore!
🎉 All tests passed!
```

---

## Common Issues:

### "I already created Firestore but still getting errors"
- The **Firestore Database** and **Firestore API** are different things
- You need BOTH:
  1. Firestore Database created in Firebase Console
  2. Firestore API enabled in Google Cloud Console

### "The enable link doesn't work"
- Make sure you're logged into the correct Google account
- Try this alternative:
  1. Go to https://console.cloud.google.com
  2. Select project `yichat-3f1b4`
  3. Search for "Firestore" in top search bar
  4. Click "Cloud Firestore API"
  5. Click "ENABLE"

### "It says I need billing enabled"
- Firebase/Firestore has a free tier
- You shouldn't need billing for development
- If prompted, use the Spark (free) plan

---

## Still Not Working?

Take a screenshot of:
1. Your Firebase Console Firestore page
2. The error message you're getting
3. The Google Cloud Console API page

This will help diagnose the exact issue.

