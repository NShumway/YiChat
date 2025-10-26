import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { Message, Chat, PendingMessage } from '../types/Message';

let db: SQLite.SQLiteDatabase | null = null;

// In-memory storage for web (fallback)
const webStorage = {
  messages: [] as Message[],
  chats: [] as Chat[],
  pendingMessages: [] as PendingMessage[],
};

export const isWebPlatform = Platform.OS === 'web';

export const getDatabase = (): SQLite.SQLiteDatabase | null => {
  if (isWebPlatform) {
    return null; // SQLite not supported on web
  }
  if (!db) {
    db = SQLite.openDatabaseSync('yichat.db');
  }
  return db;
};

export const initDatabase = () => {
  if (isWebPlatform) {
    console.log('🌐 Running on web - SQLite disabled, using in-memory storage');
    return true;
  }

  try {
    const database = getDatabase();
    if (!database) return false;
    
    // Create tables one by one for better error handling
    database.execSync(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chatId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        text TEXT NOT NULL,
        originalLanguage TEXT,
        timestamp INTEGER NOT NULL,
        status TEXT DEFAULT 'sending',
        readBy TEXT DEFAULT '{}',
        mediaURL TEXT,
        localOnly INTEGER DEFAULT 0
      );
    `);
    
    database.execSync(`CREATE INDEX IF NOT EXISTS idx_messages_chatId ON messages(chatId);`);
    database.execSync(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);`);
    
    database.execSync(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        participants TEXT NOT NULL,
        lastMessage TEXT,
        lastMessageTimestamp INTEGER,
        unreadCount INTEGER DEFAULT 0
      );
    `);
    
    database.execSync(`
      CREATE TABLE IF NOT EXISTS pending_messages (
        id TEXT PRIMARY KEY,
        messageData TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
    
    console.log('✅ Database initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

export const dbOperations = {
  // Message operations
  insertMessage: (message: Message) => {
    if (isWebPlatform) {
      // Web: use in-memory storage
      const index = webStorage.messages.findIndex(m => m.id === message.id);
      if (index >= 0) {
        webStorage.messages[index] = message;
      } else {
        webStorage.messages.push(message);
      }
      return;
    }

    const database = getDatabase();
    if (!database) return;
    database.runSync(
      'INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        message.id,
        message.chatId,
        message.senderId,
        message.text,
        message.originalLanguage || null,
        message.timestamp,
        message.status,
        JSON.stringify(message.readBy),
        message.mediaURL || null,
        message.localOnly ? 1 : 0
      ]
    );
  },

  getMessagesByChat: (chatId: string): Message[] => {
    if (isWebPlatform) {
      // Web: use in-memory storage
      return webStorage.messages
        .filter(m => m.chatId === chatId)
        .sort((a, b) => a.timestamp - b.timestamp);
    }

    const database = getDatabase();
    if (!database) return [];
    const rows = database.getAllSync<any>(
      'SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC',
      [chatId]
    );
    return rows.map(row => ({
      id: row.id,
      chatId: row.chatId,
      senderId: row.senderId,
      text: row.text,
      originalLanguage: row.originalLanguage || undefined,
      timestamp: row.timestamp,
      status: row.status,
      readBy: JSON.parse(row.readBy),
      mediaURL: row.mediaURL || undefined,
      localOnly: row.localOnly === 1
    }));
  },

  updateMessageStatus: (messageId: string, status: Message['status']) => {
    if (isWebPlatform) {
      const message = webStorage.messages.find(m => m.id === messageId);
      if (message) message.status = status;
      return;
    }

    const database = getDatabase();
    if (!database) return;
    database.runSync('UPDATE messages SET status = ? WHERE id = ?', [status, messageId]);
  },

  deleteMessage: (messageId: string) => {
    if (isWebPlatform) {
      webStorage.messages = webStorage.messages.filter(m => m.id !== messageId);
      return;
    }

    const database = getDatabase();
    if (!database) return;
    database.runSync('DELETE FROM messages WHERE id = ?', [messageId]);
  },

  updateMessageId: (oldId: string, newId: string) => {
    if (isWebPlatform) {
      const message = webStorage.messages.find(m => m.id === oldId);
      if (message) message.id = newId;
      return;
    }

    const database = getDatabase();
    // Can't update primary key, so we need to get the message, delete it, and re-insert with new ID
    const messages = database.getAllSync<any>('SELECT * FROM messages WHERE id = ?', [oldId]);
    if (messages.length > 0) {
      const message = messages[0];
      database.runSync('DELETE FROM messages WHERE id = ?', [oldId]);
      database.runSync(
        'INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newId,
          message.chatId,
          message.senderId,
          message.text,
          message.originalLanguage,
          message.timestamp,
          message.status,
          message.readBy,
          message.mediaURL,
          message.localOnly
        ]
      );
    }
  },

  batchInsertMessages: (messages: Message[]) => {
    if (isWebPlatform) {
      messages.forEach(msg => dbOperations.insertMessage(msg));
      return;
    }

    const database = getDatabase();
    if (!database) return;
    database.execSync('BEGIN TRANSACTION');
    try {
      messages.forEach(message => {
        database.runSync(
          'INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            message.id,
            message.chatId,
            message.senderId,
            message.text,
            message.originalLanguage || null,
            message.timestamp,
            message.status,
            JSON.stringify(message.readBy),
            message.mediaURL || null,
            message.localOnly ? 1 : 0
          ]
        );
      });
      database.execSync('COMMIT');
    } catch (error) {
      database.execSync('ROLLBACK');
      throw error;
    }
  },

  // Chat operations
  insertChat: (chat: Chat) => {
    if (isWebPlatform) return; // Not needed on web
    const database = getDatabase();
    if (!database) return;
    database.runSync(
      'INSERT OR REPLACE INTO chats VALUES (?, ?, ?, ?, ?, ?)',
      [
        chat.id,
        chat.type,
        JSON.stringify(chat.participants),
        chat.lastMessage || null,
        chat.lastMessageTimestamp || null,
        chat.unreadCount
      ]
    );
  },

  getAllChats: (): Chat[] => {
    if (isWebPlatform) return []; // Not needed on web
    const database = getDatabase();
    if (!database) return [];
    const rows = database.getAllSync<any>('SELECT * FROM chats ORDER BY lastMessageTimestamp DESC');
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      participants: JSON.parse(row.participants),
      lastMessage: row.lastMessage || undefined,
      lastMessageTimestamp: row.lastMessageTimestamp || undefined,
      unreadCount: row.unreadCount
    }));
  },

  updateChatLastMessage: (chatId: string, lastMessage: string, timestamp: number) => {
    if (isWebPlatform) return;
    const database = getDatabase();
    if (!database) return;
    database.runSync(
      'UPDATE chats SET lastMessage = ?, lastMessageTimestamp = ? WHERE id = ?',
      [lastMessage, timestamp, chatId]
    );
  },

  updateChatUnreadCount: (chatId: string, count: number) => {
    if (isWebPlatform) return;
    const database = getDatabase();
    if (!database) return;
    database.runSync('UPDATE chats SET unreadCount = ? WHERE id = ?', [count, chatId]);
  },

  deleteChat: (chatId: string) => {
    if (isWebPlatform) return;
    const database = getDatabase();
    if (!database) return;
    database.runSync('DELETE FROM chats WHERE id = ?', [chatId]);
    database.runSync('DELETE FROM messages WHERE chatId = ?', [chatId]);
  },

  // Pending messages operations
  insertPendingMessage: (pending: PendingMessage) => {
    if (isWebPlatform) return;
    const database = getDatabase();
    if (!database) return;
    database.runSync(
      'INSERT OR REPLACE INTO pending_messages VALUES (?, ?, ?)',
      [pending.id, JSON.stringify(pending.messageData), pending.timestamp]
    );
  },

  getAllPendingMessages: (): PendingMessage[] => {
    if (isWebPlatform) return [];
    const database = getDatabase();
    if (!database) return [];
    const rows = database.getAllSync<any>('SELECT * FROM pending_messages ORDER BY timestamp ASC');
    return rows.map(row => ({
      id: row.id,
      messageData: JSON.parse(row.messageData),
      timestamp: row.timestamp
    }));
  },

  deletePendingMessage: (messageId: string) => {
    if (isWebPlatform) return;
    const database = getDatabase();
    if (!database) return;
    database.runSync('DELETE FROM pending_messages WHERE id = ?', [messageId]);
  },

  getFailedMessages: (): Message[] => {
    if (isWebPlatform) {
      return webStorage.messages.filter(m => m.status === 'failed');
    }
    
    const database = getDatabase();
    if (!database) return [];
    const rows = database.getAllSync<any>(
      "SELECT * FROM messages WHERE status = 'failed' ORDER BY timestamp ASC"
    );
    return rows.map(row => ({
      id: row.id,
      chatId: row.chatId,
      senderId: row.senderId,
      text: row.text,
      originalLanguage: row.originalLanguage || undefined,
      timestamp: row.timestamp,
      status: row.status,
      readBy: JSON.parse(row.readBy),
      mediaURL: row.mediaURL || undefined,
      localOnly: row.localOnly === 1
    }));
  },

  // Utility operations
  clearAllData: () => {
    if (isWebPlatform) {
      webStorage.messages = [];
      webStorage.chats = [];
      webStorage.pendingMessages = [];
      console.log('✅ All in-memory data cleared');
      return;
    }
    const database = getDatabase();
    if (!database) return;
    database.runSync('DELETE FROM messages');
    database.runSync('DELETE FROM chats');
    database.runSync('DELETE FROM pending_messages');
    console.log('✅ All database data cleared');
  }
};

