import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Request notification permissions and get Expo push token
 * Returns the push token if granted, null otherwise
 */
export async function requestNotificationPermissions(userId: string): Promise<string | null> {
  // Skip on web - notifications not supported
  if (Platform.OS === 'web') {
    console.log('⚠️ Push notifications not supported on web');
    return null;
  }

  try {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('⚠️ Notification permissions not granted');
      return null;
    }

    // Get push token (projectId is auto-detected from app.json)
    let token;
    try {
      token = await Notifications.getExpoPushTokenAsync();
      console.log('✅ Push token obtained:', token.data);

      // Save token to Firestore
      await updateDoc(doc(db, 'users', userId), {
        pushToken: token.data,
        pushTokenUpdatedAt: Date.now(),
      });

      return token.data;
    } catch (tokenError: any) {
      // Push tokens require an Expo project ID (not available in bare Expo Go)
      // This is expected in development - gracefully handle it
      if (tokenError.message?.includes('projectId')) {
        console.log('⚠️ Push tokens require Expo project setup (OK for dev/testing)');
        console.log('   Foreground notifications will still work without push tokens');
        return null;
      }
      throw tokenError;
    }
  } catch (error) {
    console.error('❌ Error requesting notification permissions:', error);
    return null;
  }
}

/**
 * Show a local notification (foreground notification)
 */
export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
) {
  // Skip on web
  if (Platform.OS === 'web') {
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: true,
      },
      trigger: null, // Show immediately
    });
  } catch (error) {
    console.error('❌ Error showing notification:', error);
  }
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications() {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (error) {
    console.error('❌ Error clearing notifications:', error);
  }
}

/**
 * Set notification badge count (iOS)
 */
export async function setBadgeCount(count: number) {
  try {
    if (Platform.OS === 'ios') {
      await Notifications.setBadgeCountAsync(count);
    }
  } catch (error) {
    console.error('❌ Error setting badge count:', error);
  }
}

