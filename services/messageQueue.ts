import NetInfo from '@react-native-community/netinfo';
import { addDoc, collection, serverTimestamp, updateDoc, doc, writeBatch } from 'firebase/firestore';
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
    if (state.isConnected && state.isInternetReachable) {
      useStore.getState().setConnectionStatus('online');

      // Process queue whenever we're online and have pending messages
      // Don't check wasOffline - just process if there's work to do
      if (messageQueue.length > 0) {
        console.log(`🌐 Network available, processing ${messageQueue.length} queued messages`);
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
let batchRetryAttempts = 0;

/**
 * Send a batch of messages with exponential backoff retry
 */
const sendBatchWithRetry = async (messages: Message[]): Promise<void> => {
  try {
    await sendBatchToFirestore(messages);
    batchRetryAttempts = 0; // Success - clear retry count
  } catch (error: any) {
    // Check if it's a transient network error or permanent error
    const isTransientError =
      error.code === 'unavailable' ||
      error.code === 'deadline-exceeded' ||
      error.message?.includes('network') ||
      error.message?.includes('timeout');

    if (isTransientError && batchRetryAttempts < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[batchRetryAttempts];
      batchRetryAttempts++;

      console.log(`⏰ Batch retry ${batchRetryAttempts}/${RETRY_DELAYS.length} in ${delay}ms`);

      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendBatchWithRetry(messages); // Recursive retry
    } else {
      // Permanent error or max retries exceeded - throw to trigger fallback
      batchRetryAttempts = 0;
      throw error;
    }
  }
};

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
 * Uses batching for efficiency on poor connections (up to 10 messages per batch)
 */
export const processPendingMessages = async () => {
  if (isProcessing || messageQueue.length === 0) return;

  isProcessing = true;
  useStore.getState().setConnectionStatus('reconnecting');

  console.log(`🔄 Processing ${messageQueue.length} pending messages with batching`);

  const errors: { message: Message; error: any }[] = [];
  const BATCH_SIZE = 10; // Firestore allows up to 500, but 10 is safer for poor networks

  // Process in batches to preserve order and improve efficiency
  const queueCopy = [...messageQueue];

  for (let i = 0; i < queueCopy.length; i += BATCH_SIZE) {
    const batch = queueCopy.slice(i, i + BATCH_SIZE);

    try {
      await sendBatchWithRetry(batch);

      // Success: remove batch from queue
      batch.forEach(message => {
        dbOperations.deletePendingMessage(message.id);
        messageQueue = messageQueue.filter(m => m.id !== message.id);
      });

      console.log(`✅ Sent batch of ${batch.length} messages`);

    } catch (error) {
      console.error(`❌ Failed to send batch after retries:`, error);

      // On batch failure, fall back to individual sends for this batch
      console.log('🔄 Falling back to individual sends for failed batch');

      for (const message of batch) {
        try {
          await sendWithRetry(message);

          // Success: remove from queue
          dbOperations.deletePendingMessage(message.id);
          messageQueue = messageQueue.filter(m => m.id !== message.id);

          console.log(`✅ Sent queued message ${message.id} (individual)`);

        } catch (error) {
          console.error(`❌ Failed to send pending message ${message.id} after retries:`, error);
          errors.push({ message, error });

          // Stop processing on persistent error (e.g., auth expired)
          retryAttempts.delete(message.id);
          isProcessing = false;
          return errors;
        }
      }
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
 * Send a batch of messages to Firestore using writeBatch
 * More efficient for poor connections - single network request
 */
const sendBatchToFirestore = async (messages: Message[]) => {
  const batch = writeBatch(db);
  const messageRefs: { oldId: string; newRef: any }[] = [];

  // Add all messages to batch
  for (const message of messages) {
    const messageRef = doc(collection(db, 'messages'));
    batch.set(messageRef, {
      chatId: message.chatId,
      senderId: message.senderId,
      text: message.text,
      originalLanguage: message.originalLanguage,
      timestamp: serverTimestamp(),
      status: 'sent',
      readBy: message.readBy,
    });

    messageRefs.push({ oldId: message.id, newRef: messageRef });
  }

  // Update last message for each affected chat (one update per chat)
  const chatUpdates = new Map<string, Message>();
  messages.forEach(msg => {
    // Keep the latest message per chat
    if (!chatUpdates.has(msg.chatId) || msg.timestamp > chatUpdates.get(msg.chatId)!.timestamp) {
      chatUpdates.set(msg.chatId, msg);
    }
  });

  chatUpdates.forEach((msg, chatId) => {
    const chatRef = doc(db, 'chats', chatId);
    batch.update(chatRef, {
      lastMessage: msg.text,
      lastMessageTimestamp: serverTimestamp(),
    });
  });

  // Commit batch (single network request)
  await batch.commit();

  console.log(`📤 Batch of ${messages.length} messages sent to Firestore`);

  // Update local SQLite with real IDs
  messageRefs.forEach(({ oldId, newRef }) => {
    dbOperations.updateMessageId(oldId, newRef.id);
    dbOperations.updateMessageStatus(newRef.id, 'sent');
  });
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

