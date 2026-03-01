import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { OFFLINE_QUEUE_KEY } from './constants';
import { dbHelpers } from './db';

let syncInterval = null;

const safeParse = (value, fallback = []) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const queueRead = async () => {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  return safeParse(raw, []);
};

const queueWrite = async (items) => {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
};

const processItem = async (userId, item) => {
  if (item.action === 'ADD_TRADE') return dbHelpers.addTrade(userId, item.payload);
  if (item.action === 'UPDATE_PROGRESS') {
    const p = item.payload || {};
    return dbHelpers.updateGuideProgress(userId, p.phase, p.step, p.answers);
  }
  if (item.action === 'UPDATE_STATS') {
    return dbHelpers.upsertDailyStats(userId, item.payload || {});
  }
  return { data: null, error: null };
};

export const offlineManager = {
  enqueue: async (action, payload) => {
    const existing = await queueRead();
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action,
      payload,
      timestamp: new Date().toISOString(),
      attempts: 0,
    };
    const next = [...existing, item];
    await queueWrite(next);
    return item;
  },

  isOnline: async () => {
    const state = await Network.getNetworkStateAsync();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  },

  processQueue: async (userId) => {
    if (!userId) return { processed: 0, pending: 0 };
    const online = await offlineManager.isOnline();
    if (!online) {
      const pending = (await queueRead()).length;
      return { processed: 0, pending };
    }

    const queue = await queueRead();
    const remaining = [];
    let processed = 0;

    for (const item of queue) {
      try {
        const result = await processItem(userId, item);
        if (result?.error) {
          remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
        } else {
          processed += 1;
        }
      } catch {
        remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
      }
    }

    await queueWrite(remaining);
    return { processed, pending: remaining.length };
  },

  getSyncStatus: async () => {
    const online = await offlineManager.isOnline();
    if (!online) return 'offline';
    const pending = (await queueRead()).length;
    return pending > 0 ? 'pending' : 'synced';
  },

  startSyncListener: (userId, onStatusChange) => {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(async () => {
      const statusBefore = await offlineManager.getSyncStatus();
      if (typeof onStatusChange === 'function') onStatusChange(statusBefore);
      if (statusBefore !== 'offline') await offlineManager.processQueue(userId);
      const statusAfter = await offlineManager.getSyncStatus();
      if (typeof onStatusChange === 'function') onStatusChange(statusAfter);
    }, 30000);
  },

  stopSyncListener: () => {
    if (!syncInterval) return;
    clearInterval(syncInterval);
    syncInterval = null;
  },
};
