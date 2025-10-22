import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { auth, db } from '../services/firebase';
import { initDatabase } from '../services/database';
import { useStore } from '../store/useStore';
import { requestNotificationPermissions } from '../services/notifications';
import { useMessageNotifications } from '../hooks/useMessageNotifications';

// Set up notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const { setUser, isAuthenticated } = useStore();
  const segments = useSegments();
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  // Hook to show notifications for new messages
  useMessageNotifications();

  useEffect(() => {
    // Initialize SQLite database on app launch
    try {
      initDatabase();
      console.log('✅ SQLite database initialized');
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
    }

    // Set up Firebase auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🔐 Auth state changed:', firebaseUser ? `Logged in as ${firebaseUser.email}` : 'Logged out');
      
      if (firebaseUser) {
        try {
          // Fetch full user data from Firestore with retry logic
          let userDoc = null;
          let lastError = null;
          
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log(`📡 Fetching user data from Firestore (attempt ${attempt}/3)...`);
              userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
              break; // Success, exit retry loop
            } catch (err) {
              lastError = err;
              console.warn(`⚠️ Attempt ${attempt} failed:`, err);
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              }
            }
          }
          
          if (userDoc && userDoc.exists()) {
            const userData = userDoc.data();
            setUser({
              uid: firebaseUser.uid,
              displayName: userData.displayName,
              email: userData.email,
              preferredLanguage: userData.preferredLanguage,
              status: 'online',
              photoURL: userData.photoURL,
              pushToken: userData.pushToken,
            });
            console.log('✅ User data loaded from Firestore');
            
            // Request notification permissions
            requestNotificationPermissions(firebaseUser.uid).catch(err => {
              console.warn('⚠️ Failed to set up notifications:', err);
            });
          } else if (lastError) {
            // Firestore is unavailable, use Firebase Auth data as fallback
            console.warn('⚠️ Firestore unavailable, using Firebase Auth data as fallback');
            setUser({
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              email: firebaseUser.email || '',
              preferredLanguage: 'en', // Default
              status: 'online',
              photoURL: firebaseUser.photoURL,
            });
            
            // Still try to request notification permissions
            requestNotificationPermissions(firebaseUser.uid).catch(err => {
              console.warn('⚠️ Failed to set up notifications:', err);
            });
          } else {
            console.warn('⚠️ User document not found in Firestore (user may need to sign up again)');
            setUser(null);
          }
        } catch (error) {
          console.error('❌ Critical error loading user data:', error);
          // Still try to use Firebase Auth data as absolute fallback
          setUser({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            email: firebaseUser.email || '',
            preferredLanguage: 'en',
            status: 'online',
            photoURL: firebaseUser.photoURL,
          });
        }
      } else {
        console.log('👤 No authenticated user, clearing state');
        setUser(null);
      }
      
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  // Set up notification listeners (mobile only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      console.log('⚠️ Notifications not supported on web');
      return;
    }

    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('📬 Foreground notification received:', notification);
    });

    // Listen for user tapping on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 Notification tapped:', response);
      const chatId = response.notification.request.content.data?.chatId;
      if (chatId) {
        router.push(`/chat/${chatId}` as any);
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [router]);

  // Handle authentication-based routing
  useEffect(() => {
    if (isLoading) return;

    console.log('🧭 Current segments:', segments);
    console.log('🔐 Is authenticated:', isAuthenticated);

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const inModalOrChat = segments[0] === 'new-chat' || segments[0] === 'new-group' || segments[0] === 'chat';

    console.log('📍 Route check:', { inAuthGroup, inTabsGroup, inModalOrChat });

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated
      console.log('➡️ Redirecting to login (not authenticated)');
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if already authenticated but in auth screens
      console.log('➡️ Redirecting to tabs (authenticated, in auth)');
      router.replace('/(tabs)');
    } else if (isAuthenticated && !inTabsGroup && !inModalOrChat && segments[0] !== undefined) {
      // Only redirect to tabs if not in a valid authenticated screen
      console.log('➡️ Redirecting to tabs (authenticated, unknown route)');
      router.replace('/(tabs)');
    } else {
      console.log('✅ Staying on current route');
    }
  }, [isAuthenticated, segments, isLoading]);

  // Show loading screen while checking auth state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen 
          name="new-chat" 
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen 
          name="new-group" 
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen 
          name="chat/[chatId]" 
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

