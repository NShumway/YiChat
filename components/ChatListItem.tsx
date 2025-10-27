import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Chat } from '../types/Message';
import { useStore } from '../store/useStore';
import { safeGetDoc } from '../services/firestoreHelpers';

interface ChatListItemProps {
  chat: Chat;
}

export function ChatListItem({ chat }: ChatListItemProps) {
  const router = useRouter();
  const currentUser = useStore((state) => state.user);
  const connectionStatus = useStore((state) => state.connectionStatus);
  const [otherUserName, setOtherUserName] = useState<string>('Loading...');

  // Fetch chat name (group name or other user's name)
  useEffect(() => {
    const fetchChatName = async () => {
      // For group chats, use the group name
      if (chat.type === 'group') {
        setOtherUserName(chat.name || 'Group Chat');
        return;
      }

      // For direct chats, fetch the other user's name
      const otherParticipantId = chat.participants.find(p => p !== currentUser?.uid);
      if (!otherParticipantId) {
        setOtherUserName('Unknown');
        return;
      }

      // Skip if offline - use fallback
      if (connectionStatus === 'offline') {
        setOtherUserName(`User ${otherParticipantId.slice(0, 8)}`);
        return;
      }

      const { data, exists, isOfflineError } = await safeGetDoc<any>(
        doc(db, 'users', otherParticipantId)
      );

      if (exists && data) {
        setOtherUserName(data.displayName || 'Unknown User');
      } else if (isOfflineError) {
        // Offline - use fallback
        setOtherUserName(`User ${otherParticipantId.slice(0, 8)}`);
      } else {
        setOtherUserName(`User ${otherParticipantId.slice(0, 8)}`);
      }
    };

    fetchChatName();
  }, [chat.type, chat.name, chat.participants, currentUser?.uid, connectionStatus]);

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60);
      return `${minutes}m ago`;
    } else if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const handlePress = () => {
    router.push(`/chat/${chat.id}` as any);
  };

  const unreadCount = currentUser ? (chat.unreadCount[currentUser.uid] || 0) : 0;
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={[styles.avatar, chat.type === 'group' && styles.groupAvatar]}>
        <Text style={styles.avatarText}>
          {chat.type === 'group' ? '👥' : otherUserName?.[0]?.toUpperCase() || '?'}
        </Text>
      </View>

      {/* Chat Info */}
      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={[styles.name, hasUnread && styles.nameUnread]}>
            {otherUserName}
          </Text>
          <Text style={[styles.timestamp, hasUnread && styles.timestampUnread]}>
            {formatTimestamp(chat.lastMessageTimestamp)}
          </Text>
        </View>

        <View style={styles.messageRow}>
          <Text 
            style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {chat.lastMessage || 'No messages yet'}
          </Text>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  groupAvatar: {
    backgroundColor: '#34C759',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  nameUnread: {
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 13,
    color: '#999',
  },
  timestampUnread: {
    color: '#007AFF',
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  lastMessageUnread: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});

