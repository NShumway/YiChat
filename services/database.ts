import * as SQLite from 'expo-sqlite';
import { Message, Chat, PendingMessage } from '../types/Message';

let db: SQLite.SQLiteDatabase | null = null;

export const getDatabase = (): SQLite.SQLiteDatabase => {
  if (!db) {
    db = SQLite.openDatabaseSync('yichat.db');
  }
  return db;
};

export const initDatabase = () => {
  try {
    const database = getDatabase();
    
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
    const database = getDatabase();
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
    const database = getDatabase();
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
    const database = getDatabase();
    database.runSync('UPDATE messages SET status = ? WHERE id = ?', [status, messageId]);
  },

  deleteMessage: (messageId: string) => {
    const database = getDatabase();
    database.runSync('DELETE FROM messages WHERE id = ?', [messageId]);
  },

  // Chat operations
  insertChat: (chat: Chat) => {
    const database = getDatabase();
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
    const database = getDatabase();
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
    const database = getDatabase();
    database.runSync(
      'UPDATE chats SET lastMessage = ?, lastMessageTimestamp = ? WHERE id = ?',
      [lastMessage, timestamp, chatId]
    );
  },

  updateChatUnreadCount: (chatId: string, count: number) => {
    const database = getDatabase();
    database.runSync('UPDATE chats SET unreadCount = ? WHERE id = ?', [count, chatId]);
  },

  deleteChat: (chatId: string) => {
    const database = getDatabase();
    database.runSync('DELETE FROM chats WHERE id = ?', [chatId]);
    database.runSync('DELETE FROM messages WHERE chatId = ?', [chatId]);
  },

  // Pending messages operations
  insertPendingMessage: (pending: PendingMessage) => {
    const database = getDatabase();
    database.runSync(
      'INSERT OR REPLACE INTO pending_messages VALUES (?, ?, ?)',
      [pending.id, JSON.stringify(pending.messageData), pending.timestamp]
    );
  },

  getAllPendingMessages: (): PendingMessage[] => {
    const database = getDatabase();
    const rows = database.getAllSync<any>('SELECT * FROM pending_messages ORDER BY timestamp ASC');
    return rows.map(row => ({
      id: row.id,
      messageData: JSON.parse(row.messageData),
      timestamp: row.timestamp
    }));
  },

  deletePendingMessage: (messageId: string) => {
    const database = getDatabase();
    database.runSync('DELETE FROM pending_messages WHERE id = ?', [messageId]);
  },

  // Utility operations
  clearAllData: () => {
    const database = getDatabase();
    database.runSync('DELETE FROM messages');
    database.runSync('DELETE FROM chats');
    database.runSync('DELETE FROM pending_messages');
    console.log('✅ All database data cleared');
  }
};

