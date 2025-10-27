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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useStore } from '../store/useStore';
import { User } from '../types/User';
import { safeGetDocs } from '../services/firestoreHelpers';

export default function NewGroupScreen() {
  const router = useRouter();
  const currentUser = useStore((state) => state.user);
  const connectionStatus = useStore((state) => state.connectionStatus);
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Load all users
  useEffect(() => {
    const loadUsers = async () => {
      if (!currentUser) return;

      // Check if offline
      if (connectionStatus === 'offline') {
        Alert.alert('Offline', 'You need to be online to create a group.');
        return;
      }

      setIsLoading(true);
      try {
        const { data, isOfflineError } = await safeGetDocs<User>(
          collection(db, 'users'),
          []
        );

        if (isOfflineError) {
          Alert.alert('Offline', 'You need to be online to create a group.');
          return;
        }

        const users = data.filter((user) => user.uid !== currentUser.uid); // Exclude self
        setAllUsers(users);
      } catch (error) {
        console.error('❌ Error loading users:', error);
        Alert.alert('Error', 'Failed to load users');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [currentUser, connectionStatus]);

  const filteredUsers = allUsers.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      user.displayName?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    );
  });

  const toggleUser = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };

  const createGroup = async () => {
    if (!currentUser) return;

    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    if (selectedUsers.length < 2) {
      Alert.alert('Error', 'Please select at least 2 other people for a group');
      return;
    }

    // Check if offline
    if (connectionStatus === 'offline') {
      Alert.alert('Offline', 'You need to be online to create a group.');
      return;
    }

    setIsCreating(true);
    try {
      const participants = [currentUser.uid, ...selectedUsers];

      // Create unreadCount map
      const unreadCount: { [key: string]: number } = {};
      participants.forEach((uid) => {
        unreadCount[uid] = 0;
      });

      // Create group chat
      const newGroup = await addDoc(collection(db, 'chats'), {
        type: 'group',
        name: groupName.trim(),
        participants,
        createdBy: currentUser.uid,
        lastMessage: '',
        lastMessageTimestamp: Date.now(),
        unreadCount,
        createdAt: serverTimestamp(),
      });

      console.log('✅ Group created:', newGroup.id);

      // Send system message
      await addDoc(collection(db, 'messages'), {
        chatId: newGroup.id,
        senderId: 'system',
        text: `${currentUser.displayName} created the group "${groupName.trim()}"`,
        timestamp: serverTimestamp(),
        type: 'system',
        status: 'sent',
        readBy: {},
      });

      // Navigate to the new group
      router.back();
      router.push(`/chat/${newGroup.id}` as any);
    } catch (error) {
      console.error('❌ Error creating group:', error);
      Alert.alert('Error', 'Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const renderUserItem = ({ item }: { item: User }) => {
    const isSelected = selectedUsers.includes(item.uid);
    
    return (
      <TouchableOpacity
        style={[styles.userItem, isSelected && styles.userItemSelected]}
        onPress={() => toggleUser(item.uid)}
      >
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {item.displayName?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.displayName}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Group Name Input */}
      <View style={styles.groupNameContainer}>
        <Text style={styles.label}>Group Name</Text>
        <TextInput
          style={styles.groupNameInput}
          placeholder="Enter group name..."
          placeholderTextColor="#999"
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
        />
      </View>

      {/* Selected Count */}
      <View style={styles.selectedContainer}>
        <Text style={styles.selectedText}>
          {selectedUsers.length} participant{selectedUsers.length !== 1 ? 's' : ''} selected
          {selectedUsers.length < 2 && ' (minimum 2)'}
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* User List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.uid}
          renderItem={renderUserItem}
          contentContainerStyle={styles.userList}
        />
      )}

      {/* Create Button */}
      <TouchableOpacity
        style={[
          styles.createButton,
          (selectedUsers.length < 2 || !groupName.trim() || isCreating) && styles.createButtonDisabled
        ]}
        onPress={createGroup}
        disabled={selectedUsers.length < 2 || !groupName.trim() || isCreating}
      >
        {isCreating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.createButtonText}>Create Group</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
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
  groupNameContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  groupNameInput: {
    fontSize: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    color: '#1a1a1a',
  },
  selectedContainer: {
    padding: 12,
    backgroundColor: '#f5f5f5',
  },
  selectedText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
    marginVertical: 12,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userList: {
    paddingHorizontal: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userItemSelected: {
    backgroundColor: '#E3F2FD',
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
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  createButton: {
    margin: 16,
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

