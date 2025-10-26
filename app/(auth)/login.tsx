import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { useStore } from '../../store/useStore';
import { useGoogleAuth, signInWithGoogle, getGoogleTokens } from '../../services/googleAuth';

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, setLoading, setError, clearError } = useStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Google Sign-In
  const { request, response, promptAsync, isConfigured: isGoogleConfigured } = useGoogleAuth();
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  // Handle Google Sign-In response
  useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleSignInResponse();
    }
  }, [response]);

  const handleGoogleSignInResponse = async () => {
    const tokens = getGoogleTokens(response);
    if (!tokens?.idToken || !tokens?.accessToken) {
      Alert.alert('Error', 'Failed to get Google authentication tokens');
      return;
    }

    setIsGoogleSigningIn(true);
    setLoading(true);

    try {
      const { user, isNewUser } = await signInWithGoogle(tokens.idToken, tokens.accessToken);
      
      // Get full user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();

      setUser({
        uid: user.uid,
        displayName: userData?.displayName || user.displayName || 'User',
        email: userData?.email || user.email || '',
        preferredLanguage: userData?.preferredLanguage || 'en',
        status: 'online',
        photoURL: userData?.photoURL || user.photoURL,
      });

      setLoading(false);
      setIsGoogleSigningIn(false);

      if (isNewUser) {
        // Could show a welcome modal or language selection screen here
        console.log('Welcome new user!');
      }

      router.replace('/(tabs)');
    } catch (error: any) {
      setIsGoogleSigningIn(false);
      setLoading(false);
      
      let errorMessage = 'Google sign-in failed';
      if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = 'An account already exists with this email using a different sign-in method';
      }
      
      Alert.alert('Google Sign-In Failed', errorMessage);
      console.error('Google sign-in error:', error);
    }
  };

  const validateForm = (): string | null => {
    clearError();
    
    if (!email.trim()) {
      return 'Please enter your email';
    }
    if (!email.includes('@')) {
      return 'Please enter a valid email address';
    }
    if (!password) {
      return 'Please enter your password';
    }
    return null;
  };

  const handleLogin = async () => {
    // Validate form
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    setIsSubmitting(true);
    setLoading(true);
    clearError();

    try {
      console.log('🔐 Attempting login...');
      
      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.toLowerCase().trim(),
        password
      );

      console.log('✅ Authentication successful, fetching user data...');

      // Get user data from Firestore with retry logic
      let userDoc;
      let retries = 3;
      
      while (retries > 0) {
        try {
          userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
          if (userDoc.exists()) {
            console.log('✅ User data loaded from Firestore');
            break;
          }
        } catch (firestoreError: any) {
          console.warn(`Firestore attempt ${4 - retries} failed:`, firestoreError.message);
          retries--;
          if (retries === 0) throw firestoreError;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
      }
      
      if (!userDoc || !userDoc.exists()) {
        // If Firestore fails but auth succeeded, use auth data
        console.warn('⚠️ Using auth data, Firestore unavailable');
        setUser({
          uid: userCredential.user.uid,
          displayName: userCredential.user.displayName || 'User',
          email: userCredential.user.email || email,
          preferredLanguage: 'en', // Default
          status: 'online',
        });
        
        setLoading(false);
        setIsSubmitting(false);
        router.replace('/(tabs)');
        return;
      }

      const userData = userDoc.data();

      // Try to update user status (don't fail login if this fails)
      try {
        await updateDoc(doc(db, 'users', userCredential.user.uid), {
          status: 'online',
          lastSeen: new Date(),
        });
      } catch (updateError) {
        console.warn('⚠️ Could not update user status:', updateError);
      }

      // Update Zustand state
      setUser({
        uid: userCredential.user.uid,
        displayName: userData.displayName,
        email: userData.email,
        preferredLanguage: userData.preferredLanguage,
        status: 'online',
        photoURL: userData.photoURL,
      });

      setLoading(false);
      setIsSubmitting(false);

      console.log('✅ Login complete, navigating to main app');
      
      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error: any) {
      setIsSubmitting(false);
      setLoading(false);
      
      let errorMessage = 'An error occurred during login';
      
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed login attempts. Please try again later.';
      } else if (error.message?.includes('offline')) {
        errorMessage = 'Cannot connect to server. Check your internet connection and try again.';
      }

      setError(errorMessage);
      Alert.alert('Login Failed', errorMessage);
      console.error('❌ Login error:', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back 👋</Text>
          <Text style={styles.subtitle}>Log in to continue chatting</Text>
        </View>

        <View style={styles.form}>
          {/* Email */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
            />
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              textContentType="password"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              keyboardType="default"
            />
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting || isGoogleSigningIn}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          {/* Google Sign-In - Only show if configured */}
          {isGoogleConfigured && (
            <>
              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Sign-In Button */}
              <TouchableOpacity
                style={[styles.googleButton, (!request || isSubmitting || isGoogleSigningIn) && styles.buttonDisabled]}
                onPress={() => promptAsync()}
                disabled={!request || isSubmitting || isGoogleSigningIn}
              >
                {isGoogleSigningIn ? (
                  <ActivityIndicator color="#1a1a1a" />
                ) : (
                  <View style={styles.googleButtonContent}>
                    <Text style={styles.googleIcon}>G</Text>
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                  </View>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Sign Up Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity disabled={isSubmitting || isGoogleSigningIn}>
                <Text style={styles.link}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    height: 48,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#aaa',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
  link: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
});

