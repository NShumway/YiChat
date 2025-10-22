import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { collection, query, where, onSnapshot, orderBy, limit, doc, getDoc, getDocs } from 'firebase/firestore';
import { useSegments } from 'expo-router';
import { db } from '../services/firebase';
import { useStore } from '../store/useStore';
import { showLocalNotification } from '../services/notifications';

/**
 * Hook to listen for new messages and show notifications
 * 
 * Approach:
 * - Listen to messages collection for recent messages in user's chats
 * - Use onSnapshot with docChanges() to only process NEW messages (type === 'added')
 * - Filter out: own messages, system messages, messages in current chat
 * - Show local notification banner
 * 
 * References:
 * - Firestore Listeners: https://firebase.google.com/docs/firestore/query-data/listen
 * - Expo Notifications: https://docs.expo.dev/versions/latest/sdk/notifications/
 */
export function useMessageNotifications() {
  const user = useStore((state) => state.user);
  const segments = useSegments();
  const notifiedMessageIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Skip on web - notifications not supported
    if (Platform.OS === 'web') {
      return;
    }

    if (!user) return;

    console.log('🔔 Setting up message notification listener');

    // Get the current chat ID if user is viewing a chat
    const currentChatId = segments[0] === 'chat' && segments[1] ? segments[1] : null;
    console.log('📍 Current chat (notifications disabled for this chat):', currentChatId);

    // Listen to ALL messages (we'll filter in client)
    // Using a simple query to avoid index issues
    const messagesQuery = query(
      collection(db, 'messages'),
      orderBy('timestamp', 'desc')
    );

    let isFirstSnapshot = true; // Skip first snapshot (existing messages)

    const unsubscribe = onSnapshot(
      messagesQuery,
      async (snapshot) => {
        // Skip the first snapshot to avoid notifying for existing messages
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          console.log('🔔 Initial snapshot received, skipping existing messages');
          return;
        }

        // Only process ADDED documents (new messages)
        const newMessages = snapshot.docChanges().filter(change => change.type === 'added');
        console.log(`🔔 Received ${newMessages.length} new message(s)`);
        
        for (const change of newMessages) {
          const messageData = change.doc.data();
          const messageId = change.doc.id;
          
          console.log(`📬 Processing message ${messageId} from ${messageData.senderId}`);

          // Skip if already notified
          if (notifiedMessageIds.current.has(messageId)) {
            continue;
          }

          // Skip if message is from current user
          if (messageData.senderId === user.uid) {
            continue;
          }

          // Skip system messages
          if (messageData.type === 'system') {
            continue;
          }

          // Skip if viewing this chat
          if (messageData.chatId === currentChatId) {
            continue;
          }

          // Fetch chat info
          const chatDoc = await getDoc(doc(db, 'chats', messageData.chatId));
          if (!chatDoc.exists()) continue;

          const chatData = chatDoc.data();

          // Verify user is a participant
          if (!chatData.participants.includes(user.uid)) {
            continue;
          }

          // Fetch sender info
          const senderDoc = await getDoc(doc(db, 'users', messageData.senderId));
          const senderName = senderDoc.exists() 
            ? senderDoc.data().displayName 
            : 'Someone';

          // Determine notification title
          let title = senderName;
          if (chatData.type === 'group') {
            const chatName = chatData.name || 'Group Chat';
            title = `${senderName} in ${chatName}`;
          }

          // Show notification
          console.log('📬 Showing notification for message:', messageId);
          notifiedMessageIds.current.add(messageId);
          
          await showLocalNotification(
            title,
            messageData.text,
            { chatId: messageData.chatId }
          );
        }
      },
      (error) => {
        console.error('❌ Error listening for message notifications:', error);
      }
    );

    return () => {
      console.log('🔔 Cleaning up message notification listener');
      unsubscribe();
    };
  }, [user, segments]);
}

