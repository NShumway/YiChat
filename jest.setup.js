// Extend Jest matchers
import '@testing-library/react-native/extend-expect';

// Mock Firebase
jest.mock('./services/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user', getIdToken: jest.fn().mockResolvedValue('test-token') },
    onAuthStateChanged: jest.fn(),
  },
  db: {},
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

// Silence console errors in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
