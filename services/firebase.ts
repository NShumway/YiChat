import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore, enableNetwork, disableNetwork } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Select platform-specific Firebase credentials
const getFirebaseApiKey = () => {
  if (Platform.OS === 'web') return Constants.expoConfig?.extra?.firebaseApiKeyWeb;
  if (Platform.OS === 'ios') return Constants.expoConfig?.extra?.firebaseApiKeyIos;
  return Constants.expoConfig?.extra?.firebaseApiKeyAndroid;
};

const getFirebaseAppId = () => {
  if (Platform.OS === 'web') return Constants.expoConfig?.extra?.firebaseAppIdWeb;
  if (Platform.OS === 'ios') return Constants.expoConfig?.extra?.firebaseAppIdIos;
  return Constants.expoConfig?.extra?.firebaseAppIdAndroid;
};

const firebaseConfig = {
  apiKey: getFirebaseApiKey(),
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId,
  appId: getFirebaseAppId(),
};

// Validate Firebase config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Firebase configuration is missing! Check your .env.local file.');
  throw new Error('Firebase configuration is incomplete');
}

console.log('🔥 Initializing Firebase...');
console.log('Platform:', Platform.OS);
console.log('Project ID:', firebaseConfig.projectId);
console.log('API Key (first 10 chars):', firebaseConfig.apiKey?.substring(0, 10));
console.log('App ID:', firebaseConfig.appId);
console.log('Full config:', JSON.stringify(firebaseConfig, null, 2));

// Initialize Firebase
const app = initializeApp(firebaseConfig);
console.log('Firebase app name:', app.name);
console.log('Firebase app options:', JSON.stringify(app.options, null, 2));

// Initialize Firebase Auth with platform-specific persistence
export const auth = Platform.OS === 'web' 
  ? getAuth(app) // Web uses default browser persistence
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
// IMPORTANT: Specify the database name since it's not "(default)"
export const db = getFirestore(app, 'yichat');
export const storage = getStorage(app);
// Specify region to match Cloud Functions deployment (us-central1)
export const functions = getFunctions(app, 'us-central1');

// Firestore offline persistence is automatic in React Native
// No need to enable it explicitly

console.log('✅ Firebase initialized successfully!');

