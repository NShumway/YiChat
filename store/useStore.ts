import { create } from 'zustand';
import { User } from '../types/User';

interface AppState {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  
  // Connection state
  connectionStatus: 'online' | 'offline' | 'reconnecting';
  
  // UI state
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setConnectionStatus: (status: 'online' | 'offline' | 'reconnecting') => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  logout: () => void;
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  connectionStatus: 'online',
  isLoading: false,
  error: null,
  
  // Actions
  setUser: (user) => set({ 
    user, 
    isAuthenticated: !!user,
    error: null 
  }),
  
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error, isLoading: false }),
  
  clearError: () => set({ error: null }),
  
  logout: () => set({ 
    user: null, 
    isAuthenticated: false,
    error: null 
  }),
}));

