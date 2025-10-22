export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  preferredLanguage: string;
  status?: 'online' | 'offline';
  pushToken?: string;
}

