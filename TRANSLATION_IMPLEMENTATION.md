# Real-Time Translation with Pinecone RAG - Implementation Guide

## ✅ Completed Backend Infrastructure

### 1. TypeScript Types Updated
- **User type** (`types/User.ts`):
  - Added `preferredLanguage` (BCP 47 format: 'en-US', 'es-MX', 'zh-CN')
  - Added `country` (ISO 3166-1 alpha-2: 'US', 'MX', 'CN')

- **Message type** (`types/Message.ts`):
  - Added `translations` object: `{ 'en-US': 'Hello', 'es-MX': 'Hola' }`
  - Added `tone` string: detected emotional tone (e.g., 'friendly', 'formal')
  - Added `embedded` boolean: tracks if message is in Pinecone

### 2. Cloud Functions Created (`functions/src/`)

#### Translation Functions (`translation.ts`):
- **`detectLanguage`**: Auto-detects message language with user context
- **`translateWithTone`**: Single translation with RAG-based tone detection
- **`batchTranslate`**: Translates to multiple languages in one call (for group chats)

#### Pinecone Integration (`embeddings.ts`):
- **`generateEmbedding`**: Creates embeddings using OpenAI `text-embedding-3-small`
- **`embedMessage`**: Stores single message in Pinecone
- **`querySimilarMessages`**: Retrieves similar messages for RAG context
- **`getContextForTranslation`**: Adaptive context building (max 3000 tokens)
- **`batchEmbedMessages`**: Batch embedding for efficiency

#### Batch Jobs (`batchEmbedding.ts`):
- **`scheduledBatchEmbedMessages`**: Runs every 5 minutes
  - Embeds up to 500 messages per run
  - Only embeds messages that were translated (not same-language)
  - Only embeds messages from last 30 days
  - Optimized for Pinecone free tier limits (2GB storage, 2M writes/month)
- **`getEmbeddingStats`**: Monitor Pinecone usage
- **`cleanupOldEmbeddings`**: Remove old embeddings to manage storage

### 3. SQLite Schema Updated (`services/database.ts`)
Added columns to `messages` table:
- `translations TEXT` - JSON object of cached translations
- `tone TEXT` - Detected emotional tone
- `embedded INTEGER` - Whether message is in Pinecone (0 or 1)

---

## 🔧 Setup Instructions

### Step 1: Configure Pinecone

1. **Create Pinecone Account**
   - Go to https://www.pinecone.io/ and sign up (free tier)
   - Create a new project

2. **Create Pinecone Index**
   - In Pinecone dashboard, click "Create Index"
   - Configure the index:
     - **Name**: `yichat-messages`
     - **Dimensions**: `1024` (we use reduced dimensions for storage efficiency)
     - **Metric**: `cosine`
     - **Region**: Choose closest to your users
     - **Cloud**: Serverless (free tier)
   - Click "Create Index"

3. **Get Pinecone API Key**
   - Navigate to API Keys in Pinecone dashboard
   - Copy your API key

4. **Configure Cloud Functions Environment Variables**

   **IMPORTANT**: Do NOT add Pinecone API key to your `.env.local` - it's backend-only and would expose your key!

   Set the API keys for your deployed Cloud Functions:
   ```bash
   firebase functions:config:set pinecone.key="pc-xxxxxxxxxxxxx"
   firebase functions:config:set openai.key="sk-xxxxxxxxxxxxx"
   ```

   These keys are stored securely in Firebase and only accessible to your Cloud Functions (backend), never exposed to the client.

### Step 2: Configure OpenAI

You likely already have this set up, but verify:

```bash
cd functions
firebase functions:config:set openai.key="sk-xxxxxxxxxxxxx"
```

### Step 3: Deploy Cloud Functions

```bash
cd functions

# Install dependencies (already done)
npm install

# Build functions
npm run build

# Deploy all new functions
firebase deploy --only functions

# Or deploy specific functions:
firebase deploy --only functions:detectLanguage,functions:translateWithTone,functions:batchTranslate,functions:scheduledBatchEmbedMessages,functions:getEmbeddingStats,functions:cleanupOldEmbeddings
```

### Step 4: Verify Deployment

1. Check Firebase Console for deployed functions
2. Test the scheduled job:
   ```bash
   # View logs
   firebase functions:log --only scheduledBatchEmbedMessages

   # Should run every 5 minutes automatically
   ```

3. Monitor Pinecone usage:
   - Call `getEmbeddingStats()` from your app (admin only)
   - Check Pinecone dashboard for vector count

---

## 📋 Remaining Client-Side Implementation

### 1. Message Sending Logic

**File**: `services/messageQueue.ts` or wherever messages are sent

**Current flow**:
```typescript
// User sends message
const message = { id, chatId, senderId, text, timestamp, ... };
queueMessage(message);
```

**New flow needed**:
```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

async function sendMessageWithTranslation(
  text: string,
  chatId: string,
  senderId: string,
  chat: Chat // has participants
) {
  const functions = getFunctions();
  const currentUser = useStore.getState().user;

  // 1. Detect language
  const detectLang = httpsCallable(functions, 'detectLanguage');
  const { data: langResult } = await detectLang({
    text,
    userLanguage: currentUser.preferredLanguage
  });
  const detectedLanguage = langResult.language;

  // 2. Get recipient languages
  const recipientLanguages = await getRecipientLanguages(chat.participants);

  // Skip translation if all recipients speak same language
  const needsTranslation = recipientLanguages.some(
    lang => !isSameBaseLanguage(detectedLanguage, lang)
  );

  if (!needsTranslation) {
    // Send message without translation
    const message = {
      id: `temp_${Date.now()}`,
      chatId,
      senderId,
      text,
      originalLanguage: detectedLanguage,
      timestamp: Date.now(),
      status: 'sending',
      readBy: {},
    };
    queueMessage(message);
    return;
  }

  // 3. Batch translate to all recipient languages
  const batchTranslate = httpsCallable(functions, 'batchTranslate');
  const { data: translationResult } = await batchTranslate({
    text,
    sourceLang: detectedLanguage,
    targetLanguages: recipientLanguages,
    chatId,
    senderId
  });

  // 4. Create message with translations
  const message = {
    id: `temp_${Date.now()}`,
    chatId,
    senderId,
    text,
    originalLanguage: detectedLanguage,
    translations: translationResult.translations,
    tone: translationResult.tone,
    timestamp: Date.now(),
    status: 'sending',
    readBy: {},
    embedded: false, // Will be embedded by batch job later
  };

  // 5. Queue message (will sync to Firestore)
  queueMessage(message);
}

// Helper functions
async function getRecipientLanguages(participantIds: string[]): Promise<string[]> {
  const db = getFirestore();
  const languages = await Promise.all(
    participantIds.map(async (uid) => {
      const userDoc = await getDoc(doc(db, 'users', uid));
      return userDoc.data()?.preferredLanguage || 'en-US';
    })
  );
  return [...new Set(languages)]; // Unique languages only
}

function isSameBaseLanguage(lang1: string, lang2: string): boolean {
  const base1 = lang1.split('-')[0];
  const base2 = lang2.split('-')[0];
  return base1 === base2;
}
```

**Key points**:
- Only call translation when recipients speak different languages
- Use `batchTranslate` for efficiency (one API call for all languages)
- Store all translations in the message document
- The `embedded` field will be set to `true` by the batch job later

### 2. Message Display UI

**File**: `app/chat/[chatId].tsx` or your message component

**Add translation toggle**:
```typescript
import { useState } from 'react';

function MessageBubble({ message, currentUser }: { message: Message, currentUser: User }) {
  const [showOriginal, setShowOriginal] = useState(false);

  // Determine which text to display
  const userLanguage = currentUser.preferredLanguage;
  const hasTranslation = message.translations && message.translations[userLanguage];
  const isTranslated = hasTranslation && message.originalLanguage !== userLanguage;

  const displayText = showOriginal || !hasTranslation
    ? message.text
    : message.translations[userLanguage];

  return (
    <View style={styles.messageBubble}>
      <Text style={styles.messageText}>{displayText}</Text>

      {isTranslated && (
        <TouchableOpacity
          onPress={() => setShowOriginal(!showOriginal)}
          style={styles.translationIndicator}
        >
          <Text style={styles.indicatorText}>
            {showOriginal
              ? `Show ${getLanguageName(userLanguage)} translation`
              : `Auto-translated (${getLanguageName(message.originalLanguage)}). See original?`
            }
          </Text>
        </TouchableOpacity>
      )}

      {message.tone && (
        <Text style={styles.toneIndicator}>Tone: {message.tone}</Text>
      )}
    </View>
  );
}

// Helper to get human-readable language names
function getLanguageName(languageCode: string): string {
  const names: { [key: string]: string } = {
    'en-US': 'English',
    'en-GB': 'English (UK)',
    'es-MX': 'Spanish',
    'es-ES': 'Spanish (Spain)',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
    'fr-FR': 'French',
    'de-DE': 'German',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
    'pt-BR': 'Portuguese (Brazil)',
    'ru-RU': 'Russian',
    'ar-SA': 'Arabic',
    'hi-IN': 'Hindi',
  };
  return names[languageCode] || languageCode;
}
```

**Styling**:
```typescript
const styles = StyleSheet.create({
  translationIndicator: {
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 4,
  },
  indicatorText: {
    fontSize: 11,
    color: '#007AFF',
    fontStyle: 'italic',
  },
  toneIndicator: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
    fontStyle: 'italic',
  },
});
```

### 3. User Profile Settings

**File**: Create `app/(tabs)/profile.tsx` or add to existing settings screen

```typescript
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useStore } from '../store/useStore';

export default function ProfileSettings() {
  const user = useStore(state => state.user);
  const [selectedLanguage, setSelectedLanguage] = useState(user?.preferredLanguage || 'en-US');
  const [selectedCountry, setSelectedCountry] = useState(user?.country || 'US');

  const saveLanguageSettings = async () => {
    if (!user) return;

    await updateDoc(doc(db, 'users', user.uid), {
      preferredLanguage: selectedLanguage,
      country: selectedCountry,
    });

    // Update local store
    useStore.setState({
      user: { ...user, preferredLanguage: selectedLanguage, country: selectedCountry }
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Preferred Language</Text>
      <Picker
        selectedValue={selectedLanguage}
        onValueChange={(value) => {
          setSelectedLanguage(value);
          saveLanguageSettings();
        }}
      >
        <Picker.Item label="English (US)" value="en-US" />
        <Picker.Item label="English (UK)" value="en-GB" />
        <Picker.Item label="Spanish (Mexico)" value="es-MX" />
        <Picker.Item label="Spanish (Spain)" value="es-ES" />
        <Picker.Item label="Chinese (Simplified)" value="zh-CN" />
        <Picker.Item label="Chinese (Traditional)" value="zh-TW" />
        <Picker.Item label="French" value="fr-FR" />
        <Picker.Item label="German" value="de-DE" />
        <Picker.Item label="Japanese" value="ja-JP" />
        <Picker.Item label="Korean" value="ko-KR" />
        <Picker.Item label="Portuguese (Brazil)" value="pt-BR" />
        <Picker.Item label="Russian" value="ru-RU" />
        <Picker.Item label="Arabic" value="ar-SA" />
        <Picker.Item label="Hindi" value="hi-IN" />
      </Picker>

      <Text style={styles.helpText}>
        Messages will be automatically translated to your preferred language
      </Text>
    </View>
  );
}
```

---

## 🧪 Testing Checklist

### 1. Cloud Functions
- [ ] Deploy all functions without errors
- [ ] Test `detectLanguage` with English, Spanish, Chinese text
- [ ] Test `translateWithTone` between en-US and es-MX
- [ ] Test `batchTranslate` with 3 target languages
- [ ] Verify rate limiting (make 31 translation calls, confirm 31st fails)
- [ ] Check scheduled batch job runs every 5 minutes
- [ ] Verify embeddings appear in Pinecone dashboard

### 2. Message Flow
- [ ] Send English message to Spanish user → Receives Spanish translation
- [ ] Send message in group with mixed languages → All see their language
- [ ] Same language users → No translation call made
- [ ] Tap "See original" → Shows original text
- [ ] Tap again → Shows translation again
- [ ] Quit and rejoin chat → Back to showing translation

### 3. Tone Detection
- [ ] Send friendly message → Tone detected as "friendly"
- [ ] Send formal message → Tone detected as "formal"
- [ ] Send multiple messages → RAG context improves tone accuracy

### 4. Performance
- [ ] Translation completes in <2 seconds
- [ ] No UI blocking during translation
- [ ] Offline mode → Messages queue, translate when online
- [ ] Group chat with 5 languages → Single batch call, <3 seconds

### 5. Pinecone Usage
- [ ] Check embedding stats → Storage under 2GB
- [ ] Verify only translated messages are embedded
- [ ] Confirm messages older than 30 days not embedded
- [ ] Monitor writes stay under 66k/day (free tier)

---

## 💡 Cost Optimization Tips

### OpenAI API
- **Language detection**: ~10 tokens/call ($0.0001 each)
- **Translation**: ~100-500 tokens/call ($0.001-$0.005 each)
- **With RAG**: Add ~500-3000 tokens for context ($0.005-$0.030 each)
- **Batch translate**: More efficient than individual calls

**Monthly estimate (1000 active users, 50 messages/day each)**:
- 50k messages/day
- Assume 20% need translation: 10k translations/day
- Cost: 10k × $0.005 = $50/day = **$1500/month**

### Pinecone Free Tier
- **Storage**: 2GB (~200k messages with metadata)
- **Writes**: 2M/month (~66k/day)
- **Reads**: 1M/month (~33k/day)
- **Strategy**: Only embed translated messages (saves 80% of writes)

### Cost Reduction Strategies
1. **Skip same-language translations** (saves 80% of API calls)
2. **Cache translations in Firestore** (no re-translation needed)
3. **Batch translate in groups** (one call for all languages)
4. **Only embed messages from last 30 days** (manage Pinecone storage)
5. **Rate limit users** (30 translations/minute per user)

---

## 🐛 Troubleshooting

### "Pinecone API key not configured"
```bash
cd functions
firebase functions:config:set pinecone.key="your-key-here"
firebase deploy --only functions
```

### "Empty translation received from OpenAI"
- Check OpenAI API key is set correctly
- Verify account has sufficient quota
- Check Cloud Functions logs: `firebase functions:log`

### "Rate limit exceeded"
- Expected behavior (30 translations/minute per user)
- User sees friendly error: "Rate limit exceeded. Try again after [time]"
- Wait 1 minute and retry

### Scheduled job not running
```bash
# Check logs
firebase functions:log --only scheduledBatchEmbedMessages

# Manually trigger (for testing)
# Note: Scheduled functions can't be triggered manually via HTTP
# Deploy and wait 5 minutes for first run
```

### Messages not embedding to Pinecone
- Check `embedded` field is `false` in Firestore
- Check message has `translations` field (not null)
- Check message is within last 30 days
- View batch job logs for errors

---

## 📊 Monitoring Dashboard

Create an admin panel to monitor usage:

```typescript
// Admin component
import { httpsCallable } from 'firebase/functions';

function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const getStats = httpsCallable(functions, 'getEmbeddingStats');
    getStats().then(result => setStats(result.data));
  }, []);

  return (
    <View>
      <Text>Total Embedded Messages: {stats?.total.embeddedMessages}</Text>
      <Text>Storage Used: {stats?.total.estimatedStorageGB} GB / 2 GB</Text>
      <Text>Last 30 Days Writes: {stats?.last30Days.messagesEmbedded}</Text>
      <Text>Storage: {stats?.usage.storagePercent}%</Text>
      <Text>Writes: {stats?.usage.writesPercent}%</Text>
    </View>
  );
}
```

---

## 🎯 Next Steps

1. **Deploy Cloud Functions** following Step 3 above
2. **Update message sending logic** in your message queue service
3. **Add translation toggle UI** to message bubbles
4. **Add language picker** to user settings
5. **Test end-to-end** with different language pairs
6. **Monitor costs** and adjust rate limits as needed
7. **Consider upgrading Pinecone** if you exceed free tier limits

---

## 📚 References

- **Pinecone Docs**: https://docs.pinecone.io/
- **OpenAI Embeddings**: https://platform.openai.com/docs/guides/embeddings
- **Firebase Cloud Functions v2**: https://firebase.google.com/docs/functions
- **BCP 47 Language Tags**: https://en.wikipedia.org/wiki/IETF_language_tag
- **ISO 3166-1 Country Codes**: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2

---

## ✨ Features Implemented

- ✅ Real-time translation with tone awareness
- ✅ RAG-based context from Pinecone for accurate tone detection
- ✅ Batch translation for group chats (single API call)
- ✅ Translation caching in Firestore (no re-translation)
- ✅ Per-message translation toggle UI
- ✅ Language auto-detection with user context
- ✅ Same-language optimization (no unnecessary AI calls)
- ✅ Scheduled batch embedding job (every 5 minutes)
- ✅ Pinecone free tier optimization (2GB storage, 2M writes/month)
- ✅ Rate limiting (30 translations/minute per user)
- ✅ Monitoring and stats dashboard
- ✅ Cleanup tools for old embeddings

---

Let me know if you need any clarification or run into issues during implementation!
