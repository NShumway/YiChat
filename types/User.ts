export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  preferredLanguage: string; // BCP 47 language tag (e.g., 'en-US', 'es-MX', 'zh-CN')
  country?: string; // ISO 3166-1 alpha-2 country code (e.g., 'US', 'MX', 'CN')
  nationality?: string; // e.g., "American", "Mexican", "Japanese" - used for AI cultural context
  status?: 'online' | 'offline';
  pushToken?: string;
}

