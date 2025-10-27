import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  KeyboardEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { dbOperations } from '../../services/database';
import { useStore } from '../../store/useStore';
import { Message } from '../../types/Message';
import { MessageBubble } from '../../components/MessageBubble';
import { ConnectionBanner } from '../../components/ConnectionBanner';
import { AIChatModal } from '../../components/AIChatModal';
import { safeGetDoc } from '../../services/firestoreHelpers';
import { subscribeToUserPresence } from '../../services/presence';

export default function ChatScreen() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const user = useStore((state) => state.user);
  const connectionStatus = useStore((state) => state.connectionStatus);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [othersTyping, setOthersTyping] = useState(false);
  const [chatData, setChatData] = useState<any>(null);
  const [otherUserName, setOtherUserName] = useState<string>('');
  const [otherUserStatus, setOtherUserStatus] = useState<'online' | 'offline'>('offline');
  const [aiChatVisible, setAIChatVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [senderNationalities, setSenderNationalities] = useState<{ [userId: string]: string }>({});
  const flashListRef = useRef<FlashList<Message>>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const currentScrollOffset = useRef<number>(0);

  // Load chat data and reset unread count
  useEffect(() => {
    if (!chatId || !user) return;

    const loadChatData = async () => {
      // Skip if offline
      if (connectionStatus === 'offline') {
        console.log('⏭️ Skipping chat data load - offline');
        return;
      }

      const { data, exists, isOfflineError } = await safeGetDoc<any>(
        doc(db, 'chats', chatId)
      );

      if (exists && data) {
        setChatData({ id: chatId, ...data });

        // For direct chats, fetch the other user's info
        if (data.type === 'direct' && user) {
          const otherUserId = data.participants.find((id: string) => id !== user.uid);
          if (otherUserId) {
            const otherUserDoc = await safeGetDoc<any>(doc(db, 'users', otherUserId));
            if (otherUserDoc.exists && otherUserDoc.data) {
              setOtherUserName(otherUserDoc.data.displayName || 'User');
              // Don't set status here - we'll use real-time subscription below
            }
          }
        }

        // Reset unread count for this user
        const currentUnreadCount = typeof data.unreadCount === 'object'
          ? (data.unreadCount[user.uid] || 0)
          : data.unreadCount;

        if (currentUnreadCount > 0 && connectionStatus === 'online') {
          console.log(`📖 Resetting unread count for chat ${chatId}`);
          try {
            await updateDoc(doc(db, 'chats', chatId), {
              [`unreadCount.${user.uid}`]: 0
            });
          } catch (error: any) {
            // Silently fail if offline
            if (!error?.message?.includes('offline')) {
              console.error('❌ Error resetting unread count:', error);
            }
          }
        }
      } else if (isOfflineError) {
        console.log('📡 Chat data unavailable - offline');
      } else {
        console.warn('⚠️ Chat not found:', chatId);
      }
    };

    loadChatData();
  }, [chatId, user, connectionStatus]);

  // Subscribe to other user's presence in real-time (for direct chats)
  useEffect(() => {
    if (!chatData || chatData.type !== 'direct' || !user) return;

    const otherUserId = chatData.participants.find((id: string) => id !== user.uid);
    if (!otherUserId) return;

    console.log('👂 Subscribing to presence for user:', otherUserId);

    const unsubscribe = subscribeToUserPresence(otherUserId, (status) => {
      console.log(`👤 Other user status updated: ${status}`);
      setOtherUserStatus(status);
    });

    return () => {
      console.log('🧹 Unsubscribing from presence');
      unsubscribe();
    };
  }, [chatData, user]);

  // Load messages from SQLite first (instant, no loading state)
  useEffect(() => {
    if (!chatId) return;

    console.log('📱 Loading messages from SQLite for chat:', chatId);
    const localMessages = dbOperations.getMessagesByChat(chatId);
    console.log(`✅ Loaded ${localMessages.length} messages from SQLite`);
    setMessages(localMessages);
  }, [chatId]);

  // Fetch sender nationalities for AI context
  useEffect(() => {
    if (!chatId || messages.length === 0) return;

    const fetchNationalities = async () => {
      const senderIds = [...new Set(messages.map(m => m.senderId))];
      const nationalities: { [userId: string]: string } = {};

      for (const senderId of senderIds) {
        if (senderNationalities[senderId]) continue; // Already fetched

        try {
          const { data, exists } = await safeGetDoc<any>(doc(db, 'users', senderId));
          if (exists && data) {
            nationalities[senderId] = data.nationality || 'Unknown';
          }
        } catch (error) {
          console.warn(`Failed to fetch nationality for ${senderId}:`, error);
        }
      }

      if (Object.keys(nationalities).length > 0) {
        setSenderNationalities(prev => ({ ...prev, ...nationalities }));
      }
    };

    fetchNationalities();
  }, [messages, chatId]);

  // Then sync with Firestore (real-time updates)
  useEffect(() => {
    if (!chatId) return;

    console.log('🔥 Setting up Firestore listener for chat:', chatId);

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', chatId),
      orderBy('timestamp', 'asc'),
      limit(1000) // Load last 1000 messages
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log(`📬 Received ${snapshot.docChanges().length} message changes`);
        
        // Only process changes, not full dataset
        snapshot.docChanges().forEach((change) => {
          const messageData = change.doc.data();

          console.log('📥 Received message from Firestore:', {
            id: change.doc.id,
            text: messageData.text,
            originalLanguage: messageData.originalLanguage,
            hasTranslations: !!messageData.translations,
            translationKeys: messageData.translations ? Object.keys(messageData.translations) : [],
            hasTone: !!messageData.tone,
          });

          const message: Message = {
            id: change.doc.id,
            chatId: messageData.chatId,
            senderId: messageData.senderId,
            text: messageData.text,
            originalLanguage: messageData.originalLanguage,
            timestamp: messageData.timestamp?.toMillis?.() || messageData.timestamp || Date.now(),
            status: messageData.status || 'sent',
            readBy: messageData.readBy || {},
            mediaURL: messageData.mediaURL,
            localOnly: false,
            // ADD MISSING FIELDS!
            translations: messageData.translations,
            tone: messageData.tone,
            aiInsights: messageData.aiInsights,
            embedded: messageData.embedded,
          };

          if (change.type === 'added' || change.type === 'modified') {
            // Check if this is replacing a temp message (same sender, timestamp, text)
            if (change.type === 'added') {
              const localMessages = dbOperations.getMessagesByChat(chatId);
              const tempMessage = localMessages.find(
                m => m.localOnly && 
                     m.senderId === message.senderId && 
                     m.text === message.text &&
                     Math.abs(m.timestamp - message.timestamp) < 5000 // Within 5 seconds
              );
              if (tempMessage) {
                console.log('🔄 Replacing temp message:', tempMessage.id, '→', message.id);
                dbOperations.deleteMessage(tempMessage.id);
              }
            }
            
            dbOperations.insertMessage(message);
          } else if (change.type === 'removed') {
            dbOperations.deleteMessage(message.id);
          }
        });

        // Reload from SQLite (indexed queries are <10ms)
        const updatedMessages = dbOperations.getMessagesByChat(chatId);
        setMessages(updatedMessages);
      },
      (error) => {
        console.error('❌ Error syncing messages:', error);
      }
    );

    return () => {
      console.log('🔥 Cleaning up Firestore listener');
      unsubscribe();
    };
  }, [chatId]);

  // Handler for opening AI chat
  const handleAIChat = useCallback((message: Message) => {
    setSelectedMessage(message);
    setAIChatVisible(true);
  }, []);

  // Memoized render function for performance
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      // Debug logging for messages without text
      if (!item || !item.text) {
        console.error('🔴 ChatScreen: Rendering message without text', {
          messageId: item?.id,
          hasText: !!item?.text,
          messageType: item?.type,
          senderId: item?.senderId,
          timestamp: item?.timestamp,
          fullMessage: item,
        });
      }

      return (
        <MessageBubble
          message={item}
          isOwn={item.senderId === user?.uid}
          isGroupChat={chatData?.type === 'group'}
          chatParticipants={chatData?.participants}
          onAIChat={handleAIChat}
        />
      );
    },
    [user?.uid, chatData?.type, chatData?.participants, handleAIChat]
  );

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: Message) => item.id, []);

  // Throttled typing indicator update
  const updateTypingStatus = useCallback(() => {
    if (!user || !chatId) return;
    
    setDoc(doc(db, 'typing', `${chatId}_${user.uid}`), {
      userId: user.uid,
      chatId,
      timestamp: Date.now(),
    }, { merge: true }).catch(err => {
      console.warn('Failed to update typing status:', err);
    });
  }, [chatId, user]);

  // Handle text input change
  const handleTextChange = (text: string) => {
    setMessageText(text);
    
    if (!user || !chatId) return;
    
    // Update typing status (throttled by timeout)
    updateTypingStatus();
    
    // Clear typing after 3 seconds of inactivity
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      deleteDoc(doc(db, 'typing', `${chatId}_${user.uid}`)).catch(() => {});
    }, 3000);
  };

  // Listen for other users typing
  useEffect(() => {
    if (!chatId || !user) return;

    const q = query(
      collection(db, 'typing'),
      where('chatId', '==', chatId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const typingUsers = snapshot.docs
          .filter(docSnap => {
            const data = docSnap.data();
            // Filter out own user and stale indicators (>10s old)
            return data.userId !== user.uid && 
                   (Date.now() - data.timestamp < 10000);
          })
          .map(docSnap => docSnap.data().userId);

        setOthersTyping(typingUsers.length > 0);
      },
      (error) => {
        console.error('Typing indicator listener error:', error);
      }
    );

    return unsubscribe;
  }, [chatId, user]);

  // Cleanup typing indicator on unmount
  useEffect(() => {
    return () => {
      if (user && chatId) {
        deleteDoc(doc(db, 'typing', `${chatId}_${user.uid}`)).catch(() => {});
      }
    };
  }, [chatId, user]);

  // Handle keyboard show/hide to maintain scroll position
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event: KeyboardEvent) => {
        // Keyboard is showing - scroll up by keyboard height to keep current bottom message visible
        const keyboardHeight = event.endCoordinates.height;

        // Get current scroll position (FlashList doesn't expose this directly)
        // So we scroll by the keyboard height to maintain the visible content
        setTimeout(() => {
          flashListRef.current?.scrollToOffset({
            offset: currentScrollOffset.current + keyboardHeight,
            animated: true,
          });
        }, 50);
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (event: KeyboardEvent) => {
        // Keyboard is hiding - scroll back down
        const keyboardHeight = event.endCoordinates.height;

        setTimeout(() => {
          flashListRef.current?.scrollToOffset({
            offset: Math.max(0, currentScrollOffset.current - keyboardHeight),
            animated: true,
          });
        }, 50);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Mark messages as read when viewing chat
  useEffect(() => {
    if (!chatId || !user || messages.length === 0) return;

    const markMessagesAsRead = async () => {
      try {
        const unreadMessages = messages.filter(
          m => m.senderId !== user.uid && 
               !m.localOnly &&
               !m.readBy?.[user.uid]
        );

        if (unreadMessages.length === 0) return;

        console.log(`📖 Marking ${unreadMessages.length} messages as read`);

        // Batch update for efficiency (up to 500 docs)
        const batch = writeBatch(db);

        unreadMessages.forEach(message => {
          const messageRef = doc(db, 'messages', message.id);
          batch.update(messageRef, {
            [`readBy.${user.uid}`]: Date.now(),
          });
        });

        await batch.commit();
        console.log('✅ Read receipts sent');
      } catch (error) {
        console.error('❌ Error sending read receipts:', error);
      }
    };

    // Mark as read after a short delay (user has time to see the messages)
    const timer = setTimeout(markMessagesAsRead, 1000);
    return () => clearTimeout(timer);
  }, [chatId, user, messages]);

  const sendMessage = async () => {
    if (!messageText.trim() || !user || !chatId || isSending || !chatData) return;

    const text = messageText.trim();
    setIsSending(true);

    // Process any pending messages first (if online and queue not empty)
    if (connectionStatus === 'online') {
      const { queueLength } = require('../../services/messageQueue').getQueueStatus();
      if (queueLength > 0) {
        console.log('🔄 Processing pending queue before sending new message');
        require('../../services/messageQueue').processPendingMessages();
      }
    }

    // 1. Create optimistic message
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();

    const optimisticMessage: Message = {
      id: tempId,
      chatId,
      senderId: user.uid,
      text,
      originalLanguage: user.preferredLanguage,
      timestamp,
      status: 'sending',
      readBy: { [user.uid]: timestamp },
      localOnly: true,
    };

    // 2. Insert to SQLite (synchronous, instant UI update)
    try {
      dbOperations.insertMessage(optimisticMessage);
      // Reload from SQLite to trigger UI update
      const updatedMessages = dbOperations.getMessagesByChat(chatId);
      setMessages(updatedMessages);

      // 3. Clear input immediately (responsive feel)
      setMessageText('');

      // 4. Scroll to bottom
      setTimeout(() => {
        flashListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      // 5. Prepare message with translation (if online)
      let translationData: {
        originalLanguage: string;
        translations?: { [language: string]: string };
        tone?: string;
      } = {
        originalLanguage: user.preferredLanguage,
      };

      if (connectionStatus === 'online' && auth.currentUser) {
        try {
          console.log('🌐 Preparing translation for:', {
            text: text.substring(0, 50),
            chatId,
            senderId: user.uid,
            userLanguage: user.preferredLanguage,
            participants: chatData.participants,
          });
          const { prepareMessageWithTranslation } = await import('../../services/translation');
          translationData = await prepareMessageWithTranslation(
            text,
            chatId,
            user.uid,
            user.preferredLanguage,
            chatData.participants
          );
          console.log('✅ Translation prepared:', JSON.stringify(translationData, null, 2));
        } catch (translationError: any) {
          console.warn('⚠️ Translation failed, sending without translation:', translationError.message);
          console.error('Translation error details:', translationError);
          // Continue without translation - don't block message sending
        }
      } else {
        console.log('⚠️ Skipping translation:', {
          connectionStatus,
          hasAuthUser: !!auth.currentUser,
        });
      }

      // 6. Send to Firestore (async, don't block UI)
      const messageData: any = {
        chatId,
        senderId: user.uid,
        text,
        originalLanguage: translationData.originalLanguage,
        timestamp: serverTimestamp(),
        status: 'sent',
        readBy: { [user.uid]: Date.now() },
      };

      // Add translation fields if present
      if (translationData.translations && Object.keys(translationData.translations).length > 0) {
        messageData.translations = translationData.translations;
        console.log('✅ Added translations to messageData:', Object.keys(translationData.translations));
      } else {
        console.log('⚠️ No translations to add');
      }
      if (translationData.tone) {
        messageData.tone = translationData.tone;
        console.log('✅ Added tone to messageData:', translationData.tone);
      }
      // Mark as not embedded yet (batch job will do it later)
      messageData.embedded = false;

      console.log('📤 Sending to Firestore:', {
        hasTranslations: !!messageData.translations,
        translationKeys: messageData.translations ? Object.keys(messageData.translations) : [],
        originalLanguage: messageData.originalLanguage,
        hasTone: !!messageData.tone,
      });

      const docRef = await addDoc(collection(db, 'messages'), messageData);

      console.log('✅ Message sent to Firestore:', docRef.id);

      // 7. Update local message with real ID and translation data
      dbOperations.updateMessageId(tempId, docRef.id);

      // Update the optimistic message with translation data
      const finalMessage: Message = {
        ...optimisticMessage,
        id: docRef.id,
        originalLanguage: translationData.originalLanguage,
        translations: translationData.translations,
        tone: translationData.tone,
        embedded: false,
        status: 'sent',
      };
      dbOperations.insertMessage(finalMessage);

      // 8. Update chat's last message and increment unread count for other participants
      const { data: chatDocData, exists } = await safeGetDoc<any>(
        doc(db, 'chats', chatId)
      );

      if (exists && chatDocData) {
        const updates: any = {
          lastMessage: text,
          lastMessageTimestamp: Date.now(),
        };

        // Increment unread count for all participants except sender
        chatDocData.participants.forEach((participantId: string) => {
          if (participantId !== user.uid) {
            const currentCount = typeof chatDocData.unreadCount === 'object'
              ? (chatDocData.unreadCount[participantId] || 0)
              : 0;
            updates[`unreadCount.${participantId}`] = currentCount + 1;
          }
        });

        await updateDoc(doc(db, 'chats', chatId), updates);
      }

      // Firestore listener will sync and update UI (avoids double-render)
    } catch (error) {
      console.error('❌ Error sending message:', error);

      // Update message status to failed
      dbOperations.updateMessageStatus(tempId, 'failed');
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m))
      );

      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Connection Status Banner */}
        <ConnectionBanner />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>
              {chatData?.type === 'group'
                ? chatData?.name || 'Group Chat'
                : otherUserName || 'Chat'}
            </Text>
            {chatData?.type === 'direct' && otherUserName && (
              <View style={[
                styles.statusDot,
                otherUserStatus === 'online' ? styles.statusOnline : styles.statusOffline
              ]} />
            )}
          </View>
          {chatData?.type === 'group' && (
            <Text style={styles.participantCount}>
              {chatData?.participants?.length || 0} participants
            </Text>
          )}
          {chatData?.type === 'direct' && (
            <Text style={styles.participantCount}>
              {otherUserStatus === 'online' ? 'Online' : 'Offline'}
            </Text>
          )}
          {connectionStatus !== 'online' && (
            <Text style={styles.connectionStatus}>
              {connectionStatus === 'offline' ? '⚠️ Offline' : '🔄 Reconnecting...'}
            </Text>
          )}
        </View>
      </View>

      {/* Messages List */}
      <FlashList
        ref={flashListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        estimatedItemSize={80}
        contentContainerStyle={styles.messagesList}
        onScroll={(event) => {
          // Track current scroll position for keyboard adjustment
          currentScrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={21}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Send a message to start the conversation</Text>
          </View>
        }
      />

      {/* Typing Indicator */}
      {othersTyping && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>💬 User is typing...</Text>
        </View>
      )}

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          value={messageText}
          onChangeText={handleTextChange}
          multiline
          maxLength={1000}
          editable={!isSending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!messageText.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!messageText.trim() || isSending}
        >
          <Text style={styles.sendButtonText}>
            {isSending ? '⏱' : '➤'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* AI Chat Modal */}
      {selectedMessage && (
        <AIChatModal
          visible={aiChatVisible}
          onClose={() => {
            setAIChatVisible(false);
            setSelectedMessage(null);
          }}
          message={selectedMessage}
          senderNationality={senderNationalities[selectedMessage.senderId]}
        />
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 28,
    color: '#007AFF',
  },
  headerContent: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOnline: {
    backgroundColor: '#4CAF50',
  },
  statusOffline: {
    backgroundColor: '#999',
  },
  participantCount: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  connectionStatus: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: 2,
  },
  messagesList: {
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  typingIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
  },
  typingText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    fontSize: 16,
    color: '#1a1a1a',
    marginRight: 12,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    fontSize: 20,
    color: '#fff',
  },
});

