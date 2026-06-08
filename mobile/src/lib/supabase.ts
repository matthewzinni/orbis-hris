import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const ssrAuthStorage: AuthStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

function getAuthStorage(): AuthStorage {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return ssrAuthStorage;
    }
    return {
      getItem: (key) => Promise.resolve(window.localStorage.getItem(key)),
      setItem: (key, value) => {
        window.localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key) => {
        window.localStorage.removeItem(key);
        return Promise.resolve();
      },
    };
  }
  return AsyncStorage;
}

function buildClientOptions(): SupabaseClientOptions<'public'> {
  const options: SupabaseClientOptions<'public'> = {
    auth: {
      storage: getAuthStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  };

  const isNode =
    typeof process !== 'undefined' && typeof process.versions?.node === 'string';
  const hasNativeWebSocket = typeof globalThis.WebSocket === 'function';

  if (isNode && !hasNativeWebSocket) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ws = require('ws') as typeof WebSocket;
      options.realtime = { transport: ws };
    } catch {
      // Realtime unused in Phase 0.
    }
  }

  return options;
}

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://orbis-config-missing.invalid',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder',
  buildClientOptions()
);
