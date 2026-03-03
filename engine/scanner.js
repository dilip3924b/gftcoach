import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { db } from '../lib/db';
import { getCurrentTradingSession, getEconomicCalendar, getLiveForexPrices, isCurrentlyDangerZone } from '../lib/api';
import { getMasterTechnicalScore } from './technicals';
import { generateFinalSignal } from './signalGenerator';
import { notificationEngine } from './notificationEngine';
import { tradeTracker } from './tradeTracker';
import { isScannerAllowedNow } from './marketHours';
import { getCandleHistory } from './candleSeeder';

const SCANNER_TASK = 'GFT_MARKET_SCANNER';
const SCAN_INTERVAL_MINUTES = 30;
const TICK_KEY = 'price_ticks_EURUSD';
const USER_ID_KEY = 'scanner_user_id';
const LAST_SIGNAL_KEY = 'latest_signal';

const saveTicks = async (price) => {
  const raw = await AsyncStorage.getItem(TICK_KEY);
  const ticks = raw ? JSON.parse(raw) : [];
  ticks.push({ timestamp: new Date().toISOString(), bid: Number(price.bid), ask: Number(price.ask) });
  while (ticks.length > 500) ticks.shift();
  await AsyncStorage.setItem(TICK_KEY, JSON.stringify(ticks));
};

const aggregateToCandles = (ticks = []) => {
  const byHour = new Map();
  ticks.forEach((tick) => {
    const d = new Date(tick.timestamp);
    d.setMinutes(0, 0, 0);
    const k = d.toISOString();
    const mid = (Number(tick.bid) + Number(tick.ask)) / 2;
    if (!byHour.has(k)) {
      byHour.set(k, { timestamp: k, open: mid, high: mid, low: mid, close: mid, volume: 1 });
      return;
    }
    const c = byHour.get(k);
    c.high = Math.max(c.high, mid);
    c.low = Math.min(c.low, mid);
    c.close = mid;
    c.volume += 1;
  });
  return Array.from(byHour.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

export const getPriceHistory = async () => {
  const seeded = await getCandleHistory('EURUSD').catch(() => []);
  if (seeded?.length) return seeded.slice(-80);
  const raw = await AsyncStorage.getItem(TICK_KEY);
  const ticks = raw ? JSON.parse(raw) : [];
  return aggregateToCandles(ticks).slice(-80);
};

const shouldScan = async () => {
  if (!isScannerAllowedNow()) return { ok: false, reason: 'Market closed or wrong session.' };
  const session = getCurrentTradingSession();
  const isGoodSession = ['london', 'overlap'].includes(session.session);
  const danger = await isCurrentlyDangerZone().catch(() => ({ isDanger: false }));
  const active = await tradeTracker.getActiveTrade();
  if (!isGoodSession) return { ok: false, reason: `Wrong session (${session.label}).` };
  if (danger.isDanger) return { ok: false, reason: 'Danger zone active (high-impact news window).' };
  if (active) return { ok: false, reason: 'Active trade already open.' };
  return { ok: true, reason: '' };
};

const saveSignal = async (userId, signal) => {
  await AsyncStorage.setItem(LAST_SIGNAL_KEY, JSON.stringify(signal));
  if (!userId) return;
  const payload = {
    user_id: userId,
    pair: 'EUR/USD',
    direction: signal.signal,
    confidence: signal.confidence,
    entry_price: signal.entry?.price || null,
    entry_range: signal.entry?.range || null,
    stop_loss: signal.stopLoss?.price || null,
    take_profit: signal.takeProfit?.price || null,
    sl_pips: signal.stopLoss?.pips || null,
    tp_pips: signal.takeProfit?.pips || null,
    technical_score: signal.technicalScore || null,
    reasons: signal.reasons || [],
    warnings: signal.warnings || [],
    simple_explanation: signal.simpleExplanation || null,
    valid_until: new Date(Date.now() + (signal.validUntilMinutes || 45) * 60000).toISOString(),
  };
  await dbHelpersSafeInsert(payload);
};

const dbHelpersSafeInsert = async (payload) => {
  try {
    const { supabase } = await import('../lib/supabase');
    await supabase.from('signals').insert(payload);
  } catch {
    // Signals table might not exist yet, keep local flow alive.
  }
};

export const performScan = async (userId) => {
  try {
    if (!isScannerAllowedNow()) {
      return { scanned: false, reason: 'Market closed or restricted session.' };
    }

    const gate = await shouldScan();
    if (!gate.ok) {
      return { scanned: false, reason: gate.reason || 'Conditions not valid for scanning.' };
    }

    const [prices, calendar, todayStats] = await Promise.all([
      getLiveForexPrices(),
      getEconomicCalendar().catch(() => []),
      userId ? db.getTodayStats(userId) : Promise.resolve({ data: { total_pl: 0 } }),
    ]);

    const eurusd = prices?.EURUSD;
    if (!eurusd) return { scanned: false, reason: 'EURUSD unavailable.' };

    await saveTicks(eurusd);
    const history = await getPriceHistory();
    if (history.length < 6) {
      return { scanned: true, signal: null, reason: 'Building market data; need more candles.' };
    }

    const technicals = getMasterTechnicalScore(history, eurusd.bid, eurusd.spread);
    if (technicals.score < 55) {
      return { scanned: true, signal: null, reason: `Score too low (${technicals.score})` };
    }

    const finalSignal = await generateFinalSignal({
      technicals,
      prices: eurusd,
      calendar,
      userId,
      todayPL: Number(todayStats?.data?.total_pl || 0),
    });

    await saveSignal(userId, finalSignal);
    if (['HIGH', 'MEDIUM'].includes(finalSignal.confidence) && ['BUY', 'SELL'].includes(finalSignal.signal)) {
      await notificationEngine.sendTradeAlert(finalSignal);
    }

    return { scanned: true, signal: finalSignal };
  } catch (error) {
    return { scanned: false, reason: error?.message || 'Scanner failed.' };
  }
};

TaskManager.defineTask(SCANNER_TASK, async () => {
  const userId = await AsyncStorage.getItem(USER_ID_KEY);
  if (!userId) return BackgroundFetch.BackgroundFetchResult.NoData;
  try {
    const result = await performScan(userId);
    return result.signal ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const startScanner = async (userId) => {
  if (userId) await AsyncStorage.setItem(USER_ID_KEY, userId);
  await BackgroundFetch.registerTaskAsync(SCANNER_TASK, {
    minimumInterval: SCAN_INTERVAL_MINUTES * 60,
    stopOnTerminate: false,
    startOnBoot: true,
  });
};

export const stopScanner = async () => {
  await BackgroundFetch.unregisterTaskAsync(SCANNER_TASK);
};

export const getLatestSignal = async () => {
  const raw = await AsyncStorage.getItem(LAST_SIGNAL_KEY);
  return raw ? JSON.parse(raw) : null;
};
