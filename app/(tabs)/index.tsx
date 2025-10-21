import { View, Text, StyleSheet, Button } from 'react-native';
import { useEffect, useState } from 'react';
import { auth, db, storage } from '../../services/firebase';
import { dbOperations } from '../../services/database';
import { Message } from '../../types/Message';

export default function ChatsScreen() {
  const [firebaseStatus, setFirebaseStatus] = useState('Checking...');
  const [dbStatus, setDbStatus] = useState('Testing...');

  useEffect(() => {
    // Test Firebase initialization
    try {
      if (auth && db && storage) {
        setFirebaseStatus('Firebase Connected ✓');
      } else {
        setFirebaseStatus('Firebase Error');
      }
    } catch (error) {
      setFirebaseStatus('Firebase Error: ' + (error as Error).message);
    }

    // Test SQLite database after a small delay to ensure initialization
    setTimeout(() => {
      testDatabase();
    }, 100);
  }, []);

  const testDatabase = () => {
    try {
      // Test insert
      const testMessage: Message = {
        id: 'test-1',
        chatId: 'test-chat',
        senderId: 'user-1',
        text: 'Test message',
        timestamp: Date.now(),
        status: 'sent',
        readBy: {}
      };
      dbOperations.insertMessage(testMessage);

      // Test retrieve
      const messages = dbOperations.getMessagesByChat('test-chat');
      if (messages.length > 0) {
        setDbStatus(`SQLite Connected ✓ (${messages.length} msg)`);
      } else {
        setDbStatus('SQLite: No messages found');
      }
    } catch (error) {
      setDbStatus('SQLite Error: ' + (error as Error).message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to YiChat!</Text>
      <Text style={styles.subtext}>Your chats will appear here.</Text>
      <Text style={styles.status}>{firebaseStatus}</Text>
      <Text style={styles.status}>{dbStatus}</Text>
      <Button title="Test Database" onPress={testDatabase} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  status: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
});

