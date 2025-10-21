import { View, Text, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { auth, db, storage } from '../../services/firebase';

export default function ChatsScreen() {
  const [firebaseStatus, setFirebaseStatus] = useState('Checking...');

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
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to YiChat!</Text>
      <Text style={styles.subtext}>Your chats will appear here.</Text>
      <Text style={styles.status}>{firebaseStatus}</Text>
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

