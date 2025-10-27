# Migrating to Google Secret Manager

This guide explains how to migrate from the deprecated `functions.config()` to Google Secret Manager.

## Why Migrate?

- `functions.config()` is **deprecated** and will stop working in **March 2026**
- Secret Manager provides better security, versioning, and access control
- Secret Manager integrates natively with Cloud Functions v2

## Step 1: Enable Secret Manager API

```bash
# Enable the Secret Manager API for your project
firebase open extensions
# Or visit: https://console.cloud.google.com/apis/library/secretmanager.googleapis.com?project=yichat-3f1b4
```

## Step 2: Create Secrets in Google Cloud Console

### Option A: Using Google Cloud Console (Easiest)

1. Go to [Google Cloud Console > Secret Manager](https://console.cloud.google.com/security/secret-manager?project=yichat-3f1b4)
2. Click **"CREATE SECRET"**
3. Create these secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `OPENAI_API_KEY` | `sk-proj-...` | Your OpenAI API key |
| `PINECONE_API_KEY` | `pcsk_...` | Your Pinecone API key |

4. For each secret:
   - Name: Use exact name from table above
   - Secret value: Paste the key
   - Leave other settings as default
   - Click **"CREATE SECRET"**

### Option B: Using gcloud CLI (if installed)

```bash
# Set your current OpenAI key from functions config
OPENAI_KEY=$(firebase functions:config:get openai.key --project yichat-3f1b4)
PINECONE_KEY=$(firebase functions:config:get pinecone.key --project yichat-3f1b4)

# Create secrets
echo -n "$OPENAI_KEY" | gcloud secrets create OPENAI_API_KEY \
  --data-file=- \
  --replication-policy="automatic" \
  --project=yichat-3f1b4

echo -n "$PINECONE_KEY" | gcloud secrets create PINECONE_API_KEY \
  --data-file=- \
  --replication-policy="automatic" \
  --project=yichat-3f1b4
```

## Step 3: Grant Cloud Functions Access

Cloud Functions needs permission to access the secrets:

```bash
# Get your project number
PROJECT_NUMBER=$(firebase projects:list | grep yichat-3f1b4 | awk '{print $3}')

# Grant access (if using gcloud)
gcloud secrets add-iam-policy-binding OPENAI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=yichat-3f1b4

gcloud secrets add-iam-policy-binding PINECONE_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=yichat-3f1b4
```

**OR** use the Google Cloud Console:
1. Go to [IAM & Admin > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=yichat-3f1b4)
2. Find the "App Engine default service account" (`<project-id>@appspot.gserviceaccount.com`)
3. Go back to [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=yichat-3f1b4)
4. For each secret:
   - Click on the secret name
   - Click "PERMISSIONS" tab
   - Click "GRANT ACCESS"
   - Add principal: `<project-number>-compute@developer.gserviceaccount.com` AND `yichat-3f1b4@appspot.gserviceaccount.com`
   - Role: "Secret Manager Secret Accessor"
   - Click "SAVE"

## Step 4: Update Cloud Functions Code

The code has already been updated to use Secret Manager via `defineSecret()`. See:
- `functions/src/index.ts`
- `functions/src/translation.ts`
- `functions/src/embeddings.ts`

## Step 5: Deploy Updated Functions

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

Firebase will automatically:
- Detect secret usage via `defineSecret()`
- Bind secrets to functions at deployment time
- Inject secret values at runtime via `secret.value()`

## Step 6: Verify Secrets Work

```bash
# Check function logs after deployment
firebase functions:log --only detectLanguage

# Should see "✅ OpenAI API key loaded from Secret Manager" in logs
```

## Step 7: Clean Up Old Config (Optional)

Once you verify secrets work:

```bash
# Remove old config (optional - it will stop working in March 2026 anyway)
firebase functions:config:unset openai
firebase functions:config:unset pinecone
```

## Troubleshooting

### Error: "Permission denied" when accessing secrets

**Solution**: Grant Secret Manager Secret Accessor role to both service accounts:
- `<project-number>-compute@developer.gserviceaccount.com`
- `<project-id>@appspot.gserviceaccount.com`

### Error: "Secret not found"

**Solution**: Verify secret names are **EXACTLY**:
- `OPENAI_API_KEY` (not `openai_api_key` or `OPENAI-API-KEY`)
- `PINECONE_API_KEY`

### Secrets work in some functions but not others

**Solution**: When deploying functions, Firebase auto-binds secrets. If you add a new function that uses secrets after initial deployment, redeploy all functions: `firebase deploy --only functions`

## Security Benefits

✅ **Versioning**: Secret Manager tracks all versions of secrets
✅ **Access Control**: Fine-grained IAM permissions
✅ **Audit Logging**: Track who accesses secrets and when
✅ **Rotation**: Easy secret rotation without redeploying functions
✅ **Future-Proof**: No March 2026 deprecation deadline

## Cost

Secret Manager free tier:
- 6 secret versions per month: **FREE**
- 10,000 access operations per month: **FREE**

For this project (2 secrets, low access rate): **$0/month**

## References

- [Firebase Secret Manager Guide](https://firebase.google.com/docs/functions/config-env#secret-manager)
- [Google Secret Manager Docs](https://cloud.google.com/secret-manager/docs)
- [Migration Guide](https://cloud.google.com/functions/docs/configuring/secrets#migrating)
