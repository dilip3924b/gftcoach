import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllPrices } from '../lib/priceFeeds';
import { supabase } from '../lib/supabase';
import { dbHelpers } from '../lib/db';

const ACTIVE_TRADE_KEY = 'active_trade_state';

const symbolOf = (trade) => {
  const s = String(trade?.symbol || trade?.pair || 'EURUSD').replace('/', '').toUpperCase();
  if (s.includes('XAU') || s.includes('GOLD')) return 'XAUUSD';
  if (s.includes('BTC')) return 'BTCUSD';
  return 'EURUSD';
};

const pipSizeOf = (symbol) => (symbol === 'EURUSD' ? 0.0001 : 1.0);
const unitValueOf = (symbol) => (symbol === 'EURUSD' ? 0.1 : 0.01);

const readLocal = async () => {
  const raw = await AsyncStorage.getItem(ACTIVE_TRADE_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const tradeTracker = {
  getActiveTrade: async () => {
    const local = await readLocal();
    if (local) return local;

    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) return null;
      const remote = await dbHelpers.getActiveTradeRecord(userId);
      if (remote?.data) {
        const mapped = { ...remote.data, symbol: symbolOf(remote.data) };
        await AsyncStorage.setItem(ACTIVE_TRADE_KEY, JSON.stringify(mapped));
        return mapped;
      }
    } catch {
      // ignore remote fetch failures
    }
    return null;
  },

  setActiveTrade: async (trade) => {
    const normalized = { ...trade, symbol: symbolOf(trade) };
    await AsyncStorage.setItem(ACTIVE_TRADE_KEY, JSON.stringify(normalized));

    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (userId) {
        await dbHelpers.setActiveTradeRecord(userId, normalized);
      }
    } catch {
      // local state remains source of truth
    }
  },

  clearActiveTrade: async () => {
    await AsyncStorage.removeItem(ACTIVE_TRADE_KEY);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (userId) await dbHelpers.clearActiveTradeRecord(userId);
    } catch {
      // ignore
    }
  },

  estimatePnL: async () => {
    const trade = await tradeTracker.getActiveTrade();
    if (!trade) return null;

    const prices = await getAllPrices().catch(() => null);
    const symbol = symbolOf(trade);
    const quote = prices?.[symbol];
    if (!quote) return null;

    const entry = Number(trade.entry_price || 0);
    const current = trade.direction === 'BUY' ? Number(quote.bid) : Number(quote.ask);
    const pipSize = pipSizeOf(symbol);
    const unitValue = unitValueOf(symbol);

    const deltaUnits = trade.direction === 'BUY'
      ? (current - entry) / pipSize
      : (entry - current) / pipSize;

    const pnl = Number((deltaUnits * unitValue).toFixed(2));

    return {
      ...trade,
      symbol,
      currentPrice: current,
      deltaPips: Number(deltaUnits.toFixed(1)),
      estimatedPnL: pnl,
      distanceToTP: Number(Math.abs((Number(trade.take_profit) - current) / pipSize).toFixed(1)),
      distanceToSL: Number(Math.abs((current - Number(trade.stop_loss)) / pipSize).toFixed(1)),
      updatedAt: new Date().toISOString(),
    };
  },
};
