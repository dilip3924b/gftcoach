import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const OFFLINE_QUEUE_KEY = 'offline_queue';

const logError = (scope, error) => {
  const raw = error?.message || error || 'Unknown error';
  const msg = String(raw);
  if (msg.includes('<!DOCTYPE html>')) {
    console.log(`[dbHelpers:${scope}]`, 'HTTP HTML error response (likely upstream SSL/CDN issue).');
    return;
  }
  console.log(`[dbHelpers:${scope}]`, msg.length > 240 ? `${msg.slice(0, 240)}...` : msg);
};

const safeParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const dbHelpers = {
  getTrades: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('traded_at', { ascending: false });
      if (error) {
        logError('getTrades', error);
        return { data: [], error };
      }
      const mapped = (data || []).map((row) => ({
        id: row.id?.toString() || `${Date.now()}`,
        pair: row.pair,
        direction: row.direction,
        profit: Number(row.profit),
        note: row.note || '',
        date: row.traded_at || row.created_at,
      }));
      return { data: mapped, error: null };
    } catch (error) {
      logError('getTrades', error);
      return { data: [], error };
    }
  },

  addTrade: async (userId, trade) => {
    try {
      const payload = {
        user_id: userId,
        pair: trade.pair,
        direction: trade.direction,
        profit: Number(trade.profit),
        note: trade.note || null,
        traded_at: trade.date || new Date().toISOString(),
        synced: true,
      };
      const { data, error } = await supabase
        .from('trades')
        .insert(payload)
        .select('*')
        .single();
      if (error) {
        logError('addTrade', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('addTrade', error);
      return { data: null, error };
    }
  },

  deleteTrade: async (tradeId) => {
    try {
      const { data, error } = await supabase.from('trades').delete().eq('id', tradeId);
      if (error) {
        logError('deleteTrade', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('deleteTrade', error);
      return { data: null, error };
    }
  },

  getProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        logError('getProfile', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('getProfile', error);
      return { data: null, error };
    }
  },

  updateTotalProfit: async (userId, totalProfit) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ total_profit: Number(totalProfit) })
        .eq('id', userId)
        .select('*')
        .single();
      if (error) {
        logError('updateTotalProfit', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('updateTotalProfit', error);
      return { data: null, error };
    }
  },

  getGuideProgress: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('guide_progress')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        logError('getGuideProgress', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('getGuideProgress', error);
      return { data: null, error };
    }
  },

  updateGuideProgress: async (userId, phase, step, answers) => {
    try {
      const { data, error } = await supabase
        .from('guide_progress')
        .upsert(
          {
            user_id: userId,
            phase_index: Number(phase) || 0,
            step_index: Number(step) || 0,
            answers: answers || {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select('*')
        .single();
      if (error) {
        logError('updateGuideProgress', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('updateGuideProgress', error);
      return { data: null, error };
    }
  },

  getTodayStats: async (userId) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('user_id', userId)
        .eq('stat_date', today)
        .maybeSingle();
      if (error) {
        logError('getTodayStats', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('getTodayStats', error);
      return { data: null, error };
    }
  },

  updateProfile: async (userId, updates) => {
    try {
      const payload = {
        display_name: updates?.display_name ?? null,
        timezone: updates?.timezone || 'Asia/Kolkata',
      };
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select('*')
        .single();
      if (error) {
        logError('updateProfile', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('updateProfile', error);
      return { data: null, error };
    }
  },

  getWeeklyStats: async (userId) => {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('user_id', userId)
        .gte('stat_date', weekAgo)
        .order('stat_date', { ascending: false });
      if (error) {
        logError('getWeeklyStats', error);
        return { data: [], error };
      }
      return { data: data || [], error: null };
    } catch (error) {
      logError('getWeeklyStats', error);
      return { data: [], error };
    }
  },

  updateSignalEntryTracking: async (signalId, updates) => {
    try {
      if (!signalId) return { data: null, error: null };
      const { data, error } = await supabase
        .from('signals')
        .update(updates || {})
        .eq('id', signalId)
        .select('*')
        .single();
      if (error) {
        logError('updateSignalEntryTracking', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('updateSignalEntryTracking', error);
      return { data: null, error };
    }
  },

  getSignalsWithEntryData: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false });
      if (error) {
        logError('getSignalsWithEntryData', error);
        return { data: [], error };
      }
      return { data: data || [], error: null };
    } catch (error) {
      logError('getSignalsWithEntryData', error);
      return { data: [], error };
    }
  },

  upsertDailyStats: async (userId, stats) => {
    try {
      const payload = {
        user_id: userId,
        stat_date: stats?.stat_date || new Date().toISOString().slice(0, 10),
        total_pl: Number(stats?.total_pl || 0),
        trades_count: Number(stats?.trades_count || 0),
        wins: Number(stats?.wins || 0),
        losses: Number(stats?.losses || 0),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('daily_stats')
        .upsert(payload, { onConflict: 'user_id,stat_date' })
        .select('*')
        .single();
      if (error) {
        logError('upsertDailyStats', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      logError('upsertDailyStats', error);
      return { data: null, error };
    }
  },

  addToOfflineQueue: async (action) => {
    try {
      const existing = safeParse(await AsyncStorage.getItem(OFFLINE_QUEUE_KEY), []);
      const queue = [...existing, { ...action, queuedAt: new Date().toISOString() }];
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      return { data: queue, error: null };
    } catch (error) {
      logError('addToOfflineQueue', error);
      return { data: null, error };
    }
  },

  processOfflineQueue: async (userId) => {
    try {
      const queue = safeParse(await AsyncStorage.getItem(OFFLINE_QUEUE_KEY), []);
      const remaining = [];

      for (const item of queue) {
        if (item.action === 'ADD_TRADE') {
          const res = await dbHelpers.addTrade(userId, item.data);
          if (res.error) remaining.push(item);
          continue;
        }

        if (item.action === 'UPDATE_GUIDE') {
          const gp = item.data || {};
          const res = await dbHelpers.updateGuideProgress(userId, gp.phase, gp.step, gp.answers);
          if (res.error) remaining.push(item);
          continue;
        }

        if (item.action === 'UPDATE_PROFIT') {
          const res = await dbHelpers.updateTotalProfit(userId, item.data?.totalProfit || 0);
          if (res.error) remaining.push(item);
          continue;
        }

        if (item.action === 'UPSERT_DAILY_STATS') {
          const res = await dbHelpers.upsertDailyStats(userId, item.data || {});
          if (res.error) remaining.push(item);
          continue;
        }
      }

      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
      return { data: { processed: queue.length - remaining.length, pending: remaining.length }, error: null };
    } catch (error) {
      logError('processOfflineQueue', error);
      return { data: null, error };
    }
  },
};

export const db = {
  getProfile: dbHelpers.getProfile,
  updateProfile: dbHelpers.updateProfile,
  getTrades: dbHelpers.getTrades,
  addTrade: dbHelpers.addTrade,
  getProgress: dbHelpers.getGuideProgress,
  updateProgress: dbHelpers.updateGuideProgress,
  getTodayStats: dbHelpers.getTodayStats,
  getWeeklyStats: dbHelpers.getWeeklyStats,
  getSignalsWithEntryData: dbHelpers.getSignalsWithEntryData,
  updateSignalEntryTracking: dbHelpers.updateSignalEntryTracking,
  loadAllUserData: async (userId) => {
    const [profile, trades, progress, todayStats] = await Promise.all([
      dbHelpers.getProfile(userId),
      dbHelpers.getTrades(userId),
      dbHelpers.getGuideProgress(userId),
      dbHelpers.getTodayStats(userId),
    ]);
    return { profile, trades, progress, todayStats };
  },
};

export { OFFLINE_QUEUE_KEY };
