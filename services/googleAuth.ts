import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Constants from 'expo-constants';

// Required for Expo web browser to work properly
WebBrowser.maybeCompleteAuthSession();

/**
 * Google Sign-In Configuration
 * 
 * You need to configure OAuth 2.0 Client IDs in Google Cloud Console:
 * 1. Go to: https://console.cloud.google.com/apis/credentials
 * 2. Select your Firebase project (or create credentials)
 * 3. Create OAuth 2.0 Client IDs for:
 *    - iOS (bundle ID from app.json)
 *    - Android (package name + SHA-1 from `expo credentials:manager`)
 *    - Web (for Expo Go development)
 * 
 * Add these to your .env.local:
 * GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
 * GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
 * GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
 */

export function useGoogleAuth() {
  const webClientId = Constants.expoConfig?.extra?.googleWebClientId;
  const iosClientId = Constants.expoConfig?.extra?.googleIosClientId;
  const androidClientId = Constants.expoConfig?.extra?.googleAndroidClientId;

  // Check if Google Auth is configured
  const isConfigured = !!webClientId;

  // IMPORTANT: Provide dummy values for all required IDs to prevent errors
  // The hook will be called but won't be used if isConfigured is false
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: webClientId || 'dummy-web-client-id',
    iosClientId: iosClientId || 'dummy-ios-client-id',
    androidClientId: androidClientId || 'dummy-android-client-id',
  });

  return {
    request: isConfigured ? request : null,
    response,
    promptAsync,
    isConfigured,
  };
}

export async function signInWithGoogle(idToken: string, accessToken: string) {
  try {
    // Create Firebase credential from Google tokens
    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    
    // Sign in to Firebase
    const userCredential = await signInWithCredential(auth, credential);
    const user = userCredential.user;

    // Check if user document exists in Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // First time user - create profile with default language
      await setDoc(userDocRef, {
        uid: user.uid,
        displayName: user.displayName || 'User',
        email: user.email || '',
        photoURL: user.photoURL || '',
        preferredLanguage: 'en', // Default to English, user can change later
        status: 'online',
        createdAt: new Date(),
        lastSeen: new Date(),
      });

      return { isNewUser: true, user };
    } else {
      // Existing user - update last seen and status
      await setDoc(
        userDocRef,
        {
          status: 'online',
          lastSeen: new Date(),
          // Update photo if changed
          ...(user.photoURL && { photoURL: user.photoURL }),
        },
        { merge: true }
      );

      return { isNewUser: false, user };
    }
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
}

/**
 * Helper to extract tokens from Google auth response
 */
export function getGoogleTokens(response: any) {
  if (response?.type === 'success') {
    const { authentication } = response;
    return {
      idToken: authentication?.idToken,
      accessToken: authentication?.accessToken,
    };
  }
  return null;
}

