import { View, Text, StyleSheet } from 'react-native';
import { memo, useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Message } from '../types/Message';
import { safeGetDoc } from '../services/firestoreHelpers';
import { useStore } from '../store/useStore';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isGroupChat?: boolean;
}

export const MessageBubble = memo(
  ({ message, isOwn, isGroupChat }: MessageBubbleProps) => {
    const [senderName, setSenderName] = useState<string>('');
    const connectionStatus = useStore((state) => state.connectionStatus);

    // Fetch sender name for group chats
    useEffect(() => {
      if (!isGroupChat || isOwn || message.type === 'system') return;

      const fetchSenderName = async () => {
        // Use cached name if available
        if (message.senderName) {
          setSenderName(message.senderName);
          return;
        }

        // Skip if offline
        if (connectionStatus === 'offline') {
          setSenderName('User');
          return;
        }

        const { data, exists, isOfflineError } = await safeGetDoc<any>(
          doc(db, 'users', message.senderId)
        );

        if (exists && data) {
          setSenderName(data.displayName || 'Unknown');
        } else if (isOfflineError) {
          setSenderName('User'); // Offline fallback
        } else {
          setSenderName('Unknown');
        }
      };

      fetchSenderName();
    }, [isGroupChat, isOwn, message.senderId, message.type, message.senderName, connectionStatus]);

    const formatTime = (timestamp: number) => {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusIcon = () => {
      // Check if message has been read by anyone other than sender
      const readByOthers = Object.keys(message.readBy || {})
        .filter(uid => uid !== message.senderId)
        .length > 0;

      if (readByOthers) {
        return '✓✓'; // Read (will be blue)
      }

      switch (message.status) {
        case 'sending':
          return '⏱';
        case 'sent':
          return '✓';
        case 'delivered':
          return '✓✓';
        case 'failed':
          return '⚠';
        default:
          return '✓';
      }
    };

    const isRead = () => {
      const readByOthers = Object.keys(message.readBy || {})
        .filter(uid => uid !== message.senderId)
        .length > 0;
      return readByOthers;
    };

    // System messages (group events)
    if (message.type === 'system') {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{message.text}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
        <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
          {isGroupChat && !isOwn && senderName && (
            <Text style={styles.senderName}>{senderName}</Text>
          )}
          <Text style={[styles.text, isOwn ? styles.ownText : styles.otherText]}>
            {message.text}
          </Text>
          <View style={styles.footer}>
            <Text style={[styles.time, isOwn ? styles.ownTime : styles.otherTime]}>
              {formatTime(message.timestamp)}
            </Text>
            {isOwn && (
              <Text style={[styles.status, isRead() && styles.statusRead]}>
                {getStatusIcon()}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  },
  // Only re-render if message ID, text, status, or readBy changes
  (prevProps, nextProps) => {
    const prevReadByCount = Object.keys(prevProps.message.readBy || {}).length;
    const nextReadByCount = Object.keys(nextProps.message.readBy || {}).length;
    
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.text === nextProps.message.text &&
      prevProps.message.status === nextProps.message.status &&
      prevProps.isOwn === nextProps.isOwn &&
      prevReadByCount === nextReadByCount // Re-render if readBy count changes
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginVertical: 2,
  },
  ownContainer: {
    justifyContent: 'flex-end',
  },
  otherContainer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  ownBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#E9E9EB',
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownText: {
    color: '#fff',
  },
  otherText: {
    color: '#000',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  time: {
    fontSize: 11,
  },
  ownTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherTime: {
    color: 'rgba(0, 0, 0, 0.5)',
  },
  status: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  statusRead: {
    color: '#4CAF50',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  systemMessageContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  systemMessageText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

