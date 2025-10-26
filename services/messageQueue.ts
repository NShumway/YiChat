import NetInfo from '@react-native-community/netinfo';
import { addDoc, collection, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { dbOperations } from './database';
import { useStore } from '../store/useStore';
import { Message } from '../types/Message';

let messageQueue: Message[] = [];
let isProcessing = false;
let netInfoUnsubscribe: (() => void) | null = null;

/**
 * Initialize message queue system
 * - Loads pending messages from SQLite
 * - Sets up network state listener
 * - Processes queue when network is restored
 */
export const initMessageQueue = () => {
  console.log('🔄 Initializing message queue...');
  
  // Clean up previous listener if exists
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  
  // Load pending messages from SQLite on app start
  const pending = dbOperations.getAllPendingMessages();
  messageQueue = pending.map(p => p.messageData);
  
  console.log(`📦 Loaded ${pending.length} pending messages from SQLite`);
  
  // Set up network state listener and store unsubscribe function
  netInfoUnsubscribe = NetInfo.addEventListener(state => {
    const wasOffline = useStore.getState().connectionStatus === 'offline';
    
    if (state.isConnected && state.isInternetReachable) {
      useStore.getState().setConnectionStatus('online');
      
      // Only process if we just came back online
      if (wasOffline && messageQueue.length > 0) {
        console.log(`🌐 Network restored, processing ${messageQueue.length} queued messages`);
        processPendingMessages();
      }
    } else {
      useStore.getState().setConnectionStatus('offline');
      console.log('📡 Network unavailable');
    }
  });
  
  // Check initial network state
  NetInfo.fetch().then(state => {
    if (state.isConnected && state.isInternetReachable) {
      useStore.getState().setConnectionStatus('online');
      if (messageQueue.length > 0) {
        console.log('🔄 Initial network check: processing pending messages');
        processPendingMessages();
      }
    } else {
      useStore.getState().setConnectionStatus('offline');
    }
  });
};

/**
 * Exponential backoff retry delays
 * 1s, 2s, 5s, 10s, 30s
 */
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];
let retryAttempts = new Map<string, number>();

/**
 * Send a message with exponential backoff retry
 */
const sendWithRetry = async (message: Message): Promise<void> => {
  const attempts = retryAttempts.get(message.id) || 0;
  
  try {
    await sendMessageToFirestore(message);
    retryAttempts.delete(message.id); // Success - clear retry count
  } catch (error: any) {
    // Check if it's a transient network error or permanent error
    const isTransientError = 
      error.code === 'unavailable' || 
      error.code === 'deadline-exceeded' ||
      error.message?.includes('network') ||
      error.message?.includes('timeout');
    
    if (isTransientError && attempts < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[attempts];
      retryAttempts.set(message.id, attempts + 1);
      
      console.log(`⏰ Retry ${attempts + 1}/${RETRY_DELAYS.length} for ${message.id} in ${delay}ms`);
      
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendWithRetry(message); // Recursive retry
    } else {
      // Permanent error (auth, permissions) or max retries exceeded
      throw error;
    }
  }
};

/**
 * Process all pending messages in the queue
 * Processes sequentially to preserve message order
 */
export const processPendingMessages = async () => {
  if (isProcessing || messageQueue.length === 0) return;
  
  isProcessing = true;
  useStore.getState().setConnectionStatus('reconnecting');
  
  console.log(`🔄 Processing ${messageQueue.length} pending messages`);
  
  const errors: { message: Message; error: any }[] = [];
  
  // Process in order, one at a time to preserve sequence
  for (const message of [...messageQueue]) {
    try {
      await sendWithRetry(message); // With exponential backoff
      
      // Success: remove from queue
      dbOperations.deletePendingMessage(message.id);
      messageQueue = messageQueue.filter(m => m.id !== message.id);
      
      console.log(`✅ Sent queued message ${message.id}`);
      
    } catch (error) {
      console.error(`❌ Failed to send pending message ${message.id} after retries:`, error);
      errors.push({ message, error });
      
      // Stop processing on persistent error (e.g., auth expired)
      // Will retry on next reconnect
      // Clear retry count to start fresh on next network change
      retryAttempts.delete(message.id);
      break;
    }
  }
  
  isProcessing = false;
  
  if (messageQueue.length === 0) {
    useStore.getState().setConnectionStatus('online');
    console.log('✅ All queued messages sent successfully');
  } else {
    console.warn(`⚠️ ${messageQueue.length} messages still pending after processing`);
  }
  
  return errors;
};

/**
 * Queue a message for offline sending
 * Persists to SQLite immediately for durability
 */
export const queueMessage = (message: Message) => {
  // Persist to SQLite immediately
  dbOperations.insertPendingMessage({
    id: message.id,
    messageData: message,
    timestamp: message.timestamp,
  });
  
  messageQueue.push(message);
  
  console.log(`📦 Queued message ${message.id}, queue size: ${messageQueue.length}`);
};

/**
 * Send a message to Firestore
 * Updates local SQLite with real ID and status
 */
const sendMessageToFirestore = async (message: Message) => {
  const docRef = await addDoc(collection(db, 'messages'), {
    chatId: message.chatId,
    senderId: message.senderId,
    text: message.text,
    originalLanguage: message.originalLanguage,
    timestamp: serverTimestamp(),
    status: 'sent',
    readBy: message.readBy,
  });
  
  console.log(`📤 Message sent to Firestore: ${docRef.id}`);
  
  // Update local SQLite with real ID
  dbOperations.updateMessageId(message.id, docRef.id);
  dbOperations.updateMessageStatus(docRef.id, 'sent');
  
  // Update chat lastMessage
  await updateDoc(doc(db, 'chats', message.chatId), {
    lastMessage: message.text,
    lastMessageTimestamp: serverTimestamp(),
  });
  
  return docRef;
};

/**
 * Manual retry function for failed messages
 * Finds all failed messages and adds them to the queue
 */
export const retryFailedMessages = async () => {
  const failedMessages = dbOperations.getFailedMessages();
  
  console.log(`🔄 Retrying ${failedMessages.length} failed messages`);
  
  for (const message of failedMessages) {
    queueMessage(message);
  }
  
  if (useStore.getState().connectionStatus === 'online') {
    await processPendingMessages();
  }
};

/**
 * Get current queue status
 */
export const getQueueStatus = () => {
  return {
    queueLength: messageQueue.length,
    isProcessing,
    connectionStatus: useStore.getState().connectionStatus,
  };
};

/**
 * Cleanup function to remove network listener
 * Call this when the app is closing or user logs out
 */
export const cleanupMessageQueue = () => {
  console.log('🧹 Cleaning up message queue');
  
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
};

