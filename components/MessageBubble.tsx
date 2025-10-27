import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { memo, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Message } from '../types/Message';
import { safeGetDoc } from '../services/firestoreHelpers';
import { useStore } from '../store/useStore';
import { ReadReceiptsModal } from './ReadReceiptsModal';
import { getLanguageName } from '../services/translation';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isGroupChat?: boolean;
  chatParticipants?: string[];
}

export const MessageBubble = memo(
  ({ message, isOwn, isGroupChat, chatParticipants }: MessageBubbleProps) => {
    const [senderName, setSenderName] = useState<string>('');
    const [showReceiptsModal, setShowReceiptsModal] = useState(false);
    const [readByNames, setReadByNames] = useState<string[]>([]);
    const [showOriginal, setShowOriginal] = useState(false);
    const connectionStatus = useStore((state) => state.connectionStatus);
    const user = useStore((state) => state.user);

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

    // Fetch names of users who read the message (for group chats)
    useEffect(() => {
      if (!isGroupChat || !isOwn) return;

      const readByUserIds = Object.keys(message.readBy || {})
        .filter(uid => uid !== message.senderId);

      if (readByUserIds.length === 0) return;

      const fetchReadByNames = async () => {
        const names = await Promise.all(
          readByUserIds.slice(0, 2).map(async (uid) => {
            try {
              const userDoc = await getDoc(doc(db, 'users', uid));
              const userData = userDoc.exists() ? userDoc.data() : null;
              return userData?.displayName || 'Unknown';
            } catch (error) {
              return 'Unknown';
            }
          })
        );

        setReadByNames(names);
      };

      fetchReadByNames();
    }, [isGroupChat, isOwn, message.readBy, message.senderId]);

    // Generate read receipt text for group chats
    const getGroupReadReceiptText = () => {
      const readByUserIds = Object.keys(message.readBy || {})
        .filter(uid => uid !== message.senderId);

      // No one has read it yet - show nothing
      if (readByUserIds.length === 0) return null;

      // Calculate total participants excluding sender
      const totalParticipants = (chatParticipants || []).filter(uid => uid !== message.senderId).length;

      // All participants have read it
      if (readByUserIds.length === totalParticipants) {
        return 'Read by all';
      }

      // Some but not all have read it
      return 'Read by some';
    };

    // System messages (group events)
    if (message.type === 'system') {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{message.text}</Text>
        </View>
      );
    }

    const groupReadReceiptText = isGroupChat && isOwn ? getGroupReadReceiptText() : null;

    // Determine which text to display (original or translated)
    const userLanguage = user?.preferredLanguage || 'en-US';
    const hasTranslation = message.translations && message.translations[userLanguage];
    const isTranslated = hasTranslation && message.originalLanguage !== userLanguage;
    const displayText = showOriginal || !hasTranslation
      ? message.text
      : message.translations[userLanguage];

    return (
      <>
        <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
          <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
            {isGroupChat && !isOwn && senderName && (
              <Text style={styles.senderName}>{senderName}</Text>
            )}
            <Text style={[styles.text, isOwn ? styles.ownText : styles.otherText]}>
              {displayText}
            </Text>

            {/* Translation indicator and toggle */}
            {isTranslated && (
              <TouchableOpacity
                onPress={() => setShowOriginal(!showOriginal)}
                style={styles.translationIndicator}
              >
                <Text style={[styles.indicatorText, isOwn && styles.indicatorTextOwn]}>
                  {showOriginal
                    ? `Show ${getLanguageName(userLanguage)} translation`
                    : `Auto-translated (${getLanguageName(message.originalLanguage || 'Unknown')}). See original?`
                  }
                </Text>
              </TouchableOpacity>
            )}

            {/* Tone indicator (optional) */}
            {message.tone && !isOwn && (
              <Text style={[styles.toneIndicator, isOwn && styles.toneIndicatorOwn]}>
                Tone: {message.tone}
              </Text>
            )}

            <View style={styles.footer}>
              <Text style={[styles.time, isOwn ? styles.ownTime : styles.otherTime]}>
                {formatTime(message.timestamp)}
              </Text>
              {isOwn && !isGroupChat && (
                <Text style={[styles.status, isRead() && styles.statusRead]}>
                  {getStatusIcon()}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Group chat read receipt - tappable for details */}
        {groupReadReceiptText && (
          <Pressable
            onPress={() => setShowReceiptsModal(true)}
            style={[styles.container, styles.ownContainer]}
          >
            <Text style={styles.groupReadReceipt}>
              {groupReadReceiptText}
            </Text>
          </Pressable>
        )}

        {/* Read receipts modal */}
        {isGroupChat && isOwn && chatParticipants && (
          <ReadReceiptsModal
            visible={showReceiptsModal}
            onClose={() => setShowReceiptsModal(false)}
            readBy={message.readBy || {}}
            participants={chatParticipants}
            senderId={message.senderId}
          />
        )}
      </>
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
  groupReadReceipt: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: -2,
    marginBottom: 4,
    paddingRight: 16,
  },
  translationIndicator: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  indicatorText: {
    fontSize: 11,
    color: '#007AFF',
    fontStyle: 'italic',
  },
  indicatorTextOwn: {
    color: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  toneIndicator: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  toneIndicatorOwn: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
});

