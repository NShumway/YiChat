import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useStore } from '../store/useStore';
import { User } from '../types/User';

export default function NewChatScreen() {
  const router = useRouter();
  const currentUser = useStore((state) => state.user);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  useEffect(() => {
    // Debounced search
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      await searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchUsers = async (query: string) => {
    if (!currentUser) return;

    setIsSearching(true);
    try {
      const q = collection(db, 'users');
      const querySnapshot = await getDocs(q);

      // Client-side filtering (Firestore doesn't support text search)
      const results = querySnapshot.docs
        .map((doc) => ({ ...doc.data(), uid: doc.id } as User))
        .filter((user) => {
          if (user.uid === currentUser.uid) return false; // Exclude self
          const searchLower = query.toLowerCase();
          return (
            user.displayName.toLowerCase().includes(searchLower) ||
            user.email.toLowerCase().includes(searchLower)
          );
        })
        .slice(0, 20); // Limit to 20 results

      setSearchResults(results);
    } catch (error) {
      console.error('❌ Error searching users:', error);
      Alert.alert('Error', 'Failed to search users. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const createOrOpenChat = async (recipientUser: User) => {
    if (!currentUser) return;

    setIsCreatingChat(true);
    try {
      // Check if chat already exists
      console.log('🔍 Checking for existing chat with:', recipientUser.displayName);
      
      const chatsRef = collection(db, 'chats');
      const q = query(
        chatsRef,
        where('participants', 'array-contains', currentUser.uid)
      );
      
      const querySnapshot = await getDocs(q);
      
      // Find existing direct chat with this user
      const existingChat = querySnapshot.docs.find((doc) => {
        const data = doc.data();
        return (
          data.type === 'direct' &&
          data.participants.includes(recipientUser.uid) &&
          data.participants.length === 2
        );
      });

      if (existingChat) {
        console.log('✅ Found existing chat:', existingChat.id);
        router.back();
        router.push(`/chat/${existingChat.id}` as any);
        return;
      }

      // Create new chat
      console.log('📝 Creating new chat with:', recipientUser.displayName);
      const newChatRef = await addDoc(collection(db, 'chats'), {
        type: 'direct',
        participants: [currentUser.uid, recipientUser.uid],
        lastMessage: '',
        lastMessageTimestamp: Date.now(),
        unreadCount: {
          [currentUser.uid]: 0,
          [recipientUser.uid]: 0,
        },
        createdAt: serverTimestamp(),
      });

      console.log('✅ Chat created:', newChatRef.id);
      
      // Navigate to new chat
      router.back();
      router.push(`/chat/${newChatRef.id}` as any);
    } catch (error) {
      console.error('❌ Error creating chat:', error);
      Alert.alert('Error', 'Failed to create chat. Please try again.');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => createOrOpenChat(item)}
      disabled={isCreatingChat}
    >
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>
          {item.displayName[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.displayName}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
      </View>
      {item.status === 'online' && <View style={styles.onlineDot} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Chat</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {isSearching && (
          <ActivityIndicator size="small" color="#007AFF" style={styles.searchSpinner} />
        )}
      </View>

      {/* Results */}
      <View style={styles.resultsContainer}>
        {searchQuery.length < 2 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>Search for users</Text>
            <Text style={styles.emptySubtext}>
              Enter at least 2 characters to search by name or email
            </Text>
          </View>
        ) : searchResults.length === 0 && !isSearching ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>No users found</Text>
            <Text style={styles.emptySubtext}>
              Try a different search term
            </Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.uid}
            renderItem={renderUserItem}
            contentContainerStyle={styles.resultsList}
          />
        )}
      </View>

      {/* Creating Chat Overlay */}
      {isCreatingChat && (
        <View style={styles.overlay}>
          <View style={styles.overlayContent}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.overlayText}>Creating chat...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 28,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSpacer: {
    width: 44,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#1a1a1a',
  },
  searchSpinner: {
    marginLeft: 8,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsList: {
    paddingHorizontal: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  onlineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
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
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayContent: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  overlayText: {
    marginTop: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
});

