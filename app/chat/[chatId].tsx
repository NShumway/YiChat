import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
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
import { db } from '../../services/firebase';
import { dbOperations } from '../../services/database';
import { useStore } from '../../store/useStore';
import { Message } from '../../types/Message';
import { MessageBubble } from '../../components/MessageBubble';
import { ConnectionBanner } from '../../components/ConnectionBanner';
import { safeGetDoc } from '../../services/firestoreHelpers';

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
  const flashListRef = useRef<FlashList<Message>>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

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

  // Load messages from SQLite first (instant, no loading state)
  useEffect(() => {
    if (!chatId) return;

    console.log('📱 Loading messages from SQLite for chat:', chatId);
    const localMessages = dbOperations.getMessagesByChat(chatId);
    console.log(`✅ Loaded ${localMessages.length} messages from SQLite`);
    setMessages(localMessages);
  }, [chatId]);

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

  // Memoized render function for performance
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      return (
        <MessageBubble 
          message={item} 
          isOwn={item.senderId === user?.uid} 
          isGroupChat={chatData?.type === 'group'}
        />
      );
    },
    [user?.uid, chatData?.type]
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
    if (!messageText.trim() || !user || !chatId || isSending) return;

    const text = messageText.trim();
    setIsSending(true);

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

      // 5. Send to Firestore (async, don't block UI)
      const docRef = await addDoc(collection(db, 'messages'), {
        chatId,
        senderId: user.uid,
        text,
        originalLanguage: user.preferredLanguage,
        timestamp: serverTimestamp(),
        status: 'sent',
        readBy: { [user.uid]: Date.now() },
      });

      console.log('✅ Message sent to Firestore:', docRef.id);

      // 6. Update local message with real ID
      // Don't update status yet - let Firestore listener handle it to avoid double-render
      dbOperations.updateMessageId(tempId, docRef.id);

      // 7. Update chat's last message and increment unread count for other participants
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          <Text style={styles.headerTitle}>
            {chatData?.type === 'group' 
              ? chatData?.name || 'Group Chat'
              : 'Chat'}
          </Text>
          {chatData?.type === 'group' && (
            <Text style={styles.participantCount}>
              {chatData?.participants?.length || 0} participants
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
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

