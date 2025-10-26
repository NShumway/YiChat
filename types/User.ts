export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  preferredLanguage: string;
  nationality?: string; // e.g., "American", "Mexican", "Japanese" - used for AI cultural context
  status?: 'online' | 'offline';
  pushToken?: string;
}

