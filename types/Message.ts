export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  originalLanguage?: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  readBy: { [userId: string]: number };
  mediaURL?: string;
  localOnly?: boolean;
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

