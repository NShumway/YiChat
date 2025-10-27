export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  originalLanguage?: string; // BCP 47 language tag (e.g., 'en-US', 'es-MX')
  translations?: { [language: string]: string }; // Cached translations: { 'en-US': 'Hello', 'es-MX': 'Hola' }
  aiInsights?: { [language: string]: string }; // AI analysis in each target language: { 'en-US': 'This idiom means...', 'es-MX': 'Este modismo significa...' }
  tone?: string; // Detected emotional tone (e.g., 'friendly', 'formal', 'excited', 'concerned')
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  readBy: { [userId: string]: number };
  mediaURL?: string;
  localOnly?: boolean;
  embedded?: boolean; // Whether message has been embedded to Pinecone
  type?: 'message' | 'system'; // System messages for group events
  senderName?: string; // Cached sender name for groups
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  participants: string[];
  name?: string; // Group name (only for group chats)
  createdBy?: string; // Group creator UID
  lastMessage?: string;
  lastMessageTimestamp?: number;
  unreadCount: number | { [userId: string]: number };
}

export interface PendingMessage {
  id: string;
  messageData: Message;
  timestamp: number;
}

