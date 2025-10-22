#!/usr/bin/env node

/**
 * Test Firebase Connection
 * Run this to verify your Firebase setup is correct
 */

require('dotenv').config({ path: '.env.local' });

const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, collection, getDocs, doc, setDoc } = require('firebase/firestore');

console.log('\n🔥 Testing Firebase Connection...\n');

// Check environment variables
console.log('📋 Environment Variables:');
console.log('FIREBASE_API_KEY:', process.env.FIREBASE_API_KEY ? '✅ Set' : '❌ Missing');
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing');
console.log('FIREBASE_AUTH_DOMAIN:', process.env.FIREBASE_AUTH_DOMAIN ? '✅ Set' : '❌ Missing');

if (!process.env.FIREBASE_API_KEY || !process.env.FIREBASE_PROJECT_ID) {
  console.error('\n❌ Firebase credentials are missing in .env.local file!');
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

console.log('\n🔧 Initializing Firebase App...');
const app = initializeApp(firebaseConfig);
console.log('✅ Firebase App initialized');

const auth = getAuth(app);
const db = getFirestore(app, 'yichat'); // Use the named database, not "(default)"

async function testConnection() {
  // Set a 10 second timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
  });

  try {
    // Test 1: Firestore write with timeout
    console.log('\n📝 Test 1: Writing test document to Firestore...');
    const testDocRef = doc(db, 'test', 'connection-test');
    
    await Promise.race([
      setDoc(testDocRef, {
        timestamp: new Date(),
        message: 'Connection test',
      }),
      timeoutPromise
    ]);
    
    console.log('✅ Successfully wrote to Firestore!');

    // Test 2: Firestore read with timeout
    console.log('\n📖 Test 2: Reading from Firestore...');
    const testQuery = await Promise.race([
      getDocs(collection(db, 'test')),
      timeoutPromise
    ]);
    console.log(`✅ Successfully read from Firestore! (${testQuery.size} documents)`);

    console.log('\n🎉 All tests passed! Firebase is working correctly.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Firebase connection test failed!');
    console.error('Error:', error.message);
    
    if (error.message.includes('timeout')) {
      console.error('\n💡 Connection timed out!');
      console.error('   Possible causes:');
      console.error('   1. Firestore database not created yet');
      console.error('   2. Network/firewall blocking connection');
      console.error('   3. API still propagating (wait 2-3 more minutes)');
      console.error('\n   Go to: https://console.firebase.google.com/project/yichat-3f1b4/firestore');
      console.error('   Check if you see an actual database or a "Create database" button');
    } else if (error.code === 'permission-denied') {
      console.error('\n💡 This is a Firestore Security Rules issue.');
      console.error('   Go to Firebase Console → Firestore → Rules');
      console.error('   Make sure you have rules that allow authenticated access.');
    } else if (error.message.includes('NOT_FOUND')) {
      console.error('\n💡 Firestore database does NOT exist!');
      console.error('   You MUST create the database first:');
      console.error('   1. Go to: https://console.firebase.google.com/project/yichat-3f1b4/firestore');
      console.error('   2. Click "Create database"');
      console.error('   3. Choose "Start in test mode"');
      console.error('   4. Select a location (e.g., us-central1)');
      console.error('   5. Click "Enable"');
      console.error('   6. Wait 2-3 minutes, then run this test again');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
      console.error('\n💡 This appears to be a network connectivity issue.');
      console.error('   1. Check your internet connection');
      console.error('   2. Try disabling VPN or firewall');
      console.error('   3. Check if firebaseio.com is accessible');
    }
    
    console.error('\nError code:', error.code);
    process.exit(1);
  }
}

testConnection();

