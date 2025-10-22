import { View, Text, StyleSheet } from 'react-native';
import { memo } from 'react';
import { Message } from '../types/Message';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
}

export const MessageBubble = memo(
  ({ message, isOwn }: MessageBubbleProps) => {
    const formatTime = (timestamp: number) => {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusIcon = () => {
      switch (message.status) {
        case 'sending':
          return '⏱';
        case 'sent':
          return '✓';
        case 'delivered':
          return '✓✓';
        case 'read':
          return '✓✓';
        case 'failed':
          return '⚠';
        default:
          return '';
      }
    };

    return (
      <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
        <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
          <Text style={[styles.text, isOwn ? styles.ownText : styles.otherText]}>
            {message.text}
          </Text>
          <View style={styles.footer}>
            <Text style={[styles.time, isOwn ? styles.ownTime : styles.otherTime]}>
              {formatTime(message.timestamp)}
            </Text>
            {isOwn && (
              <Text style={[styles.status, message.status === 'read' && styles.statusRead]}>
                {getStatusIcon()}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  },
  // Only re-render if message ID, text, or status changes
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.text === nextProps.message.text &&
      prevProps.message.status === nextProps.message.status &&
      prevProps.isOwn === nextProps.isOwn
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
});

