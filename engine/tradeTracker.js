import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLiveForexPrices } from '../lib/api';

const ACTIVE_TRADE_KEY = 'active_trade_state';

export const tradeTracker = {
  getActiveTrade: async () => {
    const raw = await AsyncStorage.getItem(ACTIVE_TRADE_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  setActiveTrade: async (trade) => {
    await AsyncStorage.setItem(ACTIVE_TRADE_KEY, JSON.stringify(trade));
  },

  clearActiveTrade: async () => {
    await AsyncStorage.removeItem(ACTIVE_TRADE_KEY);
  },

  estimatePnL: async () => {
    const trade = await tradeTracker.getActiveTrade();
    if (!trade) return null;
    const prices = await getLiveForexPrices().catch(() => null);
    const eur = prices?.EURUSD;
    if (!eur) return null;

    const current = trade.direction === 'BUY' ? Number(eur.bid) : Number(eur.ask);
    const deltaPips =
      trade.direction === 'BUY'
        ? (current - Number(trade.entry_price)) / 0.0001
        : (Number(trade.entry_price) - current) / 0.0001;
    const pnl = Number((deltaPips * 0.1).toFixed(2));

    return {
      ...trade,
      currentPrice: current,
      deltaPips: Number(deltaPips.toFixed(1)),
      estimatedPnL: pnl,
      distanceToTP: Number(Math.abs((Number(trade.take_profit) - current) / 0.0001).toFixed(1)),
      distanceToSL: Number(Math.abs((current - Number(trade.stop_loss)) / 0.0001).toFixed(1)),
      updatedAt: new Date().toISOString(),
    };
  },
};
