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
  const userChatIds = useRef<Set<string>>(new Set());
  const pendingNotifications = useRef<Map<string, {
    count: number;
    timeout: NodeJS.Timeout;
    latestMessageData: any;
    latestSenderName: string;
    chatData: any;
  }>>(new Map());

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

    // First, get user's chats to know which messages to listen to
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const chatsUnsubscribe = onSnapshot(chatsQuery, (chatsSnapshot) => {
      // Update the set of chat IDs user is part of
      userChatIds.current = new Set(chatsSnapshot.docs.map(doc => doc.id));
      console.log(`🔔 User is in ${userChatIds.current.size} chat(s)`);
    });

    // Listen to messages, but only process those in user's chats
    // Still need to query all messages since we can't do "where chatId in array" easily
    // But we filter client-side with the cached chat IDs
    const messagesQuery = query(
      collection(db, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(100) // Only watch recent 100 messages for performance
    );

    let isFirstSnapshot = true; // Skip first snapshot (existing messages)

    const messagesUnsubscribe = onSnapshot(
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

          console.log('🔔 Processing new message:', {
            messageId,
            text: messageData.text?.substring(0, 50),
            timestamp: messageData.timestamp,
            chatId: messageData.chatId,
          });

          // Skip if not in user's chats
          if (!userChatIds.current.has(messageData.chatId)) {
            console.log('⏭️ Skipping - not in user chats');
            continue;
          }

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

          console.log(`📬 Processing message ${messageId} from ${messageData.senderId}`);

          // Fetch chat info
          const chatDoc = await getDoc(doc(db, 'chats', messageData.chatId));
          if (!chatDoc.exists()) continue;

          const chatData = chatDoc.data();

          // Fetch sender info
          const senderDoc = await getDoc(doc(db, 'users', messageData.senderId));
          const senderName = senderDoc.exists()
            ? senderDoc.data().displayName
            : 'Someone';

          // Mark as notified
          notifiedMessageIds.current.add(messageId);

          // Group notifications by chat with debouncing
          const chatId = messageData.chatId;
          const pending = pendingNotifications.current.get(chatId);

          if (pending) {
            // Already have a pending notification for this chat
            clearTimeout(pending.timeout);
            pending.count++;
            // Update to latest message data
            pending.latestMessageData = messageData;
            pending.latestSenderName = senderName;
            pending.chatData = chatData;

            // Show grouped notification after short delay
            const timeout = setTimeout(async () => {
              const count = pending.count;
              const latestData = pending.latestMessageData;
              const latestSender = pending.latestSenderName;
              const chat = pending.chatData;
              pendingNotifications.current.delete(chatId);

              const title = chat.type === 'group'
                ? `${count} new messages in ${chat.name || 'Group Chat'}`
                : `${count} new messages from ${latestSender}`;

              // Use translation if available, fallback to original text
              const userLanguage = user?.preferredLanguage || 'en-US';
              const displayText = (latestData.translations && latestData.translations[userLanguage])
                ? latestData.translations[userLanguage]
                : latestData.text;

              await showLocalNotification(
                title,
                displayText, // Show LATEST translated message
                { chatId }
              );
            }, 2000); // Wait 2s to group more messages

            pending.timeout = timeout;
          } else {
            // First message from this chat - show immediately but set up grouping
            const timeout = setTimeout(async () => {
              pendingNotifications.current.delete(chatId);
            }, 2000);

            pendingNotifications.current.set(chatId, {
              count: 1,
              timeout,
              latestMessageData: messageData,
              latestSenderName: senderName,
              chatData: chatData,
            });

            const title = chatData.type === 'group'
              ? `${senderName} in ${chatData.name || 'Group Chat'}`
              : senderName;

            // Use translation if available, fallback to original text
            const userLanguage = user?.preferredLanguage || 'en-US';

            console.log('🔔 Preparing notification for single message:', {
              messageId,
              originalText: messageData.text,
              hasTranslations: !!messageData.translations,
              translationKeys: messageData.translations ? Object.keys(messageData.translations) : [],
              userLanguage,
              translationForUser: messageData.translations?.[userLanguage],
            });

            const displayText = (messageData.translations && messageData.translations[userLanguage])
              ? messageData.translations[userLanguage]
              : messageData.text;

            console.log('🔔 Final display text for notification:', displayText);

            await showLocalNotification(
              title,
              displayText,
              { chatId }
            );
          }
        }
      },
      (error) => {
        console.error('❌ Error listening for message notifications:', error);
      }
    );

    return () => {
      console.log('🔔 Cleaning up message notification listener');
      chatsUnsubscribe();
      messagesUnsubscribe();

      // Clear all pending notification timeouts
      pendingNotifications.current.forEach(pending => clearTimeout(pending.timeout));
      pendingNotifications.current.clear();
    };
  }, [user, segments]);
}

