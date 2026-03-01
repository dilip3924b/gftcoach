import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const nowIso = () => new Date().toISOString();

export const cache = {
  setLocal: async (key, data, durationSeconds) => {
    const payload = {
      data,
      expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
      savedAt: nowIso(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
    return payload;
  },

  getLocal: async (key) => {
    const raw = await AsyncStorage.getItem(key);
    const parsed = safeParse(raw);
    if (!parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed.data;
  },

  setMarketCache: async (key, data, durationSeconds) => {
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    const { error } = await supabase.from('market_cache').upsert(
      {
        cache_key: key,
        data,
        expires_at: expiresAt,
      },
      { onConflict: 'cache_key' }
    );
    if (error) throw error;
    return { data, expiresAt };
  },

  getMarketCache: async (key) => {
    const { data, error } = await supabase
      .from('market_cache')
      .select('data, expires_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (error) throw error;
    if (!data?.expires_at) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    return data.data;
  },
};
