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
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  participants: string[];
  lastMessage?: string;
  lastMessageTimestamp?: number;
  unreadCount: number;
}

export interface PendingMessage {
  id: string;
  messageData: Message;
  timestamp: number;
}

