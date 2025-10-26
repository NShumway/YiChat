import { DocumentReference, CollectionReference, Query, getDoc, getDocs, DocumentSnapshot, QuerySnapshot } from 'firebase/firestore';
import { useStore } from '../store/useStore';

/**
 * Safely get a Firestore document with offline handling
 * Returns null if offline or document doesn't exist
 */
export const safeGetDoc = async <T>(
  docRef: DocumentReference,
  fallbackData?: T
): Promise<{ data: T | null; exists: boolean; isOfflineError: boolean }> => {
  try {
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        data: docSnap.data() as T,
        exists: true,
        isOfflineError: false
      };
    }

    return {
      data: fallbackData || null,
      exists: false,
      isOfflineError: false
    };
  } catch (error: any) {
    // Check if it's an offline error
    const isOffline =
      error?.code === 'unavailable' ||
      error?.message?.includes('offline') ||
      error?.message?.includes('network') ||
      error?.message?.includes('Failed to get document');

    if (isOffline) {
      console.log('📡 Firestore offline - using fallback data');
      return {
        data: fallbackData || null,
        exists: false,
        isOfflineError: true
      };
    }

    // Re-throw non-offline errors
    console.error('❌ Firestore error:', error);
    throw error;
  }
};

/**
 * Safely get multiple Firestore documents with offline handling
 * Returns empty array if offline
 */
export const safeGetDocs = async <T>(
  queryRef: Query | CollectionReference,
  fallbackData?: T[]
): Promise<{ data: T[]; isOfflineError: boolean }> => {
  try {
    const querySnapshot = await getDocs(queryRef);

    const data = querySnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    })) as T[];

    return {
      data,
      isOfflineError: false
    };
  } catch (error: any) {
    // Check if it's an offline error
    const isOffline =
      error?.code === 'unavailable' ||
      error?.message?.includes('offline') ||
      error?.message?.includes('network') ||
      error?.message?.includes('Failed to get document');

    if (isOffline) {
      console.log('📡 Firestore offline - using fallback data');
      return {
        data: fallbackData || [],
        isOfflineError: true
      };
    }

    // Re-throw non-offline errors
    console.error('❌ Firestore error:', error);
    throw error;
  }
};

/**
 * Check if we're currently offline based on connection status
 */
export const isOffline = (): boolean => {
  const status = useStore.getState().connectionStatus;
  return status === 'offline' || status === 'reconnecting';
};

/**
 * Skip Firestore operation if offline, otherwise execute it
 */
export const skipIfOffline = async <T>(
  operation: () => Promise<T>,
  fallbackValue: T
): Promise<T> => {
  if (isOffline()) {
    console.log('⏭️ Skipping Firestore operation - offline');
    return fallbackValue;
  }

  try {
    return await operation();
  } catch (error: any) {
    const isOfflineError =
      error?.code === 'unavailable' ||
      error?.message?.includes('offline') ||
      error?.message?.includes('network');

    if (isOfflineError) {
      console.log('📡 Firestore operation failed - offline');
      return fallbackValue;
    }

    throw error;
  }
};
