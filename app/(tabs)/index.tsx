import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useStore } from '../../store/useStore';
import { Chat } from '../../types/Message';
import { ChatListItem } from '../../components/ChatListItem';
import { ConnectionBanner } from '../../components/ConnectionBanner';
import { updateBadgeFromChats } from '../../services/notifications';

export default function ChatsScreen() {
  const router = useRouter();
  const { user, connectionStatus } = useStore();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Real-time listener for user's chats
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    console.log('🔥 Setting up real-time chat listener for user:', user.uid);

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageTimestamp', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log(`📬 Received ${snapshot.docs.length} chats from Firestore`);
        const chatData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Chat[];
        setChats(chatData);
        setIsLoading(false);

        // Update badge count whenever chats change
        if (user) {
          updateBadgeFromChats(chatData, user.uid);
        }
      },
      (error) => {
        console.error('❌ Error fetching chats:', error);
        Alert.alert('Error', 'Failed to load chats. Please check your connection.');
        setIsLoading(false);
      }
    );

    return () => {
      console.log('🔥 Cleaning up chat listener');
      unsubscribe();
    };
  }, [user]);

  const handleNewChat = () => {
    console.log('🚀 Navigating to new-chat');
    router.push('/new-chat' as any);
  };

  const handleNewGroup = () => {
    console.log('👥 Navigating to new-group');
    router.push('/new-group' as any);
  };

  const getLanguageEmoji = (code: string) => {
    const languages: { [key: string]: string } = {
      en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪',
      zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷', pt: '🇵🇹',
      ru: '🇷🇺', ar: '🇸🇦', hi: '🇮🇳', it: '🇮🇹',
    };
    return languages[code] || '🌐';
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Connection Status Banner */}
      <ConnectionBanner />
      
      {/* User Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.displayName?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.displayName}</Text>
          <View style={styles.languageContainer}>
            <Text style={styles.languageFlag}>
              {getLanguageEmoji(user?.preferredLanguage?.split('-')[0] || 'en')}
            </Text>
            <Text style={styles.languageText}>
              {user?.preferredLanguage?.split('-')[0]?.toUpperCase() || 'EN'}
            </Text>
          </View>
        </View>
        <View style={[
          styles.statusDot,
          connectionStatus === 'online' ? styles.statusOnline :
          connectionStatus === 'offline' ? styles.statusOffline :
          styles.statusReconnecting
        ]} />
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading chats...</Text>
          </View>
        ) : chats.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No chats yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the + button to start a conversation
            </Text>
            <TouchableOpacity
              style={styles.newChatButton}
              onPress={handleNewChat}
            >
              <Text style={styles.newChatButtonText}>Start New Chat</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <FlatList
              data={chats}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ChatListItem chat={item} />}
              style={styles.chatList}
              contentContainerStyle={styles.chatListContent}
            />
            <TouchableOpacity
              style={styles.fab}
              onPress={handleNewChat}
            >
              <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabSecondary}
              onPress={handleNewGroup}
            >
              <Text style={styles.fabSecondaryText}>👥</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  languageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageFlag: {
    fontSize: 16,
    marginRight: 6,
  },
  languageText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 12,
  },
  statusOnline: {
    backgroundColor: '#4CAF50',
  },
  statusOffline: {
    backgroundColor: '#999',
  },
  statusReconnecting: {
    backgroundColor: '#FF9800',
  },
  settingsButton: {
    padding: 8,
    marginLeft: 8,
  },
  settingsIcon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
  },
  newChatButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  newChatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    flexGrow: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
  fabSecondary: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabSecondaryText: {
    fontSize: 24,
  },
});

