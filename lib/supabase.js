import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ujaqtwagfoaclsqkxtsv.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_BlKDiZoh7djxPf_iQXZGpA_6yayZn8D';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Keep runtime stable with a clear setup hint for missing env values.
  console.warn('Supabase env is missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:
      Platform.OS === 'web' && typeof window === 'undefined'
        ? {
            getItem: async () => null,
            setItem: async () => {},
            removeItem: async () => {},
          }
        : AsyncStorage,
    autoRefreshToken: !(Platform.OS === 'web' && typeof window === 'undefined'),
    persistSession: !(Platform.OS === 'web' && typeof window === 'undefined'),
    detectSessionInUrl: Platform.OS === 'web' && typeof window !== 'undefined',
  },
});
