import { View, Text, StyleSheet } from 'react-native';
import { useStore } from '../store/useStore';

/**
 * Connection status banner that appears when offline or reconnecting
 * Shows at the top of the screen with different colors based on status
 */
export const ConnectionBanner = () => {
  const connectionStatus = useStore((state) => state.connectionStatus);
  
  // Don't show banner when online
  if (connectionStatus === 'online') return null;
  
  const bannerConfig = {
    offline: {
      color: '#dc2626',
      text: '📡 No internet connection',
      backgroundColor: '#fef2f2',
    },
    reconnecting: {
      color: '#f59e0b',
      text: '🔄 Reconnecting...',
      backgroundColor: '#fffbeb',
    },
  };
  
  const config = bannerConfig[connectionStatus];
  
  return (
    <View style={[styles.banner, { backgroundColor: config.backgroundColor }]}>
      <Text style={[styles.text, { color: config.color }]}>{config.text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});

