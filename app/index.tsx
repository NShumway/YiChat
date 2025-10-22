import { Redirect } from 'expo-router';
import { useStore } from '../store/useStore';

export default function Index() {
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  // Redirect based on authentication state
  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

