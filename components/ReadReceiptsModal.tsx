import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

interface ReadReceiptsModalProps {
  visible: boolean;
  onClose: () => void;
  readBy: { [userId: string]: number };
  participants: string[];
  senderId: string;
}

interface ParticipantInfo {
  uid: string;
  name: string;
  hasRead: boolean;
  readAt?: number;
}

export const ReadReceiptsModal = ({ visible, onClose, readBy, participants, senderId }: ReadReceiptsModalProps) => {
  const [participantInfos, setParticipantInfos] = useState<ParticipantInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;

    const fetchParticipantNames = async () => {
      setLoading(true);
      try {
        // Fetch names for all participants except sender
        const participantsToFetch = participants.filter(uid => uid !== senderId);
        console.log('📋 Fetching names for participants:', participantsToFetch);
        console.log('📋 ReadBy object:', readBy);

        const infos = await Promise.all(
          participantsToFetch.map(async (uid) => {
            try {
              console.log(`🔍 Fetching user document for: ${uid}`);
              const userDoc = await getDoc(doc(db, 'users', uid));
              const userData = userDoc.exists() ? userDoc.data() : null;

              if (!userDoc.exists()) {
                console.warn(`⚠️ User document not found for: ${uid}`);
              } else {
                console.log(`✅ Found user: ${userData?.displayName || 'no name'}`);
              }

              return {
                uid,
                name: userData?.displayName || 'Unknown User',
                hasRead: !!readBy[uid],
                readAt: readBy[uid],
              };
            } catch (error) {
              console.error(`❌ Failed to fetch user ${uid}:`, error);
              return {
                uid,
                name: 'Unknown User',
                hasRead: !!readBy[uid],
                readAt: readBy[uid],
              };
            }
          })
        );

        // Sort: read users first, then unread
        infos.sort((a, b) => {
          if (a.hasRead && !b.hasRead) return -1;
          if (!a.hasRead && b.hasRead) return 1;
          // Both read or both unread - sort by read time or name
          if (a.hasRead && b.hasRead && a.readAt && b.readAt) {
            return b.readAt - a.readAt; // Most recent first
          }
          return a.name.localeCompare(b.name);
        });

        setParticipantInfos(infos);
      } catch (error) {
        console.error('Failed to fetch participant info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchParticipantNames();
  }, [visible, readBy, participants, senderId]);

  const readUsers = participantInfos.filter(p => p.hasRead);
  const unreadUsers = participantInfos.filter(p => !p.hasRead);

  const formatReadTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        >
          <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Read Receipts</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : (
            <ScrollView
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Read By Section */}
              {readUsers.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Read by {readUsers.length} {readUsers.length === 1 ? 'person' : 'people'}
                  </Text>
                  {readUsers.map((user) => (
                    <View key={user.uid} style={styles.userRow}>
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{user.name}</Text>
                        {user.readAt && (
                          <Text style={styles.readTime}>{formatReadTime(user.readAt)}</Text>
                        )}
                      </View>
                      <Text style={styles.checkmark}>✓✓</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Not Read Section */}
              {unreadUsers.length > 0 && (
                <View style={[styles.section, readUsers.length > 0 && styles.sectionSpacing]}>
                  <Text style={styles.sectionTitle}>
                    Not yet read ({unreadUsers.length})
                  </Text>
                  {unreadUsers.map((user) => (
                    <View key={user.uid} style={styles.userRow}>
                      <View style={styles.userInfo}>
                        <Text style={[styles.userName, styles.unreadUserName]}>{user.name}</Text>
                      </View>
                      <Text style={styles.pendingIcon}>○</Text>
                    </View>
                  ))}
                </View>
              )}

              {participantInfos.length === 0 && !loading && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No participants found</Text>
                </View>
              )}
            </ScrollView>
          )}
          </View>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingTop: 60, // Add padding to avoid status bar
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%', // Use most of the screen
    minHeight: 400,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionSpacing: {
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  unreadUserName: {
    color: '#666',
  },
  readTime: {
    fontSize: 13,
    color: '#999',
  },
  checkmark: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
  pendingIcon: {
    fontSize: 18,
    color: '#ccc',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
  },
});
