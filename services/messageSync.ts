import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { dbOperations } from './database';
import { useStore } from '../store/useStore';
import { Message } from '../types/Message';
import { processPendingMessages } from './messageQueue';

let firestoreUnsubscribers: (() => void)[] = [];
let lastSyncTimestamp = Date.now();

/**
 * Initialize message sync system
 * Handles app lifecycle (background/foreground) and syncs messages
 */
export const initMessageSync = (userId: string) => {
  let appState = AppState.currentState;
  
  console.log('🔄 Initializing message sync for user:', userId);
  
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log('📱 App state change:', appState, '->', nextAppState);
    
    // Going to background
    if (appState.match(/active/) && nextAppState.match(/inactive|background/)) {
      console.log('🌙 App backgrounded - saving sync state');
      
      // Save last sync time before backgrounding
      await AsyncStorage.setItem('lastSyncTimestamp', Date.now().toString());
      
      // Update user status to offline
      if (userId) {
        try {
          await updateDoc(doc(db, 'users', userId), {
            status: 'offline',
            lastSeen: serverTimestamp(),
          });
        } catch (error) {
          console.error('❌ Error updating offline status:', error);
        }
      }
      
      // Firestore listeners stay active for ~60 seconds in background
      // They'll auto-disconnect, then reconnect on foreground
    }
    
    // Coming to foreground
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('☀️ App foregrounded - syncing messages');
      
      // Update user status to online immediately
      if (userId) {
        try {
          await updateDoc(doc(db, 'users', userId), {
            status: 'online',
            lastSeen: serverTimestamp(),
          });
        } catch (error) {
          console.error('❌ Error updating online status:', error);
        }
      }
      
      // Check network connectivity
      const netState = await NetInfo.fetch();
      if (netState.isConnected && netState.isInternetReachable) {
        useStore.getState().setConnectionStatus('reconnecting');
        
        // Sync missed messages (target: <1 second)
        await syncMissedMessages(userId);
        
        // Process pending queue
        await processPendingMessages();
        
        useStore.getState().setConnectionStatus('online');
      } else {
        useStore.getState().setConnectionStatus('offline');
      }
    }
    
    appState = nextAppState;
  };
  
  const subscription = AppState.addEventListener('change', handleAppStateChange);
  
  return () => {
    subscription.remove();
    firestoreUnsubscribers.forEach(unsub => unsub());
  };
};

/**
 * Sync messages that were missed while app was in background
 * Uses delta sync to only fetch new messages since last sync
 */
const syncMissedMessages = async (userId: string) => {
  const startTime = Date.now();
  
  try {
    // Get last sync timestamp
    const lastSyncStr = await AsyncStorage.getItem('lastSyncTimestamp');
    const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr) : Date.now() - 86400000; // 24h ago fallback
    
    console.log(`🔄 Syncing messages since ${new Date(lastSyncTime).toISOString()}`);
    
    // Get user's chats first (batch query)
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', userId)
    );
    
    const chatsSnapshot = await getDocs(chatsQuery);
    const chatIds = chatsSnapshot.docs.map(docSnap => docSnap.id);
    
    console.log(`📬 Found ${chatIds.length} chats to sync`);
    
    if (chatIds.length === 0) {
      console.log('✅ No chats to sync');
      return;
    }
    
    // Batch fetch messages for all chats (parallel queries)
    // Limit parallelism to avoid overwhelming poor networks
    const PARALLEL_LIMIT = 5;
    const allNewMessages: Message[] = [];
    
    for (let i = 0; i < chatIds.length; i += PARALLEL_LIMIT) {
      const batchChatIds = chatIds.slice(i, i + PARALLEL_LIMIT);
      
      const messagePromises = batchChatIds.map(async (chatId) => {
        try {
          const messagesQuery = query(
            collection(db, 'messages'),
            where('chatId', '==', chatId),
            where('timestamp', '>', lastSyncTime),
            orderBy('timestamp', 'asc'),
            limit(100) // Limit per chat to avoid huge syncs
          );
          
          const messagesSnapshot = await getDocs(messagesQuery);
          return messagesSnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              chatId: data.chatId,
              senderId: data.senderId,
              text: data.text,
              originalLanguage: data.originalLanguage,
              timestamp: data.timestamp?.toMillis?.() || data.timestamp || Date.now(),
              status: data.status || 'sent',
              readBy: data.readBy || {},
              mediaURL: data.mediaURL,
              localOnly: false,
            } as Message;
          });
        } catch (error) {
          console.error(`❌ Failed to sync chat ${chatId}:`, error);
          return []; // Skip failed chats, don't block others
        }
      });
      
      const messageArrays = await Promise.all(messagePromises);
      allNewMessages.push(...messageArrays.flat());
    }
    
    console.log(`📥 Fetched ${allNewMessages.length} new messages across ${chatIds.length} chats`);
    
    // Batch insert to SQLite (transaction for speed)
    if (allNewMessages.length > 0) {
      dbOperations.batchInsertMessages(allNewMessages);
      console.log('✅ Messages synced to SQLite');
    }
    
    // Update last sync timestamp
    await AsyncStorage.setItem('lastSyncTimestamp', Date.now().toString());
    
    const syncDuration = Date.now() - startTime;
    console.log(`✅ Delta sync completed in ${syncDuration}ms`);
    
    // Target is <1 second for 100 messages, <2s for 100+
    const target = allNewMessages.length > 100 ? 2000 : 1000;
    if (syncDuration > target) {
      console.warn(`⚠️ Sync took ${syncDuration}ms, target is <${target}ms for ${allNewMessages.length} messages`);
    }
    
    return allNewMessages.length;
  } catch (error) {
    console.error('❌ Delta sync failed:', error);
    // Don't throw - app should continue working with local data
    return 0;
  }
};

/**
 * Set up real-time Firestore listeners for active chats
 * Called after sync to receive new messages in real-time
 */
export const setupRealtimeListeners = (chatIds: string[]) => {
  // Unsubscribe from old listeners
  firestoreUnsubscribers.forEach(unsub => unsub());
  firestoreUnsubscribers = [];
  
  console.log(`🔥 Setting up real-time listeners for ${chatIds.length} chats`);
  
  // Set up new listeners for each chat
  chatIds.forEach(chatId => {
    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', chatId),
      where('timestamp', '>', lastSyncTimestamp),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data();
          const message: Message = {
            id: change.doc.id,
            chatId: data.chatId,
            senderId: data.senderId,
            text: data.text,
            originalLanguage: data.originalLanguage,
            timestamp: data.timestamp?.toMillis?.() || data.timestamp || Date.now(),
            status: data.status || 'sent',
            readBy: data.readBy || {},
            mediaURL: data.mediaURL,
            localOnly: false,
          };
          
          if (change.type === 'added' || change.type === 'modified') {
            dbOperations.insertMessage(message);
          }
        });
      },
      (error) => {
        console.error('❌ Firestore listener error:', error);
        // Attempt reconnection on error
        setTimeout(() => setupRealtimeListeners(chatIds), 5000);
      }
    );
    
    firestoreUnsubscribers.push(unsubscribe);
  });
  
  lastSyncTimestamp = Date.now();
};

/**
 * Cleanup function to remove all listeners
 */
export const cleanupMessageSync = () => {
  console.log('🧹 Cleaning up message sync');
  firestoreUnsubscribers.forEach(unsub => unsub());
  firestoreUnsubscribers = [];
};

