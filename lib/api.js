import { cache } from './cache';
import { C, CACHE_KEYS, CACHE_TTL_SECONDS, IST_TIME_ZONE, TRACKED_PAIRS } from './constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_CONFIG = {
  EXCHANGE_RATE_API_KEY: process.env.EXPO_PUBLIC_EXCHANGE_RATE_API_KEY || '',
  EXCHANGE_RATE_BASE: 'https://v6.exchangerate-api.com/v6',
  BACKUP_FOREX_BASE: 'https://api.frankfurter.app/latest',
  FOREX_FACTORY_JSON: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
};

const DEFAULT_MIDS = {
  EURUSD: 1.08,
  AUDUSD: 0.66,
  GBPUSD: 1.27,
  USDJPY: 150.0,
};

const pairLabelToCodes = (pair) => {
  const label = pair.includes('/') ? pair : `${pair.slice(0, 3)}/${pair.slice(3)}`;
  return { base: label.slice(0, 3), quote: label.slice(4, 7), label };
};

const toPips = (value) => Number((value * 10000).toFixed(1));

const formatIstTime = (date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

const fetchPrimaryPair = async (pair) => {
  if (!API_CONFIG.EXCHANGE_RATE_API_KEY) return null;
  const { base, quote } = pairLabelToCodes(pair);
  const url = `${API_CONFIG.EXCHANGE_RATE_BASE}/${API_CONFIG.EXCHANGE_RATE_API_KEY}/pair/${base}/${quote}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Primary price API failed (${res.status})`);
  const json = await res.json();
  if (json?.result !== 'success' || typeof json?.conversion_rate !== 'number') return null;
  const mid = Number(json.conversion_rate);
  const spread = 0.00013;
  return {
    pair,
    bid: Number((mid - spread / 2).toFixed(5)),
    ask: Number((mid + spread / 2).toFixed(5)),
    spread: toPips(spread),
    change: 0,
    changePct: 0,
    updatedAt: new Date().toISOString(),
  };
};

const fetchBackupPair = async (pair) => {
  const { base, quote } = pairLabelToCodes(pair);
  const url = `${API_CONFIG.BACKUP_FOREX_BASE}?from=${base}&to=${quote}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Backup price API failed (${res.status})`);
  const json = await res.json();
  const mid = Number(json?.rates?.[quote] || 0);
  if (!mid) return null;
  const spread = 0.00016;
  return {
    pair,
    bid: Number((mid - spread / 2).toFixed(5)),
    ask: Number((mid + spread / 2).toFixed(5)),
    spread: toPips(spread),
    change: 0,
    changePct: 0,
    updatedAt: new Date().toISOString(),
  };
};

const getStaleForexCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.FOREX_PRICES);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.data || null;
  } catch {
    return null;
  }
};

const buildFallbackPrices = () => {
  const data = {};
  for (const pair of TRACKED_PAIRS) {
    const mid = Number(DEFAULT_MIDS[pair] || 1);
    const spread = pair === 'USDJPY' ? 0.02 : 0.0002;
    data[pair] = {
      pair,
      bid: Number((mid - spread / 2).toFixed(pair === 'USDJPY' ? 3 : 5)),
      ask: Number((mid + spread / 2).toFixed(pair === 'USDJPY' ? 3 : 5)),
      spread: pair === 'USDJPY' ? Number((spread * 100).toFixed(1)) : toPips(spread),
      change: 0,
      changePct: 0,
      updatedAt: new Date().toISOString(),
      delayed: true,
    };
  }
  return data;
};

const coerceImpact = (value = '') => {
  const v = String(value).toLowerCase();
  if (v.includes('high')) return 'HIGH';
  if (v.includes('medium')) return 'MEDIUM';
  return 'LOW';
};

const toEventDate = (event) => {
  const raw = event?.date || event?.Date || event?.timestamp || event?.time;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const getSpreadQuality = (spreadPips) => {
  if (spreadPips <= 3) return 'good';
  if (spreadPips <= 7) return 'ok';
  return 'bad';
};

export const cacheData = async (key, data, durationSeconds) => {
  await cache.setLocal(key, data, durationSeconds);
  try {
    await cache.setMarketCache(key, data, durationSeconds);
  } catch {
    // Local cache remains source of truth when DB cache is unavailable.
  }
};

export const getCachedData = async (key) => {
  const local = await cache.getLocal(key);
  if (local) return local;
  try {
    return await cache.getMarketCache(key);
  } catch {
    return null;
  }
};

export const getLiveForexPrices = async () => {
  const cached = await getCachedData(CACHE_KEYS.FOREX_PRICES);
  if (cached) return cached;

  const prices = {};
  for (const pair of TRACKED_PAIRS) {
    try {
      const primary = await fetchPrimaryPair(pair);
      if (primary) {
        prices[pair] = primary;
        continue;
      }
      const backup = await fetchBackupPair(pair);
      if (backup) prices[pair] = backup;
    } catch {
      // Try backup if primary failed.
      try {
        const backup = await fetchBackupPair(pair);
        if (backup) prices[pair] = backup;
      } catch {
        // Ignore this pair and proceed with others.
      }
    }
  }

  if (Object.keys(prices).length === 0) {
    const stale = await getStaleForexCache();
    if (stale && Object.keys(stale).length > 0) {
      return { ...stale, delayed: true };
    }
    return buildFallbackPrices();
  }

  await cacheData(CACHE_KEYS.FOREX_PRICES, prices, CACHE_TTL_SECONDS.FOREX_PRICE);
  return prices;
};

export const getEconomicCalendar = async () => {
  const cached = await getCachedData(CACHE_KEYS.ECON_CALENDAR);
  if (cached) return cached;

  const res = await fetch(API_CONFIG.FOREX_FACTORY_JSON);
  if (!res.ok) throw new Error(`Calendar API failed (${res.status})`);
  const raw = await res.json();
  const events = Array.isArray(raw) ? raw : [];

  const mapped = events
    .map((event, idx) => {
      const timestamp = toEventDate(event);
      if (!timestamp) return null;
      const impact = coerceImpact(event.impact || event.Impact);
      const country = event.country || event.Country || '';
      const dangerWindowStart = new Date(timestamp.getTime() - 30 * 60 * 1000);
      const dangerWindowEnd = new Date(timestamp.getTime() + 30 * 60 * 1000);
      const now = Date.now();
      const isDangerNow = now >= dangerWindowStart.getTime() && now <= dangerWindowEnd.getTime();
      return {
        id: event.id || `${idx}_${timestamp.toISOString()}`,
        time: `${formatIstTime(timestamp)} IST`,
        timestamp: timestamp.toISOString(),
        country,
        flag: country === 'USD' ? '🇺🇸' : country === 'EUR' ? '🇪🇺' : country === 'GBP' ? '🇬🇧' : '🌍',
        event: event.title || event.event || event.Event || 'Economic Event',
        impact,
        forecast: event.forecast || event.Forecast || null,
        previous: event.previous || event.Previous || null,
        actual: event.actual || event.Actual || null,
        isDangerNow,
        dangerWindowStart: dangerWindowStart.toISOString(),
        dangerWindowEnd: dangerWindowEnd.toISOString(),
        shouldAvoid: impact === 'HIGH',
      };
    })
    .filter(Boolean)
    .filter((event) => event.impact === 'HIGH');

  await cacheData(CACHE_KEYS.ECON_CALENDAR, mapped, CACHE_TTL_SECONDS.CALENDAR);
  return mapped;
};

export const getTodaysDangerZones = async () => {
  const events = await getEconomicCalendar();
  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return events.filter((event) => {
    const eventDateIst = new Intl.DateTimeFormat('en-CA', {
      timeZone: IST_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(event.timestamp));
    return eventDateIst === todayIst;
  });
};

export const isCurrentlyDangerZone = async () => {
  const events = await getTodaysDangerZones();
  const now = Date.now();
  const active = events.find((event) => {
    const start = new Date(event.dangerWindowStart).getTime();
    const end = new Date(event.dangerWindowEnd).getTime();
    return now >= start && now <= end;
  });

  if (!active) {
    return { isDanger: false, event: null, minutesUntilSafe: 0 };
  }
  const minutesUntilSafe = Math.max(
    0,
    Math.ceil((new Date(active.dangerWindowEnd).getTime() - now) / 60000)
  );
  return { isDanger: true, event: active.event, minutesUntilSafe };
};

export const getCurrentTradingSession = () => {
  const now = new Date();
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(now)
    .split(':')
    .map((v) => Number(v));
  const total = hour * 60 + minute;

  if (total >= 18 * 60 + 30 && total < 22 * 60 + 30) {
    return {
      session: 'overlap',
      label: '🔥 BEST TIME TO TRADE',
      color: C.green,
      advice: 'London + NY overlap is live. Trade now!',
      minutesRemaining: 22 * 60 + 30 - total,
    };
  }
  if (total >= 13 * 60 + 30 && total < 18 * 60 + 30) {
    return {
      session: 'london',
      label: '🟡 London Session',
      color: C.yellow,
      advice: 'Tradable session. Wait for clean setups.',
      minutesRemaining: 18 * 60 + 30 - total,
    };
  }
  if (total >= 22 * 60 + 30 && total < 23 * 60) {
    return {
      session: 'ny_closing',
      label: '🟠 NY Closing',
      color: C.orange,
      advice: 'Close trades and avoid fresh entries.',
      minutesRemaining: 23 * 60 - total,
    };
  }
  return {
    session: 'dead',
    label: '😴 Dead Zone',
    color: C.muted,
    advice: 'Low-quality market session. Avoid trading.',
    minutesRemaining: Math.max(0, 13 * 60 + 30 - total),
  };
};
