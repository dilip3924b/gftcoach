import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = "https://ujaqtwagfoaclsqkxtsv.supabase.co";
const SUPABASE_ANON_KEY = 'sb_publishable_BlKDiZoh7djxPf_iQXZGpA_6yayZn8D';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
