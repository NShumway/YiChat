#!/usr/bin/env node

/**
 * Firebase Setup Checker
 * Run this to verify your Firebase project is configured correctly
 */

const https = require('https');

console.log('🔥 Checking Firebase Setup...\n');

// Colors for terminal
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

function success(message) {
  console.log(`${green}✅ ${message}${reset}`);
}

function error(message) {
  console.log(`${red}❌ ${message}${reset}`);
}

function warning(message) {
  console.log(`${yellow}⚠️  ${message}${reset}`);
}

function info(message) {
  console.log(`   ${message}`);
}

// Check environment variables
console.log('📋 Checking Environment Variables:');
const requiredVars = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID'
];

let allVarsPresent = true;
requiredVars.forEach(varName => {
  if (process.env[varName]) {
    success(`${varName} is set`);
  } else {
    error(`${varName} is missing`);
    allVarsPresent = false;
  }
});

if (!allVarsPresent) {
  console.log('\n📝 Make sure your .env.local file exists with all Firebase config values');
  console.log('   Get them from: Firebase Console → Project Settings → Your apps → Web app\n');
}

// Check if firebase.json exists
console.log('\n📋 Checking Firebase Configuration Files:');
const fs = require('fs');

try {
  fs.accessSync('firebase.json');
  success('firebase.json exists');
} catch {
  warning('firebase.json not found');
  info('Run: firebase init');
}

try {
  fs.accessSync('firestore.rules');
  success('firestore.rules exists');
} catch {
  error('firestore.rules not found');
  info('This file is required for security!');
}

try {
  fs.accessSync('storage.rules');
  success('storage.rules exists');
} catch {
  error('storage.rules not found');
  info('This file is required for media upload security!');
}

// Manual checklist
console.log('\n📋 Manual Checklist (verify in Firebase Console):');
console.log('');
console.log('   1. Authentication:');
console.log('      → Go to Authentication → Sign-in method');
console.log('      → Enable Email/Password');
console.log('');
console.log('   2. Firestore Database:');
console.log('      → Go to Firestore Database');
console.log('      → Create database if not exists');
console.log('      → Deploy rules: firebase deploy --only firestore:rules');
console.log('');
console.log('   3. Storage:');
console.log('      → Go to Storage');
console.log('      → Initialize storage');
console.log('      → Deploy rules: firebase deploy --only storage');
console.log('');
console.log('   4. Test Security Rules:');
console.log('      → Try signing up with the app');
console.log('      → Check Firestore for user document');
console.log('      → Use Rules Simulator in console to test');
console.log('');

if (allVarsPresent) {
  console.log(`${green}✅ Environment variables look good!${reset}`);
  console.log(`   Next steps:`);
  console.log(`   1. Run: firebase login`);
  console.log(`   2. Run: firebase init (if not done)`);
  console.log(`   3. Run: firebase deploy --only firestore:rules,storage`);
  console.log(`   4. Test signup/login in your app`);
} else {
  console.log(`${red}❌ Fix environment variables first${reset}`);
}

console.log('');

