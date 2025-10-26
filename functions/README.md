# YiChat Cloud Functions

Firebase Cloud Functions for AI-powered features in YiChat.

## Features

- **Translation** (`translateMessage`): Translate messages between languages using GPT-4
- **Slang Explanation** (`explainSlang`): Explain slang and informal language with cultural context
- **Cultural Context** (`getCulturalContext`): Provide cultural context for messages between different nationalities

## Prerequisites

- Node.js 18 or later
- Firebase CLI: `npm install -g firebase-tools`
- OpenAI API key

## Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure OpenAI API Key

**IMPORTANT**: NEVER commit your API key to the repository!

Set the OpenAI API key as a Firebase Functions config variable:

```bash
firebase functions:config:set openai.key="sk-your-openai-api-key-here"
```

Verify it's set:

```bash
firebase functions:config:get
```

### 3. Build TypeScript

```bash
npm run build
```

## Development

### Local Testing with Emulators

```bash
# Start Firebase emulators
firebase emulators:start --only functions

# In another terminal, test a function
curl -X POST http://localhost:5001/yichat-XXXXX/us-central1/translateMessage \
  -H "Content-Type: application/json" \
  -d '{"data": {"text": "Hello", "sourceLang": "en", "targetLang": "es"}}'
```

**Note**: AI features won't work in emulators without a real OpenAI API key.

### View Logs

```bash
# View all logs
npm run logs

# Follow logs in real-time
firebase functions:log --only translateMessage
```

## Deployment

### Deploy All Functions

```bash
npm run deploy
```

### Deploy Specific Function

```bash
firebase deploy --only functions:translateMessage
```

## Rate Limiting

All AI functions have built-in rate limiting to prevent runaway costs:

| Feature | Per Minute | Per Hour | Per Day |
|---------|------------|----------|---------|
| Translation | 30 | 200 | 1000 |
| AI Conversation | 10 | 50 | 200 |
| Smart Replies | 5 | 30 | 100 |
| Slang Explanation | 10 | 50 | 200 |
| Cultural Context | 10 | 50 | 200 |

Rate limits are enforced BEFORE calling the OpenAI API to prevent accidental charges.

## Error Handling

Functions return these error codes:

- `unauthenticated`: User must be logged in
- `resource-exhausted`: Rate limit exceeded
- `invalid-argument`: Missing or invalid parameters
- `internal`: Internal error (OpenAI API failed, etc.)

## Cost Estimation

Using GPT-4-turbo pricing (as of 2024):
- Input: $0.01 per 1K tokens
- Output: $0.03 per 1K tokens

Estimated costs per operation:
- Translation (short message, 50 tokens): ~$0.002
- Translation (long message, 200 tokens): ~$0.008
- Slang explanation (300 tokens): ~$0.012
- Cultural context (200 tokens): ~$0.008

With rate limits, max cost per user per day:
- Translation: 1000 × $0.008 = $8.00
- All features combined: ~$20/day max per user

## File Structure

```
functions/
├── src/
│   ├── index.ts           # Main Cloud Functions exports
│   ├── rateLimiting.ts    # Rate limiting middleware
│   ├── translation.ts     # (Future) Caching layer
│   └── embeddings.ts      # (Future) Pinecone RAG
├── package.json
├── tsconfig.json
└── README.md
```

## Security Notes

- API keys are stored in Firebase Functions config (never in code)
- All functions require authentication
- Rate limiting prevents abuse
- Input validation on all parameters
- Errors don't expose internal details to clients

## Troubleshooting

### "OpenAI API key not configured"

Run: `firebase functions:config:set openai.key="sk-..."`

### "Rate limit exceeded"

Wait for the reset time shown in the error message, or increase limits in `rateLimiting.ts`.

### "TypeScript compilation errors"

Run: `npm run build` and fix any errors before deploying.

### "Function deployment failed"

Check that you're using Node.js 18: `node --version`

## Next Steps

- [ ] Add translation caching to reduce costs
- [ ] Implement Pinecone RAG for smart replies
- [ ] Add streaming for AI conversations
- [ ] Implement cost tracking dashboard
