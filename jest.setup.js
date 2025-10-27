// Extend Jest matchers
import '@testing-library/jest-native/extend-expect';

// Mock Expo winter runtime globals
global.__ExpoImportMetaRegistry = new Map();

// Mock structuredClone if not available
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock TextDecoderStream and TextEncoderStream for jsdom
if (typeof global.TextDecoderStream === 'undefined') {
  global.TextDecoderStream = class TextDecoderStream {};
}
if (typeof global.TextEncoderStream === 'undefined') {
  global.TextEncoderStream = class TextEncoderStream {};
}

// Mock TextEncoder if not available
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    encode(str) {
      // Convert string to Uint8Array
      const arr = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        arr[i] = str.charCodeAt(i);
      }
      return arr;
    }
  };
}

// Mock TextDecoder if not available
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = class TextDecoder {
    decode(value) {
      if (!value) return '';
      // Convert Uint8Array to string
      return String.fromCharCode.apply(null, Array.from(value));
    }
  };
}

// Mock ReadableStream if not available (used by streaming tests)
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = class ReadableStream {
    constructor(source) {
      this.source = source;
      this._chunks = [];
      this._closed = false;

      // Start the source immediately
      if (source && source.start) {
        const controller = {
          enqueue: (chunk) => this._chunks.push(chunk),
          close: () => { this._closed = true; },
          error: (err) => { this._error = err; }
        };
        source.start(controller);
      }
    }

    getReader() {
      let index = 0;
      return {
        read: async () => {
          // Wait a tick to simulate async behavior
          await new Promise(resolve => setTimeout(resolve, 0));

          if (index < this._chunks.length) {
            return { done: false, value: this._chunks[index++] };
          } else if (this._closed) {
            return { done: true, value: undefined };
          } else if (this._error) {
            throw this._error;
          } else {
            return { done: true, value: undefined };
          }
        },
        releaseLock: jest.fn(),
        cancel: jest.fn(),
      };
    }
  };
}

// Mock Firebase
jest.mock('./services/firebase', () => {
  const mockGetIdToken = jest.fn(async () => 'test-token');
  return {
    auth: {
      currentUser: {
        uid: 'test-user',
        getIdToken: mockGetIdToken
      },
      onAuthStateChanged: jest.fn(),
    },
    db: {},
    functions: {},
  };
});

// Mock Firestore operations
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(() => Date.now()),
  Timestamp: {
    now: jest.fn(() => ({ seconds: Date.now() / 1000, nanoseconds: 0 })),
  },
}));

// Mock SQLite
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(),
  })),
}));

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
}));

// Mock Expo Constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        firebaseApiKey: 'test-key',
        firebaseAuthDomain: 'test.firebaseapp.com',
        firebaseProjectId: 'test-project',
        firebaseStorageBucket: 'test.appspot.com',
        firebaseMessagingSenderId: '123456',
        firebaseAppId: '1:123456:web:abcdef',
      },
    },
  },
}));

// Mock process.env for component tests
if (!process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL) {
  process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL = 'https://test-functions.cloudfunctions.net';
}

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
}));

// Mock Zustand store
jest.mock('./store/useStore', () => ({
  useStore: jest.fn((selector) => {
    const mockState = {
      user: {
        uid: 'test-user',
        displayName: 'Test User',
        email: 'test@example.com',
        preferredLanguage: 'en-US',
        nationality: 'American',
      },
      connectionStatus: 'online',
    };
    return selector(mockState);
  }),
}));

// Mock firestoreHelpers
jest.mock('./services/firestoreHelpers', () => ({
  safeGetDoc: jest.fn().mockResolvedValue({
    data: null,
    exists: false,
    isOfflineError: false,
  }),
  safeGetDocs: jest.fn().mockResolvedValue({
    data: [],
    isOfflineError: false,
  }),
}));

// Mock translation service
jest.mock('./services/translation', () => ({
  getLanguageName: jest.fn((code) => code),
  detectLanguage: jest.fn(),
  translateMessage: jest.fn(),
  getBaseLanguage: jest.fn((tag) => tag.split('-')[0]),
  isSameLanguage: jest.fn(),
}));

// Silence console errors and warnings in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
