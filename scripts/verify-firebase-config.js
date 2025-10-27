/**
 * Verify Firebase Configuration
 *
 * Run with: node scripts/verify-firebase-config.js
 *
 * Checks that Firebase credentials are properly configured for all platforms
 */

require('dotenv').config({ path: '.env.local' });

const requiredVars = [
  'FIREBASE_API_KEY_WEB',
  'FIREBASE_API_KEY_ANDROID',
  'FIREBASE_API_KEY_IOS',
  'FIREBASE_APP_ID_WEB',
  'FIREBASE_APP_ID_ANDROID',
  'FIREBASE_APP_ID_IOS',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
];

console.log('🔍 Verifying Firebase Configuration...\n');

let hasErrors = false;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    console.error(`❌ Missing: ${varName}`);
    hasErrors = true;
  } else {
    console.log(`✅ ${varName}: ${value.substring(0, 20)}...`);
  }
});

console.log('\n📱 Platform-Specific Credentials:');
console.log(`Web API Key: ${process.env.FIREBASE_API_KEY_WEB?.substring(0, 20)}...`);
console.log(`Android API Key: ${process.env.FIREBASE_API_KEY_ANDROID?.substring(0, 20)}...`);
console.log(`iOS API Key: ${process.env.FIREBASE_API_KEY_IOS?.substring(0, 20)}...`);

console.log(`\nWeb App ID: ${process.env.FIREBASE_APP_ID_WEB}`);
console.log(`Android App ID: ${process.env.FIREBASE_APP_ID_ANDROID}`);
console.log(`iOS App ID: ${process.env.FIREBASE_APP_ID_IOS}`);

// Verify app ID formats
const webAppId = process.env.FIREBASE_APP_ID_WEB;
const androidAppId = process.env.FIREBASE_APP_ID_ANDROID;
const iosAppId = process.env.FIREBASE_APP_ID_IOS;

if (webAppId && !webAppId.includes(':web:')) {
  console.error('\n❌ FIREBASE_APP_ID_WEB should contain ":web:"');
  hasErrors = true;
}

if (androidAppId && !androidAppId.includes(':android:')) {
  console.error('❌ FIREBASE_APP_ID_ANDROID should contain ":android:"');
  hasErrors = true;
}

if (iosAppId && !iosAppId.includes(':ios:')) {
  console.error('❌ FIREBASE_APP_ID_IOS should contain ":ios:"');
  hasErrors = true;
}

if (hasErrors) {
  console.error('\n❌ Configuration errors found! Check .env.local file.');
  console.error('📖 See .env.example for the correct format.');
  process.exit(1);
} else {
  console.log('\n✅ All Firebase credentials configured correctly!');
  console.log('\n💡 Next steps:');
  console.log('   1. Restart Expo dev server: npm start');
  console.log('   2. Reload app on Android device');
  console.log('   3. Try sending a message again');
}
