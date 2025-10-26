import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { useStore } from '../../store/useStore';
import { useGoogleAuth, signInWithGoogle, getGoogleTokens } from '../../services/googleAuth';

// Common languages for YiChat
const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
];

export default function SignUpScreen() {
  const router = useRouter();
  const { setUser, setLoading, setError, clearError } = useStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
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
        // Could show language selection modal for new users
        console.log('Welcome new user from Google!');
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
    
    if (!displayName.trim()) {
      return 'Please enter your name';
    }
    if (!email.trim()) {
      return 'Please enter your email';
    }
    if (!email.includes('@')) {
      return 'Please enter a valid email address';
    }
    if (!password) {
      return 'Please enter a password';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  };

  const handleSignUp = async () => {
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
      console.log('🔐 Creating Firebase Auth account...');
      
      // Create user with Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      console.log('✅ Auth account created, updating profile...');
      
      // Update display name in Firebase Auth
      await updateProfile(userCredential.user, {
        displayName: displayName.trim(),
      });

      console.log('✅ Profile updated, creating Firestore document...');

      // Create user document in Firestore with retry logic
      const userData = {
        uid: userCredential.user.uid,
        displayName: displayName.trim(),
        email: email.toLowerCase().trim(),
        preferredLanguage,
        status: 'online',
        createdAt: new Date(),
        lastSeen: new Date(),
      };

      let firestoreSuccess = false;
      let retries = 3;
      
      while (retries > 0 && !firestoreSuccess) {
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), userData);
          firestoreSuccess = true;
          console.log('✅ Firestore document created!');
        } catch (firestoreError: any) {
          console.warn(`Firestore write attempt ${4 - retries} failed:`, firestoreError.message);
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
          } else {
            console.error('❌ Failed to create Firestore document after 3 attempts');
            // Continue anyway - user is authenticated, we can create the document later
          }
        }
      }

      // Update Zustand state
      setUser({
        uid: userCredential.user.uid,
        displayName: displayName.trim(),
        email: email.toLowerCase().trim(),
        preferredLanguage,
        status: 'online',
      });

      setLoading(false);
      setIsSubmitting(false);

      console.log('✅ Sign up complete, navigating to main app');

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error: any) {
      setIsSubmitting(false);
      setLoading(false);
      
      let errorMessage = 'An error occurred during sign up';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please log in instead.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Connection timed out. Please try again.';
      }

      setError(errorMessage);
      Alert.alert('Sign Up Failed', errorMessage);
      console.error('❌ Sign up error:', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to YiChat 🌍</Text>
          <Text style={styles.subtitle}>
            Create your account to start chatting across languages
          </Text>
        </View>

        <View style={styles.form}>
          {/* Display Name */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!isSubmitting}
            />
          </View>

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
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              textContentType="password"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
            />
          </View>

          {/* Confirm Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={true}
              textContentType="password"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
            />
          </View>

          {/* Preferred Language */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Your Preferred Language</Text>
            <Text style={styles.helperText}>
              Messages will be translated to this language
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.languageScroll}
            >
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.languageChip,
                    preferredLanguage === lang.code && styles.languageChipSelected,
                  ]}
                  onPress={() => setPreferredLanguage(lang.code)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text
                    style={[
                      styles.languageName,
                      preferredLanguage === lang.code && styles.languageNameSelected,
                    ]}
                  >
                    {lang.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={isSubmitting || isGoogleSigningIn}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
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

          {/* Login Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity disabled={isSubmitting || isGoogleSigningIn}>
                <Text style={styles.link}>Log In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
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
  helperText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
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
  languageScroll: {
    flexGrow: 0,
  },
  languageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  languageChipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  languageFlag: {
    fontSize: 20,
    marginRight: 6,
  },
  languageName: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  languageNameSelected: {
    color: '#fff',
    fontWeight: '600',
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#999',
  },
  googleButton: {
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    marginRight: 12,
    color: '#4285F4',
  },
  googleButtonText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '600',
  },
});

