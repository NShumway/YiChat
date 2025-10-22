import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { useStore } from '../../store/useStore';

export default function ChatsScreen() {
  const router = useRouter();
  const { user, logout, connectionStatus } = useStore();

  const handleLogout = async () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update user status to offline
              if (user) {
                await updateDoc(doc(db, 'users', user.uid), {
                  status: 'offline',
                  lastSeen: new Date(),
                });
              }

              // Sign out from Firebase
              await signOut(auth);
              
              // Clear Zustand state
              logout();
              
              // Navigate to login
              router.replace('/(auth)/login');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to log out. Please try again.');
            }
          },
        },
      ]
    );
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
    <View style={styles.container}>
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
              {getLanguageEmoji(user?.preferredLanguage || 'en')}
            </Text>
            <Text style={styles.languageText}>
              {user?.preferredLanguage?.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={[
          styles.statusDot,
          connectionStatus === 'online' ? styles.statusOnline :
          connectionStatus === 'offline' ? styles.statusOffline :
          styles.statusReconnecting
        ]} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to YiChat! 🌍</Text>
        <Text style={styles.subtitle}>
          Your multilingual messaging app
        </Text>
        
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyText}>No chats yet</Text>
          <Text style={styles.emptySubtext}>
            Start a conversation to see your chats here
          </Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>✅ Phase 1 Complete!</Text>
          <Text style={styles.infoText}>
            • User authentication{'\n'}
            • Firebase & SQLite setup{'\n'}
            • Auth state persistence{'\n'}
            • Secure logout
          </Text>
        </View>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
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
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    marginBottom: 40,
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
  },
  infoBox: {
    backgroundColor: '#E8F5E9',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#2E7D32',
    lineHeight: 22,
  },
  logoutButton: {
    margin: 20,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});

