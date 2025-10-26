import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Presence Service
 *
 * Manages user online/offline status with:
 * - Heartbeat updates every 15 seconds while app is active
 * - Automatic offline detection after 30 seconds of inactivity
 * - Real-time status listeners for other users
 * - App state handling (foreground/background)
 */

let heartbeatInterval: NodeJS.Timeout | null = null;
let currentUserId: string | null = null;

/**
 * Start presence heartbeat for current user
 * Updates lastSeen and status every 15 seconds
 */
export function startPresenceHeartbeat(userId: string) {
  console.log('💓 Starting presence heartbeat for user:', userId);

  // Stop any existing heartbeat
  stopPresenceHeartbeat();

  currentUserId = userId;

  // Immediately mark as online
  updatePresence(userId, 'online').catch(err => {
    console.error('Failed to set initial online status:', err);
  });

  // Set up recurring heartbeat every 15 seconds
  heartbeatInterval = setInterval(async () => {
    try {
      await updatePresence(userId, 'online');
      console.log('💓 Heartbeat sent');
    } catch (error) {
      console.error('❌ Heartbeat failed:', error);
    }
  }, 15000); // 15 seconds

  // Listen for app state changes
  const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
    handleAppStateChange(nextAppState, userId);
  });

  // Store cleanup function
  return () => {
    subscription.remove();
    stopPresenceHeartbeat();
  };
}

/**
 * Stop presence heartbeat
 */
export function stopPresenceHeartbeat() {
  if (heartbeatInterval) {
    console.log('💓 Stopping presence heartbeat');
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Mark user as offline
  if (currentUserId) {
    updatePresence(currentUserId, 'offline').catch(err => {
      console.error('Failed to set offline status:', err);
    });
    currentUserId = null;
  }
}

/**
 * Update user presence in Firestore
 */
async function updatePresence(userId: string, status: 'online' | 'offline') {
  try {
    await updateDoc(doc(db, 'users', userId), {
      status,
      lastSeen: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to update presence:', error);
    throw error;
  }
}

/**
 * Handle app state changes (foreground/background)
 */
function handleAppStateChange(nextAppState: AppStateStatus, userId: string) {
  console.log('📱 App state changed to:', nextAppState);

  if (nextAppState === 'active') {
    // App came to foreground - start heartbeat
    if (!heartbeatInterval && currentUserId === userId) {
      console.log('💓 Resuming heartbeat (app foregrounded)');
      startPresenceHeartbeat(userId);
    }
  } else if (nextAppState === 'background' || nextAppState === 'inactive') {
    // App went to background - stop heartbeat, mark offline
    console.log('💤 App backgrounded, marking offline');
    stopPresenceHeartbeat();
  }
}

/**
 * Listen to another user's presence status in real-time
 * Returns unsubscribe function
 */
export function subscribeToUserPresence(
  userId: string,
  onStatusChange: (status: 'online' | 'offline') => void
): () => void {
  console.log('👂 Subscribing to presence for user:', userId);

  const unsubscribe = onSnapshot(
    doc(db, 'users', userId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onStatusChange('offline');
        return;
      }

      const data = snapshot.data();
      const lastSeen = data.lastSeen?.toDate?.() || new Date(0);
      const now = new Date();
      const secondsSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000;

      // Consider user offline if last seen > 30 seconds ago
      const isOnline = data.status === 'online' && secondsSinceLastSeen < 30;

      console.log(`👤 User ${userId} status:`, {
        status: data.status,
        secondsSinceLastSeen: Math.round(secondsSinceLastSeen),
        isOnline,
      });

      onStatusChange(isOnline ? 'online' : 'offline');
    },
    (error) => {
      console.error('❌ Error subscribing to user presence:', error);
      onStatusChange('offline');
    }
  );

  return unsubscribe;
}

/**
 * Check if user is online based on lastSeen timestamp
 * Used for one-time checks without real-time listener
 */
export function isUserOnline(lastSeen: Date | undefined, status: string | undefined): boolean {
  if (status !== 'online') return false;
  if (!lastSeen) return false;

  const now = new Date();
  const lastSeenDate = lastSeen instanceof Date ? lastSeen : new Date(0);
  const secondsSinceLastSeen = (now.getTime() - lastSeenDate.getTime()) / 1000;

  return secondsSinceLastSeen < 30;
}
