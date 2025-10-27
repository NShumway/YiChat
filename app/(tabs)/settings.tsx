import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { LanguagePicker } from '../../components/LanguagePicker';
import { NationalityPicker } from '../../components/NationalityPicker';
import { auth } from '../../services/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const router = useRouter();

  const handleSignOut = async () => {
    console.log('🖱️ Log Out button clicked!');

    // On web, use native confirm dialog. On mobile, use Alert.alert
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to log out?');
      if (!confirmed) {
        console.log('❌ Logout cancelled');
        return;
      }
    } else {
      // Mobile: use Alert.alert with buttons
      Alert.alert(
        'Log Out',
        'Are you sure you want to log out?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log Out',
            style: 'destructive',
            onPress: async () => {
              await performLogout();
            },
          },
        ]
      );
      return;
    }

    // Web: if confirmed, proceed with logout
    await performLogout();
  };

  const performLogout = async () => {
    try {
      console.log('🔓 Logging out (confirmed)...');

      // Sign out from Firebase (this triggers onAuthStateChanged)
      await signOut(auth);
      console.log('✅ Signed out from Firebase');

      // Clear Zustand state
      logout();
      console.log('✅ Store cleared');

      // Navigate to login
      router.replace('/(auth)/login');
      console.log('✅ Navigated to login');
    } catch (error) {
      console.error('❌ Error signing out:', error);
      if (Platform.OS === 'web') {
        alert('Failed to log out. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to log out');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* User Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{user?.displayName || 'Unknown'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{user?.email || 'Unknown'}</Text>
            </View>
          </View>
        </View>

        {/* Personal Information Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <View style={styles.card}>
            <NationalityPicker />
          </View>
        </View>

        {/* Language Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Language & Translation</Text>
          <View style={styles.card}>
            <LanguagePicker />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <Text style={styles.aboutText}>
              YiChat is a real-time messaging app with automatic translation powered by AI.
            </Text>
            <Text style={[styles.aboutText, styles.versionText]}>Version 1.0.0</Text>
          </View>
        </View>

        {/* Log Out Button */}
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.signOutButtonPressed
            ]}
            onPress={() => {
              console.log('🖱️ Pressable onPress fired!');
              handleSignOut();
            }}
            onPressIn={() => console.log('🖱️ Pressable onPressIn fired!')}
            onPressOut={() => console.log('🖱️ Pressable onPressOut fired!')}
            testID="logout-button"
          >
            <Text style={styles.signOutText}>Log Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  label: {
    fontSize: 16,
    color: '#000',
  },
  value: {
    fontSize: 16,
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginLeft: 16,
  },
  aboutText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  versionText: {
    color: '#999',
    fontSize: 13,
    paddingTop: 0,
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        cursor: 'pointer',
      },
    }),
  },
  signOutButtonPressed: {
    opacity: 0.8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
